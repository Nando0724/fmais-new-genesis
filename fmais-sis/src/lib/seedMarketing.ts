// Datos de marketing de la demo. También migra datos guardados antes de que existiera el módulo.
import { agentDraft, simulateSend } from "./marketing";
import type { Campaign, DB, MarketingTemplate, Segment } from "./types";
import { addDays, nowISO, today } from "./utils";

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const TEMPLATES: MarketingTemplate[] = [
  {
    id: "mt_followup",
    name: "Seguimiento a interesados",
    subject: { es: "{{nombre}}, todavía hay cupo en {{programa}}", en: "{{nombre}}, there are still seats in {{programa}}" },
    body: {
      es: "Hola {{nombre}},\n\n{{parrafo_ia}}\n\nEl próximo grupo empieza el {{proximo_grupo}}. Si tienes preguntas, responde este email y {{asesor}} te ayuda.\n\nFlorida Medical & Aesthetic International School",
      en: "Hi {{nombre}},\n\n{{parrafo_ia}}\n\nThe next class starts {{proximo_grupo}}. If you have questions, just reply to this email and {{asesor}} will help you.\n\nFlorida Medical & Aesthetic International School",
    },
    cta: { es: "Inscribirme en línea", en: "Enroll online" },
  },
  {
    id: "mt_price",
    name: "Planes de pago",
    subject: { es: "{{nombre}}, estudiar {{programa}} cabe en tu presupuesto", en: "{{nombre}}, {{programa}} fits your budget" },
    body: {
      es: "Hola {{nombre}},\n\n{{parrafo_ia}}\n\nTe explicamos las opciones sin compromiso. El próximo grupo empieza el {{proximo_grupo}}.\n\nFMAIS – Admisiones",
      en: "Hi {{nombre}},\n\n{{parrafo_ia}}\n\nWe're happy to walk you through the options. The next class starts {{proximo_grupo}}.\n\nFMAIS – Admissions",
    },
    cta: { es: "Ver precios y planes", en: "See pricing and plans" },
  },
  {
    id: "mt_welcome",
    name: "Bienvenida a leads nuevos",
    subject: { es: "Bienvenida a FMAIS, {{nombre}}", en: "Welcome to FMAIS, {{nombre}}" },
    body: {
      es: "Hola {{nombre}},\n\n{{parrafo_ia}}\n\nMientras tanto, aquí tienes todo sobre {{programa}}: horarios, duración y cómo inscribirte.\n\nFMAIS",
      en: "Hi {{nombre}},\n\n{{parrafo_ia}}\n\nIn the meantime, here's everything about {{programa}}: schedules, length and how to enroll.\n\nFMAIS",
    },
    cta: { es: "Agendar una visita", en: "Book a visit" },
  },
  {
    id: "mt_referral",
    name: "Referidos de graduados",
    subject: { es: "{{nombre}}, ¿conoces a alguien para el próximo grupo?", en: "{{nombre}}, know someone for our next class?" },
    body: {
      es: "Hola {{nombre}},\n\n{{parrafo_ia}}\n\nGracias por ser parte de la familia FMAIS.",
      en: "Hi {{nombre}},\n\n{{parrafo_ia}}\n\nThank you for being part of the FMAIS family.",
    },
    cta: { es: "Referir a alguien", en: "Refer someone" },
  },
];

const SEGMENTS: Segment[] = [
  { id: "sg_followup", name: "Interesados que no se inscribieron", description: "Leads contactados o con tour, con 7 días o más sin inscribirse.", audience: "leads", filters: { stages: ["contacted", "tour_scheduled", "toured", "applied"], minDaysSinceCreated: 7 }, ccListId: "cc_list_followup" },
  { id: "sg_lost_price", name: "Perdidos por precio", description: "Leads que no se inscribieron por el costo.", audience: "leads", filters: { stages: ["lost"], lostReasons: ["Precio"] }, ccListId: "cc_list_price" },
  { id: "sg_lost_schedule", name: "Perdidos por horario", audience: "leads", filters: { stages: ["lost"], lostReasons: ["Horario no le sirve"] }, ccListId: "cc_list_schedule" },
  { id: "sg_new", name: "Leads nuevos (7 días)", description: "Para la secuencia de bienvenida.", audience: "leads", filters: { createdWithinDays: 7, stages: ["new", "contacted"] }, ccListId: "cc_list_new" },
  { id: "sg_meta_laser", name: "Meta Ads · Laser y electrólisis", audience: "leads", filters: { sources: ["meta_ads"], programIds: ["p_cel", "p_ele"], stages: ["new", "contacted", "tour_scheduled", "toured"] }, ccListId: "cc_list_meta" },
  { id: "sg_grads", name: "Graduados", description: "Para referidos y cursos de continuación.", audience: "students", filters: { studentStatuses: ["Graduated"] }, ccListId: "cc_list_grads" },
];

