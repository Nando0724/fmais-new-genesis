import { CheckCheck, LogIn, LogOut, Mail, MessageCircle, Phone, Printer, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "../components/Layout";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Table, Tabs, Td, Th } from "../components/ui";
import { sendTemplate } from "../lib/actions";
import {
  adjustmentsOn, attendancePct, consecutiveAbsences, currentScheduleId, inLOA, isAboutToGrad, isScheduledDay, lastAttended, midpointsReached,
  missingOuts, programOf, remainingHours, scheduledHours, scheduleOn, trackedHoursUntil,
} from "../lib/calc";
import { printSignInSheets } from "../lib/print";
import { useStore } from "../lib/store";
import type { AttendanceRecord, DB, Student, User } from "../lib/types";
import { addDays, DAY_SHORT, displayName, fmtDate, fullName, hoursBetween, parseDate, today, uid } from "../lib/utils";

type TabId = "batch" | "now" | "missing" | "alerts";
type Mark = "present" | "absent" | "excused";

const nowHHMM = () => new Date().toTimeString().slice(0, 5);
const hrs = (inT?: string, outT?: string, br = 0) => (inT && outT ? hoursBetween(inT, outT, br) : 0);

/** Estudiantes que deberían estar en clase esa fecha, en ese horario y programa. */
function expectedOn(db: DB, date: string, user: User | undefined, scheduleId?: string, programId?: string) {
  return db.students
    .filter((s) => s.status === "Enrolled" && s.firstClass <= date && !inLOA(s, date))
    .filter((s) => !scheduleId || currentScheduleId(s, date) === scheduleId)
    .filter((s) => !programId || s.programId === programId)
    .filter((s) => user?.role !== "instructor" || s.instructorId === user.id)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export default function Attendance() {
  const { db, user } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabId) || "batch";
  const missing = missingOuts(db).filter((a) => user?.role !== "instructor" || db.students.find((s) => s.id === a.studentId)?.instructorId === user.id).length;
  return (
    <div>
      <PageHeader title="Asistencia" subtitle="Registro en lote por programa y horario, quién falta ahora, salidas sin marcar y alertas." />
      <Tabs
        tabs={[
          { id: "batch", label: "Asistencia en lote" },
          { id: "now", label: "Check Attendance" },
          { id: "missing", label: <>Salidas sin marcar {missing > 0 && <Badge tone="red">{missing}</Badge>}</> },
          { id: "alerts", label: "Alertas" },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t })}
      />
      <div className="mt-4">
        {tab === "batch" && <BatchSheet />}
        {tab === "now" && <CheckNow />}
        {tab === "missing" && <MissingOuts />}
        {tab === "alerts" && <Alerts />}
      </div>
    </div>
  );
}

// ── En lote (Tasks › Attendance de Genesis) ───────────────────────

interface Row {
  studentId: string;
  mark: Mark;
  timeIn: string;
  timeOut: string; // vacío = todavía en clase / salida sin marcar
  breakMinutes: number;
  existing?: AttendanceRecord;
}

const rowKey = (r: Pick<Row, "mark" | "timeIn" | "timeOut" | "breakMinutes">) => `${r.mark}|${r.mark === "absent" ? "" : `${r.timeIn}|${r.timeOut}|${r.breakMinutes}`}`;
const recToMark = (a: AttendanceRecord): Mark => (a.type === "Absent" ? "absent" : a.type === "Excused" ? "excused" : "present");

