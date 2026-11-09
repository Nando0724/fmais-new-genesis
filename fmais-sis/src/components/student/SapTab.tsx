import { Calculator, Printer, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { programOf } from "../../lib/calc";
import { academicDetail, evaluateSap, probationFor, SAP_LABEL, SAP_TONE } from "../../lib/sap";
import { useStore } from "../../lib/store";
import type { SapLevel, Student } from "../../lib/types";
import { addDays, fmtDate, nowISO, today, uid } from "../../lib/utils";
import { useToast } from "../Layout";
import { Badge, Button, Card, Empty, Field, Input, Table, Td, Th } from "../ui";

export const SapBadge = ({ level }: { level?: SapLevel }) => (level ? <Badge tone={SAP_TONE[level]}>{SAP_LABEL[level]}</Badge> : <span className="text-slate-400">—</span>);
const pct = (n?: number) => (n == null ? "—" : `${n}%`);

export default function SapTab({ s }: { s: Student }) {
  const { db, user, save } = useStore();
  const toast = useToast();
  const [asOf, setAsOf] = useState(addDays(today(), -1));
  const program = programOf(s, db);
  const result = useMemo(() => evaluateSap(s, db, asOf), [s, db, asOf]);
  const detail = useMemo(() => academicDetail(s, db, asOf), [s, db, asOf]);
  const history = db.sapEvaluations.filter((e) => e.studentId === s.id).sort((a, b) => b.at.localeCompare(a.at));
  const canEdit = user?.role !== "instructor";
  if (!program) return <Empty>El estudiante no tiene programa.</Empty>;
  const sap = program.sap;
  const proposed = probationFor(result);

  const record = () => {
    save("sapEvaluations", { ...result, id: uid(), by: user?.id, at: nowISO() }, "Calcular SAP");
    toast("SAP guardado en el historial.");
  };

  return (
    <div className="space-y-4">
      {!sap.verified && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Los mínimos y pesos SAP de este programa son <b>valores de ejemplo</b> (README › Pendiente de verificar). Confírmalos en Configuración › Programas › SAP.
        </div>
      )}

      <Card
        title="Calcular SAP"
        actions={
          <div className="no-print flex items-end gap-2">
            <Field label="A la fecha"><Input type="date" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value || addDays(today(), -1))} className="w-40" /></Field>
            <Button variant="secondary" onClick={() => window.print()}><Printer size={14} /> Imprimir</Button>
            {canEdit && <Button onClick={record}><Calculator size={14} /> Guardar cálculo</Button>}
          </div>
        }
      >
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Académico (cualitativo)</div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums">{pct(result.academicPct)} <SapBadge level={result.academic} /></div>
            <table className="mt-2 w-full text-xs text-slate-600">
              <tbody>
                <tr><td>Exam ({detail.weights.exam}%)</td><td className="text-right tabular-nums">{pct(detail.exam)}</td></tr>
                <tr><td>Written ({detail.weights.written}%)</td><td className="text-right tabular-nums">{pct(detail.written)}</td></tr>
                <tr><td>Requirement ({detail.weights.requirement}%)</td><td className="text-right tabular-nums">{pct(detail.requirement)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-400">Requirement = unidades hechas contra las esperadas para las horas que lleva. Sin datos, su peso se reparte.</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Asistencia (cuantitativo)</div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums">{pct(result.attendancePct)} <SapBadge level={result.attendance} /></div>
            <div className="mt-2 text-xs text-slate-600">{result.hoursAttended} h asistidas / {result.hoursScheduled} h programadas</div>
            <p className="mt-2 text-[11px] text-slate-400">Desde {fmtDate(s.trackingStartDate && s.trackingStartDate > s.firstClass ? s.trackingStartDate : s.firstClass)}. Excusadas {sap.excusedCountsAsAttended ? "cuentan" : "no cuentan"} como asistidas.</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">SAP general (el más bajo)</div>
            <div className="mt-1 text-2xl font-semibold"><SapBadge level={result.overall} /></div>
            <table className="mt-2 w-full text-xs text-slate-600">
              <thead><tr className="text-slate-400"><th className="text-left font-normal">Mínimos</th><th className="text-right font-normal">Acad.</th><th className="text-right font-normal">Asist.</th></tr></thead>
              <tbody>
                <tr><td>Critical (debajo)</td><td className="text-right">{sap.academic.critical}%</td><td className="text-right">{sap.attendance.critical}%</td></tr>
                <tr><td>OK</td><td className="text-right">{sap.academic.ok}%</td><td className="text-right">{sap.attendance.ok}%</td></tr>
                <tr><td>Superior</td><td className="text-right">{sap.academic.superior}%</td><td className="text-right">{sap.attendance.superior}%</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        {proposed && canEdit && (
          <div className="no-print mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <ShieldAlert size={16} />
            <span className="flex-1">SAP <b>Critical</b> en {proposed === "Academic" ? "lo académico" : "asistencia"}. Se propone poner al estudiante en <b>probation {proposed}</b>.</span>
            {s.probation === proposed ? (
              <Badge tone="red">Ya está en probation desde {fmtDate(s.probationDate)}</Badge>
            ) : (
              <Button size="sm" variant="danger" onClick={() => { save("students", { ...s, probation: proposed, probationDate: today() }, `Probation ${proposed} por SAP`); toast(`Probation ${proposed} registrada.`); }}>
                Confirmar probation
              </Button>
            )}
          </div>
        )}
        {s.probation && !proposed && canEdit && (
          <div className="no-print mx-4 mb-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <span className="flex-1">Está en probation {s.probation} desde {fmtDate(s.probationDate)} y el SAP a esta fecha ya no es Critical.</span>
            <Button size="sm" variant="secondary" onClick={() => { save("students", { ...s, probation: "", probationDate: undefined }, "Fin de probation"); toast("Probation levantada."); }}>Levantar probation</Button>
          </div>
        )}
      </Card>

      <Card title={`Historial de SAP (${history.length})`}>
        <Table>
          <thead><tr><Th>Calculado</Th><Th>A la fecha</Th><Th>Origen</Th><Th>Académico</Th><Th>Asistencia</Th><Th>General</Th><Th>Por</Th></tr></thead>
          <tbody>
            {history.map((e) => (
              <tr key={e.id}>
                <Td>{fmtDate(e.at.slice(0, 10))}</Td>
                <Td>{fmtDate(e.asOf)}</Td>
                <Td className="text-xs">{e.midpoint ? `Midpoint ${e.midpoint} h` : "Manual"}{!e.verifiedPolicy && <span className="ml-1 text-amber-600">(ejemplo)</span>}</Td>
                <Td className="tabular-nums">{pct(e.academicPct)} <SapBadge level={e.academic} /></Td>
                <Td className="tabular-nums">{pct(e.attendancePct)} <SapBadge level={e.attendance} /></Td>
                <Td><SapBadge level={e.overall} /></Td>
                <Td className="text-xs text-slate-500">{db.users.find((u) => u.id === e.by)?.name ?? e.by ?? "—"}</Td>
              </tr>
            ))}
            {!history.length && <tr><Td colSpan={7} className="text-center text-slate-400">Todavía no se ha guardado ningún cálculo.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
