// Cálculos derivados (equivalentes a las funciones automáticas de Genesis).
import type { AttendanceRecord, DB, LedgerEntry, PaymentPlan, Schedule, Student } from "./types";
import { addDays, addMonths, diffDays, hoursBetween, parseDate, today } from "./utils";

export const currentScheduleId = (s: Student, on = today()) => {
  const valid = [...s.schedules].filter((a) => a.from <= on).sort((a, b) => b.from.localeCompare(a.from));
  return (valid[0] ?? s.schedules[0])?.scheduleId;
};

export const currentSchedule = (s: Student, db: DB) => db.schedules.find((x) => x.id === currentScheduleId(s));

export const dailyHours = (sch?: Schedule) => (sch ? hoursBetween(sch.start, sch.end, sch.breakMinutes) : 0);
export const weeklyHours = (sch?: Schedule) => (sch ? dailyHours(sch) * sch.days.length : 0);

export const studentAttendance = (s: Student, db: DB) =>
  db.attendance.filter((a) => a.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date));

/**
 * Asistencia que cuenta en este sistema: la que va desde la fecha de inicio de conteo.
 * Lo anterior ya está sumado en las horas importadas, así que no se cuenta dos veces.
 */
export const countedAttendance = (s: Student, db: DB) =>
  db.attendance.filter((a) => a.studentId === s.id && (!s.trackingStartDate || a.date >= s.trackingStartDate));

/** Primer día desde el que se calculan ausencias. */
export const trackingStart = (s: Student) => (s.trackingStartDate && s.trackingStartDate > s.firstClass ? s.trackingStartDate : s.firstClass);

export const programOf = (s: Student, db: DB) => db.programs.find((p) => p.id === s.programId);

/** ¿Este registro suma horas asistidas? Las excusadas solo si la política SAP del programa lo permite. */
export const countsAsAttended = (a: AttendanceRecord, s: Student, db: DB) =>
  a.type !== "Absent" && (a.type !== "Excused" || !!programOf(s, db)?.sap.excusedCountsAsAttended);

/** Horas asistidas en este sistema desde el inicio de conteo (sin importadas ni transferidas). */
export const trackedHours = (s: Student, db: DB) =>
  Math.round(countedAttendance(s, db).reduce((t, a) => t + (countsAsAttended(a, s, db) ? a.hours : 0), 0) * 100) / 100;

export const hoursAttended = (s: Student, db: DB) => Math.round((trackedHours(s, db) + s.transferHours + s.importedHours) * 100) / 100;

/** Último día en que estuvo en clase (las horas excusadas no cuentan como presencia). */
export const lastAttended = (s: Student, db: DB) =>
  studentAttendance(s, db).find((a) => a.type !== "Absent" && a.type !== "Excused" && a.hours > 0)?.date;

export const remainingHours = (s: Student, db: DB) => Math.max(0, (programOf(s, db)?.totalHours ?? 0) - hoursAttended(s, db));

export const progressPct = (s: Student, db: DB) => {
  const total = programOf(s, db)?.totalHours ?? 0;
  return total ? Math.min(100, Math.round((hoursAttended(s, db) / total) * 100)) : 0;
};

/** Asientos que cuentan: todos menos los anulados. Usar siempre en balances y reportes. */
export const liveLedger = (db: DB) => db.ledger.filter((l) => !l.voided);

export const studentLedger = (studentId: string, db: DB) =>
  liveLedger(db).filter((l) => l.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date));

export const balance = (studentId: string, db: DB) =>
  Math.round(liveLedger(db).filter((l) => l.studentId === studentId).reduce((t, l) => t + l.charge - l.payment, 0) * 100) / 100;

/**
 * "Por verificar" (manual de Genesis §6.7): el asiento se modificó en una fecha distinta a la suya
 * y nadie lo ha revisado después del cambio.
 */
export const needsVerification = (l: LedgerEntry) =>
  !!l.modifiedAt && l.modifiedAt.slice(0, 10) !== l.date && (!l.verifiedAt || l.verifiedAt < l.modifiedAt);

export const inLOA = (s: Student, date: string) => s.loas.some((l) => l.start <= date && (!l.end || l.end >= date));

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Feriados/ajustes que aplican a un programa en una fecha (los sin programa aplican a todos). */
export const adjustmentsOn = (date: string, db: DB, programId?: string) =>
  db.holidays.filter((h) => h.date === date && (!h.programId || !programId || h.programId === programId));

/**
 * Horas programadas de un día según el horario, menos feriados y ajustes.
 * Un ajuste sin horas cierra el día completo; con horas, descuenta solo el tramo que se cruza con la clase.
 */
export const scheduledHoursOn = (date: string, sch: Schedule | undefined, db: DB, programId?: string) => {
  if (!sch || !sch.days.includes(parseDate(date).getDay())) return 0;
  const adj = adjustmentsOn(date, db, programId);
  if (adj.some((h) => !h.start || !h.end)) return 0;
  const start = toMin(sch.start);
  const end = toMin(sch.end);
  const closed = adj.reduce((t, h) => t + Math.max(0, Math.min(end, toMin(h.end!)) - Math.max(start, toMin(h.start!))), 0);
  const minutes = Math.max(0, end - start - closed - (closed ? 0 : sch.breakMinutes));
  return Math.round((minutes / 60) * 100) / 100;
};

/** Día de clase: el horario lo incluye y no hay un feriado que lo cierre por completo. */
export const isScheduledDay = (date: string, sch: Schedule | undefined, db: DB, programId?: string) =>
  scheduledHoursOn(date, sch, db, programId) > 0;

/** Horario que tenía el estudiante en una fecha (respeta los cambios de horario). */
export const scheduleOn = (s: Student, db: DB, date: string) => db.schedules.find((x) => x.id === currentScheduleId(s, date));