function BatchSheet() {
  const { db, user, saveMany } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [programId, setProgramId] = useState("");
  const [scheduleId, setScheduleId] = useState(db.schedules[0]?.id ?? "");
  const sch = db.schedules.find((s) => s.id === scheduleId);
  const adj = adjustmentsOn(date, db, programId || undefined);
  const scheduledDay = isScheduledDay(date, sch, db, programId || undefined);

  const students = useMemo(() => expectedOn(db, date, user, scheduleId, programId), [db, date, user, scheduleId, programId]);

  // Prellena con el horario; si ya hay registro de ese día, muestra lo guardado.
  const fresh = (s: Student): Row => {
    const ex = db.attendance.find((a) => a.studentId === s.id && a.date === date);
    return {
      studentId: s.id,
      mark: ex ? recToMark(ex) : "present",
      timeIn: ex?.timeIn ?? sch?.start ?? "09:00",
      timeOut: ex ? ex.timeOut ?? "" : sch?.end ?? "13:00",
      breakMinutes: ex?.breakMinutes ?? sch?.breakMinutes ?? 0,
      existing: ex,
    };
  };
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    setRows(students.map(fresh));
    // Recargar solo al cambiar fecha, horario, programa o la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, date, scheduleId]);

  const upd = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const isChanged = (r: Row) => !r.existing || rowKey(r) !== rowKey({ mark: recToMark(r.existing), timeIn: r.existing.timeIn ?? "", timeOut: r.existing.timeOut ?? "", breakMinutes: r.existing.breakMinutes });
  const changed = rows.filter(isChanged);
  const invalid = rows.find((r) => r.mark !== "absent" && r.timeOut && r.timeOut <= r.timeIn);

  // Procesar: solo guarda lo nuevo o lo que cambió (como Genesis).
  const process = () => {
    const recs: AttendanceRecord[] = changed.map((r) => ({
      id: r.existing?.id ?? uid(),
      studentId: r.studentId,
      date,
      type: r.mark === "absent" ? "Absent" : r.mark === "excused" ? "Excused" : r.existing && r.existing.type !== "Absent" && r.existing.type !== "Excused" ? r.existing.type : "Regular",
      timeIn: r.mark === "absent" ? undefined : r.timeIn,
      timeOut: r.mark === "absent" || !r.timeOut ? undefined : r.timeOut,
      breakMinutes: r.mark === "absent" ? 0 : r.breakMinutes,
      hours: r.mark === "absent" ? 0 : hrs(r.timeIn, r.timeOut, r.breakMinutes),
      source: "manual",
    }));
    saveMany("attendance", recs, `batch:${date}`);
    const byId = new Map(recs.map((x) => [x.studentId, x]));
    setRows((rs) => rs.map((r) => (byId.has(r.studentId) ? { ...r, existing: byId.get(r.studentId) } : r)));
    const noOut = recs.filter((x) => x.type !== "Absent" && !x.timeOut).length;
    toast(`Procesado: ${recs.length} registro(s) guardados.${noOut ? ` ${noOut} sin hora de salida (quedan en "Salidas sin marcar").` : ""}`);
  };

  const printSheet = () =>
    printSignInSheets(db.settings.schoolName, date, [{ title: `${sch?.name ?? ""} (${sch?.start}–${sch?.end})${programId ? ` · ${db.programs.find((p) => p.id === programId)?.name}` : ""}`, students: students.map((s) => ({ name: fullName(s), badge: s.badge, program: programOf(s, db)?.code ?? "" })) }]);

  const present = rows.filter((r) => r.mark === "present").length;

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
        <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></Field>
        <div className="flex gap-1 pb-0.5">
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -1))}>←</Button>
          <Button size="sm" variant="ghost" onClick={() => setDate(today())}>Hoy</Button>
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, 1))}>→</Button>
        </div>
        <Field label="Programa">
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)} className="w-52">
            <option value="">Todos los programas</option>
            {db.programs.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Horario">
          <Select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} className="w-52">
            {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}
          </Select>
        </Field>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" disabled={!rows.length} onClick={printSheet}><Printer size={15} /> Hoja de firmas</Button>
          <Button variant="secondary" onClick={() => setRows((r) => r.map((x) => ({ ...x, mark: "present", timeIn: sch?.start ?? x.timeIn, timeOut: sch?.end ?? x.timeOut, breakMinutes: sch?.breakMinutes ?? 0 })))}><CheckCheck size={15} /> Todos presentes con horario</Button>
          <Button variant="ghost" onClick={() => setRows(students.map(fresh))}><RotateCcw size={15} /> Deshacer cambios</Button>
          <Button disabled={!changed.length || !!invalid} onClick={process}><Save size={15} /> Procesar ({changed.length})</Button>
        </div>
      </div>
      {(adj.length > 0 || !scheduledDay) && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {adj.length
            ? `${fmtDate(date)}: ${adj.map((h) => `${h.description}${h.start ? ` (cerrado ${h.start}–${h.end})` : " (día completo)"}`).join(", ")}.`
            : `${DAY_SHORT[parseDate(date).getDay()]} no es día de clase para este horario.`}{" "}
          Puedes registrar igual (por ejemplo, horas de recuperación).
        </div>
      )}
      {invalid && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">Hay una salida igual o antes de la entrada. Corrígela para poder procesar.</div>}
      <Table>
        <thead><tr><Th>Estudiante</Th><Th>Asistencia</Th><Th>Entrada</Th><Th>Salida</Th><Th>Breaks (min)</Th><Th className="text-right">Horas</Th><Th></Th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const s = students.find((x) => x.id === r.studentId);
            if (!s) return null;
            const off = r.mark === "absent";
            return (
              <tr key={r.studentId} className={off ? "bg-red-50/40" : r.mark === "excused" ? "bg-violet-50/40" : ""}>
                <Td><Link to={`/students/${s.id}?tab=attendance`} className="font-medium hover:underline">{fullName(s)}</Link><div className="text-xs text-slate-400">#{s.badge} · {programOf(s, db)?.code}</div></Td>
                <Td>
                  <Select value={r.mark} onChange={(e) => upd(i, { mark: e.target.value as Mark })} className="w-32">
                    <option value="present">Presente</option><option value="absent">Ausente</option><option value="excused">Excusado</option>
                  </Select>
                </Td>
                <Td><Input type="time" disabled={off} value={r.timeIn} onChange={(e) => upd(i, { timeIn: e.target.value })} className="w-32" /></Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Input type="time" disabled={off} value={r.timeOut} onChange={(e) => upd(i, { timeOut: e.target.value })} className="w-32" />
                    {!off && !r.timeOut && <Badge tone="amber">En clase</Badge>}
                  </div>
                </Td>
                <Td><Input type="number" min={0} disabled={off} value={r.breakMinutes} onChange={(e) => upd(i, { breakMinutes: Number(e.target.value) })} className="w-20" /></Td>
                <Td className="text-right font-medium tabular-nums">{off ? "0.00" : hrs(r.timeIn, r.timeOut, r.breakMinutes).toFixed(2)}</Td>
                <Td className="text-right">{!r.existing ? <Badge>Nuevo</Badge> : isChanged(r) ? <Badge tone="amber">Cambiado</Badge> : <Badge tone="green">Guardado</Badge>}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {!rows.length ? (
        <Empty>No hay estudiantes inscritos en este horario{programId ? " y programa" : ""} para esta fecha.</Empty>
      ) : (
        <div className="px-4 py-2 text-xs text-slate-500">
          {present} presentes · {rows.filter((r) => r.mark === "absent").length} ausentes · {rows.filter((r) => r.mark === "excused").length} excusados de {rows.length}.
          Deja la salida vacía si el estudiante sigue en clase: la completas después en "Salidas sin marcar".
        </div>
      )}
    </Card>
  );
}

