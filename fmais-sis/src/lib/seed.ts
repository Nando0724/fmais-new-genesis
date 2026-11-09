// Datos de demostración 100% ficticios. Se regeneran relativos a la fecha de hoy.
import { costsFrom, DEFAULT_GRADE_SCALE, defaultSap, programTotal, seedSelections } from "./config";
import { ensureMarketing } from "./seedMarketing";
import type {
  AttendanceRecord, DB, EmailLog, Grade, Lead, LeadActivity, LeadSource, LeadStage, LedgerEntry,
  OnlineEnrollment, PaymentMethod, PaymentPlan, Program, Schedule, Student, User,
} from "./types";
import { addDays, addMonths, hoursBetween, nowISO, parseDate, today } from "./utils";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["María", "José", "Ana", "Luis", "Carmen", "Yanet", "Daniela", "Gabriela", "Lisandra", "Yudith", "Rosa", "Elena", "Camila", "Valentina", "Isabel", "Mariela", "Yaima", "Liset", "Andrea", "Paola", "Sofía", "Lucía", "Adriana", "Claudia", "Natalia", "Karla", "Jessica", "Diana", "Laura", "Mónica", "Pedro", "Jorge", "Alejandro", "Raúl", "Yoel", "Michel"];
const LAST = ["González", "Rodríguez", "Pérez", "Fernández", "López", "Martínez", "Sánchez", "Díaz", "Hernández", "Álvarez", "Romero", "Torres", "Ramírez", "Flores", "Castillo", "Morales", "Ortiz", "Delgado", "Vargas", "Rojas", "Cruz", "Reyes", "Medina", "Suárez", "Herrera", "Aguilar", "Castro", "Ruiz", "Mendoza", "Silva"];
const CITIES = [["Hialeah", "33012"], ["Hialeah", "33013"], ["Miami", "33126"], ["Miami", "33135"], ["Doral", "33178"], ["Miami Lakes", "33014"], ["Kendall", "33176"], ["Westchester", "33155"]];

