// Motor de marketing de la demo: segmentos, agente de campañas y envío por Constant Contact.
// Todo es simulado. En producción el texto lo escribe un modelo de IA (Claude) y el envío
// lo hace la API v3 de Constant Contact (ver docs/INTEGRACIONES.md).
import { programTotal } from "./config";
import type { Audience, Bilingual, Campaign, DB, Lead, LeadActivity, MarketingEvent, Segment, Student } from "./types";
import { addDays, fillTemplate, money, parseDate, toISODate, today, uid } from "./utils";

export interface Contact {
  audience: Audience;
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  language: "es" | "en";
  programId?: string;
  ownerId?: string;
  raw: Lead | Student;
}

const FREQUENCY_CAP_DAYS = 7;

export const toContact = (db: DB, audience: Audience, x: Lead | Student): Contact => {
  if (audience === "leads") {
    const l = x as Lead;
    return { audience, id: l.id, firstName: l.firstName, lastName: l.lastName, email: l.email, language: l.language, programId: l.programId, ownerId: l.ownerId, raw: l };
  }
  const s = x as Student;
  const lead = db.leads.find((l) => l.id === s.leadId);
  return { audience, id: s.id, firstName: s.firstName, lastName: s.lastName, email: s.email, language: lead?.language ?? "es", programId: s.programId, ownerId: lead?.ownerId, raw: s };
};

export const consentState = (c: { marketingOptIn?: boolean; unsubscribedAt?: string; email?: string }) =>
  c.unsubscribedAt ? "unsubscribed" : !c.marketingOptIn ? "no_consent" : !c.email ? "no_email" : "ok";

function matches(db: DB, seg: Segment, x: Lead | Student) {
  const f = seg.filters;
  if (seg.audience === "leads") {
    const l = x as Lead;
    const age = Math.round((Date.now() - new Date(l.createdAt).getTime()) / 86400000);
    if (f.stages?.length && !f.stages.includes(l.stage)) return false;
    if (f.sources?.length && !f.sources.includes(l.source)) return false;
    if (f.lostReasons?.length && !f.lostReasons.includes(l.lostReason ?? "")) return false;
    if (f.programIds?.length && !f.programIds.includes(l.programId ?? "")) return false;
    if (f.language && l.language !== f.language) return false;
    if (f.createdWithinDays && age > f.createdWithinDays) return false;
    if (f.minDaysSinceCreated && age < f.minDaysSinceCreated) return false;
    return true;
  }
  const s = x as Student;
  if (f.studentStatuses?.length && !f.studentStatuses.includes(s.status)) return false;
  if (f.programIds?.length && !f.programIds.includes(s.programId)) return false;
  if (f.language && toContact(db, "students", s).language !== f.language) return false;
  return true;
}

/** Contactos del segmento, separados entre los que pueden recibir y los excluidos (con motivo). */
export function segmentContacts(db: DB, seg: Segment) {
  const pool = seg.audience === "leads" ? db.leads : db.students;
  const all = pool.filter((x) => matches(db, seg, x)).map((x) => toContact(db, seg.audience, x));
  const since = new Date(Date.now() - FREQUENCY_CAP_DAYS * 86400000).toISOString();
  const recent = new Set(db.marketingEvents.filter((e) => e.type === "sent" && e.at >= since).map((e) => e.contactId));
  const eligible: Contact[] = [];
  const excluded = { no_consent: 0, unsubscribed: 0, no_email: 0, recent: 0 };
  all.forEach((c) => {
    const st = consentState(c.raw);
    if (st !== "ok") excluded[st]++;
    else if (recent.has(c.id)) excluded.recent++;
    else eligible.push(c);
  });
  return { all, eligible, excluded };
}

