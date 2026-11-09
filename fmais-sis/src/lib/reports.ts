// Catálogo de reportes (manual de Genesis §9 · especificación §5.6). Cada reporte es una función pura db + filtros → filas.
import {
  balance, consecutiveAbsences, countsAsAttended, currentSchedule, currentScheduleId, hoursAttended, inLOA, isScheduledDay, lastAttended,
  liveLedger, needsVerification, planStatus, programOf, scheduledHours, scheduleOn,
} from "./calc";
import { letterFor } from "./config";
import { academicDetail, evaluateSap, SAP_LABEL } from "./sap";
import { LEAD_SOURCES, type DB, type EnrollmentStatus, type Program, type SapLevel, type Student } from "./types";
import { addDays, diffDays, fmtDate, fmtTime, fullName, maskSSN, money, SOURCE_LABEL } from "./utils";

export type Row = Record<string, string | number>;
export type FilterKey = "range" | "date" | "year" | "program" | "programRequired" | "status" | "schedule" | "student" | "sort";

export interface Filters {
  from: string;
  to: string; // también "a la fecha" en reportes de un solo día
  year: number;
  program: string;
  status: string; // "" = todos · "NoStart" = retirados sin horas
  schedule: string;
  student: string;
  sort: "name" | "number";
}

export interface ReportResult {
  rows: Row[];
  note?: string; // aviso arriba del reporte
  totals?: Row; // fila de totales
}

export interface ReportDef {
  id: string;
  group: string;
  name: string;
  desc: string;
  genesis?: string; // nombre en Genesis
  filters: FilterKey[];
  defaultStatus?: string;
  kind?: "table" | "labels" | "signin";
  pending?: string; // reporte de un módulo que todavía no existe
  run?: (db: DB, f: Filters) => ReportResult;
}

export const STATUS_ES: Record<EnrollmentStatus, string> = { Applicant: "Aplicante", Enrolled: "Inscrito", LOA: "LOA", Graduated: "Graduado", Withdrawn: "Retirado", Dropped: "Baja" };
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");
const byName = (a: Student, b: Student) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
const code = (s: Student, db: DB) => programOf(s, db)?.code ?? "";

/** Estudiantes según programa, estado, horario y estudiante. "NoStart" = retirado o baja sin ninguna hora. */
export function filteredStudents(db: DB, f: Filters) {
  return db.students
    .filter((s) => !f.program || s.programId === f.program)
    .filter((s) => !f.status || (f.status === "NoStart" ? (s.status === "Withdrawn" || s.status === "Dropped") && hoursAttended(s, db) === 0 : s.status === f.status))
    .filter((s) => !f.schedule || currentScheduleId(s) === f.schedule)
    .filter((s) => !f.student || s.id === f.student)
    .sort(byName);
}

const programFor = (db: DB, f: Filters): Program | undefined => db.programs.find((p) => p.id === f.program) ?? db.programs.find((p) => p.active);

/** Estudiantes que deberían estar en clase en una fecha (inscritos, ya empezaron, no en LOA, día de clase). */
export function expectedOn(db: DB, date: string, scheduleId?: string) {
  return db.students
    .filter((s) => s.status === "Enrolled" && s.firstClass <= date && !inLOA(s, date))
    .filter((s) => !scheduleId || currentScheduleId(s, date) === scheduleId)
    .filter((s) => isScheduledDay(date, scheduleOn(s, db, date), db, s.programId))
    .sort(byName);
}

