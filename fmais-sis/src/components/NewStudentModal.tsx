import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStudent, type NewStudentInput } from "../lib/actions";
import { useStore } from "../lib/store";
import type { PaymentMethod } from "../lib/types";
import { addDays, money, today } from "../lib/utils";
import { useToast } from "./Layout";
import { Button, Field, Input, Modal, Select } from "./ui";

const METHODS: PaymentMethod[] = ["Card", "Affirm", "FMAIS Plan", "Zelle", "Cash", "Check"];

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
  });
  const [f, setF] = useState<NewStudentInput>(blank);
  useEffect(() => {
    if (open) setF({ ...blank(), ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof NewStudentInput>(k: K, v: NewStudentInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const program = db.programs.find((p) => p.id === f.programId);
  const total = program ? program.costs.filter((c) => c.autoPost).reduce((t, c) => t + c.amount, 0) : 0;
  const rest = Math.max(0, total - (f.deposit ?? 0));
  const valid = f.firstName && f.lastName && f.programId && f.scheduleId;

  const submit = () => {
    const s = createStudent(store, f);
    toast(`Estudiante creado · badge #${s.badge}`);
    onClose();
    if (onCreated) onCreated(s.id);
    else nav(`/students/${s.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo estudiante"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid} onClick={submit}>Crear estudiante</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
        <Field label="Apellido"><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Celular"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Programa" className="col-span-2">
          <Select value={f.programId} onChange={(e) => set("programId", e.target.value)}>
            {db.programs.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>{p.code} · {p.name} ({p.totalHours} h)</option>
            ))}
          </Select>
        </Field>
        <Field label="Horario">
          <Select value={f.scheduleId} onChange={(e) => set("scheduleId", e.target.value)}>
            {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Primera clase"><Input type="date" value={f.firstClass} onChange={(e) => set("firstClass", e.target.value)} /></Field>
        <Field label="Depósito recibido"><Input type="number" min={0} value={f.deposit ?? 0} onChange={(e) => set("deposit", Number(e.target.value))} /></Field>
        <Field label="Método del depósito">
          <Select value={f.depositMethod} onChange={(e) => set("depositMethod", e.target.value as PaymentMethod)}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Plan de pago del resto">
          <Select value={f.planMode} onChange={(e) => set("planMode", e.target.value as "autopay" | "zelle")}>
            <option value="autopay">Cobro automático (tarjeta)</option>
            <option value="zelle">Zelle con recordatorio por email</option>
          </Select>
        </Field>
        <Field label="Cuotas mensuales"><Input type="number" min={1} max={36} value={f.installments} onChange={(e) => set("installments", Number(e.target.value))} /></Field>
      </div>
      {program && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Total del programa <b>{money(total)}</b> · resto <b>{money(rest)}</b> en {f.installments} cuotas de <b>{money(rest / Math.max(1, f.installments ?? 1))}</b>.
        </div>
      )}
    </Modal>
  );
}
