import { Plus, Trash2 } from "lucide-react";
import { consecutiveAbsences, hoursAttended, lastAttended, projectedGrad, remainingHours } from "../../lib/calc";
import { useStore } from "../../lib/store";
import type { EnrollmentStatus, Student } from "../../lib/types";
import { fmtDate, today } from "../../lib/utils";
import { STATUS_LABEL } from "../../pages/Students";
import { Button, Card, Field, Input, Select } from "../ui";
import { SaveBar, useDraft } from "./DetailTab";

export default function EnrollmentTab({ s }: { s: Student }) {
  const { db, user, save } = useStore();
  const { d, set, dirty, commit: saveDraft, reset } = useDraft(s);
  const ro = user?.role === "instructor" || user?.role === "admissions";

  // Al cerrar la inscripción se pausan los cobros automáticos para no cobrarle a quien ya no estudia.
  const commit = () => {
    const closing = d.status !== s.status && ["Graduated", "Withdrawn", "Dropped"].includes(d.status);
    const patch: Partial<Student> = {};
    if (closing) {
      patch.record = "Inactive";
      if (!d.completionDate && d.status === "Graduated") patch.completionDate = today();
      db.plans.filter((p) => p.studentId === s.id && p.active && p.mode === "autopay").forEach((p) => save("plans", { ...p, active: false }, "pause:status"));
    }
    saveDraft(patch);
  };

  return (
    <Card>
      <div className="grid gap-6 p-4 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado">
              <Select disabled={ro} value={d.status} onChange={(e) => set("status", e.target.value as EnrollmentStatus)}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Registro">
              <Select disabled={ro} value={d.record} onChange={(e) => set("record", e.target.value as Student["record"])}>
                <option value="Active">Activo</option><option value="Inactive">Inactivo</option>
              </Select>
            </Field>
            <Field label="Programa" className="col-span-2">
              <Select disabled={ro} value={d.programId} onChange={(e) => set("programId", e.target.value)}>
                {db.programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Fecha de inscripción"><Input disabled={ro} type="date" value={d.enrollmentDate} onChange={(e) => set("enrollmentDate", e.target.value)} /></Field>
            <Field label="Primera clase"><Input disabled={ro} type="date" value={d.firstClass} onChange={(e) => set("firstClass", e.target.value)} /></Field>
            <Field label="Graduación por contrato"><Input disabled={ro} type="date" value={d.contractGrad} onChange={(e) => set("contractGrad", e.target.value)} /></Field>
            <Field label="Fecha de completado"><Input disabled={ro} type="date" value={d.completionDate ?? ""} onChange={(e) => set("completionDate", e.target.value)} /></Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Horarios (historial)</h4>
              {!ro && <Button size="sm" variant="secondary" onClick={() => set("schedules", [...d.schedules, { scheduleId: db.schedules[0].id, from: today() }])}><Plus size={13} /> Cambio de horario</Button>}
            </div>
            <div className="space-y-2">
              {d.schedules.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-slate-400">{i + 1}.</span>
                  <Select disabled={ro} value={a.scheduleId} onChange={(e) => set("schedules", d.schedules.map((x, j) => (j === i ? { ...x, scheduleId: e.target.value } : x)))}>
                    {db.schedules.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                  </Select>
                  <Input disabled={ro} type="date" className="w-44" value={a.from} onChange={(e) => set("schedules", d.schedules.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
                  {!ro && d.schedules.length > 1 && <button onClick={() => set("schedules", d.schedules.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Quitar"><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Horas de transferencia / re-inscripción"><Input disabled={ro} type="number" value={d.transferHours} onChange={(e) => set("transferHours", Number(e.target.value))} /></Field>
            <Field label="Horas importadas de sistema anterior"><Input disabled={ro} type="number" value={d.importedHours} onChange={(e) => set("importedHours", Number(e.target.value))} /></Field>
            <Field label="Horas extra cobradas"><Input disabled={ro} type="number" value={d.overtimeHours} onChange={(e) => set("overtimeHours", Number(e.target.value))} /></Field>
          </div>
        </section>

        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div><div className="text-xs text-slate-500">Total horas asistidas</div><div className="font-semibold tabular-nums">{hoursAttended(s, db)}</div></div>
            <div><div className="text-xs text-slate-500">Horas restantes</div><div className="font-semibold tabular-nums">{remainingHours(s, db)}</div></div>
            <div><div className="text-xs text-slate-500">Último día asistido</div><div className="font-semibold">{fmtDate(lastAttended(s, db))}</div></div>
            <div><div className="text-xs text-slate-500">Graduación proyectada</div><div className="font-semibold">{fmtDate(projectedGrad(s, db))}</div></div>
            <div><div className="text-xs text-slate-500">Ausencias consecutivas</div><div className="font-semibold tabular-nums">{consecutiveAbsences(s, db)}</div></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leave of Absence (LOA)</h4>
              {!ro && <Button size="sm" variant="secondary" onClick={() => set("loas", [...d.loas, { start: today(), end: "", reason: "" }])}><Plus size={13} /> Agregar LOA</Button>}
            </div>
            {!d.loas.length && <div className="text-sm text-slate-400">Sin LOA registrados.</div>}
            <div className="space-y-2">
              {d.loas.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1.3fr_auto] items-center gap-2">
                  <Input disabled={ro} type="date" value={l.start} onChange={(e) => set("loas", d.loas.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  <Input disabled={ro} type="date" value={l.end} onChange={(e) => set("loas", d.loas.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  <Input disabled={ro} placeholder="Motivo" value={l.reason ?? ""} onChange={(e) => set("loas", d.loas.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />
                  {!ro && <button onClick={() => set("loas", d.loas.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Quitar"><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Probation">
              <Select disabled={ro} value={d.probation ?? ""} onChange={(e) => set("probation", e.target.value as Student["probation"])}>
                <option value="">Ninguna</option><option value="Academic">Académica</option><option value="Attendance">Asistencia</option><option value="Financial">Financiera</option>
              </Select>
            </Field>
            <Field label="Fecha de probation"><Input disabled={ro} type="date" value={d.probationDate ?? ""} onChange={(e) => set("probationDate", e.target.value)} /></Field>
            <Field label="Instructor" className="col-span-2">
              <Select disabled={ro} value={d.instructorId ?? ""} onChange={(e) => set("instructorId", e.target.value || undefined)}>
                <option value="">—</option>
                {db.users.filter((u) => u.role === "instructor").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
          </div>
        </section>
      </div>
      <SaveBar dirty={dirty} commit={commit} reset={reset} readOnly={ro} />
    </Card>
  );
}
