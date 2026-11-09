// SAP (Satisfactory Academic Progress) y midpoints — fase 5. Manual de Genesis §4.7 y §8.3.
import { attendancePct, hoursAttended, midpointsReached, programOf, scheduledHours, trackedHoursUntil } from "./calc";
import type { DB, Grade, MidpointReview, Program, SapEvaluation, SapLevel, SapLevels, Student } from "./types";
import { addDays, nowISO, today } from "./utils";

export const SAP_RANK: Record<SapLevel, number> = { Critical: 0, Below: 1, OK: 2, Superior: 3 };
export const SAP_LABEL: Record<SapLevel, string> = { Critical: "Critical", Below: "Bajo OK", OK: "OK", Superior: "Superior" };
export const SAP_TONE: Record<SapLevel, "red" | "amber" | "green" | "blue"> = { Critical: "red", Below: "amber", OK: "green", Superior: "blue" };

/** Nivel según los mínimos del programa: debajo de Critical = Critical; entre Critical y OK = Bajo OK. */
export const levelFor = (pct: number | undefined, l: SapLevels): SapLevel | undefined =>
  pct == null ? undefined : pct >= l.superior ? "Superior" : pct >= l.ok ? "OK" : pct >= l.critical ? "Below" : "Critical";

export const lowest = (...ls: (SapLevel | undefined)[]) =>
  ls.filter((l): l is SapLevel => !!l).sort((a, b) => SAP_RANK[a] - SAP_RANK[b])[0];

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : undefined);

/** Funciones que cuentan para el estudiante: las activas y las que ya tienen nota (aunque luego se desactivaran). */
const countedRequirements = (p: Program, grades: Grade[]) => p.requirements.filter((r) => r.active !== false || grades.some((g) => g.requirementId === r.id));

export interface AcademicDetail {
  exam?: number;
  written?: number;
  requirement?: number; // unidades hechas / esperadas según el avance en horas
  weights: { exam: number; written: number; requirement: number };
  pct?: number;
}

/**
 * Promedio académico ponderado a una fecha.
 * - Exam y Written: promedio de los %. Un 0 significa "completado sin nota" y no entra en el promedio.
 * - Requirement: unidades hechas contra las esperadas para las horas que lleva (si lleva 50% de las horas, se esperan 50% de las unidades), tope 100.
 *   No se evalúa hasta que registre su primera unidad o llegue al primer midpoint.
 * - Si una categoría no tiene datos todavía, su peso se reparte entre las otras.
 */
export function academicDetail(s: Student, db: DB, asOf = today()): AcademicDetail {
  const p = programOf(s, db);
  const weights = { exam: p?.sap.weightExam ?? 0, written: p?.sap.weightWritten ?? 0, requirement: Math.max(0, 100 - (p?.sap.weightExam ?? 0) - (p?.sap.weightWritten ?? 0)) };
  if (!p) return { weights };
  const grades = db.grades.filter((g) => g.studentId === s.id && g.date <= asOf);
  const reqs = countedRequirements(p, grades);
  const pctsOf = (kind: "exam" | "written") =>
    reqs.filter((r) => r.kind === kind).flatMap((r) => grades.filter((g) => g.requirementId === r.id && (g.percent ?? 0) > 0).map((g) => g.percent!));
  const exam = avg(pctsOf("exam"));
  const written = avg(pctsOf("written"));
  const practical = reqs.filter((r) => r.kind === "practical");
  const hours = hoursAttended(s, db);
  const progress = p.totalHours ? Math.min(1, hours / p.totalHours) : 0;
  const expected = practical.reduce((t, r) => t + r.unitsRequired, 0) * progress;
  const done = practical.reduce((t, r) => t + Math.min(r.unitsRequired, grades.find((g) => g.requirementId === r.id)?.unitsDone ?? 0), 0);
  // Recién empezado (sin unidades y antes del primer midpoint): todavía no se evalúa la práctica.
  const firstMidpoint = p.midpoints.length ? Math.min(...p.midpoints) : p.totalHours * 0.25;
  const started = done > 0 || hours >= firstMidpoint;
  const requirement = started && expected >= 1 ? Math.min(100, (done / expected) * 100) : undefined;

  const parts = [
    { v: exam, w: weights.exam },
    { v: written, w: weights.written },
    { v: requirement, w: weights.requirement },
  ].filter((x) => x.v != null && x.w > 0);
  const totalW = parts.reduce((t, x) => t + x.w, 0);
  const pct = totalW ? round1(parts.reduce((t, x) => t + x.v! * x.w, 0) / totalW) : undefined;
  return {
    exam: exam == null ? undefined : round1(exam),
    written: written == null ? undefined : round1(written),
    requirement: requirement == null ? undefined : round1(requirement),
    weights,
    pct,
  };
}

