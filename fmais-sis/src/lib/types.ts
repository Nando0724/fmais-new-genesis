// Modelo de datos del sistema. Cada colección corresponde a una tabla en supabase/schema.sql.

export type Role = "owner" | "admin" | "admissions" | "registrar" | "finance" | "instructor";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

// ── Catálogos (Selections de Genesis) ─────────────────────────────
// Listas editables que alimentan los menús desplegables. Nunca se borran, solo se desactivan.
export const SELECTION_TYPES = ["ethnicity", "dependency", "company", "payment_method", "account", "lead_source", "vendor", "product_class", "distributor"] as const;
export type SelectionType = (typeof SELECTION_TYPES)[number];

export interface Selection {
  id: string;
  type: SelectionType;
  value: string;
  active: boolean;
  sort: number;
  // Solo para "company": se copian a la colocación al elegir la empresa.
  extra?: { contact?: string; phone?: string; address1?: string; city?: string; state?: string; zip?: string };
}

// ── Programas ──────────────────────────────────────────────────────
// exam = parcial / final (un intento) · written = quiz, tarea · practical = requisito con unidades.
export type RequirementKind = "exam" | "written" | "practical";

export interface Requirement {
  id: string;
  name: string;
  kind: RequirementKind;
  unitsRequired: number; // solo para "practical"; exam y written valen 1
  active?: boolean; // undefined = activo. Desactivar no afecta a los ya inscritos.
}

export interface ProgramCost {
  id: string;
  description: string;
  amount: number;
  account: string; // valor del catálogo "account"
  autoPost: boolean; // "Add" de Genesis: se carga solo al ledger al inscribir
  institutional: boolean; // "Inst" de Genesis: cuenta en el cálculo de reembolso
}

export interface GradeBand {
  letter: string;
  min: number;
  max: number;
}

export interface SapLevels {
  critical: number;
  ok: number;
  superior: number;
}

export interface SapPolicy {
  academic: SapLevels; // % mínimo de nota ponderada
  attendance: SapLevels; // % mínimo de horas asistidas / programadas
  weightExam: number;
  weightWritten: number; // requisitos = 100 - exam - written
  excusedCountsAsAttended: boolean;
  verified: boolean; // false = valores de ejemplo pendientes de confirmar con la escuela
}

export interface Program {
  id: string;
  code: string;
  name: string;
  unitType: "clock" | "credit";
  totalHours: number; // largo del programa (horas reloj o créditos)
  exitAnalysisUnits?: number;
  academicYearUnits?: number;
  accreditor?: string;
  accreditationFrom?: string;
  accreditationTo?: string;
  active: boolean;
  costs: ProgramCost[];
  gradeScale: GradeBand[];
  requirements: Requirement[];
  sap: SapPolicy;
  midpoints: number[]; // horas en las que se alcanza cada midpoint (hasta 10)
  copiedFrom?: string;
}

export interface Schedule {
  id: string;
  name: string;
  days: number[]; // 0 = domingo … 6 = sábado
  start: string; // "09:00"
  end: string; // "13:00"
  breakMinutes: number;
}

/** Feriado o ajuste (Holidays / Adjustments). Reduce horas programadas, nunca las asistidas. */
export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  programId?: string; // vacío = todos los programas
  start?: string; // vacío = día completo
  end?: string;
}

/** Consentimiento de marketing: compartido por leads y estudiantes. */
export interface MarketingConsent {
  marketingOptIn?: boolean;
  optInAt?: string;
  optInSource?: string;
  unsubscribedAt?: string;
  ccContactId?: string; // id del contacto en Constant Contact
  ccSyncedAt?: string;
}