/** Fecha del próximo grupo: primer lunes del mes siguiente (en producción saldría del calendario de cohortes). */
export const nextCohort = () => {
  const d = parseDate(today());
  d.setMonth(d.getMonth() + 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return toISODate(d);
};

const fmtLong = (iso: string, lang: "es" | "en") =>
  parseDate(iso).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric" });

/** "Agente IA" simulado: un párrafo distinto para cada contacto según su situación real en el CRM. */
export function aiParagraph(db: DB, c: Contact): string {
  const es = c.language === "es";
  const p = db.programs.find((x) => x.id === c.programId);
  const total = programTotal(p);
  const monthly = total ? money(Math.round((total - 1500) / 6)) : "";
  const advisor = db.users.find((u) => u.id === c.ownerId)?.name.split(" ")[0];
  const cohort = fmtLong(nextCohort(), c.language);
  const night = db.schedules.some((s) => s.start >= "17:00");
  const weekend = db.schedules.some((s) => s.days.includes(6));

  if (c.audience === "students") {
    const s = c.raw as Student;
    if (s.status === "Graduated") {
      const hired = s.placement.company;
      return es
        ? `Han pasado unos meses desde que terminaste ${p?.name.toLowerCase() ?? "tu programa"}${hired ? ` y nos alegra saber que estás en ${hired}` : ""}. Si conoces a alguien que quiera empezar en esta carrera, el próximo grupo inicia el ${cohort} y tu referido recibe un descuento en la matrícula.`
        : `It's been a few months since you completed ${p?.name.toLowerCase() ?? "your program"}${hired ? ` and we're glad to hear you're at ${hired}` : ""}. If you know someone who wants to start this career, the next class starts ${cohort} and your referral gets a tuition discount.`;
    }
    return es
      ? `Como estudiante de ${p?.name.toLowerCase() ?? "FMAIS"}, queremos que seas de los primeros en saber de nuestros nuevos talleres y certificaciones.`
      : `As a ${p?.name.toLowerCase() ?? "FMAIS"} student, we want you to be among the first to hear about our new workshops and certifications.`;
  }

  const l = c.raw as Lead;
  const days = Math.round((Date.now() - new Date(l.createdAt).getTime()) / 86400000);
  if (l.stage === "lost" && l.lostReason === "Precio") {
    return es
      ? `Sabemos que el costo fue una duda cuando hablamos. Por eso queremos contarte que ${p?.name.toLowerCase() ?? "el programa"} se puede pagar con un depósito de $1,500 y cuotas desde ${monthly} al mes, con tarjeta, Affirm o Zelle.`
      : `We know cost was a concern when we spoke. ${p?.name ?? "The program"} can be paid with a $1,500 deposit and installments from ${monthly} a month by card, Affirm or Zelle.`;
  }
  if (l.stage === "lost" && l.lostReason === "Horario no le sirve") {
    return es
      ? `Nos dijiste que el horario no te funcionaba. Ahora tenemos ${[night && "grupos de noche", weekend && "grupos de fin de semana"].filter(Boolean).join(" y ") || "más horarios"}, y el próximo grupo empieza el ${cohort}.`
      : `You mentioned the schedule didn't work for you. We now offer ${[night && "evening classes", weekend && "weekend classes"].filter(Boolean).join(" and ") || "more schedules"}, and the next class starts ${cohort}.`;
  }
  if (l.stage === "new" || days <= 7) {
    return es
      ? `Gracias por escribirnos sobre ${p?.name.toLowerCase() ?? "nuestros programas"}. ${advisor ? `${advisor}, tu asesora de admisiones,` : "Un asesor de admisiones"} te va a contactar, pero si prefieres, puedes agendar una visita a la escuela cuando te quede bien.`
      : `Thanks for reaching out about ${p?.name.toLowerCase() ?? "our programs"}. ${advisor ? `${advisor}, your admissions advisor,` : "An admissions advisor"} will contact you, or you can book a campus visit whenever it suits you.`;
  }
  return es
    ? `Hace ${days} días nos preguntaste por ${p?.name.toLowerCase() ?? "nuestros programas"}${p ? ` (${p.totalHours} horas)` : ""}. Todavía hay cupo en el grupo que empieza el ${cohort} y puedes inscribirte en línea en menos de 12 minutos.`
    : `${days} days ago you asked us about ${p?.name.toLowerCase() ?? "our programs"}${p ? ` (${p.totalHours} hours)` : ""}. There are still seats in the class starting ${cohort}, and you can enroll online in under 12 minutes.`;
}

export function renderEmail(db: DB, camp: Pick<Campaign, "subject" | "body" | "cta" | "personalizeWithAI">, c: Contact) {
  const lang = c.language;
  const p = db.programs.find((x) => x.id === c.programId);
  const vars = {
    nombre: c.firstName,
    programa: p?.name ?? (lang === "es" ? "nuestros programas" : "our programs"),
    proximo_grupo: fmtLong(nextCohort(), lang),
    asesor: db.users.find((u) => u.id === c.ownerId)?.name ?? "FMAIS",
    parrafo_ia: camp.personalizeWithAI ? aiParagraph(db, c) : "",
    link: `${db.settings.enrollmentPortalUrl}?lang=${lang}&utm_source=constantcontact`,
  };
  return {
    lang,
    subject: fillTemplate(camp.subject[lang], vars),
    body: fillTemplate(camp.body[lang], vars).replace(/\n{3,}/g, "\n\n"),
    cta: fillTemplate(camp.cta[lang], vars),
  };
}

const GOAL_HINTS: Record<string, { time: string; why: string }> = {
  leads: { time: "10:00", why: "los leads abren más a media mañana entre semana" },
  students: { time: "18:30", why: "estudiantes y graduados leen más al salir del trabajo" },
};

/** Lo que haría el agente de IA: elegir contenido, revisar el segmento y dejar el borrador para aprobar. */
export function agentDraft(db: DB, args: { segmentId: string; templateId: string; goal: string; personalize: boolean }): Campaign {
  const seg = db.segments.find((s) => s.id === args.segmentId)!;
  const tpl = db.marketingTemplates.find((t) => t.id === args.templateId)!;
  const { all, eligible, excluded } = segmentContacts(db, seg);
  const hint = GOAL_HINTS[seg.audience];
  let send = addDays(today(), 1);
  while ([0, 6].includes(parseDate(send).getDay())) send = addDays(send, 1);
  const es = eligible.filter((c) => c.language === "es").length;
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const sameTpl = new Set(db.campaigns.filter((c) => c.templateId === tpl.id).map((c) => c.id));
  const gotSame = new Set(db.marketingEvents.filter((e) => e.type === "sent" && e.at >= since30 && sameTpl.has(e.campaignId)).map((e) => e.contactId));
  const repeats = eligible.filter((c) => gotSame.has(c.id)).length;

  const notes = [
    `Segmento "${seg.name}": ${all.length} contactos, ${eligible.length} pueden recibir el email (${es} en español, ${eligible.length - es} en inglés).`,
    excluded.no_consent || excluded.unsubscribed || excluded.no_email
      ? `Excluí ${excluded.no_consent} sin consentimiento, ${excluded.unsubscribed} dados de baja y ${excluded.no_email} sin email.`
      : "No hubo exclusiones por consentimiento.",
    excluded.recent ? `Excluí ${excluded.recent} que ya recibieron una campaña en los últimos ${FREQUENCY_CAP_DAYS} días, para no saturarlos.` : "",
    args.personalize ? "Cada email lleva un párrafo escrito para esa persona según su situación en el CRM (programa, motivo de pérdida, días desde que preguntó, asesor)." : "Sin párrafo personalizado: solo nombre y programa.",
    `Sugiero enviarla el ${fmtLong(send, "es")} a las ${hint.time}: ${hint.why}.`,
    eligible.length < 5 ? "Ojo: el segmento es muy pequeño; quizás convenga ampliarlo." : "",
    repeats ? `Ojo: ${repeats} de estos contactos ya recibieron este mismo template en los últimos 30 días. Conviene cambiar el texto o esperar.` : "",
    "No incluí precios ni promociones que no estén en la plataforma o en el template.",
  ].filter(Boolean);

  return {
    id: uid(),
    name: `${tpl.name} · ${seg.name}`,
    segmentId: seg.id,
    templateId: tpl.id,
    goal: args.goal,
    subject: { ...tpl.subject },
    body: { ...tpl.body },
    cta: { ...tpl.cta },
    personalizeWithAI: args.personalize,
    status: "pending_approval",
    recurring: false,
    createdBy: "agent",
    createdAt: new Date().toISOString(),
    agentNotes: notes,
    scheduledFor: `${send}T${hint.time}:00`,
    stats: { sent: 0, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 },
  };
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * Simula el envío por Constant Contact y lo que pasa después (aperturas, clics, bajas).
 * Devuelve todo lo que hay que guardar; no modifica db.
 */
export function simulateSend(db: DB, camp: Campaign, at = new Date()) {
  const seg = db.segments.find((s) => s.id === camp.segmentId);
  if (!seg) return null;
  const already = new Set(db.marketingEvents.filter((e) => e.campaignId === camp.id && e.type === "sent").map((e) => e.contactId));
  const recipients = segmentContacts(db, seg).eligible.filter((c) => !already.has(c.id));
  const r = rng(recipients.length * 97 + camp.id.length * 13 + at.getDate());
  const events: MarketingEvent[] = [];
  const leads: Lead[] = [];
  const students: Student[] = [];
  const activities: LeadActivity[] = [];
  const stats = { ...camp.stats };
  const iso = (mins: number) => new Date(at.getTime() + mins * 60000).toISOString();
  const ctaUrl = camp.cta.es.toLowerCase().includes("precio") ? "precios" : "inscripcion";

  recipients.forEach((c) => {
    events.push({ id: uid(), campaignId: camp.id, audience: c.audience, contactId: c.id, type: "sent", at: iso(0) });
    stats.sent++;
    if (r() < 0.02) {
      events.push({ id: uid(), campaignId: camp.id, audience: c.audience, contactId: c.id, type: "bounce", at: iso(1) });
      stats.bounces++;
      return;
    }
    if (r() > 0.46) return;
    events.push({ id: uid(), campaignId: camp.id, audience: c.audience, contactId: c.id, type: "open", at: iso(20 + Math.round(r() * 600)) });
    stats.opens++;
    const lead = c.audience === "leads" ? (c.raw as Lead) : undefined;
    if (r() < 0.03) {
      events.push({ id: uid(), campaignId: camp.id, audience: c.audience, contactId: c.id, type: "unsubscribe", at: iso(700) });
      stats.unsubscribes++;
      if (lead) leads.push({ ...lead, unsubscribedAt: iso(700) });
      else students.push({ ...(c.raw as Student), unsubscribedAt: iso(700) });
      return;
    }
    if (lead) activities.push({ id: uid(), leadId: lead.id, type: "email", note: `Marketing: abrió "${camp.name}"`, at: iso(30) });
    if (r() < 0.25) {
      events.push({ id: uid(), campaignId: camp.id, audience: c.audience, contactId: c.id, type: "click", url: ctaUrl, at: iso(35) });
      stats.clicks++;
      if (lead) {
        activities.push({ id: uid(), leadId: lead.id, type: "email", note: `Marketing: hizo clic en "${camp.cta.es}" de "${camp.name}"`, at: iso(36) });
        // Regla automática: un clic crea una tarea para el asesor del lead.
        if (lead.stage !== "enrolled") leads.push({ ...lead, nextAction: `Llamar: hizo clic en "${camp.cta.es}"`, nextActionDate: toISODate(at), stage: lead.stage === "lost" ? "contacted" : lead.stage });
      }
    }
  });

  return {
    events,
    leads,
    students,
    activities,
    campaign: { ...camp, status: "sent" as const, sentAt: camp.sentAt ?? at.toISOString(), stats, ccCampaignId: camp.ccCampaignId ?? `cc_${uid()}` },
    recipients: recipients.length,
  };
}

/** Aplica el resultado de un envío al db. Se encadena para procesar varias campañas en un mismo paso. */
export function mergeSend(db: DB, res: NonNullable<ReturnType<typeof simulateSend>>): DB {
  const lp = new Map(res.leads.map((l) => [l.id, l]));
  const sp = new Map(res.students.map((s) => [s.id, s]));
  const exists = db.campaigns.some((c) => c.id === res.campaign.id);
  return {
    ...db,
    leads: db.leads.map((l) => lp.get(l.id) ?? l),
    students: db.students.map((s) => sp.get(s.id) ?? s),
    leadActivities: [...res.activities, ...db.leadActivities],
    marketingEvents: [...res.events, ...db.marketingEvents],
    campaigns: exists ? db.campaigns.map((c) => (c.id === res.campaign.id ? res.campaign : c)) : [res.campaign, ...db.campaigns],
  };
}

export const rate = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export const emptyBilingual = (): Bilingual => ({ es: "", en: "" });