// ── Check Attendance (ITA de Genesis): quién falta ahora ─────────────

function CheckNow() {
  const { db, user, save } = useStore();
  const toast = useToast();
  const T = today();
  const [date, setDate] = useState(T);
  // Por defecto, el horario que está en curso o el próximo del día.
  const defaultSch = () => {
    const now = nowHHMM();
    const sorted = [...db.schedules].sort((a, b) => a.start.localeCompare(b.start));
    return (sorted.find((s) => s.start <= now && now < s.end) ?? sorted.find((s) => now < s.start) ?? sorted[0])?.id ?? "";
  };
  const [scheduleId, setScheduleId] = useState(defaultSch);
  const sch = db.schedules.find((s) => s.id === scheduleId);

  const expected = expectedOn(db, date, user, scheduleId).filter((s) => isScheduledDay(date, scheduleOn(s, db, date), db, s.programId));
  const recOf = (s: Student) => db.attendance.find((a) => a.studentId === s.id && a.date === date);
  const notHere = expected.filter((s) => !recOf(s));
  const here = expected.filter((s) => {
    const r = recOf(s);
    return r && r.type !== "Absent";
  });
  const marked = expected.filter((s) => recOf(s)?.type === "Absent");
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const late = date === T && !!sch && nowHHMM() > sch.start;
  const minutesLate = late ? toMin(nowHHMM()) - toMin(sch!.start) : 0;

  const arrive = (s: Student) => {
    save("attendance", { id: uid(), studentId: s.id, date, type: "Regular", timeIn: date === T ? nowHHMM() : sch?.start ?? "09:00", breakMinutes: sch?.breakMinutes ?? 0, hours: 0, source: "manual" }, "check_in");
    toast(`${s.firstName}: llegada registrada.`);
  };
  const absent = (s: Student) => save("attendance", { id: uid(), studentId: s.id, date, type: "Absent", breakMinutes: 0, hours: 0, source: "manual" }, "mark_absent");
  const leave = (r: AttendanceRecord) => {
    const out = date === T ? nowHHMM() : sch?.end ?? "13:00";
    if (r.timeIn && out <= r.timeIn) return toast("La salida tiene que ser después de la entrada.");
    save("attendance", { ...r, timeOut: out, hours: hrs(r.timeIn, out, r.breakMinutes) }, "check_out");
  };

  const printAll = () =>
    printSignInSheets(
      db.settings.schoolName,
      date,
      db.schedules.map((x) => ({
        title: `${x.name} (${x.start}–${x.end})`,
        students: expectedOn(db, date, user, x.id).map((s) => ({ name: fullName(s), badge: s.badge, program: programOf(s, db)?.code ?? "" })),
      })),
    ) || toast("El navegador bloqueó la ventana de impresión.");

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></Field>
          <Field label="Horario">
            <Select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} className="w-52">
              {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}
            </Select>
          </Field>
          <div className="pb-2 text-sm text-slate-600">
            {late ? <>La clase empezó hace <b>{minutesLate} min</b>.</> : date === T ? "La clase todavía no empieza." : null}
          </div>
          <Button className="ml-auto" variant="secondary" onClick={printAll}><Printer size={15} /> Hojas de firma (todos los horarios)</Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<>No han llegado <Badge tone={notHere.length ? "red" : "green"}>{notHere.length}</Badge></>}>
          <Table>
            <thead><tr><Th>Estudiante</Th><Th>Teléfono</Th><Th></Th></tr></thead>
            <tbody>
              {notHere.map((s) => (
                <tr key={s.id}>
                  <Td><Link to={`/students/${s.id}?tab=attendance`} className="font-medium hover:underline">{fullName(s)}</Link><div className="text-xs text-slate-400">{programOf(s, db)?.code} · {consecutiveAbsences(s, db, date)} ausencias seguidas antes de hoy</div></Td>
                  <Td className="whitespace-nowrap text-sm">
                    {s.cell ? (
                      <span className="flex items-center gap-2">
                        <a href={`tel:${s.cell.replace(/\D/g, "")}`} className="flex items-center gap-1 hover:underline"><Phone size={13} />{s.cell}</a>
                        <a href={`https://wa.me/1${s.cell.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noreferrer" className="text-emerald-600" aria-label="WhatsApp"><MessageCircle size={14} /></a>
                      </span>
                    ) : "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="secondary" onClick={() => arrive(s)}><LogIn size={13} /> Llegó</Button>
                    <Button size="sm" variant="ghost" onClick={() => absent(s)}>Ausente</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!notHere.length && <Empty>{expected.length ? "Todos tienen registro." : "No hay clase de este horario en esta fecha."}</Empty>}
        </Card>

        <Card title={<>Presentes <Badge tone="green">{here.length}</Badge>{marked.length > 0 && <span className="ml-2 text-xs font-normal text-slate-500">{marked.length} marcados ausentes</span>}</>}>
          <Table>
            <thead><tr><Th>Estudiante</Th><Th>Entrada</Th><Th>Salida</Th><Th></Th></tr></thead>
            <tbody>
              {here.map((s) => {
                const r = recOf(s)!;
                return (
                  <tr key={s.id}>
                    <Td><Link to={`/students/${s.id}?tab=attendance`} className="font-medium hover:underline">{fullName(s)}</Link>{r.type === "Excused" && <div><Badge tone="violet">Excusado</Badge></div>}</Td>
                    <Td className="tabular-nums">{r.timeIn ?? "—"}</Td>
                    <Td className="tabular-nums">{r.timeOut ?? <Badge tone="amber">En clase</Badge>}</Td>
                    <Td className="text-right">{!r.timeOut && <Button size="sm" variant="secondary" onClick={() => leave(r)}><LogOut size={13} /> Salió</Button>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {!here.length && <Empty>Nadie ha llegado todavía.</Empty>}
        </Card>
      </div>
      <p className="text-xs text-slate-400">"Llegó" y "Salió" usan la hora actual. Para corregir horas o registrar a varios a la vez, usa "Asistencia en lote".</p>
    </div>
  );
}

// ── Salidas sin marcar (Check Swipes de Genesis) ─────────────────────

function MissingOuts() {
  const { db, user, save } = useStore();
  const toast = useToast();
  const rows = missingOuts(db).filter((a) => user?.role !== "instructor" || db.students.find((s) => s.id === a.studentId)?.instructorId === user.id);
  const [outs, setOuts] = useState<Record<string, string>>({});
  const defaultOut = (a: AttendanceRecord) => {
    const s = db.students.find((x) => x.id === a.studentId);
    return (s && scheduleOn(s, db, a.date)?.end) ?? "13:00";
  };
  const complete = (a: AttendanceRecord) => {
    const out = outs[a.id] ?? defaultOut(a);
    if (a.timeIn && out <= a.timeIn) return toast("La salida tiene que ser después de la entrada.");
    save("attendance", { ...a, timeOut: out, hours: hrs(a.timeIn, out, a.breakMinutes) }, "fix_missing_out");
    toast("Salida registrada.");
  };
  return (
    <Card title="Entradas sin salida en días anteriores">
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        Pasa cuando se marca la llegada y no la salida. Mientras falte la salida, esas horas no cuentan. Se propone la hora de salida del horario; cámbiala si salió a otra hora.
      </p>
      <Table>
        <thead><tr><Th>Fecha</Th><Th>Estudiante</Th><Th>Entrada</Th><Th>Salida</Th><Th></Th></tr></thead>
        <tbody>
          {rows.map((a) => {
            const s = db.students.find((x) => x.id === a.studentId);
            return (
              <tr key={a.id}>
                <Td>{fmtDate(a.date)}</Td>
                <Td>{s ? <Link to={`/students/${s.id}?tab=attendance`} className="font-medium hover:underline">{fullName(s)}</Link> : "—"}</Td>
                <Td className="tabular-nums">{a.timeIn}</Td>
                <Td><Input type="time" className="w-32" value={outs[a.id] ?? defaultOut(a)} onChange={(e) => setOuts({ ...outs, [a.id]: e.target.value })} /></Td>
                <Td className="text-right"><Button size="sm" onClick={() => complete(a)}><Save size={13} /> Guardar</Button></Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {!rows.length && <Empty>No hay salidas pendientes.</Empty>}
    </Card>
  );
}

// ── Alertas ───────────────────────────────────────────────────────

function Alerts() {
  const store = useStore();
  const { db, user } = store;
  const toast = useToast();
  const active = db.students.filter((s) => s.status === "Enrolled" && (user?.role !== "instructor" || s.instructorId === user.id));
  const absences = active.map((s) => ({ s, n: consecutiveAbsences(s, db) })).filter((x) => x.n >= db.settings.absenceThreshold).sort((a, b) => b.n - a.n);
  const grad = active.filter((s) => isAboutToGrad(s, db)).sort((a, b) => remainingHours(a, db) - remainingHours(b, db));
  const since = addDays(today(), -14);
  const mids = active.flatMap((s) => midpointsReached(s, db).map((m, i) => ({ s, i, ...m }))).filter((m) => m.date && m.date >= since);
  const loaEnding = db.students.filter((s) => s.status === "LOA" || s.loas.some((l) => l.end && l.end >= today() && l.end <= addDays(today(), 14)));
  const low = active
    .map((s) => ({ s, pct: attendancePct(s, db), min: programOf(s, db)?.sap.attendance.ok }))
    .filter((x): x is { s: Student; pct: number; min: number } => x.pct != null && x.min != null && x.pct < x.min)
    .sort((a, b) => a.pct - b.pct);

  const emailAll = () => {
    absences.forEach(({ s, n }) => sendTemplate(store, "absence_alert", s.email, { nombre: s.firstName, dias: n }, { studentId: s.id }));
    toast(`${absences.length} emails de ausencia enviados.`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`Ausencias consecutivas (≥ ${db.settings.absenceThreshold} días programados)`} actions={absences.length > 0 && user?.role !== "instructor" && <Button size="sm" variant="secondary" onClick={emailAll}><Mail size={13} /> Email a todos</Button>}>
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
      <Card title="Asistencia por debajo del mínimo (SAP · nivel OK)">
        <Table>
          <thead><tr><Th>Estudiante</Th><Th className="text-right">Asistidas / programadas</Th><Th className="text-right">%</Th><Th className="text-right">Mínimo</Th></tr></thead>
          <tbody>
            {low.map(({ s, pct, min }) => (
              <tr key={s.id}>
                <Td><Link to={`/students/${s.id}?tab=attendance`} className="font-medium hover:underline">{displayName(s)}</Link></Td>
                <Td className="text-right text-xs tabular-nums">{trackedHoursUntil(s, db)} / {scheduledHours(s, db)} h</Td>
                <Td className="text-right"><Badge tone={pct < (programOf(s, db)?.sap.attendance.critical ?? 0) ? "red" : "amber"}>{pct}%</Badge></Td>
                <Td className="text-right text-xs text-slate-500">{min}%</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!low.length && <Empty>Todos por encima del mínimo.</Empty>}
        <p className="px-4 py-2 text-xs text-slate-400">Calculado hasta ayer. Los mínimos del SAP son valores de ejemplo hasta que la escuela los confirme.</p>
      </Card>
      <Card title={`Por graduar (≤ ${db.settings.aboutToGradHours} horas restantes)`}>
        <Table>
          <thead><tr><Th>Estudiante</Th><Th>Programa</Th><Th className="text-right">Faltan</Th></tr></thead>
          <tbody>
            {grad.map((s) => (
              <tr key={s.id}>
                <Td><Link to={`/students/${s.id}`} className="font-medium hover:underline">{displayName(s)}</Link></Td>
                <Td className="text-xs">{programOf(s, db)?.name}</Td>
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
