import { FileText, Mail, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { sendTemplate } from "../../lib/actions";
import { balance, consecutiveAbsences, hoursAttended, isAboutToGrad, midpointsReached, planStatus, programOf, progressPct, remainingHours, studentAttendance } from "../../lib/calc";
import { useStore, userName } from "../../lib/store";
import type { Student } from "../../lib/types";
import { fmtDate, fmtDateTime, money, nowISO, uid } from "../../lib/utils";
import { useToast } from "../Layout";
import { Badge, Button, Card, Field, Input, Progress, Select, Table, Td, Textarea, Th } from "../ui";
import { SaveBar, useDraft } from "./DetailTab";

export function SummaryTab({ s }: { s: Student }) {
  const store = useStore();
  const { db, user } = store;
  const toast = useToast();
  const abs = consecutiveAbsences(s, db);
  const bal = balance(s.id, db);
  const plan = db.plans.find((p) => p.studentId === s.id && p.active);
  const pst = plan ? planStatus(plan, db) : undefined;
  const mids = midpointsReached(s, db);
  const recent = studentAttendance(s, db).slice(0, 6);
  const lead = db.leads.find((l) => l.id === s.leadId);
  const loa = s.loas.find((l) => l.start <= new Date().toISOString().slice(0, 10) && (!l.end || l.end >= new Date().toISOString().slice(0, 10)));
  const alerts: { tone: "red" | "amber" | "green" | "blue"; text: string }[] = [];
  if (abs >= db.settings.absenceThreshold) alerts.push({ tone: "red", text: `${abs} días de clase consecutivos sin asistir` });
  if (pst === "overdue") alerts.push({ tone: "red", text: `Pago vencido desde ${fmtDate(plan!.nextDue)} (${money(plan!.amount)})` });
  if (pst === "due_soon") alerts.push({ tone: "amber", text: `Pago de ${money(plan!.amount)} vence el ${fmtDate(plan!.nextDue)}` });
  if (isAboutToGrad(s, db)) alerts.push({ tone: "green", text: `Por graduar: faltan ${remainingHours(s, db)} horas` });
  if (loa) alerts.push({ tone: "blue", text: `En LOA hasta ${fmtDate(loa.end)}` });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Alertas" className="lg:col-span-2">
        <div className="space-y-2 p-4">
          {alerts.length ? alerts.map((a, i) => <div key={i}><Badge tone={a.tone}>{a.text}</Badge></div>) : <div className="text-sm text-slate-400">Sin alertas.</div>}
          {abs >= db.settings.absenceThreshold && user?.role !== "instructor" && (
            <Button size="sm" variant="secondary" onClick={() => { sendTemplate(store, "absence_alert", s.email, { nombre: s.firstName, dias: abs }, { studentId: s.id }); toast("Email de ausencia enviado."); }}>
              <Mail size={13} /> Enviar email de ausencia
            </Button>
          )}
        </div>
      </Card>
      <Card title="Origen">
        <div className="space-y-1 p-4 text-sm">
          {lead ? <div>Lead del CRM: <Link className="text-brand-600 hover:underline" to={`/crm?lead=${lead.id}`}>ver historial</Link></div> : <div className="text-slate-400">Sin lead asociado.</div>}
          {s.onlineEnrollmentId && <div>Inscripción en línea: <Link className="text-brand-600 hover:underline" to={`/enrollments?id=${s.onlineEnrollmentId}`}>ver</Link></div>}
          <div className="text-xs text-slate-400">Inscrito el {fmtDate(s.enrollmentDate)}</div>
        </div>
      </Card>
      <Card title="Progreso">
        <div className="space-y-4 p-4 text-sm">
          <div>
            <div className="mb-1 flex justify-between"><span>Horas</span><span className="tabular-nums">{hoursAttended(s, db)} / {programOf(s, db)?.totalHours}</span></div>
            <Progress value={progressPct(s, db)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {mids.map((m, i) => <Badge key={i} tone={m.date ? "green" : "slate"}>MP{i + 1} · {m.units} h</Badge>)}
          </div>
        </div>
      </Card>
      {user?.role !== "instructor" && (
        <Card title="Pagos">
          <div className="space-y-1 p-4 text-sm">
            <div>Balance: <b className={bal > 0 ? "text-amber-700" : ""}>{money(bal)}</b></div>
            {plan ? <div>{plan.mode === "autopay" ? "Cobro automático" : "Zelle"} · {money(plan.amount)} · próximo {fmtDate(plan.nextDue)}</div> : <div className="text-slate-400">Sin plan activo.</div>}
          </div>
        </Card>
      )}
      <Card title="Asistencia reciente">
        <ul className="divide-y divide-slate-100 text-sm">
          {recent.map((a) => (
            <li key={a.id} className="flex justify-between px-4 py-1.5"><span>{fmtDate(a.date)}</span><span className="tabular-nums">{a.type === "Absent" ? "Ausente" : `${a.hours.toFixed(2)} h`}</span></li>
          ))}
          {!recent.length && <li className="px-4 py-3 text-slate-400">Sin registros.</li>}
        </ul>
      </Card>
    </div>
  );
}

export function PlacementTab({ s }: { s: Student }) {
  const { user } = useStore();
  const { d, setD, dirty, commit, reset } = useDraft(s);
  const ro = user?.role === "instructor";
  const p = d.placement;
  const set = (k: keyof typeof p, v: string) => setD({ ...d, placement: { ...p, [k]: v } });
  const txt = (k: keyof typeof p, label: string, cls = "") => (
    <Field label={label} className={cls}><Input disabled={ro} value={(p[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  return (
    <Card>
      <div className="space-y-5 p-4">
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Certificación estatal</h4>
          <div className="grid max-w-lg grid-cols-2 gap-3">
            <Field label="¿Pasó el State Board Exam?">
              <Select disabled={ro} value={p.passedBoard} onChange={(e) => set("passedBoard", e.target.value)}>
                <option value="">—</option><option value="Yes">Sí</option><option value="No">No</option><option value="Pending">Pendiente</option>
              </Select>
            </Field>
            <Field label="Fecha"><Input disabled={ro} type="date" value={p.boardDate ?? ""} onChange={(e) => set("boardDate", e.target.value)} /></Field>
          </div>
        </section>
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Empleo</h4>
          <div className="grid grid-cols-6 gap-3">
            <Field label="Fecha de contratación" className="col-span-2"><Input disabled={ro} type="date" value={p.hireDate ?? ""} onChange={(e) => set("hireDate", e.target.value)} /></Field>
            {txt("company", "Empresa", "col-span-4")}
            {txt("contact", "Contacto", "col-span-3")}
            {txt("phone", "Teléfono", "col-span-3")}
            {txt("address1", "Dirección 1", "col-span-6")}
            {txt("address2", "Dirección 2", "col-span-6")}
            {txt("city", "Ciudad", "col-span-3")}
            {txt("state", "Estado", "col-span-1")}
            {txt("zip", "Zip", "col-span-2")}
          </div>
        </section>
      </div>
      <SaveBar dirty={dirty} commit={() => commit()} reset={reset} readOnly={ro} />
    </Card>
  );
}

const DOC_TYPES = ["Identificación", "Diploma / GED", "Contrato firmado", "Comprobante de dirección", "Certificado médico", "Otro"];

export function DocumentsTab({ s }: { s: Student }) {
  const { db, save, remove } = useStore();
  const [type, setType] = useState(DOC_TYPES[0]);
  const docs = db.documents.filter((d) => d.studentId === s.id);
  const missing = DOC_TYPES.slice(0, 4).filter((t) => !docs.some((d) => d.type === t));
  return (
    <Card title="Documentos">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Tipo"><Select value={type} onChange={(e) => setType(e.target.value)} className="w-56">{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600">
            <Upload size={15} /> Subir archivo
            <input type="file" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) save("documents", { id: uid(), studentId: s.id, name: f.name, type, size: f.size, uploadedAt: nowISO() });
              e.target.value = "";
            }} />
          </label>
        </div>
        <p className="text-xs text-slate-400">En la demo solo se guarda el nombre del archivo. En producción se suben a un bucket privado de Supabase Storage.</p>
        {missing.length > 0 && <div className="flex flex-wrap gap-1">{missing.map((m) => <Badge key={m} tone="amber">Falta: {m}</Badge>)}</div>}
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText size={16} className="text-slate-400" />
              <span className="font-medium">{d.name}</span>
              <Badge>{d.type}</Badge>
              <span className="text-xs text-slate-400">{Math.round(d.size / 1024)} KB · {fmtDateTime(d.uploadedAt)}</span>
              <button className="ml-auto text-slate-400 hover:text-red-600" onClick={() => remove("documents", d.id)} aria-label="Eliminar"><Trash2 size={14} /></button>
            </li>
          ))}
          {!docs.length && <li className="px-3 py-4 text-sm text-slate-400">Sin documentos.</li>}
        </ul>
      </div>
    </Card>
  );
}

