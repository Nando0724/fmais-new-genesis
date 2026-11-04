import type { ActivityType, LeadSource, LeadStage, Role } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const pad = (n: number) => String(n).padStart(2, "0");

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const nowISO = () => new Date().toISOString();

export const parseDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

export const addMonths = (s: string, n: number) => {
  const d = parseDate(s);
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
};

export const diffDays = (a: string, b: string) => Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);

export const fmtDate = (s?: string) => {
  if (!s) return "—";
  const d = parseDate(s);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

export const fmtDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${fmtDate(toISODate(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const money = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const hoursBetween = (start: string, end: string, breakMinutes = 0) => {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  const mins = h2 * 60 + m2 - (h1 * 60 + m1) - breakMinutes;
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
};

export const fmtTime = (t?: string) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${pad(((h + 11) % 12) + 1)}:${pad(m)} ${ap}`;
};

export const fullName = (p: { firstName: string; lastName: string }) => `${p.lastName}, ${p.firstName}`;
export const displayName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

export const maskSSN = (s?: string) => (s ? "***-**-" + s.slice(-4) : "—");

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  tour_scheduled: "Cita / tour agendado",
  toured: "Asistió al tour",
  applied: "Aplicó",
  enrolled: "Inscrito",
  lost: "Perdido",
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  meta_ads: "Meta Ads",
  web_form: "Formulario web",
  whatsapp: "WhatsApp",
  phone: "Llamada",
  walk_in: "Walk-in",
  referral: "Referido",
  import: "Importado",
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Dueño",
  admin: "Administrador",
  admissions: "Admisiones",
  registrar: "Registro académico",
  finance: "Finanzas",
  instructor: "Instructor",
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  call: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  tour: "Tour / cita",
  note: "Nota",
  stage: "Cambio de etapa",
};

export const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export const fillTemplate = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
