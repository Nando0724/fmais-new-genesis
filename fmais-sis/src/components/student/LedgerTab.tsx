import { Ban, CheckCircle2, CreditCard, Mail, Pencil, Plus, Printer } from "lucide-react";
import { useState } from "react";
import { entryProblem, recordPayment, saveEntry, verifyEntry, voidEntry, zelleReminder, type EntryInput, type EntryKind } from "../../lib/actions";
import { balance, needsVerification, planStatus, programOf } from "../../lib/calc";
import { accountFor, activeOptions } from "../../lib/config";
import { useStore, userName } from "../../lib/store";
import type { LedgerEntry, PaymentPlan, Role, Student } from "../../lib/types";
import { addMonths, displayName, fmtDate, fmtDateTime, money, today, uid } from "../../lib/utils";
import { useToast } from "../Layout";
import { Badge, Button, Card, Field, Input, Modal, Select, Table, Td, Textarea, Th } from "../ui";

const EXTRA_CONCEPTS = ["Tuition/Fees", "Kit / Uniforme", "Late Fee", "Reembolso", "Ajuste"];
const KIND_LABEL: Record<EntryKind, string> = { charge: "Cargo", payment: "Pago", charge_auto_payment: "Cargo con pago automático" };

/** Quién puede registrar, editar y anular asientos (igual que la política RLS de producción). */
export const canWriteLedger = (role?: Role) => role === "owner" || role === "admin" || role === "finance";