export function buildSeed(): DB {
  const r = rng(20261020);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const T = today();
  let n = 0;
  const id = (p: string) => `${p}_${(++n).toString(36)}`;

  const users: User[] = [
    { id: "u_owner", name: "Dirección FMAIS", email: "direccion@fmais.demo", role: "owner", active: true },
    { id: "u_adm1", name: "Laura Méndez", email: "laura@fmais.demo", role: "admissions", active: true },
    { id: "u_adm2", name: "Carlos Ruiz", email: "carlos@fmais.demo", role: "admissions", active: true },
    { id: "u_reg", name: "Patricia Gómez", email: "registro@fmais.demo", role: "registrar", active: true },
    { id: "u_fin", name: "Daniel Torres", email: "finanzas@fmais.demo", role: "finance", active: true },
    { id: "u_ins1", name: "Mariela Soto", email: "msoto@fmais.demo", role: "instructor", active: true },
    { id: "u_ins2", name: "Yanelis Acosta", email: "yacosta@fmais.demo", role: "instructor", active: true },
  ];

  // Parciales y finales son "exam" (un intento); el resto de evaluaciones, "written".
  const isExam = (w: string) => /mid ?term|final/i.test(w);
  const prog = (code: string, name: string, totalHours: number, tuition: number, written: string[], practical: [string, number][]): Program => ({
    id: `p_${code.toLowerCase()}`,
    code,
    name,
    unitType: "clock",
    totalHours,
    active: true,
    costs: costsFrom(tuition, 150, 350, (p) => `${p}_${code}_${++n}`),
    gradeScale: DEFAULT_GRADE_SCALE,
    requirements: [
      ...written.map((w, i) => ({ id: `rq_${code}_w${i}`, name: w, kind: isExam(w) ? ("exam" as const) : ("written" as const), unitsRequired: 1 })),
      ...practical.map(([p, u], i) => ({ id: `rq_${code}_p${i}`, name: p, kind: "practical" as const, unitsRequired: u })),
    ],
    sap: defaultSap(),
    midpoints: [0.25, 0.5, 0.75].map((f) => Math.round(totalHours * f)), // EJEMPLO: por verificar
  });

  const programs: Program[] = [
    prog("CEL", "COMBINED ELECTROLYSIS AND LASER", 350, 4540, ["MID Term", "Laser Exam", "ELE175 Clinical Applications", "Final"], [["Electrolysis clinical services", 40], ["Laser treatments", 25]]),
    prog("ELE", "ELECTROLYSIS", 320, 4000, ["MID Term", "ELE175 Clinical Applications", "Final"], [["Electrolysis clinical services", 40]]),
    prog("FAC", "FACIAL SPECIALIST", 260, 3400, ["MID Term", "Skin Analysis", "Final"], [["Facials", 30], ["Waxing services", 20]]),
    prog("FUL", "FULL SPECIALIST", 500, 6400, ["MID Term", "Skin Analysis", "Nail Technology", "Final"], [["Facials", 40], ["Manicure / Pedicure", 40]]),
    prog("MA", "MEDICAL ASSISTANT", 720, 9000, ["Anatomy", "Clinical Procedures", "Pharmacology", "Final"], [["Venipunctures", 30], ["EKG", 15], ["Externship hours", 1]]),
    prog("PHL", "PHLEBOTOMY TECHNICIAN", 165, 1650, ["MID Term", "Final"], [["Venipunctures", 50], ["Capillary punctures", 10]]),
  ];

  // Horarios confirmados por la escuela. Los días (lunes a jueves) están por verificar.
  const schedules: Schedule[] = [
    { id: "s_ptd", name: "MAÑANA", days: [1, 2, 3, 4], start: "09:00", end: "13:00", breakMinutes: 0 },
    { id: "s_ptn", name: "NOCHE", days: [1, 2, 3, 4], start: "18:00", end: "22:00", breakMinutes: 0 },
  ];

  const year = parseDate(T).getFullYear();
  const holidays = [
    [`${year}-01-01`, "Año Nuevo"], [`${year}-05-25`, "Memorial Day"], [`${year}-07-04`, "Independence Day"],
    [`${year}-09-07`, "Labor Day"], [`${year}-11-26`, "Thanksgiving"], [`${year}-12-24`, "Nochebuena"], [`${year}-12-25`, "Navidad"],
  ].map(([date, description]) => ({ id: id("h"), date, description }));

  const students: Student[] = [];
  const attendance: AttendanceRecord[] = [];
  const ledger: LedgerEntry[] = [];
  const plans: PaymentPlan[] = [];
  const grades: Grade[] = [];
  const leads: Lead[] = [];
  const leadActivities: LeadActivity[] = [];
  const onlineEnrollments: OnlineEnrollment[] = [];
  const emails: EmailLog[] = [];
  let receipt = 7400;
  let badgeSeq = 300;

  const holidaySet = new Set(holidays.map((h) => h.date));
  const methods: PaymentMethod[] = ["Zelle", "Zelle", "Card", "Card", "Affirm", "FMAIS Plan", "Cash"];
  const sources: LeadSource[] = ["meta_ads", "meta_ads", "meta_ads", "web_form", "web_form", "whatsapp", "phone", "walk_in", "referral"];

  const statusPlan: Student["status"][] = [
    ...Array(30).fill("Enrolled"), ...Array(8).fill("Graduated"), ...Array(4).fill("Withdrawn"), "LOA", "LOA", "Dropped",
  ];

  statusPlan.forEach((status, i) => {
    const p = i < 12 ? programs[0] : pick(programs);
    const sch = pick(schedules);
    const fn = pick(FIRST);
    const ln = pick(LAST);
    const [city, zip] = pick(CITIES);
    const perDay = hoursBetween(sch.start, sch.end, sch.breakMinutes);
    const weeksNeeded = Math.ceil(p.totalHours / (perDay * sch.days.length));
    const nearGrad = status === "Enrolled" && i % 6 === 1;
    const justStarted = status === "Enrolled" && i % 8 === 2;
    const daysBack =
      status === "Graduated" ? int(weeksNeeded * 7 + 20, weeksNeeded * 7 + 300)
      : nearGrad ? int(Math.round(weeksNeeded * 7 * 0.95), Math.round(weeksNeeded * 7 * 1.02))
      : justStarted ? int(3, 14)
      : status === "Enrolled" ? int(10, Math.min(weeksNeeded * 7 - 3, 330))
      : int(60, 400);
    const firstClass = addDays(T, -daysBack);
    const enrollmentDate = addDays(firstClass, justStarted ? -int(1, 3) : -int(4, 20));
    const contractGrad = addDays(firstClass, Math.ceil(weeksNeeded * 7 * 1.1));
    const sid = id("st");
    const yr = parseDate(enrollmentDate).getFullYear();
    const student: Student = {
      id: sid,
      badge: `${yr}0${badgeSeq++}`,
      firstName: fn,
      lastName: ln,
      email: `${fn}.${ln}${i}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@example.com",
      cell: `(305) 555-${String(1000 + i * 37).slice(-4)}`,
      address1: `${int(100, 9999)} W ${int(1, 80)} St`,
      city,
      state: "FL",
      zip,
      ssn: `900-${int(10, 99)}-${int(1000, 9999)}`,
      birthdate: `${int(1970, 2005)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      birthplace: pick(["Cuba", "Venezuela", "Colombia", "Miami, FL", "Honduras", "Nicaragua", "Perú"]),
      sex: r() < 0.85 ? "F" : "M",
      marital: pick(["Single", "Married", "Divorced"]),
      ethnicity: "Hispanic",
      education: pick(["High School Diploma", "GED", "Some College", "Bachelor's (foreign)"]),
      highSchool: pick(["Hialeah Senior High", "Miami Lakes Educational Center", "Foreign High School", "Barbara Goleman High"]),
      matriculationDate: enrollmentDate,
      efc: 0,
      dependents: int(0, 3),
      programId: p.id,
      status,
      record: status === "Enrolled" || status === "LOA" ? "Active" : "Inactive",
      enrollmentDate,
      firstClass,
      contractGrad,
      schedules: [{ scheduleId: sch.id, from: firstClass }],
      transferHours: r() < 0.1 ? 20 : 0,
      importedHours: 0,
      overtimeHours: 0,
      loas: status === "LOA" ? [{ start: addDays(T, -int(5, 20)), end: addDays(T, int(10, 40)), reason: "Médica" }] : [],
      probation: "",
      instructorId: pick(["u_ins1", "u_ins2"]),
      placement: { passedBoard: "" },
      createdAt: new Date(parseDate(enrollmentDate)).toISOString(),
    };

    // Asistencia día a día
    const stopEarly = status === "Enrolled" && i % 9 === 4 ? int(4, 9) : 0; // algunos con ausencias consecutivas
    const withdrawAfter = status === "Withdrawn" || status === "Dropped" ? int(20, 60) : Infinity;
    const loaStart = student.loas[0]?.start;
    let cum = student.transferHours;
    let d = firstClass;
    let lastDay = firstClass;
    let k = 0;
    const end = addDays(T, -1 - stopEarly);
    while (d <= end && cum < p.totalHours && k < withdrawAfter) {
      if (loaStart && d >= loaStart) break;
      const wd = parseDate(d).getDay();
      if (sch.days.includes(wd) && !holidaySet.has(d)) {
        k++;
        if (r() < 0.9) {
          const late = r() < 0.15 ? 15 * int(1, 3) : 0;
          const [h, m] = sch.start.split(":").map(Number);
          const tin = `${String(h + Math.floor((m + late) / 60)).padStart(2, "0")}:${String((m + late) % 60).padStart(2, "0")}`;
          const hrs = Math.min(hoursBetween(tin, sch.end, sch.breakMinutes), p.totalHours - cum);
          cum += hrs;
          attendance.push({ id: id("a"), studentId: sid, date: d, type: "Regular", timeIn: tin, timeOut: sch.end, breakMinutes: sch.breakMinutes, hours: hrs, source: "import" });
          lastDay = d;
        }
      }
      d = addDays(d, 1);
    }
    if (status === "Graduated") {
      student.completionDate = lastDay;
      student.placement = r() < 0.7
        ? { passedBoard: "Yes", boardDate: addDays(lastDay, int(10, 40)), hireDate: addDays(lastDay, int(20, 90)), company: pick(["Smooth Skin Laser Center", "Miami Aesthetic Clinic", "Glow MedSpa Doral", "Baptist Health", "Hialeah Dermatology Group"]), city: "Miami", state: "FL", phone: "(305) 555-0199" }
        : { passedBoard: "Pending" };
    }

    // Notas
    const pct = cum / p.totalHours;
    p.requirements.forEach((rq, j) => {
      const threshold = rq.kind !== "practical" ? (j + 1) / (p.requirements.filter((x) => x.kind !== "practical").length + 0.5) : 0.1;
      if (pct >= threshold) {
        grades.push({
          id: id("g"),
          studentId: sid,
          requirementId: rq.id,
          date: addDays(firstClass, Math.round(daysBack * Math.min(1, threshold))),
          percent: rq.kind !== "practical" ? int(72, 99) : undefined,
          unitsDone: rq.kind === "practical" ? Math.min(rq.unitsRequired, Math.round(rq.unitsRequired * pct)) : undefined,
        });
      }
    });

    // Ledger: cargos + depósito + pagos
    const total = programTotal(p);
    ledger.push(...p.costs.filter((c) => c.autoPost).map((c) => ({ id: id("l"), studentId: sid, date: enrollmentDate, enteredBy: "u_fin", description: c.description, charge: c.amount, payment: 0 })));
    const method = pick(methods);
    const deposit = Math.min(1500, total);
    ledger.push({ id: id("l"), studentId: sid, date: enrollmentDate, enteredBy: "u_fin", description: "Depósito de inscripción", charge: 0, payment: deposit, receipt: String(receipt++), method });
    let paid = deposit;
    const installments = int(4, 8);
    const inst = Math.round(((total - deposit) / installments) * 100) / 100;
    const plan: PaymentPlan = {
      id: id("pl"),
      studentId: sid,
      mode: method === "Zelle" || method === "Cash" ? "zelle" : "autopay",
      amount: inst,
      frequency: "monthly",
      nextDue: addMonths(enrollmentDate, 1),
      installmentsLeft: installments,
      cardLast4: method === "Card" || method === "FMAIS Plan" ? String(int(1000, 9999)) : undefined,
      active: true,
    };
    const late = status === "Enrolled" && i % 7 === 3; // morosos
    while (plan.installmentsLeft > 0 && plan.nextDue < T) {
      if (late && plan.nextDue >= addDays(T, -45)) break;
      if ((status === "Withdrawn" || status === "Dropped") && plan.nextDue > addDays(firstClass, 60)) break;
      ledger.push({ id: id("l"), studentId: sid, date: plan.nextDue, enteredBy: "u_fin", description: "Tuition/Fees", charge: 0, payment: inst, receipt: String(receipt++), method: plan.mode === "zelle" ? "Zelle" : method, planId: plan.id });
      paid += inst;
      plan.installmentsLeft--;
      plan.nextDue = addMonths(plan.nextDue, 1);
    }
    if (status === "Withdrawn" || status === "Dropped") plan.active = false;
    if (plan.installmentsLeft === 0) plan.active = false;
    if (Math.abs(total - paid) < 1 && plan.installmentsLeft === 0) {
      // redondeo
      const last = ledger[ledger.length - 1];
      last.payment = Math.round((last.payment + (total - paid)) * 100) / 100;
    }
    plans.push(plan);
    students.push(student);

    // Lead de origen
    const lid = id("ld");
    const created = addDays(enrollmentDate, -int(3, 40));
    leads.push({
      id: lid, firstName: fn, lastName: ln, email: student.email, phone: student.cell, language: "es", source: pick(sources),
      programId: p.id, stage: "enrolled", ownerId: pick(["u_adm1", "u_adm2"]), createdAt: new Date(parseDate(created)).toISOString(),
      firstContactAt: new Date(parseDate(created).getTime() + int(5, 240) * 60000).toISOString(), studentId: sid,
    });
    student.leadId = lid;
    leadActivities.push(
      { id: id("act"), leadId: lid, type: "call", note: "Primera llamada, interesada en el programa.", at: new Date(parseDate(created).getTime() + 3600000).toISOString(), userId: "u_adm1" },
      { id: id("act"), leadId: lid, type: "tour", note: "Visitó la escuela.", at: new Date(parseDate(addDays(created, 2))).toISOString(), userId: "u_adm1" },
      { id: id("act"), leadId: lid, type: "stage", note: "Inscrito", at: new Date(parseDate(enrollmentDate)).toISOString() },
    );
  });

  // Leads abiertos del pipeline
  const openStages: LeadStage[] = ["new", "new", "new", "new", "contacted", "contacted", "contacted", "contacted", "tour_scheduled", "tour_scheduled", "toured", "applied", "lost", "lost"];
  for (let i = 0; i < 48; i++) {
    const fn = pick(FIRST);
    const ln = pick(LAST);
    const stage = pick(openStages);
    const created = addDays(T, -int(0, stage === "new" ? 5 : 45));
    // Nunca en el futuro (si no, el CRM mostraría antigüedades negativas).
    const createdAt = new Date(Math.min(Date.now() - int(5, 600) * 60000, parseDate(created).getTime() + int(8, 20) * 3600000)).toISOString();
    const lid = id("ld");
    const source = pick(sources);
    const lead: Lead = {
      id: lid, firstName: fn, lastName: ln,
      email: `${fn}${ln}${i}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@example.com",
      phone: `(786) 555-${String(2000 + i * 53).slice(-4)}`,
      language: r() < 0.8 ? "es" : "en",
      source,
      campaign: source === "meta_ads" ? pick(["Laser Otoño", "Electrolysis Hialeah", "Medical Assistant 2026"]) : undefined,
      programId: pick(programs).id,
      stage,
      ownerId: stage === "new" && r() < 0.5 ? undefined : pick(["u_adm1", "u_adm2"]),
      createdAt,
      firstContactAt: stage === "new" ? undefined : new Date(new Date(createdAt).getTime() + int(4, 600) * 60000).toISOString(),
      nextAction: stage === "lost" ? undefined : pick(["Llamar de nuevo", "Enviar info de precios", "Confirmar tour", "Enviar link de inscripción", "Seguimiento WhatsApp"]),
      nextActionDate: stage === "lost" ? undefined : addDays(T, int(-3, 5)),
      lostReason: stage === "lost" ? pick(["Precio", "Horario no le sirve", "Eligió otra escuela", "No contesta"]) : undefined,
    };
    leads.push(lead);
    if (stage !== "new") {
      leadActivities.push({ id: id("act"), leadId: lid, type: pick(["call", "whatsapp", "email"]), note: pick(["Interesada, pidió precios.", "No contestó, se dejó mensaje.", "Pregunta por horarios de noche.", "Quiere empezar el próximo mes."]), at: lead.firstContactAt!, userId: lead.ownerId });
    }
    if (stage === "tour_scheduled" || stage === "toured") {
      leadActivities.push({ id: id("act"), leadId: lid, type: "tour", note: stage === "toured" ? "Vino al tour, le gustó la clínica." : "Tour agendado.", at: new Date(parseDate(addDays(created, 2))).toISOString(), userId: lead.ownerId });
    }
    if (stage === "applied") {
      const oe: OnlineEnrollment = {
        id: id("oe"), firstName: fn, lastName: ln, email: lead.email, phone: lead.phone, programId: lead.programId!, scheduleId: pick(schedules).id,
        stepsDone: int(1, 5), status: "in_progress", depositAmount: 0, createdAt: addDays(created, 1) + "T15:00:00.000Z", updatedAt: addDays(T, -int(0, 6)) + "T15:00:00.000Z", leadId: lid,
      };
      onlineEnrollments.push(oe);
      lead.enrollmentId = oe.id;
    }
  }

  // Inscripciones en línea completadas (de estudiantes recientes) y abandonadas
  students.filter((s) => s.enrollmentDate >= addDays(T, -120)).forEach((s) => {
    const oe: OnlineEnrollment = {
      id: id("oe"), firstName: s.firstName, lastName: s.lastName, email: s.email, phone: s.cell, programId: s.programId, scheduleId: s.schedules[0].scheduleId,
      stepsDone: 7, status: "completed", depositAmount: 1500, paymentMethod: ledger.find((l) => l.studentId === s.id && l.payment > 0)?.method,
      createdAt: s.enrollmentDate + "T14:00:00.000Z", updatedAt: s.enrollmentDate + "T14:12:00.000Z", leadId: s.leadId, studentId: s.id,
    };
    s.onlineEnrollmentId = oe.id;
    onlineEnrollments.push(oe);
  });
  for (let i = 0; i < 4; i++) {
    const fn = pick(FIRST);
    const ln = pick(LAST);
    onlineEnrollments.push({
      id: id("oe"), firstName: fn, lastName: ln, email: `${fn}.${ln}.ab${i}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@example.com",
      phone: `(305) 555-${3000 + i}`, programId: pick(programs).id, scheduleId: pick(schedules).id, stepsDone: int(1, 4), status: "abandoned", depositAmount: 0,
      createdAt: addDays(T, -int(20, 60)) + "T12:00:00.000Z", updatedAt: addDays(T, -int(15, 19)) + "T12:00:00.000Z",
    });
  }

  emails.push({
    id: id("e"), at: nowISO(), to: "direccion@fmais.demo", subject: "Bienvenido al sistema FMAIS (demo)",
    body: "Este es el registro de emails. En la demo los emails no se envían: se guardan aquí para revisar el contenido.", kind: "other",
  });

  return ensureMarketing({
    version: 1,
    settings: {
      schoolName: "Florida Medical & Aesthetic International School",
      address: "Hialeah, FL",
      phone: "(305) 555-0100",
      email: "info@fmais.demo",
      zelleRecipient: "pagos@fmais.demo",
      absenceThreshold: 3,
      aboutToGradHours: 40,
      reminderDaysBefore: 3,
      leadResponseMinutes: 15,
      enrollmentPortalUrl: "https://thefmais-enrollment.lovable.app/",
      licenseNumber: "CIE-0000 (ejemplo)",
      licenseApproved: addDays(T, -700),
      licenseExpires: addDays(T, 395),
      autoLogoutMinutes: 30,
      checkMidpointsOnLogin: true,
      checkMissingOutOnLogin: true,
      templates: {
        zelle_reminder: {
          subject: "Recordatorio de pago FMAIS – vence {{fecha}}",
          body: "Hola {{nombre}},\n\nTe recordamos que tu pago de {{monto}} del programa {{programa}} vence el {{fecha}}.\n\nPuedes pagar por Zelle a: {{zelle}}\nEn el concepto escribe tu número de badge: {{badge}}.\n\nGracias,\nFMAIS – Finanzas",
        },
        autopay_receipt: {
          subject: "Recibo de pago FMAIS #{{recibo}}",
          body: "Hola {{nombre}},\n\nRecibimos tu pago automático de {{monto}} (tarjeta terminada en {{tarjeta}}).\nBalance pendiente: {{balance}}.\n\nGracias,\nFMAIS",
        },
        enrollment_link: {
          subject: "Tu inscripción en FMAIS – {{programa}}",
          body: "Hola {{nombre}},\n\n¡Gracias por tu interés en {{programa}}! Completa tu inscripción en línea en menos de 12 minutos:\n{{link}}\n\nCualquier duda, responde este email o escríbenos por WhatsApp.\n\n{{asesor}} – Admisiones FMAIS",
        },
        lead_followup: {
          subject: "¿Tienes preguntas sobre {{programa}}?",
          body: "Hola {{nombre}},\n\nSoy {{asesor}} de FMAIS. Quería saber si tienes preguntas sobre {{programa}} o si quieres agendar una visita.\n\nSaludos,\n{{asesor}}",
        },
        absence_alert: {
          subject: "Te extrañamos en clase – FMAIS",
          body: "Hola {{nombre}},\n\nNotamos que no has asistido a clase los últimos {{dias}} días programados. Por favor comunícate con la oficina para ayudarte a no atrasarte.\n\nFMAIS – Registro académico",
        },
        resume_enrollment: {
          subject: "Termina tu inscripción en FMAIS",
          body: "Hola {{nombre}},\n\nTu inscripción quedó en el paso {{paso}} de 7. Puedes continuar donde la dejaste aquí:\n{{link}}\n\nFMAIS – Admisiones",
        },
      },
    },
    users,
    selections: seedSelections(),
    programs,
    schedules,
    holidays,
    leads,
    leadActivities,
    onlineEnrollments,
    students,
    attendance,
    grades,
    ledger,
    plans,
    emails,
    comments: [],
    documents: [],
    audit: [],
    segments: [],
    marketingTemplates: [],
    campaigns: [],
    marketingEvents: [],
  });
}