export const LEAD_STAGES = ["new", "contacted", "tour_scheduled", "toured", "applied", "enrolled", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_SOURCES = ["meta_ads", "web_form", "whatsapp", "phone", "walk_in", "referral", "import"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Lead extends MarketingConsent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  language: "es" | "en";
  source: LeadSource;
  campaign?: string;
  programId?: string;
  stage: LeadStage;
  ownerId?: string;
  createdAt: string; // ISO
  firstContactAt?: string;
  nextAction?: string;
  nextActionDate?: string; // YYYY-MM-DD
  lostReason?: string;
  studentId?: string;
  enrollmentId?: string;
}

export type ActivityType = "call" | "email" | "whatsapp" | "sms" | "tour" | "note" | "stage";

export interface LeadActivity {
  id: string;
  leadId: string;
  type: ActivityType;
  note: string;
  at: string;
  userId?: string;
}

// Inscripción en línea (lo que hoy hace el portal de enrollment, 7 pasos).
export const ENROLLMENT_STEPS = ["Programa", "Información", "Documentos", "Pólizas", "Firma", "Depósito", "Confirmación"];
export type OnlineEnrollmentStatus = "in_progress" | "completed" | "abandoned";

export interface OnlineEnrollment {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  programId: string;
  scheduleId: string;
  stepsDone: number; // 0..7
  status: OnlineEnrollmentStatus;
  depositAmount: number;
  paymentMethod?: PaymentMethod;
  createdAt: string;
  updatedAt: string;
  leadId?: string;
  studentId?: string;
}

export type EnrollmentStatus = "Applicant" | "Enrolled" | "LOA" | "Graduated" | "Withdrawn" | "Dropped";
export type RecordStatus = "Active" | "Inactive";

export interface LeaveOfAbsence {
  start: string;
  end: string;
  reason?: string;
}

export interface ScheduleAssignment {
  scheduleId: string;
  from: string;
}

export interface Placement {
  passedBoard: "" | "Yes" | "No" | "Pending";
  boardDate?: string;
  hireDate?: string;
  company?: string;
  contact?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
}

export interface Student extends MarketingConsent {
  id: string;
  badge: string;
  // Detail
  firstName: string;
  lastName: string;
  mi?: string;
  email: string;
  cell: string;
  homePhone?: string;
  workPhone?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  ssn?: string; // en producción: cifrado y visible solo para roles autorizados
  birthdate?: string;
  birthplace?: string;
  sex?: string;
  marital?: string;
  ethnicity?: string;
  driverLicense?: string;
  alienRegistration?: string;
  education?: string;
  highSchool?: string;
  hsCity?: string;
  locker?: string;
  combination?: string;
  matriculationDate?: string;
  efc?: number;
  adjGrossIncome?: number;
  dependents?: number;
  dependency?: string;
  // Enrollment
  programId: string;
  status: EnrollmentStatus;
  record: RecordStatus;
  enrollmentDate: string;
  firstClass: string;
  contractGrad: string;
  completionDate?: string;
  schedules: ScheduleAssignment[];
  transferHours: number;
  importedHours: number;
  overtimeHours: number;
  loas: LeaveOfAbsence[];
  probation?: "" | "Academic" | "Attendance" | "Financial";
  probationDate?: string;
  instructorId?: string;
  // Placement
  placement: Placement;
  // Origen
  leadId?: string;
  onlineEnrollmentId?: string;
  createdAt: string;
}

export type AttendanceType = "Regular" | "Makeup" | "Clinic" | "Non-Clinic" | "Absent";

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string;
  type: AttendanceType;
  timeIn?: string;
  timeOut?: string;
  breakMinutes: number;
  hours: number;
  source: "manual" | "import" | "kiosk";
}

export interface Grade {
  id: string;
  studentId: string;
  requirementId: string;
  date: string;
  percent?: number;
  unitsDone?: number;
}

export type PaymentMethod = "Card" | "Affirm" | "FMAIS Plan" | "Zelle" | "Cash" | "Check";

export interface LedgerEntry {
  id: string;
  studentId: string;
  date: string;
  enteredBy: string;
  description: string;
  charge: number;
  payment: number;
  receipt?: string;
  method?: PaymentMethod;
  planId?: string;
}

export interface PaymentPlan {
  id: string;
  studentId: string;
  mode: "autopay" | "zelle";
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly";
  nextDue: string;
  installmentsLeft: number;
  cardLast4?: string;
  active: boolean;
  lastReminderAt?: string;
}

export interface EmailLog {
  id: string;
  at: string;
  to: string;
  subject: string;
  body: string;
  kind: "zelle_reminder" | "autopay_receipt" | "enrollment_link" | "lead_followup" | "absence_alert" | "resume_enrollment" | "other";
  studentId?: string;
  leadId?: string;
}