const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function printReceipt(e: LedgerEntry, s: Student, schoolName: string, bal: number) {
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) return;
  const refund = e.payment < 0;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${esc(e.receipt ?? "")}</title><style>
    body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a}h1{font-size:18px;margin:0}small{color:#64748b}
    table{width:100%;margin-top:20px;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:14px}td:last-child{text-align:right}
  </style></head><body>
    <h1>${esc(schoolName)}</h1><small>${refund ? "Comprobante de reembolso" : "Recibo de pago"}</small>
    <table>
      <tr><td>Recibo #</td><td>${esc(e.receipt ?? "—")}</td></tr>
      <tr><td>Fecha</td><td>${fmtDate(e.date)}</td></tr>
      <tr><td>Estudiante</td><td>${esc(displayName(s))} (#${esc(s.badge)})</td></tr>
      <tr><td>Concepto</td><td>${esc(e.description)}</td></tr>
      <tr><td>Cuenta</td><td>${esc(e.account ?? "—")}</td></tr>
      <tr><td>Método</td><td>${esc(e.method ?? "—")}</td></tr>
      <tr><td><b>${refund ? "Monto reembolsado" : "Monto"}</b></td><td><b>${money(Math.abs(e.payment || e.charge))}</b></td></tr>
      <tr><td>Balance pendiente</td><td>${money(bal)}</td></tr>
    </table>
    <script>window.print()</script></body></html>`);
  w.document.close();
}

type Draft = EntryInput & { refund: boolean };

export default function LedgerTab({ s }: { s: Student }) {
  const store = useStore();
  const { db, save, user } = store;
  const toast = useToast();
  const writable = canWriteLedger(user?.role);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [voiding, setVoiding] = useState<LedgerEntry | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [planEdit, setPlanEdit] = useState<PaymentPlan | null>(null);

  const entries = db.ledger.filter((l) => l.studentId === s.id).sort((a, b) => a.date.localeCompare(b.date) || b.charge - a.charge);
  let run = 0;
  const rows = entries.map((e) => ({ e, run: e.voided ? undefined : (run = Math.round((run + e.charge - e.payment) * 100) / 100) }));
  const live = entries.filter((e) => !e.voided);
  const charges = live.reduce((t, e) => t + e.charge, 0);
  const payments = live.reduce((t, e) => t + e.payment, 0);
  const bal = balance(s.id, db);
  const plans = db.plans.filter((p) => p.studentId === s.id);
  const toVerify = live.filter(needsVerification).length;

  // Conceptos sugeridos: los costos del programa del estudiante + los generales.
  const program = programOf(s, db);
  const concepts = [...new Map([...(program?.costs ?? []).map((c) => [c.description, c.account] as const), ...EXTRA_CONCEPTS.map((d) => [d, accountFor(d)] as const)]).entries()];
  const accounts = activeOptions(db, "account", edit?.account);
  const methods = activeOptions(db, "payment_method", edit?.method);

  const startAdd = (kind: EntryKind) =>
    setEdit({ studentId: s.id, kind, date: today(), description: "Tuition/Fees", amount: 0, account: "Tuition", institutional: true, method: kind === "charge" ? undefined : "Zelle", refund: false });

  const startEdit = (e: LedgerEntry) =>
    setEdit({
      id: e.id, studentId: s.id, kind: e.payment !== 0 ? "payment" : "charge", date: e.date, description: e.description,
      amount: Math.abs(e.payment || e.charge), account: e.account ?? accountFor(e.description), institutional: e.institutional ?? true, method: e.method, refund: e.payment < 0,
    });

  const input: EntryInput | undefined = edit && { ...edit, amount: edit.kind === "payment" && edit.refund ? -Math.abs(edit.amount) : Math.abs(edit.amount) };
  const problem = input && entryProblem(input);

  const commit = () => {
    if (!input || problem) return;
    const receipt = saveEntry(store, input);
    setEdit(null);
    if (!receipt) return toast(input.id ? "Asiento actualizado." : "Cargo registrado.");
    toast(`${input.amount < 0 ? "Reembolso" : "Pago"} registrado · recibo #${receipt}`);
    // Genesis pregunta si se imprime el recibo al registrar un pago.
    if (confirm(`Recibo #${receipt}. ¿Imprimir el recibo para el estudiante?`)) {
      const delta = input.kind === "charge_auto_payment" ? 0 : -input.amount;
      printReceipt({ id: "", studentId: s.id, enteredBy: "", charge: 0, payment: input.amount, receipt, ...input }, s, db.settings.schoolName, Math.round((bal + delta) * 100) / 100);
    }
  };

  const pairLabel = (e: LedgerEntry) => (e.linkedId ? (e.payment ? "Pago del cargo" : "Cargo pagado") : undefined);

  return (
    <div className="space-y-4">
      {toVerify > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {toVerify} asiento(s) <b>por verificar</b>: se modificaron en una fecha distinta a la del asiento. Revísalos y márcalos como verificados.
        </div>
      )}
      <Card
        title="Ledger"
        actions={
          writable && (
            <>
              <Button size="sm" variant="secondary" onClick={() => startAdd("charge")}><Plus size={13} /> Cargo</Button>
              <Button size="sm" variant="secondary" onClick={() => startAdd("charge_auto_payment")}><Plus size={13} /> Cargo + pago</Button>
              <Button size="sm" onClick={() => startAdd("payment")}><Plus size={13} /> Pago</Button>
            </>
          )
        }
      >
        <Table>
          <thead><tr><Th>Fecha</Th><Th>Registrado por</Th><Th>Concepto</Th><Th>Cuenta</Th><Th className="text-right">Cargos</Th><Th className="text-right">Pagos</Th><Th className="text-right">Balance</Th><Th>Recibo #</Th><Th>Método</Th><Th></Th></tr></thead>
          <tbody>
            {rows.map(({ e, run }) => {
              const verify = !e.voided && needsVerification(e);
              const tip = [
                e.createdAt && `Creado ${fmtDateTime(e.createdAt)} por ${userName(db, e.enteredBy)}`,
                e.modifiedAt && `Modificado ${fmtDateTime(e.modifiedAt)} por ${userName(db, e.modifiedBy)}`,
                e.verifiedAt && `Verificado ${fmtDateTime(e.verifiedAt)} por ${userName(db, e.verifiedBy)}`,
                e.voided && `Anulado ${e.voidedAt ? fmtDateTime(e.voidedAt) : ""} por ${userName(db, e.voidedBy)}: ${e.voidReason ?? ""}`,
              ].filter(Boolean).join("\n");
              return (
                <tr key={e.id} className={e.voided ? "text-slate-400" : verify ? "bg-amber-50/60" : undefined} title={tip}>
                  <Td className={e.voided ? "line-through" : undefined}>{fmtDate(e.date)}</Td>
                  <Td className="text-xs">{userName(db, e.enteredBy)}</Td>
                  <Td>
                    <div className={e.voided ? "line-through" : undefined}>{e.description}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {e.voided && <Badge tone="red">Anulado{e.voidReason ? `: ${e.voidReason}` : ""}</Badge>}
                      {e.payment < 0 && <Badge tone="violet">Reembolso</Badge>}
                      {e.batchId && <Badge tone="blue">Desembolso</Badge>}
                      {e.autoPosted && <Badge>Auto</Badge>}
                      {e.institutional && <Badge tone="blue">Inst.</Badge>}
                      {pairLabel(e) && <Badge tone="slate">{pairLabel(e)}</Badge>}
                      {verify && <Badge tone="amber">Por verificar</Badge>}
                    </div>
                  </Td>
                  <Td className="text-xs">{e.account ?? "—"}</Td>
                  <Td className={`text-right tabular-nums ${e.voided ? "line-through" : ""}`}>{e.charge ? money(e.charge) : ""}</Td>
                  <Td className={`text-right tabular-nums ${e.voided ? "line-through" : e.payment < 0 ? "text-violet-700" : "text-emerald-700"}`}>{e.payment ? money(e.payment) : ""}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{run == null ? "—" : money(run)}</Td>
                  <Td className="font-mono text-xs">{e.receipt ?? ""}</Td>
                  <Td className="text-xs">{e.method ?? ""}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {!e.voided && e.payment !== 0 && <button onClick={() => printReceipt(e, s, db.settings.schoolName, bal)} className="mr-2 text-slate-400 hover:text-slate-700" aria-label="Imprimir recibo" title="Imprimir recibo"><Printer size={14} /></button>}
                    {writable && verify && <button onClick={() => { verifyEntry(store, e); toast("Asiento verificado."); }} className="mr-2 text-amber-600 hover:text-emerald-700" aria-label="Marcar verificado" title="Marcar verificado"><CheckCircle2 size={14} /></button>}
                    {writable && !e.voided && <button onClick={() => startEdit(e)} className="mr-2 text-slate-400 hover:text-slate-700" aria-label="Editar" title="Editar"><Pencil size={14} /></button>}
                    {writable && !e.voided && <button onClick={() => { setVoiding(e); setVoidReason(""); }} className="text-slate-400 hover:text-red-600" aria-label="Anular" title="Anular"><Ban size={14} /></button>}
                  </Td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-semibold">
              <Td colSpan={4} className="text-right">Totales (sin anulados)</Td>
              <Td className="text-right tabular-nums">{money(charges)}</Td>
              <Td className="text-right tabular-nums">{money(payments)}</Td>
              <Td className={`text-right tabular-nums ${bal > 0 ? "text-amber-700" : ""}`}>{money(bal)}</Td>
              <Td colSpan={3}>Balance</Td>
            </tr>
          </tbody>
        </Table>
        <p className="px-4 py-2 text-xs text-slate-400">
          Los asientos no se borran: se anulan y quedan a la vista, sin sumar en el balance ni en los reportes. Los reembolsos se registran como pago negativo (lo pide el 1098-T).
          Pasa el mouse sobre un asiento para ver quién lo creó, lo modificó o lo anuló.
        </p>
      </Card>

      <Card
        title="Plan de pagos"
        actions={writable && <Button size="sm" variant="secondary" onClick={() => setPlanEdit({ id: uid(), studentId: s.id, mode: "zelle", amount: Math.max(0, Math.round(bal / 4)), frequency: "monthly", nextDue: addMonths(today(), 1), installmentsLeft: 4, active: true })}><Plus size={13} /> Nuevo plan</Button>}
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
                  {writable && (
                    <span className="ml-auto flex gap-2">
                      {p.active && p.mode === "zelle" && <Button size="sm" variant="secondary" onClick={() => { zelleReminder(store, p); toast("Recordatorio enviado."); }}><Mail size={13} /> Recordar</Button>}
                      {p.active && (
                        <Button size="sm" variant="success" onClick={() => { const r = recordPayment(store, { studentId: s.id, amount: p.amount, method: p.mode === "zelle" ? "Zelle" : "Card", plan: p, sendReceipt: p.mode === "autopay" }); toast(`Pago registrado · recibo #${r}`); }}>
                          <CreditCard size={13} /> {p.mode === "zelle" ? "Marcar Zelle recibido" : "Cobrar ahora"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setPlanEdit(p)}><Pencil size={13} /></Button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-slate-400">Sin plan de pagos.</div>
        )}
      </Card>

      {edit && input && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? "Editar asiento" : KIND_LABEL[edit.kind]}
          footer={
            <>
              {problem && <span className="mr-auto self-center text-xs text-amber-700">{problem}</span>}
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button disabled={!!problem} onClick={commit}>Guardar</Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select disabled={!!edit.id} value={edit.kind} onChange={(e) => { const kind = e.target.value as EntryKind; setEdit({ ...edit, kind, method: kind === "charge" ? undefined : edit.method ?? "Zelle", refund: kind === "payment" && edit.refund }); }}>
                {(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </Select>
            </Field>
            <Field label="Fecha"><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label="Concepto" className="col-span-2">
              <Input
                list="ledger-concepts"
                value={edit.description}
                onChange={(e) => {
                  const known = concepts.find(([d]) => d === e.target.value);
                  setEdit({ ...edit, description: e.target.value, account: known ? known[1] : edit.account });
                }}
              />
              <datalist id="ledger-concepts">{concepts.map(([d]) => <option key={d} value={d} />)}</datalist>
            </Field>
            <Field label="Monto"><Input type="number" min={0} step="0.01" value={edit.amount || ""} onChange={(e) => setEdit({ ...edit, amount: Math.abs(Number(e.target.value)) })} /></Field>
            <Field label="Cuenta">
              <Select value={edit.account} onChange={(e) => setEdit({ ...edit, account: e.target.value })}>
                <option value="">—</option>
                {accounts.map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
              </Select>
            </Field>
            {edit.kind !== "charge" && (
              <Field label="Método de pago">
                <Select value={edit.method ?? ""} onChange={(e) => setEdit({ ...edit, method: e.target.value })}>
                  <option value="">—</option>
                  {methods.map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
                </Select>
              </Field>
            )}
            <div className="col-span-2 space-y-2 pt-1">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={edit.institutional} onChange={(e) => setEdit({ ...edit, institutional: e.target.checked })} />
                <span>Institucional<span className="block text-xs text-slate-400">Cuenta en el cálculo de reembolso.</span></span>
              </label>
              {edit.kind === "payment" && (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={edit.refund} onChange={(e) => setEdit({ ...edit, refund: e.target.checked, description: e.target.checked && edit.description === "Tuition/Fees" ? "Reembolso" : edit.description })} />
                  <span>Es un reembolso al estudiante<span className="block text-xs text-slate-400">Se guarda como pago negativo y sube el balance.</span></span>
                </label>
              )}
              {edit.kind === "charge_auto_payment" && <p className="text-xs text-slate-500">Se crean dos asientos enlazados: el cargo y su pago por el mismo monto. Anular uno anula los dos.</p>}
              {edit.id && edit.date !== today() && <p className="text-xs text-amber-700">Este asiento es de otra fecha: al guardarlo quedará marcado "por verificar" hasta que alguien lo revise.</p>}
            </div>
          </div>
        </Modal>
      )}

      {voiding && (
        <Modal
          open
          onClose={() => setVoiding(null)}
          title="Anular asiento"
          footer={
            <>
              <Button variant="secondary" onClick={() => setVoiding(null)}>Cancelar</Button>
              <Button variant="danger" disabled={!voidReason.trim()} onClick={() => { voidEntry(store, voiding, voidReason.trim()); setVoiding(null); toast("Asiento anulado."); }}>Anular</Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            {fmtDate(voiding.date)} · {voiding.description} · <b>{money(voiding.payment || voiding.charge)}</b>
            {voiding.linkedId && <> · también se anula su asiento par</>}.
            El asiento queda visible tachado y deja de contar en el balance y los reportes. No se puede deshacer.
          </p>
          <Field label="Motivo (obligatorio)"><Textarea rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Ej. registrado dos veces, monto equivocado" /></Field>
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
