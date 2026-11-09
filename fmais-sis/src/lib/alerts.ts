// Centro de alertas: reemplaza las ventanas que Genesis abre al iniciar sesión
// (Check Swipes, Check Midpoints, Consecutive Absences, About To Grad…).
import { attendancePct, consecutiveAbsences, isAboutToGrad, liveLedger, missingOuts, needsVerification, planStatus, programOf } from "./calc";
import { lastSap, pendingMidpoints } from "./sap";
import type { DB, User } from "./types";
import { addDays, diffDays, today } from "./utils";

export interface Alert {
  id: string;
  title: string;
  detail: string;
  count: number;
  tone: "red" | "amber" | "blue" | "green";
  to: string; // dónde se resuelve
}

const FINANCE = ["owner", "admin", "finance"];
const ACADEMIC = ["owner", "admin", "registrar", "instructor"];

export function buildAlerts(db: DB, user?: User): Alert[] {
  if (!user) return [];
  const T = today();
  const role = user.role;
  const mine = (studentId: string) => role !== "instructor" || db.students.find((s) => s.id === studentId)?.instructorId === user.id;
  const active = db.students.filter((s) => s.status === "Enrolled" && mine(s.id));
  const out: Alert[] = [];

  if (ACADEMIC.includes(role)) {
    if (db.settings.checkMissingOutOnLogin) {
      const mo = missingOuts(db).filter((a) => mine(a.studentId));
      if (mo.length) out.push({ id: "missing_out", title: "Salidas sin marcar", detail: "Estudiantes con entrada y sin salida en días anteriores. Esas horas no cuentan hasta completar la salida.", count: mo.length, tone: "red", to: "/attendance?tab=missing" });
    }
    const abs = active.filter((s) => consecutiveAbsences(s, db) >= db.settings.absenceThreshold);
    if (abs.length) out.push({ id: "absences", title: "Ausencias consecutivas", detail: `${db.settings.absenceThreshold} o más días de clase seguidos sin asistir.`, count: abs.length, tone: "red", to: "/attendance?tab=alerts" });
    const low = active.filter((s) => {
      const pct = attendancePct(s, db);
      const min = programOf(s, db)?.sap.attendance.ok;
      return pct != null && min != null && pct < min;
    });
    if (low.length) out.push({ id: "low_attendance", title: "Asistencia por debajo del mínimo", detail: "Horas asistidas / programadas por debajo del nivel OK del SAP del programa.", count: low.length, tone: "amber", to: "/attendance?tab=alerts" });
    if (db.settings.checkMidpointsOnLogin) {
      const mids = pendingMidpoints(db).filter((m) => mine(m.student.id));
      if (mids.length) out.push({ id: "midpoints", title: "Midpoints por revisar", detail: "Calcular el SAP y, si aplica, pedir el desembolso de ayuda financiera.", count: mids.length, tone: "blue", to: "/academic?tab=midpoints" });
    }
    const crit = active.filter((s) => lastSap(s.id, db)?.overall === "Critical" && !s.probation);
    if (crit.length) out.push({ id: "sap_critical", title: "SAP Critical sin probation", detail: "Su último SAP guardado es Critical y todavía no se decidió la probation.", count: crit.length, tone: "red", to: "/students?flag=sap" });
    const grad = active.filter((s) => isAboutToGrad(s, db));
    if (grad.length) out.push({ id: "about_to_grad", title: "Por graduar", detail: `Les faltan ${db.settings.aboutToGradHours} horas o menos.`, count: grad.length, tone: "green", to: "/attendance?tab=alerts" });
    const loa = db.students.filter((s) => mine(s.id) && s.loas.some((l) => l.end && l.end >= T && l.end <= addDays(T, 14)));
    if (loa.length) out.push({ id: "loa_ending", title: "LOA que terminan pronto", detail: "Vuelven a clase en los próximos 14 días.", count: loa.length, tone: "blue", to: "/attendance?tab=alerts" });
  }

  if (FINANCE.includes(role)) {
    const overdue = db.plans.filter((p) => planStatus(p, db) === "overdue");
    if (overdue.length) out.push({ id: "overdue", title: "Pagos vencidos", detail: "Planes con la cuota vencida.", count: overdue.length, tone: "amber", to: "/billing" });
    const verify = liveLedger(db).filter(needsVerification);
    if (verify.length) out.push({ id: "ledger_verify", title: "Asientos por verificar", detail: "Asientos del ledger modificados en otra fecha.", count: verify.length, tone: "amber", to: "/students?flag=verify" });
  }

  if (role === "owner" || role === "admin") {
    const exp = db.settings.licenseExpires;
    const days = exp ? diffDays(exp, T) : undefined;
    if (days != null && days <= 60) out.push({ id: "license", title: days < 0 ? "Licencia estatal vencida" : "Licencia estatal por vencer", detail: days < 0 ? `Venció hace ${-days} días.` : `Vence en ${days} días.`, count: 1, tone: days < 0 ? "red" : "amber", to: "/settings" });
  }
  return out;
}
