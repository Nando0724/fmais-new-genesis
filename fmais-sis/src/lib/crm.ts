// CRM de admisiones — fase 7: seguimientos (Genesis: Follow Up), leads activos / inactivos y métricas.
import type { DB, FollowUp, FollowUpStep, FollowUpType, Lead, LeadStage, User } from "./types";
import { addDays, nowISO, STAGE_LABEL, today, uid } from "./utils";

export const FOLLOWUP_LABEL: Record<FollowUpType, string> = { call: "Llamar", whatsapp: "WhatsApp", email: "Email", sms: "SMS", tour: "Tour / cita", other: "Otro" };

export const DEFAULT_FOLLOWUP_PLAN: FollowUpStep[] = [
  { day: 0, type: "call", note: "Primer contacto: presentarse y confirmar programa y horario" },
  { day: 1, type: "whatsapp", note: "WhatsApp con información del programa" },
  { day: 3, type: "call", note: "Segunda llamada: resolver dudas y ofrecer tour" },
  { day: 7, type: "email", note: "Email con precios y opciones de pago" },
  { day: 14, type: "call", note: "Última llamada antes de pasar a inactivo" },
];

export const isOpenLead = (l: Lead) => l.active !== false && l.stage !== "lost" && l.stage !== "enrolled";
export const isPending = (f: FollowUp) => !f.completedAt && !f.canceled;

export type FollowUpBucket = "overdue" | "today" | "upcoming";
export const bucketOf = (f: FollowUp, on = today()): FollowUpBucket => (f.due < on ? "overdue" : f.due === on ? "today" : "upcoming");

/** Seguimientos pendientes de leads abiertos, filtrados por asesor (undefined = todos). */
export function pendingFollowUps(db: DB, ownerId?: string) {
  const leads = new Map(db.leads.map((l) => [l.id, l]));
  return db.followUps
    .filter(isPending)
    .map((f) => ({ f, lead: leads.get(f.leadId)! }))
    .filter((x) => x.lead && isOpenLead(x.lead))
    .filter((x) => !ownerId || (x.f.ownerId ?? x.lead.ownerId) === ownerId)
    .sort((a, b) => a.f.due.localeCompare(b.f.due));
}

/** Seguimientos que se crean con un lead nuevo según el plan de Configuración. */
export function planFor(lead: Lead, plan: FollowUpStep[], userId?: string, start = today()): FollowUp[] {
  const at = nowISO();
  return plan.map((s) => ({ id: uid(), leadId: lead.id, due: addDays(start, s.day), type: s.type, note: s.note, ownerId: lead.ownerId, createdAt: at, createdBy: userId ?? "auto" }));
}

/** Cierra (cancela) los seguimientos pendientes de un lead, p. ej. al marcarlo perdido o inscrito. */
export const closeFor = (db: DB, leadId: string, reason: string, userId?: string): FollowUp[] =>
  db.followUps.filter((f) => f.leadId === leadId && isPending(f)).map((f) => ({ ...f, canceled: true, completedAt: nowISO(), completedBy: userId, result: reason }));

/**
 * Convierte la "próxima acción" de versiones anteriores (o la que deja una regla de marketing)
 * en un seguimiento, y limpia los campos viejos.
 */
export function nextActionsToFollowUps(db: DB): DB {
  const withAction = db.leads.filter((l) => l.nextAction || l.nextActionDate);
  if (!withAction.length && db.followUps) return db;
  const at = nowISO();
  const created: FollowUp[] = withAction
    .filter((l) => l.stage !== "lost" && l.stage !== "enrolled")
    .map((l) => ({
      id: uid(),
      leadId: l.id,
      due: l.nextActionDate || today(),
      type: /whats/i.test(l.nextAction ?? "") ? "whatsapp" : /email|enviar/i.test(l.nextAction ?? "") ? "email" : /tour/i.test(l.nextAction ?? "") ? "tour" : "call",
      note: l.nextAction || "Seguimiento",
      ownerId: l.ownerId,
      createdAt: at,
      createdBy: "auto",
    }));
  const ids = new Set(withAction.map((l) => l.id));
  return {
    ...db,
    leads: db.leads.map((l) => (ids.has(l.id) ? { ...l, nextAction: undefined, nextActionDate: undefined } : l)),
    followUps: [...created, ...(db.followUps ?? [])],
  };
}

