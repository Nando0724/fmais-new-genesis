import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AcademicTab from "../components/student/AcademicTab";
import AttendanceTab from "../components/student/AttendanceTab";
import DetailTab from "../components/student/DetailTab";
import EnrollmentTab from "../components/student/EnrollmentTab";
import LedgerTab from "../components/student/LedgerTab";
import { DocumentsTab, HistoryTab, NotesTab, PlacementTab, SummaryTab } from "../components/student/OtherTabs";
import { Badge, Button, Card, Empty, Tabs } from "../components/ui";
import { balance, currentSchedule, hoursAttended, lastAttended, programOf, projectedGrad } from "../lib/calc";
import { useStore } from "../lib/store";
import { fmtDate, fullName, money } from "../lib/utils";
import { STATUS_LABEL, STATUS_TONE } from "./Students";

type Tab = "summary" | "detail" | "enrollment" | "academic" | "attendance" | "ledger" | "placement" | "documents" | "notes" | "history";

export default function StudentProfile() {
  const { id } = useParams();
  const { db, user } = useStore();
  const [params, setParams] = useSearchParams();
  const s = db.students.find((x) => x.id === id);
  if (!s) return <Empty>Estudiante no encontrado. <Link to="/students" className="text-brand-600">Volver</Link></Empty>;

  const instructor = user?.role === "instructor";
  const tabs: { id: Tab; label: string }[] = [
    { id: "summary", label: "Resumen" },
    { id: "detail", label: "Detalle" },
    { id: "enrollment", label: "Inscripción" },
    { id: "academic", label: "Académico" },
    { id: "attendance", label: "Asistencia" },
    ...(!instructor ? [{ id: "ledger" as Tab, label: "Ledger y pagos" }] : []),
    { id: "placement", label: "Colocación" },
    { id: "documents", label: "Documentos" },
    { id: "notes", label: "Notas" },
    ...(!instructor ? [{ id: "history" as Tab, label: "Historial" }] : []),
  ];
  const tab = (params.get("tab") as Tab) || "summary";
  const program = programOf(s, db);
  const sch = currentSchedule(s, db);
  const bal = balance(s.id, db);

  return (
    <div>
      <div className="no-print mb-3 flex items-center justify-between">
        <Link to="/students" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={15} /> Estudiantes</Link>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={14} /> Imprimir</Button>
      </div>

      <Card className="mb-4">
        <div className="grid gap-x-8 gap-y-2 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{fullName(s)}</h1>
            <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
            <Badge tone={s.record === "Active" ? "green" : "slate"}>Registro {s.record === "Active" ? "activo" : "inactivo"}</Badge>
            {s.probation && <Badge tone="red">Probation {s.probation}</Badge>}
            <span className="ml-auto font-mono text-sm text-slate-500">Badge # {s.badge}</span>
          </div>
          <Info label="Programa" value={program?.name} />
          <Info label="Horario" value={sch?.name} />
          <Info label="Graduación por contrato" value={fmtDate(s.contractGrad)} />
          <Info label="Graduación proyectada" value={fmtDate(projectedGrad(s, db))} />
          <Info label="Horas asistidas" value={`${hoursAttended(s, db)} / ${program?.totalHours ?? 0}`} />
          <Info label="Último día asistido" value={fmtDate(lastAttended(s, db))} />
          <Info label="Primera clase" value={fmtDate(s.firstClass)} />
          {!instructor && <Info label="Balance" value={<span className={bal > 0 ? "text-amber-700" : ""}>{money(bal)}</span>} />}
        </div>
      </Card>

      <div className="no-print">
        <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      </div>
      <div className="mt-4">
        {tab === "summary" && <SummaryTab s={s} />}
        {tab === "detail" && <DetailTab s={s} />}
        {tab === "enrollment" && <EnrollmentTab s={s} />}
        {tab === "academic" && <AcademicTab s={s} />}
        {tab === "attendance" && <AttendanceTab s={s} />}
        {tab === "ledger" && !instructor && <LedgerTab s={s} />}
        {tab === "placement" && <PlacementTab s={s} />}
        {tab === "documents" && <DocumentsTab s={s} />}
        {tab === "notes" && <NotesTab s={s} />}
        {tab === "history" && !instructor && <HistoryTab s={s} />}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium text-slate-800">{value ?? "—"}</div>
    </div>
  );
}
