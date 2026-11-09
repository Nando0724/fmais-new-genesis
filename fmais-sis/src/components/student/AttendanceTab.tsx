import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { attendancePct, currentSchedule, midpointsReached, programOf, scheduledHours, studentAttendance, trackedHoursUntil } from "../../lib/calc";
import { levelFor, SAP_LABEL, SAP_TONE } from "../../lib/sap";
import { useStore } from "../../lib/store";
import type { AttendanceRecord, AttendanceType, Student } from "../../lib/types";
import { fmtDate, fmtTime, hoursBetween, today, uid } from "../../lib/utils";
import { Badge, Button, Card, Field, Input, Modal, Select, Table, Td, Th } from "../ui";

const TYPES: AttendanceType[] = ["Regular", "Makeup", "Clinic", "Non-Clinic", "Excused", "Absent"];
const TYPE_LABEL: Record<AttendanceType, string> = { Regular: "Regular", Makeup: "Recuperación", Clinic: "Clínica", "Non-Clinic": "No clínica", Excused: "Excusado", Absent: "Ausente" };

export default function AttendanceTab({ s }: { s: Student }) {
  const { db, save, remove } = useStore();
  const [limit, setLimit] = useState(40);
  const [adding, setAdding] = useState<AttendanceRecord | null>(null);
  const recs = studentAttendance(s, db);
  const mids = midpointsReached(s, db);
  const sch = currentSchedule(s, db);
  const program = programOf(s, db);
  const sched = scheduledHours(s, db);
  const done = trackedHoursUntil(s, db);
  const pct = attendancePct(s, db);
  const level = program ? levelFor(pct, program.sap.attendance) : undefined;

  const startAdd = () =>
    setAdding({ id: uid(), studentId: s.id, date: today(), type: "Regular", timeIn: sch?.start ?? "09:00", timeOut: sch?.end ?? "13:00", breakMinutes: sch?.breakMinutes ?? 0, hours: 0, source: "manual" });

  const hrs = (a: AttendanceRecord) => (a.type === "Absent" || !a.timeIn || !a.timeOut ? 0 : hoursBetween(a.timeIn, a.timeOut, a.breakMinutes));
  const badOut = adding && adding.type !== "Absent" && adding.timeIn && adding.timeOut && adding.timeOut <= adding.timeIn;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
        <Card><div className="p-4"><div className="text-xs text-slate-500">Horas programadas (hasta ayer)</div><div className="mt-1 text-2xl font-semibold tabular-nums">{sched}</div><div className="text-xs text-slate-400">Desde {fmtDate(s.trackingStartDate && s.trackingStartDate > s.firstClass ? s.trackingStartDate : s.firstClass)}, sin feriados ni LOA</div></div></Card>
        <Card><div className="p-4"><div className="text-xs text-slate-500">Horas asistidas (mismo periodo)</div><div className="mt-1 text-2xl font-semibold tabular-nums">{done}</div><div className="text-xs text-slate-400">{s.importedHours ? `+ ${s.importedHours} importadas` : ""}{s.transferHours ? ` + ${s.transferHours} transferidas` : ""}</div></div></Card>
        <Card><div className="p-4"><div className="text-xs text-slate-500">Asistencia</div><div className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums">{pct == null ? "—" : `${pct}%`} {level && <Badge tone={SAP_TONE[level]}>{SAP_LABEL[level]}</Badge>}</div><div className="text-xs text-slate-400">Mínimo OK del programa: {program?.sap.attendance.ok ?? "—"}%{program && !program.sap.verified ? " (ejemplo)" : ""}</div></div></Card>
      </div>
      <Card title={`Registros de asistencia (${recs.length})`} actions={<Button size="sm" onClick={startAdd}><Plus size={13} /> Agregar</Button>}>
        <Table>
          <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th>Entrada</Th><Th>Salida</Th><Th>Breaks (min)</Th><Th className="text-right">Total</Th><Th>Origen</Th><Th></Th></tr></thead>
          <tbody>
            {recs.slice(0, limit).map((a) => (
              <tr key={a.id}>
                <Td>{fmtDate(a.date)}</Td>
                <Td>{a.type === "Absent" ? <Badge tone="red">Ausente</Badge> : a.type === "Excused" ? <Badge tone="violet">Excusado</Badge> : TYPE_LABEL[a.type]}</Td>
                <Td className="tabular-nums">{fmtTime(a.timeIn)}</Td>
                <Td className="tabular-nums">{a.type !== "Absent" && a.timeIn && !a.timeOut ? <Badge tone="amber">Sin salida</Badge> : fmtTime(a.timeOut)}</Td>
                <Td className="tabular-nums">{a.breakMinutes}</Td>
                <Td className="text-right tabular-nums font-medium">{a.hours.toFixed(2)}</Td>
                <Td className="text-xs text-slate-400">{a.source === "import" ? "Genesis" : a.source === "kiosk" ? "Kiosco" : "Manual"}</Td>
                <Td className="text-right"><button onClick={() => remove("attendance", a.id)} className="text-slate-400 hover:text-red-600" aria-label="Eliminar"><Trash2 size={14} /></button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {recs.length > limit && <div className="p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit(limit + 60)}>Ver más</Button></div>}
      </Card>

      <Card title="Midpoints alcanzados">
        <ol className="divide-y divide-slate-100">
          {mids.map((m, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-slate-600">{i + 1}. {m.units} h</span>
              {m.date ? <Badge tone="green">{fmtDate(m.date)}</Badge> : <span className="text-xs text-slate-400">Pendiente</span>}
            </li>
          ))}
          {!mids.length && <li className="px-4 py-4 text-sm text-slate-400">El programa no tiene midpoints configurados.</li>}
        </ol>
      </Card>

      {adding && (
        <Modal
          open
          onClose={() => setAdding(null)}
          title="Agregar asistencia"
          footer={
            <>
              {badOut && <span className="mr-auto self-center text-xs text-red-600">La salida tiene que ser después de la entrada.</span>}
              <Button variant="secondary" onClick={() => setAdding(null)}>Cancelar</Button>
              <Button
                disabled={!!badOut}
                onClick={() => {
                  const absent = adding.type === "Absent";
                  save("attendance", { ...adding, timeIn: absent ? undefined : adding.timeIn, timeOut: absent || !adding.timeOut ? undefined : adding.timeOut, breakMinutes: absent ? 0 : adding.breakMinutes, hours: hrs(adding) });
                  setAdding(null);
                }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha"><Input type="date" value={adding.date} onChange={(e) => setAdding({ ...adding, date: e.target.value })} /></Field>
            <Field label="Tipo" hint={adding.type === "Excused" ? (program?.sap.excusedCountsAsAttended ? "Cuenta como asistida (política del programa)." : "No suma horas; no cuenta como ausencia.") : undefined}>
              <Select value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value as AttendanceType })}>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </Select>
            </Field>
            {adding.type !== "Absent" && (
              <>
                <Field label="Entrada"><Input type="time" value={adding.timeIn ?? ""} onChange={(e) => setAdding({ ...adding, timeIn: e.target.value })} /></Field>
                <Field label="Salida" hint="Vacía si todavía está en clase."><Input type="time" value={adding.timeOut ?? ""} onChange={(e) => setAdding({ ...adding, timeOut: e.target.value })} /></Field>
                <Field label="Breaks (minutos)"><Input type="number" min={0} value={adding.breakMinutes} onChange={(e) => setAdding({ ...adding, breakMinutes: Number(e.target.value) })} /></Field>
                <Field label="Total horas"><Input disabled value={hrs(adding).toFixed(2)} /></Field>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