export function ensureMarketing(db: DB): DB {
  const next: DB = {
    ...db,
    segments: db.segments ?? [],
    marketingTemplates: db.marketingTemplates ?? [],
    campaigns: db.campaigns ?? [],
    marketingEvents: db.marketingEvents ?? [],
    settings: { ...db.settings },
  };

  // Consentimiento importado de Constant Contact (la escuela ya lo tiene registrado).
  const consent = <T extends { id: string; createdAt: string; marketingOptIn?: boolean }>(x: T, source: string): T => {
    if (x.marketingOptIn !== undefined) return x;
    const h = hash(x.id) % 100;
    return {
      ...x,
      marketingOptIn: h < 90,
      optInAt: h < 90 ? x.createdAt : undefined,
      optInSource: h < 90 ? source : undefined,
      unsubscribedAt: h >= 86 && h < 90 ? addDays(today(), -(h % 20) - 3) + "T15:00:00.000Z" : undefined,
      ccContactId: h < 90 ? `cc_${x.id}` : undefined,
      ccSyncedAt: h < 90 ? nowISO() : undefined,
    };
  };
  next.leads = db.leads.map((l) => consent(l, l.source === "web_form" ? "Formulario web" : l.source === "meta_ads" ? "Meta Lead Ads" : "Importado de Constant Contact"));
  next.students = db.students.map((s) => consent(s, "Portal de inscripción"));

  if (!next.marketingTemplates.length) next.marketingTemplates = TEMPLATES;
  if (!next.segments.length) next.segments = SEGMENTS;
  if (next.settings.ccConnected === undefined) {
    next.settings.ccConnected = true;
    next.settings.ccAccountName = "FMAIS (Constant Contact · demo)";
    next.settings.ccLastSyncAt = nowISO();
  }

  if (!next.campaigns.length) {
    // 1) Campaña ya enviada hace 10 días (fuera del límite de frecuencia), con resultados.
    const sent: Campaign = {
      ...agentDraft(next, { segmentId: "sg_followup", templateId: "mt_followup", goal: "Que los interesados terminen su inscripción para el próximo grupo.", personalize: true }),
      id: "cp_sent_followup",
      name: "Seguimiento a interesados · octubre",
      createdAt: addDays(today(), -11) + "T14:00:00.000Z",
      approvedBy: "u_owner",
      approvedAt: addDays(today(), -11) + "T16:00:00.000Z",
    };
    const res = simulateSend(next, sent, new Date(addDays(today(), -10) + "T10:00:00"));
    if (res) {
      next.campaigns.push(res.campaign);
      next.marketingEvents = [...res.events, ...next.marketingEvents];
      const patch = new Map(res.leads.map((l) => [l.id, l]));
      next.leads = next.leads.map((l) => patch.get(l.id) ?? l);
      const spatch = new Map(res.students.map((s) => [s.id, s]));
      next.students = next.students.map((s) => spatch.get(s.id) ?? s);
      next.leadActivities = [...res.activities, ...next.leadActivities];
    }
    // 2) Bienvenida recurrente ya aprobada.
    next.campaigns.push({
      ...agentDraft(next, { segmentId: "sg_new", templateId: "mt_welcome", goal: "Dar la bienvenida a cada lead nuevo el mismo día.", personalize: true }),
      id: "cp_welcome",
      status: "scheduled",
      recurring: true,
      approvedBy: "u_owner",
      approvedAt: addDays(today(), -10) + "T12:00:00.000Z",
      scheduledFor: undefined,
      createdAt: addDays(today(), -10) + "T11:00:00.000Z",
    });
    // 3) Borrador del agente esperando aprobación.
    next.campaigns.push({ ...agentDraft(next, { segmentId: "sg_lost_price", templateId: "mt_price", goal: "Recuperar leads perdidos por precio mostrando los planes de pago.", personalize: true }), id: "cp_pending_price" });
  }
  return next;
}
