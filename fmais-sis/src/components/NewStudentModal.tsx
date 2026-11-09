import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createStudent, newStudentMissing, possibleDuplicates, type NewStudentInput } from "../lib/actions";
import { useStore } from "../lib/store";
import type { PaymentMethod } from "../lib/types";
import { addDays, fullName, money, today } from "../lib/utils";
import { useToast } from "./Layout";
import { Button, cx, Field, Input, Modal, Select } from "./ui";

const METHODS: PaymentMethod[] = ["Card", "Affirm", "FMAIS Plan", "Zelle", "Cash", "Check"];

// Campos obligatorios vacíos con fondo amarillo, como en Genesis.
const req = (empty: boolean) => cx(empty && "!border-amber-300 !bg-amber-50");

/** Alta de estudiante: desde cero, desde un lead del CRM o desde una inscripción en línea. */
export default function NewStudentModal({ open, onClose, initial, onCreated }: { open: boolean; onClose: () => void; initial?: Partial<NewStudentInput>; onCreated?: (id: string) => void }) {
  const store = useStore();
  const { db } = store;
  const toast = useToast();
  const nav = useNavigate();
  const blank = (): NewStudentInput => ({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    programId: db.programs.find((p) => p.active)?.id ?? "",
    scheduleId: db.schedules[0]?.id ?? "",
    firstClass: addDays(today(), 7),
    deposit: 1500,
    depositMethod: "Card",
    planMode: "autopay",
    installments: 6,
    autoLedger: true,
  });
  const [f, setF] = useState<NewStudentInput>(blank);
  const [continuing, setContinuing] = useState(false);
  useEffect(() => {
    if (open) {
      setF({ ...blank(), ...initial });
      setContinuing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof NewStudentInput>(k: K, v: NewStudentInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const program = db.programs.find((p) => p.id === f.programId);
  const posted = f.autoLedger !== false ? (program?.costs ?? []).filter((c) => c.autoPost && c.amount) : [];
  const total = posted.reduce((t, c) => t + c.amount, 0);
  const rest = Math.max(0, total - (f.deposit ?? 0));
  const input: NewStudentInput = continuing ? f : { ...f, importedHours: undefined, trackingStartDate: undefined };
  const missing = newStudentMissing(input);
  const dups = possibleDuplicates(db, f.email, f.phone);
  const openLeads = db.leads.filter((l) => !l.studentId && l.stage !== "lost").sort((a, b) => a.lastName.localeCompare(b.lastName));

  // Botón "Lead" de Genesis: trae los datos del lead sin volver a escribirlos.
  const importLead = (id: string) => {
    const l = db.leads.find((x) => x.id === id);
    if (!l) return set("leadId", undefined);
    setF((x) => ({
      ...x,
      leadId: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      email: l.email,
      phone: l.phone,
      programId: l.programId && db.programs.some((p) => p.id === l.programId && p.active) ? l.programId : x.programId,
    }));
  };

  const submit = () => {
    const s = createStudent(store, input);
    toast(`Estudiante creado · badge #${s.badge}`);
    onClose();
    if (onCreated) onCreated(s.id);
    else nav(`/students/${s.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Nuevo estudiante"
      footer={
        <>
          {missing && <span className="mr-auto self-center text-xs text-amber-700">{missing}</span>}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!!missing} onClick={submit}>Crear estudiante</Button>
        </>
      }
    >
      <div className="space-y-5">
        {!initial?.leadId && (
          <Field label="Traer datos de un lead del CRM (opcional)">
            <Select value={f.leadId ?? ""} onChange={(e) => importLead(e.target.value)}>
              <option value="">— Estudiante nuevo, sin lead —</option>
              {openLeads.map((l) => <option key={l.id} value={l.id}>{l.lastName}, {l.firstName} · {l.phone || l.email}</option>)}
            </Select>
          </Field>
        )}

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Datos personales</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *"><Input className={req(!f.firstName.trim())} value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
            <Field label="Apellido *"><Input className={req(!f.lastName.trim())} value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
            <Field label="Email" hint="Email o celular: al menos uno."><Input className={req(!f.email && !f.phone)} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Celular"><Input className={req(!f.email && !f.phone)} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          </div>
          {dups.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Ya hay {dups.length === 1 ? "un estudiante" : "estudiantes"} con ese email o celular:{" "}
              {dups.map((s, i) => (
                <span key={s.id}>{i > 0 && ", "}<Link className="underline" to={`/students/${s.id}`} onClick={onClose}>{fullName(s)} (#{s.badge})</Link></span>
              ))}
              . Revisa que no sea la misma persona.
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Programa</h4>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Programa *" className="col-span-3">
              <Select className={req(!f.programId)} value={f.programId} onChange={(e) => set("programId", e.target.value)}>
                {db.programs.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name} ({p.totalHours} {p.unitType === "credit" ? "créditos" : "h"})</option>
                ))}
              </Select>
            </Field>
            <Field label="Horario *">
              <Select className={req(!f.scheduleId)} value={f.scheduleId} onChange={(e) => set("scheduleId", e.target.value)}>
                {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}
              </Select>
            </Field>
            <Field label="Primera clase *"><Input className={req(!f.firstClass)} type="date" value={f.firstClass} onChange={(e) => set("firstClass", e.target.value)} /></Field>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={continuing} onChange={(e) => {
              setContinuing(e.target.checked);
              if (e.target.checked && !f.trackingStartDate) set("trackingStartDate", today());
            }} />
            <span>
              Ya venía cursando (pasa desde Genesis u otro sistema)
              <span className="block text-xs text-slate-400">Sus horas hechas hasta hoy entran como horas importadas, sin cargar día por día.</span>
            </span>
          </label>
          {continuing && (
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
              <Field label="Horas ya completadas"><Input type="number" min={0} value={f.importedHours ?? 0} onChange={(e) => set("importedHours", Number(e.target.value))} /></Field>
              <Field label="Empezar a contar asistencia desde" hint="Las ausencias y el SAP se calculan desde esta fecha."><Input type="date" value={f.trackingStartDate ?? ""} onChange={(e) => set("trackingStartDate", e.target.value)} /></Field>
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cobro</h4>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={f.autoLedger !== false} onChange={(e) => set("autoLedger", e.target.checked)} />
            <span>
              Cargar los costos del programa al ledger (Auto-ledger)
              <span className="block text-xs text-slate-400">
                {program && f.autoLedger !== false
                  ? posted.map((c) => `${c.description} ${money(c.amount)}`).join(" · ") || "El programa no tiene costos marcados para cargar al inscribir."
                  : "No se carga nada: los cargos se agregan a mano en el ledger (por ejemplo, si ya se cobraron en Genesis)."}
              </span>
            </span>
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Depósito recibido"><Input type="number" min={0} value={f.deposit ?? 0} onChange={(e) => set("deposit", Number(e.target.value))} /></Field>
            <Field label="Método del depósito">
              <Select value={f.depositMethod} onChange={(e) => set("depositMethod", e.target.value as PaymentMethod)}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
            {total > 0 && (
              <>
                <Field label="Plan de pago del resto">
                  <Select value={f.planMode} onChange={(e) => set("planMode", e.target.value as "autopay" | "zelle")}>
                    <option value="autopay">Cobro automático (tarjeta)</option>
                    <option value="zelle">Zelle con recordatorio por email</option>
                  </Select>
                </Field>
                <Field label="Cuotas mensuales"><Input type="number" min={1} max={36} value={f.installments} onChange={(e) => set("installments", Number(e.target.value))} /></Field>
              </>
            )}
          </div>
          {total > 0 && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Total del programa <b>{money(total)}</b> · resto <b>{money(rest)}</b> en {f.installments} cuotas de <b>{money(rest / Math.max(1, f.installments ?? 1))}</b>.
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
