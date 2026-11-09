// Importación desde CSV (exportes de Genesis o de cualquier hoja de cálculo).
// Cada columna del archivo se asigna a un campo; los nombres típicos de Genesis se detectan solos.
import { Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { nextBadge } from "../lib/calc";
import { useStore } from "../lib/store";
import type { AttendanceRecord, EnrollmentStatus, Lead, LedgerEntry, PaymentMethod, Student } from "../lib/types";
import { hoursBetween, nowISO, parseCSV, toISODate, today, uid } from "../lib/utils";
import { useToast } from "./Layout";
import { Badge, Button, Card, Field, Select, Table, Td, Th } from "./ui";

type Kind = "students" | "ledger" | "attendance" | "leads";

const FIELDS: Record<Kind, { key: string; label: string; aliases: string[]; required?: boolean }[]> = {
  students: [
    { key: "badge", label: "Badge #", aliases: ["badge", "badge #", "badge#", "id", "student id"] },
    { key: "lastName", label: "Apellido", aliases: ["last", "last name", "lastname", "apellido"], required: true },
    { key: "firstName", label: "Nombre", aliases: ["first", "first name", "firstname", "nombre"], required: true },
    { key: "email", label: "Email", aliases: ["email", "e-mail", "correo"] },
    { key: "cell", label: "Celular", aliases: ["cell", "cell phone", "mobile", "celular", "phone"] },
    { key: "address1", label: "Dirección", aliases: ["address", "address1", "direccion"] },
    { key: "city", label: "Ciudad", aliases: ["city", "ciudad"] },
    { key: "state", label: "Estado", aliases: ["state", "estado"] },
    { key: "zip", label: "Zip", aliases: ["zip", "zip code", "zipcode"] },
    { key: "birthdate", label: "Fecha de nacimiento", aliases: ["birthdate", "dob", "birth date", "fecha de nacimiento"] },
    { key: "ssn", label: "SSN", aliases: ["ssn", "social security"] },
    { key: "program", label: "Programa (código o nombre)", aliases: ["program", "programa", "course"] },
    { key: "schedule", label: "Horario", aliases: ["schedule", "horario"] },
    { key: "status", label: "Estado de inscripción", aliases: ["enrollment", "status", "enrollment status"] },
    { key: "enrollmentDate", label: "Fecha de inscripción", aliases: ["enrollment date", "enrolled"] },
    { key: "firstClass", label: "Primera clase", aliases: ["first class", "start date", "start"] },
    { key: "contractGrad", label: "Graduación por contrato", aliases: ["contract graduation", "contract graduation date", "grad date"] },
    { key: "importedHours", label: "Horas asistidas (de Genesis)", aliases: ["total hours attended", "hours attended", "hours", "horas"] },
  ],
  ledger: [
    { key: "badge", label: "Badge # del estudiante", aliases: ["badge", "badge #", "student id"], required: true },
    { key: "date", label: "Fecha", aliases: ["entry date", "date", "fecha"], required: true },
    { key: "description", label: "Concepto", aliases: ["account description", "description", "concepto"] },
    { key: "charge", label: "Cargo", aliases: ["charges", "charge", "cargo"] },
    { key: "payment", label: "Pago", aliases: ["payments", "payment", "pago"] },
    { key: "receipt", label: "Recibo #", aliases: ["receipt #", "receipt", "recibo"] },
    { key: "method", label: "Método", aliases: ["method", "metodo", "método"] },
  ],
  attendance: [
    { key: "badge", label: "Badge # del estudiante", aliases: ["badge", "badge #", "student id"], required: true },
    { key: "date", label: "Fecha", aliases: ["date", "fecha"], required: true },
    { key: "type", label: "Tipo", aliases: ["type", "tipo"] },
    { key: "timeIn", label: "Entrada", aliases: ["time in", "in", "entrada"] },
    { key: "timeOut", label: "Salida", aliases: ["time out", "out", "salida"] },
    { key: "hours", label: "Total horas", aliases: ["total", "hours", "horas"] },
  ],
  leads: [
    { key: "firstName", label: "Nombre", aliases: ["first name", "first_name", "nombre", "firstname"], required: true },
    { key: "lastName", label: "Apellido", aliases: ["last name", "last_name", "apellido", "lastname"] },
    { key: "email", label: "Email", aliases: ["email", "correo"] },
    { key: "phone", label: "Teléfono", aliases: ["phone", "phone_number", "telefono", "teléfono", "cell"] },
    { key: "program", label: "Programa de interés", aliases: ["program", "programa", "interest"] },
    { key: "campaign", label: "Campaña", aliases: ["campaign", "campaign_name", "campaña"] },
    { key: "createdAt", label: "Fecha de creación", aliases: ["created_time", "created", "date", "fecha"] },
  ],
};

const norm = (s: string) => s.toLowerCase().replace(/[_.:]/g, " ").replace(/\s+/g, " ").trim();

/** Acepta MM/DD/YYYY (Genesis), YYYY-MM-DD o fechas ISO. */
export function toDate(v?: string) {
  if (!v) return "";
  const s = v.trim();
  if (/^0{1,2}\/0{1,2}\/0{4}$/.test(s)) return "";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return toISODate(new Date(y, Number(m[1]) - 1, Number(m[2])));
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : toISODate(d);
}

/** Acepta "09:00 AM", "1:00 PM" o "13:00". */
export function toTime(v?: string) {
  if (!v) return undefined;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const num = (v?: string) => Number(String(v ?? "").replace(/[$,\s]/g, "")) || 0;

const STATUS_MAP: Record<string, EnrollmentStatus> = {
  enrolled: "Enrolled", active: "Enrolled", graduated: "Graduated", withdrawn: "Withdrawn", dropped: "Dropped", loa: "LOA", "leave of absence": "LOA", applicant: "Applicant",
};

export default function ImportData() {
  const store = useStore();
  const { db, saveMany } = store;
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("students");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<Record<string, string>>({});
  const headers = rows.length ? Object.keys(rows[0]) : [];

  const autoMap = (hs: string[], k: Kind) => {
    const m: Record<string, string> = {};
    FIELDS[k].forEach((f) => {
      const h = hs.find((x) => f.aliases.includes(norm(x)));
      if (h) m[f.key] = h;
    });
    setMap(m);
  };

  const onFile = async (f: File) => {
    const parsed = parseCSV(await f.text());
    setRows(parsed);
    setFileName(f.name);
    autoMap(parsed.length ? Object.keys(parsed[0]) : [], kind);
  };

  const get = (r: Record<string, string>, key: string) => (map[key] ? r[map[key]] : undefined);
  const missing = FIELDS[kind].filter((f) => f.required && !map[f.key]);
  const byBadge = useMemo(() => new Map(db.students.map((s) => [s.badge, s])), [db.students]);
  const findProgram = (v?: string) => {
    const s = norm(v ?? "");
    return db.programs.find((p) => norm(p.code) === s || norm(p.name) === s || (s && norm(p.name).startsWith(s.slice(0, 20))));
  };

  const run = () => {
    let skipped = 0;
    if (kind === "students") {
      let seq = Number(nextBadge(db).slice(4));
      const yr = new Date().getFullYear();
      const out: Student[] = rows.map((r) => {
        const p = findProgram(get(r, "program")) ?? db.programs[0];
        const sch = db.schedules.find((x) => norm(x.name) === norm(get(r, "schedule") ?? "")) ?? db.schedules[0];
        const existing = byBadge.get(get(r, "badge") ?? "");
        const first = toDate(get(r, "firstClass")) || toDate(get(r, "enrollmentDate")) || today();
        const base: Student = existing ?? {
          id: uid(), badge: get(r, "badge") || `${yr}${String(seq++).padStart(4, "0")}`, firstName: "", lastName: "", email: "", cell: "", address1: "", city: "", state: "FL", zip: "",
          programId: p.id, status: "Enrolled", record: "Active", enrollmentDate: first, firstClass: first, contractGrad: "", schedules: [{ scheduleId: sch.id, from: first }],
          transferHours: 0, importedHours: 0, overtimeHours: 0, loas: [], placement: { passedBoard: "" }, createdAt: nowISO(),
        };
        const status = STATUS_MAP[norm(get(r, "status") ?? "")] ?? base.status;
        const imported = map.importedHours ? num(get(r, "importedHours")) : base.importedHours;
        // Con horas importadas, la asistencia empieza a contarse hoy: lo anterior ya va en esas horas.
        const trackingStartDate = imported > 0 ? base.trackingStartDate ?? (today() > first ? today() : first) : base.trackingStartDate;
        return {
          ...base,
          firstName: get(r, "firstName") ?? base.firstName, lastName: get(r, "lastName") ?? base.lastName,
          email: get(r, "email") ?? base.email, cell: get(r, "cell") ?? base.cell, address1: get(r, "address1") ?? base.address1,
          city: get(r, "city") ?? base.city, state: get(r, "state") || base.state, zip: (get(r, "zip") ?? base.zip).replace(/-$/, ""),
          birthdate: toDate(get(r, "birthdate")) || base.birthdate, ssn: get(r, "ssn") || base.ssn, programId: p.id, status,
          record: status === "Enrolled" || status === "LOA" ? "Active" : "Inactive",
          enrollmentDate: toDate(get(r, "enrollmentDate")) || base.enrollmentDate, firstClass: first,
          contractGrad: toDate(get(r, "contractGrad")) || base.contractGrad, importedHours: imported, trackingStartDate,
          autoLedger: base.autoLedger ?? false, // los cargos llegan con el import del ledger
        };
      });
      saveMany("students", out, `import:students:${fileName}`);
      toast(`${out.length} estudiantes importados o actualizados.`);
    } else if (kind === "ledger") {
      const out: LedgerEntry[] = [];
      rows.forEach((r) => {
        const s = byBadge.get(get(r, "badge") ?? "");
        if (!s) return skipped++;
        out.push({ id: uid(), studentId: s.id, date: toDate(get(r, "date")) || today(), enteredBy: "import", description: get(r, "description") || "Tuition/Fees", charge: num(get(r, "charge")), payment: num(get(r, "payment")), receipt: get(r, "receipt") || undefined, method: (get(r, "method") as PaymentMethod) || undefined });
      });
      saveMany("ledger", out, `import:ledger:${fileName}`);
      toast(`${out.length} movimientos importados${skipped ? `, ${skipped} sin estudiante con ese badge` : ""}.`);
    } else if (kind === "attendance") {
      const out: AttendanceRecord[] = [];
      rows.forEach((r) => {
        const s = byBadge.get(get(r, "badge") ?? "");
        if (!s) return skipped++;
        const tin = toTime(get(r, "timeIn"));
        const tout = toTime(get(r, "timeOut"));
        const hours = map.hours ? num(get(r, "hours")) : tin && tout ? hoursBetween(tin, tout) : 0;
        const type = /abs/i.test(get(r, "type") ?? "") ? "Absent" : "Regular";
        out.push({ id: uid(), studentId: s.id, date: toDate(get(r, "date")) || today(), type, timeIn: tin, timeOut: tout, breakMinutes: 0, hours, source: "import" });
      });
      saveMany("attendance", out, `import:attendance:${fileName}`);
      toast(`${out.length} registros de asistencia importados${skipped ? `, ${skipped} sin estudiante` : ""}.`);
    } else {
      const out: Lead[] = rows.map((r) => ({
        id: uid(), firstName: get(r, "firstName") ?? "", lastName: get(r, "lastName") ?? "", email: get(r, "email") ?? "", phone: get(r, "phone") ?? "",
        language: "es", source: map.campaign ? "meta_ads" : "import", campaign: get(r, "campaign"), programId: findProgram(get(r, "program"))?.id,
        stage: "new", createdAt: get(r, "createdAt") ? new Date(toDate(get(r, "createdAt")) || today()).toISOString() : nowISO(),
      }));
      saveMany("leads", out, `import:leads:${fileName}`);
      toast(`${out.length} leads importados al CRM.`);
    }
    setRows([]);
    setFileName("");
  };

  return (
    <Card title="Importar datos desde CSV (Genesis, Excel, Meta)">
      <div className="space-y-4 p-4">
        <p className="text-sm text-slate-600">
          Exporta desde Genesis (R-Reports o File › Backup) o desde Excel a <b>CSV</b>. Los estudiantes se identifican por <b>Badge #</b>: si el badge ya existe se actualiza, si no se crea.
          Importa primero estudiantes y después ledger y asistencia. Las fechas pueden venir como MM/DD/YYYY.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="¿Qué vas a importar?">
            <Select value={kind} onChange={(e) => { const k = e.target.value as Kind; setKind(k); autoMap(headers, k); }} className="w-56">
              <option value="students">Estudiantes</option>
              <option value="ledger">Ledger (cargos y pagos)</option>
              <option value="attendance">Asistencia</option>
              <option value="leads">Leads (CRM / Meta Lead Ads)</option>
            </Select>
          </Field>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload size={15} /> Elegir CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </label>
          {fileName && <Badge tone="blue">{fileName} · {rows.length} filas</Badge>}
        </div>

        {rows.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS[kind].map((f) => (
                <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                  <Select value={map[f.key] ?? ""} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}>
                    <option value="">— no importar —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Vista previa</div>
              <Table className="rounded-lg border border-slate-200">
                <thead><tr>{FIELDS[kind].filter((f) => map[f.key]).map((f) => <Th key={f.key}>{f.label}</Th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => <tr key={i}>{FIELDS[kind].filter((f) => map[f.key]).map((f) => <Td key={f.key} className="text-xs">{f.key === "ssn" ? "•••" : get(r, f.key)}</Td>)}</tr>)}
                </tbody>
              </Table>
            </div>
            <div className="flex items-center justify-end gap-2">
              {missing.length > 0 && <span className="text-xs text-red-600">Falta asignar: {missing.map((m) => m.label).join(", ")}</span>}
              <Button variant="secondary" onClick={() => setRows([])}>Cancelar</Button>
              <Button disabled={missing.length > 0} onClick={run}>Importar {rows.length} filas</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