export type SapResult = Omit<SapEvaluation, "id" | "at" | "by">;

/** Calcula el SAP a una fecha (asistencia hasta esa fecha incluida). No guarda nada. */
export function evaluateSap(s: Student, db: DB, asOf = addDays(today(), -1)): SapResult {
  const p = programOf(s, db);
  const academicPct = academicDetail(s, db, asOf).pct;
  const attPct = attendancePct(s, db, asOf);
  const academic = p ? levelFor(academicPct, p.sap.academic) : undefined;
  const attendance = p ? levelFor(attPct, p.sap.attendance) : undefined;
  return {
    studentId: s.id,
    asOf,
    academicPct,
    attendancePct: attPct,
    academic,
    attendance,
    overall: lowest(academic, attendance),
    hoursAttended: trackedHoursUntil(s, db, asOf),
    hoursScheduled: scheduledHours(s, db, asOf),
    verifiedPolicy: !!p?.sap.verified,
  };
}

export const lastSap = (studentId: string, db: DB) =>
  db.sapEvaluations.filter((e) => e.studentId === studentId).sort((a, b) => b.at.localeCompare(a.at))[0];

/** Probation que corresponde a un SAP Critical (la confirma una persona). */
export const probationFor = (r: Pick<SapResult, "academic" | "attendance">) =>
  r.academic === "Critical" ? "Academic" : r.attendance === "Critical" ? "Attendance" : undefined;

// ── Midpoints ─────────────────────────────────────────────────────

export interface PendingMidpoint {
  student: Student;
  units: number;
  number: number; // 1.º, 2.º…
  reachedOn: string;
}

const reviewed = (db: DB) => new Set(db.midpointReviews.map((r) => `${r.studentId}|${r.units}`));

/** Midpoints alcanzados y todavía no revisados (inscritos y en LOA). */
export function pendingMidpoints(db: DB): PendingMidpoint[] {
  const done = reviewed(db);
  return db.students
    .filter((s) => s.status === "Enrolled" || s.status === "LOA")
    .flatMap((s) =>
      midpointsReached(s, db).flatMap((m, i) => (m.date && !done.has(`${s.id}|${m.units}`) ? [{ student: s, units: m.units, number: i + 1, reachedOn: m.date }] : [])),
    )
    .sort((a, b) => b.reachedOn.localeCompare(a.reachedOn));
}

/** Da por revisados los midpoints alcanzados hace más de 3 semanas, para que la cola empiece solo con lo reciente. */
export function reviewOldMidpoints(db: DB): DB {
  const cutoff = addDays(today(), -21);
  const at = nowISO();
  const old: MidpointReview[] = pendingMidpoints(db)
    .filter((m) => m.reachedOn < cutoff)
    .map((m) => ({ id: `mr_${m.student.id}_${m.units}`, studentId: m.student.id, units: m.units, reachedOn: m.reachedOn, by: "Migración", at }));
  return { ...db, midpointReviews: [...db.midpointReviews, ...old] };
}

/** Completa datos guardados antes de la fase 5. */
export function ensurePhase5(db: DB): DB {
  if (db.sapEvaluations && db.midpointReviews) return db;
  const next = { ...db, sapEvaluations: db.sapEvaluations ?? [], midpointReviews: db.midpointReviews ?? [] };
  return db.midpointReviews ? next : reviewOldMidpoints(next);
}
