import { Download, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, cx, Empty, Field, Input, PageHeader, Select, Table, Td, Th, Button } from "../components/ui";
import { balance, currentSchedule, hoursAttended, lastAttended, liveLedger, planStatus, programOf } from "../lib/calc";
import { useStore, userName } from "../lib/store";
import { LEAD_SOURCES } from "../lib/types";
import { addDays, downloadFile, fmtDate, fullName, money, SOURCE_LABEL, toCSV, today } from "../lib/utils";
import { STATUS_LABEL } from "./Students";

type ReportId = "roster" | "attendance" | "delinquency" | "placement" | "admissions" | "revenue" | "labels";

const REPORTS: { id: ReportId; name: string; desc: string }[] = [
  { id: "roster", name: "Roster", desc: "Estudiantes por programa, horario y estado." },
  { id: "attendance", name: "Asistencia por rango", desc: "Horas, días presentes y ausentes por estudiante." },
  { id: "delinquency", name: "Morosidad", desc: "Balances pendientes y pagos vencidos." },
  { id: "placement", name: "Graduados y colocación", desc: "Graduación, examen estatal y empleo por programa." },
  { id: "admissions", name: "Admisiones por fuente", desc: "Leads, contacto, conversión y tiempo de respuesta." },
  { id: "revenue", name: "Ingresos", desc: "Pagos recibidos por mes y método, menos reembolsos. No incluye anulados." },
  { id: "labels", name: "Etiquetas", desc: "Etiquetas de correo imprimibles (Labels)." },
];

