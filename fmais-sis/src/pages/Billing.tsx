import { CreditCard, Mail, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Disbursement from "../components/Disbursement";
import { useToast } from "../components/Layout";
import { Badge, Button, Card, Empty, Modal, PageHeader, Select, Stat, Table, Tabs, Td, Th } from "../components/ui";
import { recordPayment, zelleReminder } from "../lib/actions";
import { balance, liveLedger, nextReceipt, planStatus } from "../lib/calc";
import { useStore } from "../lib/store";
import type { EmailLog } from "../lib/types";
import { displayName, fmtDate, fmtDateTime, money, today } from "../lib/utils";

const STATUS_LABEL = { overdue: "Vencido", due_soon: "Vence pronto", ok: "Al día", inactive: "Inactivo" };
const STATUS_TONE = { overdue: "red", due_soon: "amber", ok: "green", inactive: "slate" } as const;

export default function Billing() {
  const store = useStore();
  const { db } = store;
  const toast = useToast();
  const [tab, setTab] = useState<"plans" | "payments" | "disbursement" | "emails">("plans");
  const [mode, setMode] = useState("");
  const [st, setSt] = useState("active");
  const [email, setEmail] = useState<EmailLog | null>(null);
  const T = today();
  const sById = useMemo(() => new Map(db.students.map((s) => [s.id, s])), [db.students]);

  const plans = db.plans
    .map((p) => ({ p, st: planStatus(p, db), s: sById.get(p.studentId) }))
    .filter((x) => x.s)
    .filter((x) => !mode || x.p.mode === mode)
    .filter((x) => (st === "active" ? x.st !== "inactive" : !st || x.st === st))
    .sort((a, b) => a.p.nextDue.localeCompare(b.p.nextDue));

  const toRemind = db.plans.filter((p) => p.mode === "zelle" && ["overdue", "due_soon"].includes(planStatus(p, db)) && (!p.lastReminderAt || Date.now() - new Date(p.lastReminderAt).getTime() > 86400000));
  const toCharge = db.plans.filter((p) => p.active && p.mode === "autopay" && p.nextDue <= T);
  const monthPayments = liveLedger(db).filter((l) => l.payment > 0 && l.date.slice(0, 7) === T.slice(0, 7));
  const overdueAmt = db.plans.filter((p) => planStatus(p, db) === "overdue").reduce((t, p) => t + p.amount, 0);

  const runReminders = () => {
    toRemind.forEach((p) => zelleReminder(store, p));
    toast(`${toRemind.length} recordatorios de Zelle enviados.`);
  };
  const runAutopay = () => {
    let r = Number(nextReceipt(db));
    toCharge.forEach((p) => recordPayment(store, { studentId: p.studentId, amount: p.amount, method: "Card", plan: p, sendReceipt: true, receipt: String(r++) }));
    toast(`${toCharge.length} cobros automáticos procesados (simulado).`);
  };

  return (
    <div>
      <PageHeader
        title="Cobros"
        subtitle="Planes de pago con cobro automático o Zelle con recordatorio."
        actions={
          <>
            <Button variant="secondary" disabled={!toRemind.length} onClick={runReminders}><Mail size={15} /> Enviar recordatorios Zelle ({toRemind.length})</Button>
            <Button disabled={!toCharge.length} onClick={runAutopay}><Play size={15} /> Ejecutar cobros automáticos ({toCharge.length})</Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cobrado este mes" value={money(monthPayments.reduce((t, l) => t + l.payment, 0))} sub={`${monthPayments.length} pagos`} tone="green" />
        <Stat label="Vencido" value={money(overdueAmt)} sub={`${db.plans.filter((p) => planStatus(p, db) === "overdue").length} planes`} tone="red" />
        <Stat label="Planes automáticos" value={db.plans.filter((p) => p.active && p.mode === "autopay").length} tone="blue" />
        <Stat label="Planes Zelle" value={db.plans.filter((p) => p.active && p.mode === "zelle").length} tone="violet" />
      </div>
      <Tabs tabs={[{ id: "plans", label: "Planes de pago" }, { id: "payments", label: "Pagos recibidos" }, { id: "disbursement", label: "Desembolso en lote" }, { id: "emails", label: "Registro de emails" }]} value={tab} onChange={(t) => setTab(t as typeof tab)} />
      <div className="mt-4">
        {tab === "plans" && (
          <Card>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
              <Select value={mode} onChange={(e) => setMode(e.target.value)} className="w-44">
                <option value="">Todas las modalidades</option><option value="autopay">Cobro automático</option><option value="zelle">Zelle</option>
              </Select>
              <Select value={st} onChange={(e) => setSt(e.target.value)} className="w-40">
                <option value="active">Activos</option><option value="overdue">Vencidos</option><option value="due_soon">Vencen pronto</option><option value="ok">Al día</option><option value="inactive">Inactivos</option><option value="">Todos</option>
              </Select>
            </div>
            <Table>
              <thead><tr><Th>Estudiante</Th><Th>Modalidad</Th><Th className="text-right">Cuota</Th><Th>Próximo</Th><Th>Cuotas</Th><Th>Estado</Th><Th className="text-right">Balance</Th><Th>Último recordatorio</Th><Th></Th></tr></thead>
              <tbody>
                {plans.map(({ p, st, s }) => (
                  <tr key={p.id}>
                    <Td><Link to={`/students/${s!.id}?tab=ledger`} className="font-medium hover:underline">{displayName(s!)}</Link><div className="text-xs text-slate-400">#{s!.badge}</div></Td>
                    <Td>{p.mode === "autopay" ? <Badge tone="blue">Automático{p.cardLast4 ? ` ****${p.cardLast4}` : ""}</Badge> : <Badge tone="violet">Zelle</Badge>}</Td>
                    <Td className="text-right tabular-nums">{money(p.amount)}</Td>
                    <Td>{fmtDate(p.nextDue)}</Td>
                    <Td className="tabular-nums">{p.installmentsLeft}</Td>
                    <Td><Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge></Td>
                    <Td className="text-right tabular-nums">{money(balance(p.studentId, db))}</Td>
                    <Td className="text-xs">{fmtDateTime(p.lastReminderAt)}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {p.active && p.mode === "zelle" && <Button size="sm" variant="ghost" onClick={() => { zelleReminder(store, p); toast("Recordatorio enviado."); }}><Mail size={13} /></Button>}
                      {p.active && <Button size="sm" variant="ghost" onClick={() => { const r = recordPayment(store, { studentId: p.studentId, amount: p.amount, method: p.mode === "zelle" ? "Zelle" : "Card", plan: p, sendReceipt: p.mode === "autopay" }); toast(`Pago registrado · recibo #${r}`); }}><CreditCard size={13} /> {p.mode === "zelle" ? "Recibido" : "Cobrar"}</Button>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!plans.length && <Empty>Sin planes con esos filtros.</Empty>}
          </Card>
        )}
        {tab === "payments" && (
          <Card>
            <Table>
              <thead><tr><Th>Fecha</Th><Th>Estudiante</Th><Th>Concepto</Th><Th>Método</Th><Th>Recibo</Th><Th className="text-right">Monto</Th></tr></thead>
              <tbody>
                {db.ledger.filter((l) => l.payment !== 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150).map((l) => {
                  const s = sById.get(l.studentId);
                  return (
                    <tr key={l.id} className={l.voided ? "text-slate-400" : undefined}>
                      <Td className={l.voided ? "line-through" : undefined}>{fmtDate(l.date)}</Td>
                      <Td>{s ? <Link className="hover:underline" to={`/students/${s.id}?tab=ledger`}>{displayName(s)}</Link> : "—"}</Td>
                      <Td>
                        <span className={l.voided ? "line-through" : undefined}>{l.description}</span>{" "}
                        {l.voided && <Badge tone="red">Anulado</Badge>}
                        {!l.voided && l.payment < 0 && <Badge tone="violet">Reembolso</Badge>}
                        {l.batchId && <Badge tone="blue">Desembolso</Badge>}
                      </Td>
                      <Td>{l.method}</Td>
                      <Td className="font-mono text-xs">{l.receipt}</Td>
                      <Td className={`text-right tabular-nums ${l.voided ? "line-through" : l.payment < 0 ? "text-violet-700" : "text-emerald-700"}`}>{money(l.payment)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
        {tab === "disbursement" && <Disbursement />}
        {tab === "emails" && (
          <Card>
            <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">En la demo los emails no se envían; quedan aquí para revisar el contenido. En producción salen por el proveedor de email del portal.</p>
            <Table>
              <thead><tr><Th>Fecha</Th><Th>Para</Th><Th>Asunto</Th><Th>Tipo</Th></tr></thead>
              <tbody>
                {db.emails.slice(0, 200).map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEmail(e)}>
                    <Td className="text-xs">{fmtDateTime(e.at)}</Td>
                    <Td className="text-xs">{e.to}</Td>
                    <Td>{e.subject}</Td>
                    <Td><Badge>{e.kind}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
      {email && (
        <Modal open onClose={() => setEmail(null)} title={email.subject}>
          <div className="text-xs text-slate-500">Para: {email.to} · {fmtDateTime(email.at)}</div>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-700">{email.body}</pre>
        </Modal>
      )}
    </div>
  );
}
