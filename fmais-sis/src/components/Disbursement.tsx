// Desembolso en lote (Tasks › Ledger de Genesis, manual §7): un cheque o transferencia repartido entre varios estudiantes.
import { Plus, Printer, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { balance, nextReceipt, programOf } from "../lib/calc";
import { activeOptions } from "../lib/config";
import { printDisbursement } from "../lib/print";
import { useStore } from "../lib/store";
import type { DB, DisbursementBatch, LedgerEntry } from "../lib/types";
import { fmtDate, fullName, money, nowISO, today, uid } from "../lib/utils";
import { useToast } from "./Layout";
import { Badge, Button, Card, Empty, Field, Input, Select, Table, Td, Th } from "./ui";

interface Line {
  key: string;
  studentId: string;
  amount: string;
  account: string;
  institutional: boolean;
}

const cents = (n: number) => Math.round(n * 100);

export function printBatch(db: DB, b: DisbursementBatch) {
  const entries = b.entryIds.map((id) => db.ledger.find((l) => l.id === id)).filter((l): l is LedgerEntry => !!l);
  return printDisbursement(
    db.settings.schoolName,
    { date: b.date, method: b.method, reference: b.reference, description: b.description, total: money(b.total) },
    entries.map((l) => {
      const s = db.students.find((x) => x.id === l.studentId);
      return { name: s ? fullName(s) : "—", badge: s?.badge ?? "", account: l.account ?? "", institutional: !!l.institutional, amount: money(l.payment), receipt: l.receipt ?? "", voided: l.voided };
    }),
  );
}

export default function Disbursement() {
  const { db, user, saveMany, save } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Check");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("Disbursement");
  const [total, setTotal] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");

  const candidates = db.students.filter((s) => s.status !== "Applicant" && !lines.some((l) => l.studentId === s.id)).sort((a, b) => a.lastName.localeCompare(b.lastName));
  const allocated = lines.reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const unallocated = (cents(Number(total) || 0) - cents(allocated)) / 100;
  const badLine = lines.some((l) => !(Number(l.amount) > 0));
  const problem =
    !(Number(total) > 0) ? "Escribe el total del cheque."
    : !lines.length ? "Agrega al menos un estudiante."
    : badLine ? "Cada estudiante necesita un monto mayor que 0."
    : unallocated !== 0 ? `Falta repartir ${money(unallocated)}. No se puede procesar si no cuadra.`
    : method === "Check" && !reference.trim() ? "Escribe el número de cheque."
    : !description.trim() ? "Escribe el concepto."
    : undefined;

  const add = () => {
    if (!pick) return;
    setLines([...lines, { key: uid(), studentId: pick, amount: "", account: "Tuition", institutional: true }]);
    setPick("");
  };
  const set = (key: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const process = () => {
    if (problem) return;
    const batchId = uid();
    const at = nowISO();
    let receipt = Number(nextReceipt(db));
    const entries: LedgerEntry[] = lines.map((l) => ({
      id: uid(),
      studentId: l.studentId,
      date,
      enteredBy: user?.id ?? "system",
      description: description.trim(),
      charge: 0,
      payment: Math.round(Number(l.amount) * 100) / 100,
      receipt: String(receipt++),
      method,
      account: l.account,
      institutional: l.institutional,
      batchId,
      createdAt: at,
    }));
    const batch: DisbursementBatch = { id: batchId, date, method, reference: reference.trim(), description: description.trim(), total: Number(total), entryIds: entries.map((e) => e.id), createdBy: user?.id, at };
    saveMany("ledger", entries, `Desembolso en lote ${batch.reference}`);
    save("disbursementBatches", batch, "Desembolso en lote");
    setLines([]);
    setTotal("");
    setReference("");
    toast(`Desembolso procesado: ${entries.length} pagos, recibos ${entries[0].receipt}–${entries[entries.length - 1].receipt}.`);
    // Se imprime con el db que ya incluye los asientos nuevos.
    if (window.confirm("¿Imprimir los recibos del desembolso?")) printBatch({ ...db, ledger: [...db.ledger, ...entries] }, batch);
  };

  const history = [...db.disbursementBatches].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-4">
      <Card title="Nuevo desembolso">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} /></Field>
          <Field label="Método">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {activeOptions(db, "payment_method", method).map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
            </Select>
          </Field>
          <Field label={method === "Check" ? "Cheque #" : "Referencia"}><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Total"><Input type="number" min={0} step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
          <Field label="Concepto"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pell Grant, beca, empleador…" /></Field>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3">
          <Field label="Agregar estudiante">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-72">
              <option value="">— elegir —</option>
              {candidates.map((s) => <option key={s.id} value={s.id}>{fullName(s)} · #{s.badge} · {programOf(s, db)?.code}</option>)}
            </Select>
          </Field>
          <Button variant="secondary" disabled={!pick} onClick={add}><Plus size={14} /> Agregar</Button>
        </div>
        {lines.length ? (
          <Table>
            <thead><tr><Th>Estudiante</Th><Th className="text-right">Balance actual</Th><Th className="w-36">Monto</Th><Th className="w-40">Cuenta</Th><Th>Institucional</Th><Th></Th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const s = db.students.find((x) => x.id === l.studentId)!;
                const bal = balance(s.id, db);
                return (
                  <tr key={l.key}>
                    <Td><Link to={`/students/${s.id}?tab=ledger`} className="font-medium hover:underline">{fullName(s)}</Link><div className="text-xs text-slate-400">#{s.badge}</div></Td>
                    <Td className="text-right tabular-nums">
                      {money(bal)}
                      {bal > 0 && <button className="ml-2 text-xs text-brand-600 hover:underline" onClick={() => set(l.key, { amount: String(bal) })}>usar</button>}
                    </Td>
                    <Td><Input type="number" min={0} step="0.01" value={l.amount} onChange={(e) => set(l.key, { amount: e.target.value })} className={l.amount && !(Number(l.amount) > 0) ? "!border-red-400" : ""} /></Td>
                    <Td>
                      <Select value={l.account} onChange={(e) => set(l.key, { account: e.target.value })}>
                        {activeOptions(db, "account", l.account).map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
                      </Select>
                    </Td>
                    <Td><input type="checkbox" checked={l.institutional} onChange={(e) => set(l.key, { institutional: e.target.checked })} aria-label="Institucional" /></Td>
                    <Td className="text-right"><button onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="text-slate-400 hover:text-red-600" aria-label="Quitar"><Trash2 size={14} /></button></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <Empty>Agrega los estudiantes que reciben parte de este pago.</Empty>
        )}
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 p-4 text-sm">
          <span>Total: <b className="tabular-nums">{money(Number(total) || 0)}</b></span>
          <span>Repartido: <b className="tabular-nums">{money(allocated)}</b></span>
          <span>Sin repartir: <b className={`tabular-nums ${unallocated === 0 ? "text-emerald-700" : "text-red-600"}`}>{money(unallocated)}</b></span>
          {problem && <span className="text-xs text-slate-500">{problem}</span>}
          <Button className="ml-auto" disabled={!!problem} onClick={process}><Save size={14} /> Procesar</Button>
        </div>
      </Card>

      <Card title={`Desembolsos procesados (${history.length})`}>
        <Table>
          <thead><tr><Th>Fecha</Th><Th>Método</Th><Th>Cheque / ref.</Th><Th>Concepto</Th><Th className="text-right">Total</Th><Th>Estudiantes</Th><Th>Por</Th><Th></Th></tr></thead>
          <tbody>
            {history.map((b) => {
              const voided = b.entryIds.filter((id) => db.ledger.find((l) => l.id === id)?.voided).length;
              return (
                <tr key={b.id}>
                  <Td>{fmtDate(b.date)}</Td>
                  <Td>{b.method}</Td>
                  <Td className="font-mono text-xs">{b.reference || "—"}</Td>
                  <Td>{b.description}</Td>
                  <Td className="text-right tabular-nums">{money(b.total)}</Td>
                  <Td>{b.entryIds.length} {voided > 0 && <Badge tone="red">{voided} anulado(s)</Badge>}</Td>
                  <Td className="text-xs text-slate-500">{db.users.find((u) => u.id === b.createdBy)?.name ?? "—"}</Td>
                  <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => printBatch(db, b)}><Printer size={13} /> Recibos</Button></Td>
                </tr>
              );
            })}
            {!history.length && <tr><Td colSpan={8} className="text-center text-slate-400">Todavía no hay desembolsos.</Td></tr>}
          </tbody>
        </Table>
        <p className="px-4 py-2 text-xs text-slate-400">Para corregir un pago del desembolso, anúlalo en la ficha del estudiante › Ledger (queda tachado aquí y en los recibos).</p>
      </Card>
    </div>
  );
}