export default function Reports() {
  const { db } = useStore();
  const [rid, setRid] = useState<ReportId>("roster");
  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(today());
  const [program, setProgram] = useState("");
  const [status, setStatus] = useState("Enrolled");

  const rows = useMemo<Record<string, string | number>[]>(() => {
    const byProgram = (s: { programId: string }) => !program || s.programId === program;
    switch (rid) {
      case "roster":
        return db.students.filter(byProgram).filter((s) => !status || s.status === status).sort((a, b) => a.lastName.localeCompare(b.lastName)).map((s) => ({
          Badge: s.badge, Nombre: fullName(s), Programa: programOf(s, db)?.code ?? "", Horario: currentSchedule(s, db)?.name ?? "", Estado: STATUS_LABEL[s.status],
          "Primera clase": fmtDate(s.firstClass), "Grad. contrato": fmtDate(s.contractGrad), Horas: hoursAttended(s, db), Instructor: userName(db, s.instructorId), Celular: s.cell,
        }));
      case "attendance":
        return db.students.filter(byProgram).filter((s) => !status || s.status === status).map((s) => {
          const recs = db.attendance.filter((a) => a.studentId === s.id && a.date >= from && a.date <= to);
          return {
            Badge: s.badge, Nombre: fullName(s), Programa: programOf(s, db)?.code ?? "",
            "Días presente": recs.filter((a) => a.type !== "Absent").length, "Ausencias registradas": recs.filter((a) => a.type === "Absent").length,
            "Horas en rango": Math.round(recs.reduce((t, a) => t + a.hours, 0) * 100) / 100, "Horas totales": hoursAttended(s, db), "Último día": fmtDate(lastAttended(s, db)),
          };
        }).sort((a, b) => String(a.Nombre).localeCompare(String(b.Nombre)));
      case "delinquency":
        return db.students.filter(byProgram).map((s) => {
          const plan = db.plans.find((p) => p.studentId === s.id && p.active);
          return { s, bal: balance(s.id, db), plan, st: plan ? planStatus(plan, db) : "" };
        }).filter((x) => x.bal > 0).sort((a, b) => b.bal - a.bal).map(({ s, bal, plan, st }) => ({
          Badge: s.badge, Nombre: fullName(s), Estado: STATUS_LABEL[s.status], Balance: money(bal), Modalidad: plan ? (plan.mode === "zelle" ? "Zelle" : "Automático") : "Sin plan",
          "Próximo pago": fmtDate(plan?.nextDue), Situación: st === "overdue" ? "VENCIDO" : st === "due_soon" ? "Vence pronto" : st === "ok" ? "Al día" : "—", Email: s.email,
        }));
      case "placement":
        return db.programs.filter((p) => !program || p.id === program).map((p) => {
          const grads = db.students.filter((s) => s.programId === p.id && s.status === "Graduated" && (s.completionDate ?? "") >= from && (s.completionDate ?? "") <= to);
          const board = grads.filter((s) => s.placement.passedBoard === "Yes").length;
          const hired = grads.filter((s) => s.placement.hireDate).length;
          const withdrawn = db.students.filter((s) => s.programId === p.id && (s.status === "Withdrawn" || s.status === "Dropped")).length;
          return {
            Programa: p.name, Graduados: grads.length, "Pasaron examen estatal": board, Empleados: hired,
            "Tasa de colocación": grads.length ? `${Math.round((hired / grads.length) * 100)}%` : "—", "Retirados / baja (total)": withdrawn,
          };
        });
      case "admissions":
        return LEAD_SOURCES.map((src) => {
          const ls = db.leads.filter((l) => l.source === src && l.createdAt.slice(0, 10) >= from && l.createdAt.slice(0, 10) <= to).filter((l) => !program || l.programId === program);
          const contacted = ls.filter((l) => l.firstContactAt);
          const mins = contacted.map((l) => (new Date(l.firstContactAt!).getTime() - new Date(l.createdAt).getTime()) / 60000);
          const enrolled = ls.filter((l) => l.stage === "enrolled").length;
          return {
            Fuente: SOURCE_LABEL[src], Leads: ls.length, Contactados: contacted.length, Inscritos: enrolled,
            Conversión: ls.length ? `${Math.round((enrolled / ls.length) * 100)}%` : "—",
            "Respuesta promedio": mins.length ? `${Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)} min` : "—",
            Perdidos: ls.filter((l) => l.stage === "lost").length,
          };
        }).filter((r) => r.Leads > 0);
      case "revenue": {
        // Sin anulados. Los reembolsos (pagos negativos) se restan del total del mes.
        const pays = liveLedger(db).filter((l) => l.payment !== 0 && l.date >= from && l.date <= to);
        const months = [...new Set(pays.map((l) => l.date.slice(0, 7)))].sort();
        const methods = [...new Set(pays.filter((l) => l.payment > 0).map((l) => l.method ?? "—"))];
        const sum = (ls: typeof pays) => ls.reduce((t, l) => t + l.payment, 0);
        return months.map((m) => {
          const pm = pays.filter((l) => l.date.startsWith(m));
          const refunds = pm.filter((l) => l.payment < 0);
          return {
            Mes: m,
            ...Object.fromEntries(methods.map((me) => [me, money(sum(pm.filter((l) => l.payment > 0 && (l.method ?? "—") === me)))])),
            Reembolsos: refunds.length ? money(sum(refunds)) : "—",
            "Total neto": money(sum(pm)),
            Pagos: pm.filter((l) => l.payment > 0).length,
          };
        });
      }
      default:
        return [];
    }
  }, [db, rid, from, to, program, status]);

  const labelStudents = db.students.filter((s) => (!program || s.programId === program) && (!status || s.status === status));
  const usesRange = ["attendance", "placement", "admissions", "revenue"].includes(rid);
  const usesStatus = ["roster", "attendance", "labels"].includes(rid);
  const report = REPORTS.find((r) => r.id === rid)!;

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Reemplazo de R-Reports y Labels de Genesis." />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="no-print space-y-1">
          {REPORTS.map((r) => (
            <button key={r.id} onClick={() => setRid(r.id)} className={cx("w-full rounded-lg px-3 py-2 text-left transition", rid === r.id ? "bg-brand-700 text-white" : "hover:bg-white")}>
              <div className="text-sm font-medium">{r.name}</div>
              <div className={cx("text-xs", rid === r.id ? "text-slate-200" : "text-slate-500")}>{r.desc}</div>
            </button>
          ))}
        </div>
        <Card
          title={report.name}
          actions={
            <div className="no-print flex gap-2">
              {rid !== "labels" && <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadFile(`${rid}-${today()}.csv`, toCSV(rows))}><Download size={13} /> CSV</Button>}
              <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer size={13} /> Imprimir</Button>
            </div>
          }
        >
          <div className="no-print flex flex-wrap gap-3 border-b border-slate-100 p-3">
            {usesRange && (
              <>
                <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              </>
            )}
            <Field label="Programa">
              <Select value={program} onChange={(e) => setProgram(e.target.value)} className="w-52">
                <option value="">Todos</option>
                {db.programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            {usesStatus && (
              <Field label="Estado">
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
                  <option value="">Todos</option>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
            )}
          </div>
          {rid === "labels" ? (
            <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3">
              {labelStudents.map((s) => (
                <div key={s.id} className="rounded border border-dashed border-slate-300 p-3 text-sm leading-tight">
                  <div className="font-medium">{s.firstName} {s.lastName}</div>
                  <div>{s.address1 || "—"}</div>
                  {s.address2 && <div>{s.address2}</div>}
                  <div>{s.city}{s.city ? ", " : ""}{s.state} {s.zip}</div>
                </div>
              ))}
              {!labelStudents.length && <Empty>Sin estudiantes.</Empty>}
            </div>
          ) : rows.length ? (
            <Table>
              <thead><tr>{Object.keys(rows[0]).map((k) => <Th key={k}>{k}</Th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <Td key={j} className="text-xs">{v}</Td>)}</tr>)}
              </tbody>
            </Table>
          ) : (
            <Empty>Sin datos para estos filtros.</Empty>
          )}
          {rid !== "labels" && rows.length > 0 && <div className="px-4 py-2 text-xs text-slate-500">{rows.length} filas</div>}
        </Card>
      </div>
    </div>
  );
}
