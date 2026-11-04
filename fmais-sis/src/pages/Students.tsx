import { Download, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import NewStudentModal from "../components/NewStudentModal";
import { Badge, Button, Card, Empty, Input, PageHeader, Progress, Select, Table, Td, Th, type Tone } from "../components/ui";
import { balance, consecutiveAbsences, currentSchedule, hoursAttended, isAboutToGrad, lastAttended, programOf, progressPct } from "../lib/calc";
import { useStore } from "../lib/store";
import type { EnrollmentStatus } from "../lib/types";
import { downloadFile, fmtDate, fullName, money, toCSV, today } from "../lib/utils";

export const STATUS_TONE: Record<EnrollmentStatus, Tone> = { Applicant: "slate", Enrolled: "blue", LOA: "amber", Graduated: "green", Withdrawn: "red", Dropped: "red" };
export const STATUS_LABEL: Record<EnrollmentStatus, string> = { Applicant: "Aplicante", Enrolled: "Inscrito", LOA: "LOA", Graduated: "Graduado", Withdrawn: "Retirado", Dropped: "Baja" };

export default function Students() {
  const { db, user } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [program, setProgram] = useState("");
  const [schedule, setSchedule] = useState("");
  const [status, setStatus] = useState<string>("Enrolled");
  const [flag, setFlag] = useState("");
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return db.students
      .filter((x) => user?.role !== "instructor" || x.instructorId === user.id)
      .filter((x) => !s || `${x.firstName} ${x.lastName} ${x.badge} ${x.email} ${x.cell}`.toLowerCase().includes(s))
      .filter((x) => !program || x.programId === program)
      .filter((x) => !status || x.status === status)
      .filter((x) => !schedule || currentSchedule(x, db)?.id === schedule)
      .map((x) => ({ s: x, hours: hoursAttended(x, db), pct: progressPct(x, db), bal: balance(x.id, db), last: lastAttended(x, db), abs: consecutiveAbsences(x, db) }))
      .filter((r) => !flag || (flag === "balance" ? r.bal > 0 : flag === "grad" ? isAboutToGrad(r.s, db) : r.abs >= db.settings.absenceThreshold))
      .sort((a, b) => a.s.lastName.localeCompare(b.s.lastName));
  }, [db, q, program, status, schedule, flag, user]);

  const exportCSV = () =>
    downloadFile(
      `estudiantes-${today()}.csv`,
      toCSV(rows.map((r) => ({
        badge: r.s.badge, apellido: r.s.lastName, nombre: r.s.firstName, email: r.s.email, celular: r.s.cell,
        programa: programOf(r.s, db)?.name, horario: currentSchedule(r.s, db)?.name, estado: r.s.status,
        primera_clase: r.s.firstClass, graduacion_contrato: r.s.contractGrad, horas: r.hours, ultimo_dia: r.last ?? "", balance: r.bal,
      }))),
    );

  return (
    <div>
      <PageHeader
        title="Estudiantes"
        subtitle={`${rows.length} resultados`}
        actions={
          <>
            <Button variant="secondary" onClick={exportCSV}><Download size={15} /> Exportar</Button>
            {user?.role !== "instructor" && <Button onClick={() => setCreating(true)}><Plus size={15} /> Nuevo estudiante</Button>}
          </>
        }
      />
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 p-3">
          <Input placeholder="Buscar nombre, badge, email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={program} onChange={(e) => setProgram(e.target.value)} className="w-48">
            <option value="">Todos los programas</option>
            {db.programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
          <Select value={schedule} onChange={(e) => setSchedule(e.target.value)} className="w-44">
            <option value="">Todos los horarios</option>
            {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={flag} onChange={(e) => setFlag(e.target.value)} className="w-48">
            <option value="">Sin filtro especial</option>
            <option value="balance">Con balance pendiente</option>
            <option value="grad">Por graduar</option>
            <option value="absent">Ausencias consecutivas</option>
          </Select>
        </div>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr><Th>Badge</Th><Th>Nombre</Th><Th>Programa</Th><Th>Horario</Th><Th>Estado</Th><Th className="w-44">Horas</Th><Th>Último día</Th><Th className="text-right">Balance</Th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map(({ s, hours, pct, bal, last, abs }) => (
              <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/students/${s.id}`)}>
                <Td className="font-mono text-xs">{s.badge}</Td>
                <Td>
                  <div className="font-medium text-slate-800">{fullName(s)}</div>
                  <div className="text-xs text-slate-400">{s.email}</div>
                </Td>
                <Td className="text-xs">{programOf(s, db)?.name}</Td>
                <Td className="text-xs">{currentSchedule(s, db)?.name}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                    {abs >= db.settings.absenceThreshold && <Badge tone="red">{abs} ausencias</Badge>}
                  </div>
                </Td>
                <Td>
                  <div className="mb-1 text-xs tabular-nums text-slate-500">{hours} / {programOf(s, db)?.totalHours} h</div>
                  <Progress value={pct} tone={pct >= 100 ? "green" : "brand"} />
                </Td>
                <Td className="text-xs">{fmtDate(last)}</Td>
                <Td className={`text-right tabular-nums ${bal > 0 ? "font-medium text-amber-700" : "text-slate-500"}`}>{money(bal)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!rows.length && <Empty>No hay estudiantes con esos filtros.</Empty>}
      </Card>
      <NewStudentModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