export interface Comment {
  id: string;
  entity: "student" | "lead";
  entityId: string;
  text: string;
  at: string;
  userId?: string;
}

export interface DocumentFile {
  id: string;
  studentId: string;
  name: string;
  type: string;
  uploadedAt: string;
  size: number;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
}

export interface Settings {
  schoolName: string;
  address: string;
  phone: string;
  email: string;
  zelleRecipient: string;
  absenceThreshold: number; // días programados consecutivos sin asistir
  aboutToGradHours: number; // horas restantes para "por graduar"
  reminderDaysBefore: number; // días antes del vencimiento para recordar Zelle
  leadResponseMinutes: number; // SLA de primer contacto
  enrollmentPortalUrl: string;
  templates: Record<string, { subject: string; body: string }>;
  // Licencia estatal y datos corporativos (Maintenance › School)
  licenseNumber?: string;
  licenseApproved?: string;
  licenseExpires?: string;
  officers?: string;
  // Customize Auto Features
  autoLogoutMinutes: number; // 0 = desactivado
  checkMidpointsOnLogin: boolean;
  checkMissingOutOnLogin: boolean;
  // Constant Contact (simulado en la demo)
  ccConnected?: boolean;
  ccAccountName?: string;
  ccLastSyncAt?: string;
}

// ── Marketing ──────────────────────────────────────────────────────

export type Audience = "leads" | "students";

export interface SegmentFilters {
  stages?: LeadStage[];
  sources?: LeadSource[];
  lostReasons?: string[];
  studentStatuses?: EnrollmentStatus[];
  programIds?: string[];
  language?: "" | "es" | "en";
  createdWithinDays?: number; // leads creados en los últimos N días
  minDaysSinceCreated?: number; // leads con al menos N días (para seguimiento)
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  audience: Audience;
  filters: SegmentFilters;
  ccListId?: string;
}

export interface Bilingual {
  es: string;
  en: string;
}

export interface MarketingTemplate {
  id: string;
  name: string;
  subject: Bilingual;
  body: Bilingual; // variables: {{nombre}}, {{programa}}, {{proximo_grupo}}, {{asesor}}, {{parrafo_ia}}, {{link}}
  cta: Bilingual;
}

export type CampaignStatus = "draft" | "pending_approval" | "scheduled" | "sent" | "rejected";

export interface CampaignStats {
  sent: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
}

export interface Campaign {
  id: string;
  name: string;
  segmentId: string;
  templateId: string;
  goal: string;
  subject: Bilingual;
  body: Bilingual;
  cta: Bilingual;
  personalizeWithAI: boolean; // genera {{parrafo_ia}} por contacto
  status: CampaignStatus;
  recurring: boolean; // aprobada una vez; se envía sola a contactos nuevos del segmento
  createdBy: string; // "agent" o id de usuario
  createdAt: string;
  agentNotes?: string[];
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  scheduledFor?: string; // ISO
  sentAt?: string;
  ccCampaignId?: string;
  stats: CampaignStats;
}

export type MarketingEventType = "sent" | "open" | "click" | "bounce" | "unsubscribe";

export interface MarketingEvent {
  id: string;
  campaignId: string;
  audience: Audience;
  contactId: string;
  type: MarketingEventType;
  url?: string;
  at: string;
}

export interface DB {
  version: number;
  settings: Settings;
  users: User[];
  selections: Selection[];
  programs: Program[];
  schedules: Schedule[];
  holidays: Holiday[];
  leads: Lead[];
  leadActivities: LeadActivity[];
  onlineEnrollments: OnlineEnrollment[];
  students: Student[];
  attendance: AttendanceRecord[];
  grades: Grade[];
  ledger: LedgerEntry[];
  plans: PaymentPlan[];
  emails: EmailLog[];
  comments: Comment[];
  documents: DocumentFile[];
  audit: AuditEntry[];
  segments: Segment[];
  marketingTemplates: MarketingTemplate[];
  campaigns: Campaign[];
  marketingEvents: MarketingEvent[];
}

export type Collection = Exclude<keyof DB, "version" | "settings">;