export function NotesTab({ s }: { s: Student }) {
  const { db, save, user } = useStore();
  const [text, setText] = useState("");
  const notes = db.comments.filter((c) => c.entity === "student" && c.entityId === s.id).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card title="Notas (Comments)">
      <div className="space-y-3 p-4">
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe una nota interna…" />
        <div className="flex justify-end"><Button disabled={!text.trim()} onClick={() => { save("comments", { id: uid(), entity: "student", entityId: s.id, text: text.trim(), at: nowISO(), userId: user?.id }); setText(""); }}>Agregar nota</Button></div>
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-400">{fmtDateTime(n.at)} · {userName(db, n.userId)}</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{n.text}</div>
          </div>
        ))}
        {!notes.length && <div className="text-sm text-slate-400">Sin notas.</div>}
      </div>
    </Card>
  );
}

export function HistoryTab({ s }: { s: Student }) {
  const { db } = useStore();
  const audit = db.audit.filter((a) => a.entityId === s.id || (a.entity === "ledger" && db.ledger.find((l) => l.id === a.entityId)?.studentId === s.id));
  const emails = db.emails.filter((e) => e.studentId === s.id);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Cambios">
        <Table>
          <thead><tr><Th>Fecha</Th><Th>Usuario</Th><Th>Acción</Th><Th>Sección</Th></tr></thead>
          <tbody>
            {audit.map((a) => <tr key={a.id}><Td className="text-xs">{fmtDateTime(a.at)}</Td><Td className="text-xs">{userName(db, a.userId)}</Td><Td className="text-xs">{a.action}</Td><Td className="text-xs">{a.entity}</Td></tr>)}
            {!audit.length && <tr><Td colSpan={4} className="text-center text-slate-400">Sin cambios registrados en esta sesión.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      <Card title="Emails enviados">
        <ul className="divide-y divide-slate-100">
          {emails.map((e) => (
            <li key={e.id} className="px-4 py-2 text-sm">
              <div className="font-medium">{e.subject}</div>
              <div className="text-xs text-slate-400">{fmtDateTime(e.at)} · {e.to}</div>
            </li>
          ))}
          {!emails.length && <li className="px-4 py-4 text-sm text-slate-400">Sin emails.</li>}
        </ul>
      </Card>
    </div>
  );
}
