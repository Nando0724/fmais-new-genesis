// Operaciones de negocio que tocan varias colecciones a la vez.
import { advanceDue, balance, nextBadge, nextReceipt } from "./calc";
import type { useStore } from "./store";
import type { EmailLog, LedgerEntry, PaymentMethod, PaymentPlan, Student } from "./types";
import { addDays, addMonths, displayName, fillTemplate, fmtDate, money, nowISO, today, uid } from "./utils";

type Store = ReturnType<typeof useStore>;

export function sendTemplate(store: Store, key: string, to: string, vars: Record<string, string | number>, meta: Partial<EmailLog> = {}) {
  const tpl = store.db.settings.templates[key];
  if (!tpl) return;
  store.sendEmail({
    to,
    subject: fillTemplate(tpl.subject, vars),
    body: fillTemplate(tpl.body, vars),
    kind: (meta.kind ?? key) as EmailLog["kind"],
    studentId: meta.studentId,
    leadId: meta.leadId,
  });
}

export interface NewStudentInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  programId: string;
  scheduleId: string;
  firstClass?: string;
  leadId?: string;
  onlineEnrollmentId?: string;
  deposit?: number;
  depositMethod?: PaymentMethod;
  planMode?: PaymentPlan["mode"];
  installments?: number;
}

/** Crea el estudiante con sus cargos del programa, depósito y plan de pago. */
export function createStudent(store: Store, input: NewStudentInput): Student {
  const { db, user } = store;
  const program = db.programs.find((p) => p.id === input.programId)!;
  const T = today();
  const firstClass = input.firstClass || addDays(T, 7);
  const sch = db.schedules.find((s) => s.id === input.scheduleId);
  const perWeek = sch ? ((Number(sch.end.slice(0, 2)) * 60 + Number(sch.end.slice(3)) - Number(sch.start.slice(0, 2)) * 60 - Number(sch.start.slice(3)) - sch.breakMinutes) / 60) * sch.days.length : 16;
  const student: Student = {
    id: uid(),
    badge: nextBadge(db),
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    cell: input.phone,
    address1: "",
    city: "",
    state: "FL",
    zip: "",
    programId: program.id,
    status: "Enrolled",
    record: "Active",
    enrollmentDate: T,
    firstClass,
    contractGrad: addDays(firstClass, Math.ceil((program.totalHours / Math.max(1, perWeek)) * 7 * 1.1)),
    matriculationDate: T,
    schedules: [{ scheduleId: input.scheduleId, from: firstClass }],
    transferHours: 0,
    importedHours: 0,
    overtimeHours: 0,
    loas: [],
    placement: { passedBoard: "" },
    leadId: input.leadId,
    onlineEnrollmentId: input.onlineEnrollmentId,
    createdAt: nowISO(),
  };
  // El consentimiento de marketing que dio como lead se mantiene como estudiante.
  const fromLead = db.leads.find((l) => l.id === input.leadId);
  if (fromLead) Object.assign(student, { marketingOptIn: fromLead.marketingOptIn, optInAt: fromLead.optInAt, optInSource: fromLead.optInSource, unsubscribedAt: fromLead.unsubscribedAt });
  const by = user?.id ?? "system";
  // Auto-ledger: se cargan los costos del programa marcados "Cargar al inscribir".
  const entries: LedgerEntry[] = program.costs
    .filter((c) => c.autoPost && c.amount)
    .map((c) => ({ id: uid(), studentId: student.id, date: T, enteredBy: by, description: c.description, charge: c.amount, payment: 0 }));
  let receipt = Number(nextReceipt(db));
  if (input.deposit) {
    entries.push({ id: uid(), studentId: student.id, date: T, enteredBy: by, description: "Depósito de inscripción", charge: 0, payment: input.deposit, receipt: String(receipt++), method: input.depositMethod ?? "Card" });
  }
  const total = entries.reduce((t, e) => t + e.charge, 0) - (input.deposit ?? 0);
  const installments = input.installments ?? 6;
  store.save("students", student, "create");
  store.saveMany("ledger", entries, "create:charges");
  if (total > 0) {
    store.save("plans", {
      id: uid(),
      studentId: student.id,
      mode: input.planMode ?? (input.depositMethod === "Zelle" ? "zelle" : "autopay"),
      amount: Math.round((total / installments) * 100) / 100,
      frequency: "monthly",
      nextDue: addMonths(T, 1),
      installmentsLeft: installments,
      active: true,
    });
  }
  if (input.leadId) {
    const lead = db.leads.find((l) => l.id === input.leadId);
    if (lead) store.save("leads", { ...lead, stage: "enrolled", studentId: student.id }, "convert");
    const oe = db.onlineEnrollments.find((o) => o.id === (input.onlineEnrollmentId ?? lead?.enrollmentId));
    if (oe && !oe.studentId) store.save("onlineEnrollments", { ...oe, studentId: student.id });
  }
  return student;
}

/** Registra un pago en el ledger y, si pertenece a un plan, avanza la siguiente fecha. */
export function recordPayment(store: Store, args: { studentId: string; amount: number; method: PaymentMethod; plan?: PaymentPlan; date?: string; description?: string; sendReceipt?: boolean; receipt?: string }) {
  const { db, user } = store;
  // En operaciones en lote el db de este render no ve los recibos recién creados: el llamador pasa el número.
  const receipt = args.receipt ?? nextReceipt(db);
  store.save("ledger", {
    id: uid(),
    studentId: args.studentId,
    date: args.date ?? today(),
    enteredBy: user?.id ?? "system",
    description: args.description ?? "Tuition/Fees",
    charge: 0,
    payment: args.amount,
    receipt,
    method: args.method,
    planId: args.plan?.id,
  });
  if (args.plan) {
    const left = args.plan.installmentsLeft - 1;
    store.save("plans", { ...args.plan, installmentsLeft: left, nextDue: advanceDue(args.plan), active: left > 0 });
  }
  const s = db.students.find((x) => x.id === args.studentId);
  if (s && args.sendReceipt) {
    sendTemplate(store, "autopay_receipt", s.email, {
      nombre: s.firstName,
      monto: money(args.amount),
      recibo: receipt,
      tarjeta: args.plan?.cardLast4 ?? "----",
      balance: money(balance(s.id, db) - args.amount),
    }, { studentId: s.id });
  }
  return receipt;
}

export function zelleReminder(store: Store, plan: PaymentPlan) {
  const { db } = store;
  const s = db.students.find((x) => x.id === plan.studentId);
  if (!s) return;
  const p = db.programs.find((x) => x.id === s.programId);
  sendTemplate(store, "zelle_reminder", s.email, {
    nombre: s.firstName,
    monto: money(plan.amount),
    fecha: fmtDate(plan.nextDue),
    programa: p?.name ?? "",
    zelle: db.settings.zelleRecipient,
    badge: s.badge,
  }, { studentId: s.id });
  store.save("plans", { ...plan, lastReminderAt: nowISO() }, "reminder");
}

export const studentLabel = (s: Student) => `${displayName(s)} · #${s.badge}`;
