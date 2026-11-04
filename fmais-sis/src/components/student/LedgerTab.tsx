import { CreditCard, Mail, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { recordPayment, zelleReminder } from "../../lib/actions";
import { balance, planStatus } from "../../lib/calc";
import { useStore, userName } from "../../lib/store";
import type { LedgerEntry, PaymentMethod, PaymentPlan, Student } from "../../lib/types";
import { addMonths, displayName, fmtDate, fmtDateTime, money, today, uid } from "../../lib/utils";
import { useToast } from "../Layout";
import { Badge, Button, Card, Field, Input, Modal, Select, Table, Td, Th } from "../ui";

const METHODS: PaymentMethod[] = ["Card", "Affirm", "FMAIS Plan", "Zelle", "Cash", "Check"];
const DESCRIPTIONS = ["Tuition/Fees", "School Registration Fee", "Supplies & Educational Resources", "Kit / Uniforme", "Overtime Hours", "Late Fee", "Refund", "Ajuste"];

export function printReceipt(e: LedgerEntry, s: Student, schoolName: string, bal: number) {
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Recibo ${e.receipt ?? ""}</title><style>
    body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a}h1{font-size:18px;margin:0}small{color:#64748b}
    table{width:100%;margin-top:20px;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:14px}td:last-child{text-align:right}
  </style></head><body>
    <h1>${schoolName}</h1><small>Recibo de pago</small>
    <table>
      <tr><td>Recibo #</td><td>${e.receipt ?? "—"}</td></tr>
      <tr><td>Fecha</td><td>${fmtDate(e.date)}</td></tr>
      <tr><td>Estudiante</td><td>${displayName(s)} (#${s.badge})</td></tr>
      <tr><td>Concepto</td><td>${e.description}</td></tr>
      <tr><td>Método</td><td>${e.method ?? "—"}</td></tr>
      <tr><td><b>Monto</b></td><td><b>${money(e.payment || e.charge)}</b></td></tr>
      <tr><td>Balance pendiente</td><td>${money(bal)}</td></tr>
    </table>
    <script>window.print()</script></body></html>`);
  w.document.close();
}

export default function LedgerTab({ s }: { s: Student }) {
  const store = useStore();
  const { db, save, remove } = store;
  const toast = useToast();
  const [edit, setEdit] = useState<(LedgerEntry & { kind: "charge" | "payment"; amount: number }) | null>(null);
  const [planEdit, setPlanEdit] = useState<PaymentPlan | null>(null);

  const entries = db.ledger.filter((l) => l.studentId === s.id).sort((a, b) => a.date.localeCompare(b.date) || b.charge - a.charge);
  let run = 0;
  const rows = entries.map((e) => ({ e, run: (run = Math.round((run + e.charge - e.payment) * 100) / 100) }));
  const charges = entries.reduce((t, e) => t + e.charge, 0);
  const payments = entries.reduce((t, e) => t + e.payment, 0);
  const bal = balance(s.id, db);
  const plans = db.plans.filter((p) => p.studentId === s.id);

  const startAdd = (kind: "charge" | "payment") =>
    setEdit({ id: uid(), studentId: s.id, date: today(), enteredBy: store.user?.id ?? "", description: "Tuition/Fees", charge: 0, payment: 0, kind, amount: 0, method: kind === "payment" ? "Zelle" : undefined });

  const saveEntry = () => {
    if (!edit) return;
    const { kind, amount, ...rest } = edit;
    const isNew = !db.ledger.some((l) => l.id === edit.id);
    const receipt = kind === "payment" ? rest.receipt || String(Math.max(7000, ...db.ledger.map((l) => Number(l.receipt) || 0)) + 1) : undefined;
    save("ledger", { ...rest, charge: kind === "charge" ? amount : 0, payment: kind === "payment" ? amount : 0, receipt, method: kind === "payment" ? rest.method : undefined }, isNew ? "create" : "update");
    setEdit(null);
  };

  return (
    <div className="space-y-4">
      <Card
        title="Ledger"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => startAdd("charge")}><Plus size={13} /> Cargo</Button>
            <Button size="sm" onClick={() => startAdd("payment")}><Plus size={13} /> Pago</Button>
          </>
        }
      >
        <Table>
          <thead><tr><Th>Fecha</Th><Th>Registrado por</Th><Th>Concepto</Th><Th className="text-right">Cargos</Th><Th className="text-right">Pagos</Th><Th className="text-right">Balance</Th><Th>Recibo #</Th><Th>Método</Th><Th></Th></tr></thead>
          <tbody>
            {rows.map(({ e, run }) => (
              <tr key={e.id}>
                <Td>{fmtDate(e.date)}</Td>
                <Td className="text-xs">{userName(db, e.enteredBy)}</Td>
                <Td>{e.description}</Td>
                <Td className="text-right tabular-nums">{e.charge ? money(e.charge) : ""}</Td>
                <Td className="text-right tabular-nums text-emerald-700">{e.payment ? money(e.payment) : ""}</Td>
                <Td className="text-right tabular-nums text-slate-500">{money(run)}</Td>
                <Td className="font-mono text-xs">{e.receipt ?? ""}</Td>
                <Td className="text-xs">{e.method ?? ""}</Td>
                <Td className="whitespace-nowrap text-right">
                  {e.payment > 0 && <button onClick={() => printReceipt(e, s, db.settings.schoolName, bal)} className="mr-2 text-slate-400 hover:text-slate-700" aria-label="Imprimir recibo"><Printer size={14} /></button>}
                  <button onClick={() => setEdit({ ...e, kind: e.payment > 0 ? "payment" : "charge", amount: e.payment || e.charge })} className="mr-2 text-slate-400 hover:text-slate-700" aria-label="Editar"><Pencil size={14} /></button>
                  <button onClick={() => confirm("¿Eliminar este movimiento?") && remove("ledger", e.id)} className="text-slate-400 hover:text-red-600" aria-label="Eliminar"><Trash2 size={14} /></button>
                </Td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <Td colSpan={3} className="text-right">Totales</Td>
              <Td className="text-right tabular-nums">{money(charges)}</Td>
              <Td className="text-right tabular-nums">{money(payments)}</Td>
              <Td className={`text-right tabular-nums ${bal > 0 ? "text-amber-700" : ""}`}>{money(bal)}</Td>
              <Td colSpan={3}>Balance</Td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <Card
        title="Plan de pagos"
        actions={<Button size="sm" variant="secondary" onClick={() => setPlanEdit({ id: uid(), studentId: s.id, mode: "zelle", amount: Math.max(0, Math.round(bal / 4)), frequency: "monthly", nextDue: addMonths(today(), 1), installmentsLeft: 4, active: true })}><Plus size={13} /> Nuevo plan</Button>}
      >
        {plans.length ? (
          <div className="divide-y divide-slate-100">
            {plans.map((p) => {
              const st = planStatus(p, db);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Badge tone={p.mode === "autopay" ? "blue" : "violet"}>{p.mode === "autopay" ? `Cobro automático${p.cardLast4 ? ` · ****${p.cardLast4}` : ""}` : "Zelle con recordatorio"}</Badge>
                  <span className="font-medium tabular-nums">{money(p.amount)}</span>
                  <span className="text-slate-500">{p.frequency === "monthly" ? "mensual" : p.frequency === "biweekly" ? "quincenal" : "semanal"} · {p.installmentsLeft} cuotas restantes</span>
                  <span className="text-slate-500">Próximo: {fmtDate(p.nextDue)}</span>
                  {st === "overdue" && <Badge tone="red">Vencido</Badge>}
                  {st === "due_soon" && <Badge tone="amber">Vence pronto</Badge>}
                  {st === "inactive" && <Badge>Inactivo</Badge>}
                  {p.lastReminderAt && <span className="text-xs text-slate-400">Último recordatorio {fmtDateTime(p.lastReminderAt)}</span>}
                  <span className="ml-auto flex gap-2">
                    {p.active && p.mode === "zelle" && <Button size="sm" variant="secondary" onClick={() => { zelleReminder(store, p); toast("Recordatorio enviado."); }}><Mail size={13} /> Recordar</Button>}
                    {p.active && (
                      <Button size="sm" variant="success" onClick={() => { const r = recordPayment(store, { studentId: s.id, amount: p.amount, method: p.mode === "zelle" ? "Zelle" : "Card", plan: p, sendReceipt: p.mode === "autopay" }); toast(`Pago registrado · recibo #${r}`); }}>
                        <CreditCard size={13} /> {p.mode === "zelle" ? "Marcar Zelle recibido" : "Cobrar ahora"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setPlanEdit(p)}><Pencil size={13} /></Button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-slate-400">Sin plan de pagos.</div>
        )}
      </Card>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.kind === "payment" ? "Pago" : "Cargo"} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.amount} onClick={saveEntry}>Guardar</Button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as "charge" | "payment" })}>
                <option value="charge">Cargo</option><option value="payment">Pago</option>
              </Select>
            </Field>
            <Field label="Fecha"><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label="Concepto" className="col-span-2">
              <Select value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })}>
                {[...new Set([edit.description, ...DESCRIPTIONS])].map((d) => <option key={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Monto"><Input type="number" min={0} step="0.01" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) })} /></Field>
            {edit.kind === "payment" && (
              <Field label="Método">
                <Select value={edit.method} onChange={(e) => setEdit({ ...edit, method: e.target.value as PaymentMethod })}>
                  {METHODS.map((m) => <option key={m}>{m}</option>)}
                </Select>
              </Field>
            )}
          </div>
        </Modal>
      )}

      {planEdit && (
        <Modal open onClose={() => setPlanEdit(null)} title="Plan de pagos" footer={<><Button variant="secondary" onClick={() => setPlanEdit(null)}>Cancelar</Button><Button onClick={() => { save("plans", planEdit); setPlanEdit(null); }}>Guardar</Button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Modalidad" className="col-span-2">
              <Select value={planEdit.mode} onChange={(e) => setPlanEdit({ ...planEdit, mode: e.target.value as PaymentPlan["mode"] })}>
                <option value="autopay">Cobro automático con tarjeta</option>
                <option value="zelle">Zelle con recordatorio por email</option>
              </Select>
            </Field>
            <Field label="Monto por cuota"><Input type="number" value={planEdit.amount} onChange={(e) => setPlanEdit({ ...planEdit, amount: Number(e.target.value) })} /></Field>
            <Field label="Frecuencia">
              <Select value={planEdit.frequency} onChange={(e) => setPlanEdit({ ...planEdit, frequency: e.target.value as PaymentPlan["frequency"] })}>
                <option value="monthly">Mensual</option><option value="biweekly">Quincenal</option><option value="weekly">Semanal</option>
              </Select>
            </Field>
            <Field label="Próximo vencimiento"><Input type="date" value={planEdit.nextDue} onChange={(e) => setPlanEdit({ ...planEdit, nextDue: e.target.value })} /></Field>
            <Field label="Cuotas restantes"><Input type="number" value={planEdit.installmentsLeft} onChange={(e) => setPlanEdit({ ...planEdit, installmentsLeft: Number(e.target.value) })} /></Field>
            {planEdit.mode === "autopay" && <Field label="Tarjeta (últimos 4)" hint="En producción la tarjeta se guarda en el procesador de pagos, nunca aquí."><Input maxLength={4} value={planEdit.cardLast4 ?? ""} onChange={(e) => setPlanEdit({ ...planEdit, cardLast4: e.target.value.replace(/\D/g, "") })} /></Field>}
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={planEdit.active} onChange={(e) => setPlanEdit({ ...planEdit, active: e.target.checked })} /> Plan activo</label>
          </div>
        </Modal>
      )}
    </div>
  );
}
