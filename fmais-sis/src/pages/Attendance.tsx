import { CheckCheck, Mail, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "../components/Layout";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Table, Tabs, Td, Th } from "../components/ui";
import { sendTemplate } from "../lib/actions";
import { consecutiveAbsences, currentScheduleId, isAboutToGrad, isScheduledDay, lastAttended, midpointsReached, remainingHours } from "../lib/calc";
import { useStore } from "../lib/store";
import type { AttendanceRecord } from "../lib/types";
import { addDays, DAY_SHORT, displayName, fmtDate, fullName, hoursBetween, parseDate, today, uid } from "../lib/utils";

interface Row {
  studentId: string;
  present: boolean;
  timeIn: string;
  timeOut: string;
  breakMinutes: number;
  existingId?: string;
}

export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "sheet" | "alerts") || "sheet";
  return (
    <div>
      <PageHeader title="Asistencia" subtitle="Registro diario manual por horario y alertas automáticas." />
      <Tabs tabs={[{ id: "sheet", label: "Hoja diaria" }, { id: "alerts", label: "Alertas" }]} value={tab} onChange={(t) => setParams({ tab: t })} />
      <div className="mt-4">{tab === "sheet" ? <DailySheet /> : <Alerts />}</div>
    </div>
  );
}

function DailySheet() {
  const { db, user, saveMany, remove } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [scheduleId, setScheduleId] = useState(db.schedules[0]?.id ?? "");
  const sch = db.schedules.find((s) => s.id === scheduleId);
  const holiday = db.holidays.find((h) => h.date === date);
  const scheduledDay = isScheduledDay(date, sch, db);

  const students = useMemo(
    () =>
      db.students
        .filter((s) => s.status === "Enrolled" && s.firstClass <= date && currentScheduleId(s, date) === scheduleId)
        .filter((s) => !s.loas.some((l) => l.start <= date && (!l.end || l.end >= date)))
        .filter((s) => user?.role !== "instructor" || s.instructorId === user.id)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [db.students, date, scheduleId, user],
  );

  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    setRows(
      students.map((s) => {
        const ex = db.attendance.find((a) => a.studentId === s.id && a.date === date);
        return {
          studentId: s.id,
          present: ex ? ex.type !== "Absent" : true,
          timeIn: ex?.timeIn ?? sch?.start ?? "09:00",
          timeOut: ex?.timeOut ?? sch?.end ?? "13:00",
          breakMinutes: ex?.breakMinutes ?? sch?.breakMinutes ?? 0,
          existingId: ex?.id,
        };
      }),
    );
    // Recargar la hoja solo al cambiar fecha, horario o lista de estudiantes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, date, scheduleId]);

  const upd = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const saveSheet = () => {
    const recs: AttendanceRecord[] = rows.map((r) => ({
      id: r.existingId ?? uid(),
      studentId: r.studentId,
      date,
      type: r.present ? "Regular" : "Absent",
      timeIn: r.present ? r.timeIn : undefined,
      timeOut: r.present ? r.timeOut : undefined,
      breakMinutes: r.present ? r.breakMinutes : 0,
      hours: r.present ? hoursBetween(r.timeIn, r.timeOut, r.breakMinutes) : 0,
      source: "manual",
    }));
    saveMany("attendance", recs, `sheet:${date}`);
    setRows((rs) => rs.map((r, i) => ({ ...r, existingId: recs[i].id })));
    toast(`Asistencia guardada: ${recs.filter((r) => r.type !== "Absent").length} presentes, ${recs.filter((r) => r.type === "Absent").length} ausentes.`);
  };

  const presentCount = rows.filter((r) => r.present).length;

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
        <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></Field>
        <div className="flex gap-1 pb-0.5">
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -1))}>← Día anterior</Button>
          <Button size="sm" variant="ghost" onClick={() => setDate(today())}>Hoy</Button>
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, 1))}>Día siguiente →</Button>
        </div>
        <Field label="Horario">
          <Select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} className="w-52">
            {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.days.map((d) => DAY_SHORT[d]).join(", ")})</option>)}
          </Select>
        </Field>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => setRows((r) => r.map((x) => ({ ...x, present: true })))}><CheckCheck size={15} /> Todos presentes</Button>
          <Button disabled={!rows.length} onClick={saveSheet}><Save size={15} /> Guardar asistencia</Button>
        </div>
      </div>
      {(holiday || !scheduledDay) && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {holiday ? `${fmtDate(date)} es feriado: ${holiday.description}.` : `${DAY_SHORT[parseDate(date).getDay()]} no es día de clase para este horario.`} Puedes registrar igual (por ejemplo, horas de recuperación).
        </div>
      )}
      <Table>
        <thead><tr><Th>Estudiante</Th><Th>Presente</Th><Th>Entrada</Th><Th>Salida</Th><Th>Breaks (min)</Th><Th className="text-right">Horas</Th><Th></Th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const s = students.find((x) => x.id === r.studentId)!;
            if (!s) return null;
            return (
              <tr key={r.studentId} className={r.present ? "" : "bg-red-50/40"}>
                <Td><Link to={`/students/${s.id}?tab=attendance`} className="font-medium hover:underline">{fullName(s)}</Link><div className="text-xs text-slate-400">#{s.badge}</div></Td>
                <Td><input type="checkbox" className="h-4 w-4" checked={r.present} onChange={(e) => upd(i, { present: e.target.checked })} /></Td>
                <Td><Input type="time" disabled={!r.present} value={r.timeIn} onChange={(e) => upd(i, { timeIn: e.target.value })} className="w-32" /></Td>
                <Td><Input type="time" disabled={!r.present} value={r.timeOut} onChange={(e) => upd(i, { timeOut: e.target.value })} className="w-32" /></Td>
                <Td><Input type="number" disabled={!r.present} value={r.breakMinutes} onChange={(e) => upd(i, { breakMinutes: Number(e.target.value) })} className="w-20" /></Td>
                <Td className="text-right tabular-nums font-medium">{r.present ? hoursBetween(r.timeIn, r.timeOut, r.breakMinutes).toFixed(2) : "0.00"}</Td>
                <Td className="text-right">
                  {r.existingId ? <Badge tone="green">Guardado</Badge> : <Badge>Sin guardar</Badge>}
                  {r.existingId && <button className="ml-2 text-xs text-slate-400 hover:text-red-600" onClick={() => { remove("attendance", r.existingId!); upd(i, { existingId: undefined }); }}>Borrar</button>}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {!rows.length ? <Empty>No hay estudiantes activos en este horario para esta fecha.</Empty> : <div className="px-4 py-2 text-xs text-slate-500">{presentCount} de {rows.length} presentes</div>}
    </Card>
  );
}

