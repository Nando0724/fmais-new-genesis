import { Check, Mail, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "../components/Layout";
import NewStudentModal from "../components/NewStudentModal";
import { Badge, Button, Card, cx, Empty, Input, Modal, PageHeader, Select, Stat, Table, Td, Th, type Tone } from "../components/ui";
import { sendTemplate } from "../lib/actions";
import { useStore } from "../lib/store";
import { ENROLLMENT_STEPS, type OnlineEnrollment, type OnlineEnrollmentStatus } from "../lib/types";
import { displayName, fmtDateTime, money, nowISO } from "../lib/utils";

const ST_LABEL: Record<OnlineEnrollmentStatus, string> = { in_progress: "En progreso", completed: "Completada", abandoned: "Abandonada" };
const ST_TONE: Record<OnlineEnrollmentStatus, Tone> = { in_progress: "blue", completed: "green", abandoned: "slate" };

function Steps({ done }: { done: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`${done}/7 pasos`}>
      {ENROLLMENT_STEPS.map((_, i) => <span key={i} className={cx("h-1.5 w-4 rounded-full", i < done ? "bg-emerald-500" : "bg-slate-200")} />)}
    </div>
  );
}

export default function Enrollments() {
  const store = useStore();
  const { db, save } = store;
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<OnlineEnrollment | null>(null);
  const open = db.onlineEnrollments.find((o) => o.id === params.get("id"));

  const rows = useMemo(
    () =>
      db.onlineEnrollments
        .filter((o) => !status || o.status === status)
        .filter((o) => !q || `${o.firstName} ${o.lastName} ${o.email}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [db.onlineEnrollments, status, q],
  );
  const total = db.onlineEnrollments.length;
  const completed = db.onlineEnrollments.filter((o) => o.status === "completed").length;

  const remind = (o: OnlineEnrollment) => {
    sendTemplate(store, "resume_enrollment", o.email, { nombre: o.firstName, paso: o.stepsDone + 1, link: `${db.settings.enrollmentPortalUrl}?ref=${o.id}` }, { leadId: o.leadId, kind: "resume_enrollment" });
    toast("Recordatorio para continuar enviado.");
  };

  return (
    <div>
      <PageHeader title="Inscripciones en línea" subtitle="Solicitudes que llegan del portal de inscripción (7 pasos)." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total" value={total} />
        <Stat label="En progreso" value={db.onlineEnrollments.filter((o) => o.status === "in_progress").length} tone="blue" />
        <Stat label="Completadas" value={completed} tone="green" />
        <Stat label="Tasa de completado" value={`${total ? Math.round((completed / total) * 100) : 0}%`} tone="brand" />
      </div>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 p-3">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            <option value="">Todos los estados</option>
            {Object.entries(ST_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      </Card>
      <Card>
        <Table>
          <thead><tr><Th>Solicitante</Th><Th>Programa</Th><Th>Horario</Th><Th>Progreso</Th><Th>Estado</Th><Th>Depósito</Th><Th>Actualizada</Th><Th></Th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setParams({ id: o.id })}>
                <Td><div className="font-medium">{displayName(o)}</div><div className="text-xs text-slate-400">{o.email}</div></Td>
                <Td className="text-xs">{db.programs.find((p) => p.id === o.programId)?.name}</Td>
                <Td className="text-xs">{db.schedules.find((s) => s.id === o.scheduleId)?.name}</Td>
                <Td><Steps done={o.stepsDone} /><div className="mt-1 text-[11px] text-slate-400">{o.stepsDone < 7 ? `Paso ${o.stepsDone + 1}: ${ENROLLMENT_STEPS[o.stepsDone]}` : "Completa"}</div></Td>
                <Td><Badge tone={ST_TONE[o.status]}>{ST_LABEL[o.status]}</Badge></Td>
                <Td className="text-xs">{o.depositAmount ? `${money(o.depositAmount)} · ${o.paymentMethod}` : "—"}</Td>
                <Td className="text-xs">{fmtDateTime(o.updatedAt)}</Td>
                <Td className="text-right" >
                  {o.studentId ? <Link to={`/students/${o.studentId}`} onClick={(e) => e.stopPropagation()} className="text-xs text-brand-600 hover:underline">Ver estudiante</Link>
                    : o.status === "completed" ? <Button size="sm" variant="success" onClick={(e) => { e.stopPropagation(); setCreating(o); }}><UserPlus size={13} /> Crear estudiante</Button>
                    : <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remind(o); }}><Mail size={13} /> Recordar</Button>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!rows.length && <Empty>Sin inscripciones.</Empty>}
      </Card>

      {open && (
        <Modal open onClose={() => setParams({})} title={`Inscripción · ${displayName(open)}`}>
          <ol className="space-y-2">
            {ENROLLMENT_STEPS.map((st, i) => (
              <li key={st} className="flex items-center gap-3 text-sm">
                <span className={cx("flex h-6 w-6 items-center justify-center rounded-full text-xs", i < open.stepsDone ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500")}>{i < open.stepsDone ? <Check size={13} /> : i + 1}</span>
                <span className={i < open.stepsDone ? "text-slate-800" : "text-slate-400"}>{st}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 space-y-1 text-sm text-slate-600">
            <div>Email: {open.email} · Tel: {open.phone}</div>
            <div>Iniciada {fmtDateTime(open.createdAt)} · actualizada {fmtDateTime(open.updatedAt)}</div>
            {open.leadId && <div>Lead: <Link className="text-brand-600 hover:underline" to={`/crm?lead=${open.leadId}`}>abrir en CRM</Link></div>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {open.status === "in_progress" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => remind(open)}><Mail size={13} /> Enviar recordatorio</Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  const stepsDone = Math.min(7, open.stepsDone + 1);
                  save("onlineEnrollments", { ...open, stepsDone, status: stepsDone === 7 ? "completed" : open.status, depositAmount: stepsDone >= 6 ? 1500 : 0, paymentMethod: stepsDone >= 6 ? "Card" : undefined, updatedAt: nowISO() });
                }}>Simular siguiente paso (demo)</Button>
                <Button size="sm" variant="ghost" onClick={() => save("onlineEnrollments", { ...open, status: "abandoned", updatedAt: nowISO() })}>Marcar abandonada</Button>
              </>
            )}
            {open.status === "completed" && !open.studentId && <Button size="sm" variant="success" onClick={() => setCreating(open)}><UserPlus size={13} /> Crear estudiante</Button>}
          </div>
        </Modal>
      )}

      <NewStudentModal
        open={!!creating}
        onClose={() => setCreating(null)}
        initial={creating ? {
          firstName: creating.firstName, lastName: creating.lastName, email: creating.email, phone: creating.phone, programId: creating.programId, scheduleId: creating.scheduleId,
          leadId: creating.leadId, onlineEnrollmentId: creating.id, deposit: creating.depositAmount, depositMethod: creating.paymentMethod ?? "Card",
        } : undefined}
        onCreated={(sid) => {
          if (creating) save("onlineEnrollments", { ...creating, studentId: sid });
          setParams({});
        }}
      />
    </div>
  );
}