/** Completa datos guardados antes de la fase 7. */
export function ensurePhase7(db: DB): DB {
  const next = {
    ...db,
    followUps: db.followUps ?? [],
    settings: { ...db.settings, followUpPlan: db.settings.followUpPlan ?? DEFAULT_FOLLOWUP_PLAN, autoFollowUpPlan: db.settings.autoFollowUpPlan ?? true },
  };
  return nextActionsToFollowUps(next);
}

// ── Métricas ──────────────────────────────────────────────────────

const minutesToContact = (l: Lead) => (l.firstContactAt ? (new Date(l.firstContactAt).getTime() - new Date(l.createdAt).getTime()) / 60000 : undefined);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

export function fmtMinutes(m?: number) {
  if (m == null) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 1440) return `${Math.round(m / 6) / 10} h`;
  return `${Math.round(m / 144) / 10} d`;
}

const ORDER: LeadStage[] = ["new", "contacted", "tour_scheduled", "toured", "applied", "enrolled"];

/** Etapa más avanzada a la que llegó un lead. Para los perdidos se busca en su historial de cambios de etapa. */
function reachedIndex(db: DB, l: Lead) {
  if (l.stage !== "lost") return ORDER.indexOf(l.stage);
  const notes = db.leadActivities.filter((a) => a.leadId === l.id && a.type === "stage").map((a) => a.note.split("→")[1]?.trim());
  const fromHistory = ORDER.map((st, i) => (notes.includes(STAGE_LABEL[st]) ? i : -1));
  return Math.max(l.firstContactAt ? 1 : 0, ...fromHistory);
}

/** Embudo de los leads creados en el rango: cuántos llegaron al menos a cada etapa. */
export function funnel(db: DB, from: string, to: string) {
  const idx = db.leads.filter((l) => l.createdAt.slice(0, 10) >= from && l.createdAt.slice(0, 10) <= to).map((l) => reachedIndex(db, l));
  return { total: idx.length, steps: ORDER.map((st, i) => ({ name: STAGE_LABEL[st], count: idx.filter((x) => x >= i).length })) };
}

/** Desempeño por asesor en el rango (leads creados en el rango). */
export function byRep(db: DB, users: User[], from: string, to: string) {
  const T = today();
  return users.map((u) => {
    const ls = db.leads.filter((l) => l.ownerId === u.id && l.createdAt.slice(0, 10) >= from && l.createdAt.slice(0, 10) <= to);
    const contacted = ls.filter((l) => l.firstContactAt);
    const enrolled = ls.filter((l) => l.stage === "enrolled").length;
    const fu = db.followUps.filter((f) => (f.ownerId ?? db.leads.find((l) => l.id === f.leadId)?.ownerId) === u.id);
    const done = fu.filter((f) => f.completedAt && !f.canceled && f.completedAt.slice(0, 10) >= from && f.completedAt.slice(0, 10) <= to);
    const onTime = done.filter((f) => f.completedAt!.slice(0, 10) <= f.due).length;
    return {
      user: u,
      leads: ls.length,
      contacted: contacted.length,
      response: avg(contacted.map(minutesToContact).filter((m): m is number => m != null)),
      enrolled,
      conversion: ls.length ? enrolled / ls.length : undefined,
      done: done.length,
      onTime: done.length ? onTime / done.length : undefined,
      overdue: pendingFollowUps(db, u.id).filter((x) => x.f.due < T).length,
    };
  });
}