function Alerts() {
  const store = useStore();
  const { db } = store;
  const toast = useToast();
  const active = db.students.filter((s) => s.status === "Enrolled");
  const absences = active.map((s) => ({ s, n: consecutiveAbsences(s, db) })).filter((x) => x.n >= db.settings.absenceThreshold).sort((a, b) => b.n - a.n);
  const grad = active.filter((s) => isAboutToGrad(s, db)).sort((a, b) => remainingHours(a, db) - remainingHours(b, db));
  const since = addDays(today(), -14);
  const mids = active.flatMap((s) => midpointsReached(s, db).map((m, i) => ({ s, i, ...m }))).filter((m) => m.date && m.date >= since);
  const loaEnding = db.students.filter((s) => s.status === "LOA" || s.loas.some((l) => l.end && l.end >= today() && l.end <= addDays(today(), 14)));

  const emailAll = () => {
    absences.forEach(({ s, n }) => sendTemplate(store, "absence_alert", s.email, { nombre: s.firstName, dias: n }, { studentId: s.id }));
    toast(`${absences.length} emails de ausencia enviados.`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`Ausencias consecutivas (≥ ${db.settings.absenceThreshold} días programados)`} actions={absences.length > 0 && <Button size="sm" variant="secondary" onClick={emailAll}><Mail size={13} /> Email a todos</Button>}>
        <Table>
          <thead><tr><Th>Estudiante</Th><Th>Días</Th><Th>Último día</Th><Th>Teléfono</Th></tr></thead>
          <tbody>
            {absences.map(({ s, n }) => (
              <tr key={s.id}>
                <Td><Link to={`/students/${s.id}`} className="font-medium hover:underline">{displayName(s)}</Link></Td>
                <Td><Badge tone="red">{n}</Badge></Td>
                <Td>{fmtDate(lastAttended(s, db))}</Td>
                <Td className="text-xs">{s.cell}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!absences.length && <Empty>Sin alertas.</Empty>}
      </Card>
      <Card title={`Por graduar (≤ ${db.settings.aboutToGradHours} horas restantes)`}>
        <Table>
          <thead><tr><Th>Estudiante</Th><Th>Programa</Th><Th className="text-right">Faltan</Th></tr></thead>
          <tbody>
            {grad.map((s) => (
              <tr key={s.id}>
                <Td><Link to={`/students/${s.id}`} className="font-medium hover:underline">{displayName(s)}</Link></Td>
                <Td className="text-xs">{db.programs.find((p) => p.id === s.programId)?.name}</Td>
                <Td className="text-right tabular-nums">{remainingHours(s, db)} h</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!grad.length && <Empty>Nadie cerca de graduarse.</Empty>}
      </Card>
      <Card title="Midpoints alcanzados (últimos 14 días)">
        <Table>
          <thead><tr><Th>Estudiante</Th><Th>Midpoint</Th><Th>Fecha</Th></tr></thead>
          <tbody>
            {mids.map((m) => (
              <tr key={m.s.id + m.i}>
                <Td><Link to={`/students/${m.s.id}?tab=attendance`} className="font-medium hover:underline">{displayName(m.s)}</Link></Td>
                <Td>MP{m.i + 1} · {m.units} h</Td>
                <Td>{fmtDate(m.date)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!mids.length && <Empty>Sin midpoints recientes.</Empty>}
      </Card>
      <Card title="Leave of Absence">
        <Table>
          <thead><tr><Th>Estudiante</Th><Th>Inicio</Th><Th>Fin</Th></tr></thead>
          <tbody>
            {loaEnding.map((s) => {
              const l = s.loas[s.loas.length - 1];
              return (
                <tr key={s.id}>
                  <Td><Link to={`/students/${s.id}?tab=enrollment`} className="font-medium hover:underline">{displayName(s)}</Link></Td>
                  <Td>{fmtDate(l?.start)}</Td>
                  <Td>{fmtDate(l?.end)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {!loaEnding.length && <Empty>Nadie en LOA.</Empty>}
      </Card>
    </div>
  );
}