/** Días de clase programados consecutivos sin asistencia, contando hacia atrás desde hoy. */
export const consecutiveAbsences = (s: Student, db: DB, on = today()) => {
  if (s.status !== "Enrolled") return 0;
  const recs = db.attendance.filter((a) => a.studentId === s.id);
  const attended = new Set(recs.filter((a) => a.type !== "Absent" && a.type !== "Excused" && (a.hours > 0 || (a.timeIn && !a.timeOut))).map((a) => a.date));
  const excused = new Set(recs.filter((a) => a.type === "Excused").map((a) => a.date));
  const from = trackingStart(s);
  let count = 0;
  let d = addDays(on, -1);
  for (let i = 0; i < 90 && d >= from; i++, d = addDays(d, -1)) {
    // Un día excusado o en LOA no rompe la racha ni suma a ella.
    if (inLOA(s, d) || excused.has(d) || !isScheduledDay(d, scheduleOn(s, db, d), db, s.programId)) continue;
    if (attended.has(d)) break;
    count++;
  }
  return count;
};

/** Última fecha que cuenta para horas programadas: hoy, o el fin de la inscripción si ya terminó. */
const scheduleEnd = (s: Student, db: DB, until: string) => {
  if (s.status === "Enrolled" || s.status === "LOA" || s.status === "Applicant") return until;
  const end = s.completionDate || lastAttended(s, db) || until;
  return end < until ? end : until;
};

/**
 * Horas programadas desde el inicio de conteo hasta `until` (incluido): horario de cada día
 * (con sus cambios), menos feriados y ajustes, menos días en LOA. Base del SAP de asistencia.
 */
export const scheduledHours = (s: Student, db: DB, until = addDays(today(), -1)) => {
  const end = scheduleEnd(s, db, until);
  let total = 0;
  let d = trackingStart(s);
  for (let i = 0; i < 2500 && d <= end; i++, d = addDays(d, 1)) {
    if (!inLOA(s, d)) total += scheduledHoursOn(d, scheduleOn(s, db, d), db, s.programId);
  }
  return Math.round(total * 100) / 100;
};

/** Horas asistidas desde el inicio de conteo hasta `until` (incluido). */
export const trackedHoursUntil = (s: Student, db: DB, until = addDays(today(), -1)) =>
  Math.round(countedAttendance(s, db).filter((a) => a.date <= until).reduce((t, a) => t + (countsAsAttended(a, s, db) ? a.hours : 0), 0) * 100) / 100;

/** % de asistencia: horas asistidas / programadas (hasta ayer). undefined si aún no hay horas programadas. */
export const attendancePct = (s: Student, db: DB, until = addDays(today(), -1)) => {
  const sched = scheduledHours(s, db, until);
  return sched > 0 ? Math.round((trackedHoursUntil(s, db, until) / sched) * 1000) / 10 : undefined;
};

/** Registros con entrada pero sin salida de días anteriores (Check Swipes de Genesis). */
export const missingOuts = (db: DB, before = today()) =>
  db.attendance.filter((a) => a.type !== "Absent" && a.timeIn && !a.timeOut && a.date < before).sort((a, b) => b.date.localeCompare(a.date));

/** Fecha proyectada de graduación según horas restantes y horario actual. */
export const projectedGrad = (s: Student, db: DB) => {
  if (s.status === "Graduated") return s.completionDate;
  const sch = currentSchedule(s, db);
  let remaining = remainingHours(s, db);
  if (!sch || !dailyHours(sch) || s.status !== "Enrolled") return undefined;
  let d = today();
  for (let i = 0; i < 1500 && remaining > 0; i++) {
    d = addDays(d, 1);
    remaining -= scheduledHoursOn(d, sch, db, s.programId);
  }
  return d;
};

/** Fechas en que se alcanzó cada midpoint del programa. */
export const midpointsReached = (s: Student, db: DB) => {
  const p = programOf(s, db);
  if (!p) return [];
  const recs = countedAttendance(s, db).filter((a) => countsAsAttended(a, s, db)).sort((a, b) => a.date.localeCompare(b.date));
  let cum = s.transferHours + s.importedHours;
  // Los midpoints ya superados con horas importadas se fechan en el inicio de conteo.
  const out: { units: number; date?: string }[] = p.midpoints.map((m) => ({ units: m, date: cum >= m ? trackingStart(s) : undefined }));
  for (const r of recs) {
    cum += r.hours;
    out.forEach((m) => {
      if (!m.date && cum >= m.units) m.date = r.date;
    });
  }
  return out;
};

export const isAboutToGrad = (s: Student, db: DB) =>
  s.status === "Enrolled" && remainingHours(s, db) > 0 && remainingHours(s, db) <= db.settings.aboutToGradHours;

export const planStatus = (p: PaymentPlan, db: DB): "overdue" | "due_soon" | "ok" | "inactive" => {
  if (!p.active) return "inactive";
  const d = diffDays(p.nextDue, today());
  if (d < 0) return "overdue";
  if (d <= db.settings.reminderDaysBefore) return "due_soon";
  return "ok";
};

export const advanceDue = (p: PaymentPlan) =>
  p.frequency === "monthly" ? addMonths(p.nextDue, 1) : addDays(p.nextDue, p.frequency === "weekly" ? 7 : 14);

export const nextReceipt = (db: DB) => String(Math.max(7000, ...db.ledger.map((l) => Number(l.receipt) || 0)) + 1);

export const nextBadge = (db: DB) => {
  const year = new Date().getFullYear();
  const max = Math.max(0, ...db.students.filter((s) => s.badge.startsWith(String(year))).map((s) => Number(s.badge.slice(4)) || 0));
  return `${year}${String(max + 1).padStart(4, "0")}`;
};