// Matriz estudiante × función de un tipo, para los reportes Exam / Written / Requirements por programa.
function functionMatrix(db: DB, f: Filters, kind: "exam" | "written" | "practical"): ReportResult {
  const p = programFor(db, f);
  if (!p) return { rows: [] };
  const reqs = p.requirements.filter((r) => r.kind === kind && r.active !== false);
  const rows = filteredStudents(db, { ...f, program: p.id }).map((s) => {
    const row: Row = { Badge: s.badge, Estudiante: fullName(s), Estado: STATUS_ES[s.status] };
    for (const r of reqs) {
      const g = db.grades.find((x) => x.studentId === s.id && x.requirementId === r.id);
      row[r.name] = kind === "practical" ? `${Math.min(r.unitsRequired, g?.unitsDone ?? 0)} / ${r.unitsRequired}` : g ? (g.percent ? `${g.percent}% ${letterFor(g.percent, p)}` : "Completado") : "";
    }
    return row;
  });
  return { rows, note: `Programa: ${p.code} · ${p.name}${f.program ? "" : " (elige un programa arriba)"}` };
}

const LEVEL_ORDER: (SapLevel | "none")[] = ["Critical", "Below", "OK", "Superior", "none"];

export const REPORTS: ReportDef[] = [
  // ── Académico ──
  {
    id: "acad_completed", group: "Académico", name: "Completados", genesis: "Academic › Completed", desc: "Notas y unidades registradas en un rango, por estudiante.",
    filters: ["range", "program", "status", "student"], defaultStatus: "Enrolled",
    run: (db, f) => {
      const ids = new Set(filteredStudents(db, f).map((s) => s.id));
      const rows = db.grades
        .filter((g) => ids.has(g.studentId) && g.date >= f.from && g.date <= f.to)
        .map((g) => {
          const s = db.students.find((x) => x.id === g.studentId)!;
          const p = programOf(s, db);
          const r = p?.requirements.find((x) => x.id === g.requirementId);
          return {
            Fecha: g.date, Badge: s.badge, Estudiante: fullName(s), Programa: p?.code ?? "", Función: r?.name ?? "—",
            Tipo: r?.kind === "practical" ? "Requirement" : r?.kind === "exam" ? "Exam" : "Written",
            Resultado: r?.kind === "practical" ? `${g.unitsDone ?? 0} / ${r.unitsRequired} u.` : g.percent ? `${g.percent}% (${letterFor(g.percent, p)})` : "Completado sin nota",
          };
        })
        .sort((a, b) => a.Estudiante.localeCompare(b.Estudiante) || a.Fecha.localeCompare(b.Fecha))
        .map((r) => ({ ...r, Fecha: fmtDate(r.Fecha) }));
      return { rows };
    },
  },
  {
    id: "acad_summary", group: "Académico", name: "Resumen académico", genesis: "Academic › Summary", desc: "Promedios Exam / Written, unidades y nota ponderada del SAP.",
    filters: ["program", "status", "student"], defaultStatus: "Enrolled",
    run: (db, f) => ({
      rows: filteredStudents(db, f).map((s) => {
        const p = programOf(s, db);
        const d = academicDetail(s, db);
        const prac = p?.requirements.filter((r) => r.kind === "practical") ?? [];
        const done = prac.reduce((t, r) => t + Math.min(r.unitsRequired, db.grades.find((g) => g.studentId === s.id && g.requirementId === r.id)?.unitsDone ?? 0), 0);
        return {
          Badge: s.badge, Estudiante: fullName(s), Programa: p?.code ?? "",
          Exam: d.exam != null ? `${d.exam}%` : "—", Written: d.written != null ? `${d.written}%` : "—",
          "Unidades práct.": `${done} / ${prac.reduce((t, r) => t + r.unitsRequired, 0)}`,
          "Nota ponderada": d.pct != null ? `${d.pct}% (${letterFor(d.pct, p)})` : "—",
        };
      }),
    }),
  },
  { id: "acad_exam", group: "Académico", name: "Exam por programa", genesis: "Academic › Exam", desc: "Todos los exámenes del programa por estudiante.", filters: ["programRequired", "status"], defaultStatus: "Enrolled", run: (db, f) => functionMatrix(db, f, "exam") },
  { id: "acad_written", group: "Académico", name: "Written por programa", genesis: "Academic › Written", desc: "Quizzes y trabajos escritos por estudiante.", filters: ["programRequired", "status"], defaultStatus: "Enrolled", run: (db, f) => functionMatrix(db, f, "written") },
  { id: "acad_req", group: "Académico", name: "Requirements por programa", genesis: "Academic › Requirements", desc: "Unidades prácticas hechas / requeridas.", filters: ["programRequired", "status"], defaultStatus: "Enrolled", run: (db, f) => functionMatrix(db, f, "practical") },

  // ── Asistencia ──
  {
    id: "att_detail", group: "Asistencia", name: "Detalle de asistencia", genesis: "Attendance › Detail", desc: "Cada registro (entrada, salida, breaks, horas) en un rango.",
    filters: ["range", "program", "schedule", "status", "student"], defaultStatus: "Enrolled",
    run: (db, f) => {
      const byId = new Map(filteredStudents(db, f).map((s) => [s.id, s]));
      const TYPE: Record<string, string> = { Regular: "Regular", Makeup: "Recuperación", Clinic: "Clínica", "Non-Clinic": "No clínica", Excused: "Excusado", Absent: "Ausente" };
      const recs = db.attendance.filter((a) => byId.has(a.studentId) && a.date >= f.from && a.date <= f.to).sort((a, b) => byName(byId.get(a.studentId)!, byId.get(b.studentId)!) || a.date.localeCompare(b.date));
      const rows = recs.map((a) => {
        const s = byId.get(a.studentId)!;
        return { Fecha: fmtDate(a.date), Badge: s.badge, Estudiante: fullName(s), Tipo: TYPE[a.type], Entrada: fmtTime(a.timeIn), Salida: a.timeIn && !a.timeOut && a.type !== "Absent" ? "SIN SALIDA" : fmtTime(a.timeOut), Breaks: a.breakMinutes, Horas: a.hours };
      });
      return { rows, totals: rows.length ? { Fecha: "Total", Horas: r2(rows.reduce((t, r) => t + r.Horas, 0)) } : undefined };
    },
  },
  {
    id: "att_summary", group: "Asistencia", name: "Resumen de asistencia", genesis: "Attendance › Summary", desc: "Horas programadas vs. asistidas y % en un rango, por programa.",
    filters: ["range", "program", "schedule", "status"], defaultStatus: "Enrolled",
    run: (db, f) => {
      let sched = 0, att = 0;
      const rows = filteredStudents(db, f)
        .sort((a, b) => code(a, db).localeCompare(code(b, db)) || byName(a, b))
        .map((s) => {
          const sc = r2(scheduledHours(s, db, f.to) - scheduledHours(s, db, addDays(f.from, -1)));
          const recs = db.attendance.filter((a) => a.studentId === s.id && a.date >= f.from && a.date <= f.to && (!s.trackingStartDate || a.date >= s.trackingStartDate));
          const at = r2(recs.reduce((t, a) => t + (countsAsAttended(a, s, db) ? a.hours : 0), 0));
          sched += sc; att += at;
          return {
            Programa: code(s, db), Badge: s.badge, Estudiante: fullName(s), Programadas: sc, Asistidas: at, "%": pct(at, sc),
            Ausencias: recs.filter((a) => a.type === "Absent").length, Excusadas: recs.filter((a) => a.type === "Excused").length, "Horas totales": hoursAttended(s, db),
          };
        });
      return { rows, totals: rows.length ? { Programa: "Total", Programadas: r2(sched), Asistidas: r2(att), "%": pct(att, sched) } : undefined };
    },
  },

  // ── Ledger ──
  {
    id: "led_payments", group: "Ledger", name: "Pagos", genesis: "Ledger › Payments", desc: "Pagos y reembolsos de un rango, con recibo y cuenta. Avisa si hay asientos por verificar.",
    filters: ["range", "program"],
    run: (db, f) => {
      const sById = new Map(db.students.map((s) => [s.id, s]));
      const pays = liveLedger(db).filter((l) => l.payment !== 0 && l.date >= f.from && l.date <= f.to && (!f.program || sById.get(l.studentId)?.programId === f.program)).sort((a, b) => a.date.localeCompare(b.date));
      const verify = pays.filter(needsVerification).length;
      const rows = pays.map((l) => {
        const s = sById.get(l.studentId);
        return {
          Fecha: fmtDate(l.date), Recibo: l.receipt ?? "", Estudiante: s ? fullName(s) : "—", Concepto: l.description, Método: l.method ?? "", Cuenta: l.account ?? "",
          Inst: l.institutional ? "Sí" : "No", Monto: money(l.payment), "Por verificar": needsVerification(l) ? "SÍ" : "",
        };
      });
      return {
        rows,
        totals: rows.length ? { Fecha: "Total", Monto: money(pays.reduce((t, l) => t + l.payment, 0)) } : undefined,
        note: verify ? `⚠ ${verify} asiento(s) de este rango están por verificar (se modificaron en otra fecha). Revísalos antes de cerrar.` : undefined,
      };
    },
  },
  {
    id: "led_summary", group: "Ledger", name: "Resumen de pagos", genesis: "Ledger › Payment Summary", desc: "Pagos por mes y método, menos reembolsos. Sin anulados.",
    filters: ["range"],
    run: (db, f) => {
      const pays = liveLedger(db).filter((l) => l.payment !== 0 && l.date >= f.from && l.date <= f.to);
      const months = [...new Set(pays.map((l) => l.date.slice(0, 7)))].sort();
      const methods = [...new Set(pays.filter((l) => l.payment > 0).map((l) => l.method ?? "—"))].sort();
      const sum = (ls: typeof pays) => ls.reduce((t, l) => t + l.payment, 0);
      const line = (label: string, pm: typeof pays): Row => ({
        Mes: label,
        ...Object.fromEntries(methods.map((me) => [me, money(sum(pm.filter((l) => l.payment > 0 && (l.method ?? "—") === me)))])),
        Reembolsos: money(sum(pm.filter((l) => l.payment < 0))),
        "Total neto": money(sum(pm)),
        Pagos: pm.filter((l) => l.payment > 0).length,
      });
      return { rows: months.map((m) => line(m, pays.filter((l) => l.date.startsWith(m)))), totals: pays.length ? line("Total", pays) : undefined };
    },
  },
  {
    id: "led_program", group: "Ledger", name: "Resumen por programa", genesis: "Ledger › Program Summary", desc: "Cargos, pagos y balance por programa.",
    filters: ["status"],
    run: (db, f) => {
      const live = liveLedger(db);
      const rows = db.programs.map((p) => {
        const ss = filteredStudents(db, { ...f, program: p.id });
        const ids = new Set(ss.map((s) => s.id));
        const ls = live.filter((l) => ids.has(l.studentId));
        const charges = ls.reduce((t, l) => t + l.charge, 0);
        const paid = ls.reduce((t, l) => t + l.payment, 0);
        return { Programa: `${p.code} · ${p.name}`, Estudiantes: ss.length, Cargos: charges, Pagos: paid, Balance: charges - paid, "Con balance": ss.filter((s) => balance(s.id, db) > 0).length };
      }).filter((r) => r.Estudiantes > 0);
      const tot = (k: "Cargos" | "Pagos" | "Balance") => money(rows.reduce((t, r) => t + r[k], 0));
      return {
        rows: rows.map((r) => ({ ...r, Cargos: money(r.Cargos), Pagos: money(r.Pagos), Balance: money(r.Balance) })),
        totals: rows.length ? { Programa: "Total", Estudiantes: rows.reduce((t, r) => t + r.Estudiantes, 0), Cargos: tot("Cargos"), Pagos: tot("Pagos"), Balance: tot("Balance") } : undefined,
      };
    },
  },
  {
    id: "led_delinquency", group: "Ledger", name: "Morosidad", genesis: "Ledger › Delinquency", desc: "Balances pendientes y pagos vencidos.",
    filters: ["program", "status"],
    run: (db, f) => {
      const rows = filteredStudents(db, f)
        .map((s) => ({ s, bal: balance(s.id, db), plan: db.plans.find((p) => p.studentId === s.id && p.active) }))
        .filter((x) => x.bal > 0)
        .sort((a, b) => b.bal - a.bal);
      return {
        rows: rows.map(({ s, bal, plan }) => {
          const st = plan ? planStatus(plan, db) : "";
          return {
            Badge: s.badge, Estudiante: fullName(s), Estado: STATUS_ES[s.status], Balance: money(bal), Modalidad: plan ? (plan.mode === "zelle" ? "Zelle" : "Automático") : "Sin plan",
            "Próximo pago": fmtDate(plan?.nextDue), Situación: st === "overdue" ? "VENCIDO" : st === "due_soon" ? "Vence pronto" : st === "ok" ? "Al día" : "—", Celular: s.cell, Email: s.email,
          };
        }),
        totals: rows.length ? { Badge: "Total", Balance: money(rows.reduce((t, x) => t + x.bal, 0)) } : undefined,
      };
    },
  },
  {
    id: "led_1098t", group: "Ledger", name: "Datos 1098-T", desc: "Pagos recibidos y reembolsos del año por estudiante (asientos institucionales).",
    filters: ["year", "program"],
    run: (db, f) => {
      const y = String(f.year);
      const live = liveLedger(db).filter((l) => l.date.startsWith(y) && l.payment !== 0 && l.institutional !== false);
      const rows = filteredStudents(db, { ...f, status: "" })
        .map((s) => {
          const ls = live.filter((l) => l.studentId === s.id);
          const paid = ls.filter((l) => l.payment > 0).reduce((t, l) => t + l.payment, 0);
          const refunds = -ls.filter((l) => l.payment < 0).reduce((t, l) => t + l.payment, 0);
          return { s, paid, refunds };
        })
        .filter((x) => x.paid || x.refunds)
        .map(({ s, paid, refunds }) => ({
          Estudiante: fullName(s), SSN: maskSSN(s.ssn), Dirección: [s.address1, s.address2].filter(Boolean).join(" "), Ciudad: `${s.city}, ${s.state} ${s.zip}`,
          "Pagos recibidos (Box 1)": money(paid), "Reembolsos (Box 4*)": money(refunds), Neto: money(paid - refunds),
        }));
      return { rows, note: `Año ${y}. Cuentan los pagos institucionales sin anular; los reembolsos son pagos negativos. *Confirmar con el contador qué cuentas son "qualified tuition" y cómo se reportan los ajustes de años anteriores.` };
    },
  },

  // ── Estudiantes ──
  {
    id: "stu_roster", group: "Estudiantes", name: "Roster", genesis: "Students › Roster", desc: "Inscritos, graduados, no-start o retirados, por programa y horario.",
    filters: ["program", "schedule", "status"], defaultStatus: "Enrolled",
    run: (db, f) => ({
      rows: filteredStudents(db, f).map((s) => ({
        Badge: s.badge, Estudiante: fullName(s), Programa: code(s, db), Horario: currentSchedule(s, db)?.name ?? "", Estado: STATUS_ES[s.status],
        "Primera clase": fmtDate(s.firstClass), "Grad. contrato": fmtDate(s.contractGrad), Terminó: fmtDate(s.completionDate), Horas: hoursAttended(s, db),
        "Último día": fmtDate(lastAttended(s, db)), Celular: s.cell,
      })),
    }),
  },
  {
    id: "stu_badge", group: "Estudiantes", name: "Badge #", genesis: "Students › Badge # (por nombre / por número)", desc: "Lista de badges ordenada por nombre o por número.",
    filters: ["program", "status", "sort"], defaultStatus: "Enrolled",
    run: (db, f) => {
      const ss = filteredStudents(db, f);
      if (f.sort === "number") ss.sort((a, b) => a.badge.localeCompare(b.badge));
      return { rows: ss.map((s) => ({ "Badge #": s.badge, Estudiante: fullName(s), Programa: code(s, db), Horario: currentSchedule(s, db)?.name ?? "", Estado: STATUS_ES[s.status] })) };
    },
  },
  {
    id: "stu_locker", group: "Estudiantes", name: "Locker #", genesis: "Students › Locker # (por nombre / por número)", desc: "Lockers asignados, por nombre o por número. No muestra la combinación.",
    filters: ["program", "status", "sort"], defaultStatus: "Enrolled",
    run: (db, f) => {
      const ss = filteredStudents(db, f).filter((s) => s.locker);
      if (f.sort === "number") ss.sort((a, b) => (a.locker ?? "").localeCompare(b.locker ?? "", undefined, { numeric: true }));
      return { rows: ss.map((s) => ({ "Locker #": s.locker ?? "", Estudiante: fullName(s), Badge: s.badge, Programa: code(s, db) })) };
    },
  },
  {
    id: "stu_education", group: "Estudiantes", name: "Educación previa", genesis: "Students › Education", desc: "Nivel de estudios y escuela secundaria.",
    filters: ["program", "status"], defaultStatus: "Enrolled",
    run: (db, f) => ({ rows: filteredStudents(db, f).map((s) => ({ Estudiante: fullName(s), Programa: code(s, db), Educación: s.education ?? "—", "Escuela secundaria": s.highSchool ?? "—", Ciudad: s.hsCity ?? "—" })) }),
  },
  {
    id: "stu_ethnicity", group: "Estudiantes", name: "Etnia", genesis: "Students › Ethnicity", desc: "Conteo por etnia y programa.",
    filters: ["status", "range"], defaultStatus: "",
    run: (db, f) => {
      // Rango = fecha de inscripción.
      const ss = filteredStudents(db, { ...f, program: "" }).filter((s) => s.enrollmentDate >= f.from && s.enrollmentDate <= f.to);
      const eths = [...new Set(ss.map((s) => s.ethnicity || "Sin dato"))].sort();
      const progs = db.programs.filter((p) => ss.some((s) => s.programId === p.id));
      const row = (label: string, list: Student[]): Row => ({ Etnia: label, ...Object.fromEntries(progs.map((p) => [p.code, list.filter((s) => s.programId === p.id).length])), Total: list.length, "%": pct(list.length, ss.length) });
      return { rows: eths.map((e) => row(e, ss.filter((s) => (s.ethnicity || "Sin dato") === e))), totals: ss.length ? row("Total", ss) : undefined, note: "Rango por fecha de inscripción." };
    },
  },
  {
    id: "stu_loa", group: "Estudiantes", name: "Leave of Absence", genesis: "Students › LOA", desc: "LOA que se cruzan con el rango, con días y motivo.",
    filters: ["range", "program"],
    run: (db, f) => ({
      rows: db.students
        .filter((s) => !f.program || s.programId === f.program)
        .flatMap((s) => s.loas.filter((l) => l.start <= f.to && (!l.end || l.end >= f.from)).map((l) => ({ s, l })))
        .sort((a, b) => a.l.start.localeCompare(b.l.start))
        .map(({ s, l }) => ({ Estudiante: fullName(s), Programa: code(s, db), Inicio: fmtDate(l.start), Fin: fmtDate(l.end), Días: l.end ? diffDays(l.end, l.start) + 1 : "abierto", Motivo: l.reason ?? "", Estado: STATUS_ES[s.status] })),
    }),
  },
  {
    id: "stu_placement", group: "Estudiantes", name: "Colocación", genesis: "Students › Placement", desc: "Graduados del rango, State Board y empleo por programa.",
    filters: ["range", "program"],
    run: (db, f) => {
      const rows = db.programs.filter((p) => !f.program || p.id === f.program).map((p) => {
        const grads = db.students.filter((s) => s.programId === p.id && s.status === "Graduated" && (s.completionDate ?? "") >= f.from && (s.completionDate ?? "") <= f.to);
        const board = grads.filter((s) => s.placement.passedBoard === "Yes").length;
        const took = grads.filter((s) => s.placement.passedBoard === "Yes" || s.placement.passedBoard === "No").length;
        const hired = grads.filter((s) => s.placement.hireDate || s.placement.company).length;
        return { Programa: `${p.code} · ${p.name}`, Graduados: grads.length, "Tomaron el board": took, Aprobaron: board, "% aprobados": pct(board, took), Colocados: hired, "% colocación": pct(hired, grads.length) };
      }).filter((r) => r.Graduados > 0);
      return { rows, note: "Rango por fecha de graduación. El detalle por estudiante está en Académico › Colocación." };
    },
  },
  {
    id: "stu_sap", group: "Estudiantes", name: "Evaluación SAP", genesis: "Students › SAP Evaluation", desc: "SAP de cada estudiante calculado a una fecha.",
    filters: ["date", "program", "schedule", "status"], defaultStatus: "Enrolled",
    run: (db, f) => {
      const rows = filteredStudents(db, f).map((s) => {
        const e = evaluateSap(s, db, f.to);
        const lv = (l?: SapLevel) => (l ? SAP_LABEL[l] : "—");
        return {
          Badge: s.badge, Estudiante: fullName(s), Programa: code(s, db), Académico: e.academicPct != null ? `${e.academicPct}%` : "—", "Nivel acad.": lv(e.academic),
          Asistencia: e.attendancePct != null ? `${e.attendancePct}%` : "—", "Nivel asist.": lv(e.attendance), "SAP general": lv(e.overall), Probation: s.probation || "",
        };
      });
      return { rows, note: db.programs.some((p) => !p.sap.verified) ? "Calculado con los mínimos SAP de ejemplo (por verificar con la escuela)." : undefined };
    },
  },
  {
    id: "stu_sap_summary", group: "Estudiantes", name: "Resumen SAP", genesis: "Students › SAP Summary", desc: "Cuántos estudiantes hay en cada nivel, por programa, a una fecha.",
    filters: ["date", "status"], defaultStatus: "Enrolled",
    run: (db, f) => {
      const LBL: Record<string, string> = { Critical: "Critical", Below: "Bajo OK", OK: "OK", Superior: "Superior", none: "Sin datos" };
      const all: Record<string, number> = {};
      const rows = db.programs.map((p) => {
        const ss = filteredStudents(db, { ...f, program: p.id });
        const counts: Record<string, number> = {};
        ss.forEach((s) => { const k = evaluateSap(s, db, f.to).overall ?? "none"; counts[k] = (counts[k] ?? 0) + 1; all[k] = (all[k] ?? 0) + 1; });
        return { Programa: `${p.code} · ${p.name}`, ...Object.fromEntries(LEVEL_ORDER.map((k) => [LBL[k], counts[k] ?? 0])), Total: ss.length };
      }).filter((r) => r.Total > 0);
      return { rows, totals: rows.length ? { Programa: "Total", ...Object.fromEntries(LEVEL_ORDER.map((k) => [LBL[k], all[k] ?? 0])), Total: rows.reduce((t, r) => t + r.Total, 0) } : undefined };
    },
  },

  // ── Operación ──
  {
    id: "ops_absent", group: "Operación", name: "Ausentes del día", genesis: "ITA › Check Attendance", desc: "Quién debía venir y no tiene registro, con teléfono.",
    filters: ["date", "program", "schedule"],
    run: (db, f) => {
      const seen = new Set(db.attendance.filter((a) => a.date === f.to && a.type !== "Absent").map((a) => a.studentId));
      return {
        rows: expectedOn(db, f.to, f.schedule || undefined)
          .filter((s) => (!f.program || s.programId === f.program) && !seen.has(s.id))
          .map((s) => ({ Estudiante: fullName(s), Badge: s.badge, Programa: code(s, db), Horario: scheduleOn(s, db, f.to)?.name ?? "", Celular: s.cell, "Tel. casa": s.homePhone ?? "", "Ausencias seguidas": consecutiveAbsences(s, db, addDays(f.to, 1)) })),
      };
    },
  },
  {
    id: "ops_present", group: "Operación", name: "Presentes del día", genesis: "ITA › Present", desc: "Quién vino en la fecha, con entrada y salida.",
    filters: ["date", "program", "schedule"],
    run: (db, f) => {
      const sById = new Map(db.students.map((s) => [s.id, s]));
      return {
        rows: db.attendance
          .filter((a) => a.date === f.to && a.type !== "Absent")
          .map((a) => ({ a, s: sById.get(a.studentId)! }))
          .filter(({ s }) => s && (!f.program || s.programId === f.program) && (!f.schedule || currentScheduleId(s, f.to) === f.schedule))
          .sort((x, y) => byName(x.s, y.s))
          .map(({ a, s }) => ({ Estudiante: fullName(s), Badge: s.badge, Programa: code(s, db), Horario: scheduleOn(s, db, f.to)?.name ?? "", Entrada: fmtTime(a.timeIn), Salida: a.timeOut ? fmtTime(a.timeOut) : "En clase / sin salida", Horas: a.hours })),
      };
    },
  },
  { id: "ops_signin", group: "Operación", name: "Hojas de firma", genesis: "ITA › Print Sign-In Sheets", desc: "Una hoja por horario con los que deben venir ese día.", filters: ["date", "schedule"], kind: "signin" },
  { id: "ops_labels", group: "Operación", name: "Etiquetas", genesis: "Labels", desc: "Etiquetas de correo (3 columnas, tipo Avery 5160).", filters: ["program", "schedule", "status"], defaultStatus: "Enrolled", kind: "labels" },

  // ── Admisiones ──
  {
    id: "adm_sources", group: "Admisiones", name: "Admisiones por fuente", desc: "Leads, contacto, conversión y tiempo de respuesta.",
    filters: ["range", "program"],
    run: (db, f) => ({
      rows: LEAD_SOURCES.map((src) => {
        const ls = db.leads.filter((l) => l.source === src && l.createdAt.slice(0, 10) >= f.from && l.createdAt.slice(0, 10) <= f.to && (!f.program || l.programId === f.program));
        const contacted = ls.filter((l) => l.firstContactAt);
        const mins = contacted.map((l) => (new Date(l.firstContactAt!).getTime() - new Date(l.createdAt).getTime()) / 60000);
        const enrolled = ls.filter((l) => l.stage === "enrolled").length;
        return {
          Fuente: SOURCE_LABEL[src], Leads: ls.length, Contactados: contacted.length, Inscritos: enrolled, Conversión: pct(enrolled, ls.length),
          "Respuesta promedio": mins.length ? `${Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)} min` : "—", Perdidos: ls.filter((l) => l.stage === "lost").length,
        };
      }).filter((r) => r.Leads > 0),
    }),
  },

  // ── Inventario (fase 10) ──
  ...["En existencia", "Para reordenar", "Servicios: inventario usado", "Servicios: requisitos"].map((name, i) => ({
    id: `inv_${i}`, group: "Inventario", name, desc: "Disponible cuando exista el módulo de inventario.", filters: [] as FilterKey[], pending: "Fase 10 (si se confirma inventario)",
  })),
];

export const REPORT_GROUPS = [...new Set(REPORTS.map((r) => r.group))];
