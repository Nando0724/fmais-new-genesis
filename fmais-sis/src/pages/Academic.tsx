import { Calculator, Download, Eye, Printer, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "../components/Layout";
import { SapBadge } from "../components/student/SapTab";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Stat, Table, Tabs, Td, Th } from "../components/ui";
import { programOf } from "../lib/calc";
import { letterFor } from "../lib/config";
import { evaluateSap, pendingMidpoints, probationFor } from "../lib/sap";
import { useStore } from "../lib/store";
import type { Grade, MidpointReview, RequirementKind, SapEvaluation } from "../lib/types";
import { addMonths, downloadFile, fmtDate, fullName, nowISO, toCSV, today, uid } from "../lib/utils";

type TabId = "grades" | "midpoints" | "placement";
const KIND_LABEL: Record<RequirementKind, string> = { exam: "Exam", written: "Written", practical: "Requirement" };

export default function Academic() {
  const { db, user } = useStore();
  const [params, setParams] = useSearchParams();
  const isInstructor = user?.role === "instructor";
  const tab = (params.get("tab") as TabId) || "grades";
  const pending = pendingMidpoints(db).filter((m) => !isInstructor || m.student.instructorId === user?.id).length;
  return (
    <div>
      <PageHeader title="Académico" subtitle="Notas en lote, cola de midpoints con SAP y colocación de graduados." />
      <Tabs
        tabs={[
          { id: "grades" as TabId, label: "Notas en lote" },
          { id: "midpoints" as TabId, label: <>Midpoints y SAP {pending > 0 && <Badge tone="blue">{pending}</Badge>}</> },
          ...(!isInstructor ? [{ id: "placement" as TabId, label: "Colocación" }] : []),
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t })}
      />
      <div className="mt-4">
        {tab === "grades" && <BatchGrades />}
        {tab === "midpoints" && <MidpointQueue />}
        {tab === "placement" && !isInstructor && <Placement />}
      </div>
    </div>
  );
}

// ── Notas en lote (Tasks › Academic de Genesis) ───────────────────

function BatchGrades() {
  const { db, user, saveMany } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [programId, setProgramId] = useState(db.programs.find((p) => p.active)?.id ?? "");
  const [kind, setKind] = useState<RequirementKind>("exam");
  const program = db.programs.find((p) => p.id === programId);
  const reqs = (program?.requirements ?? []).filter((r) => r.kind === kind && r.active !== false);
  const [reqId, setReqId] = useState("");
  const req = reqs.find((r) => r.id === reqId) ?? reqs[0];
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => setValues({}), [programId, kind, req?.id]);

  const students = db.students
    .filter((s) => s.programId === programId && (s.status === "Enrolled" || s.status === "LOA"))
    .filter((s) => user?.role !== "instructor" || s.instructorId === user.id)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  const existing = (sid: string) => db.grades.find((g) => g.studentId === sid && g.requirementId === req?.id);
  const isUnits = kind === "practical";
  const valueOf = (g?: Grade) => (g ? String(isUnits ? g.unitsDone ?? "" : g.percent ?? "") : "");

  const rows = students.map((s) => {
    const g = existing(s.id);
    const input = values[s.id] ?? valueOf(g);
    const num = input === "" ? undefined : Number(input);
    const invalid = num != null && (Number.isNaN(num) || num < 0 || (!isUnits && num > 100));
    const state = input === "" || invalid ? (g ? "saved" : "none") : !g ? "new" : input !== valueOf(g) ? "changed" : "saved";
    return { s, g, input, num, invalid, state };
  });
  const changed = rows.filter((r) => r.state === "new" || r.state === "changed");
  const invalid = rows.filter((r) => r.invalid).length;

  const process = () => {
    if (!req) return;
    const items: Grade[] = changed.map((r) => ({
      id: r.g?.id ?? uid(),
      studentId: r.s.id,
      requirementId: req.id,
      date,
      percent: isUnits ? undefined : r.num,
      unitsDone: isUnits ? Math.min(req.unitsRequired, r.num ?? 0) : undefined,
    }));
    saveMany("grades", items, `Notas en lote: ${req.name}`);
    setValues({});
    toast(`Procesado: ${items.length} nota(s) guardadas.`);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
        <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} className="w-40" /></Field>
        <Field label="Programa">
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)} className="w-56">
            {db.programs.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as RequirementKind)} className="w-36">
            {(Object.keys(KIND_LABEL) as RequirementKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="Función">
          <Select value={req?.id ?? ""} onChange={(e) => setReqId(e.target.value)} className="w-64">
            {reqs.map((r) => <option key={r.id} value={r.id}>{r.name}{r.kind === "practical" ? ` (${r.unitsRequired} u.)` : ""}</option>)}
            {!reqs.length && <option value="">— sin funciones de este tipo —</option>}
          </Select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          {invalid > 0 && <span className="text-xs text-red-600">{invalid} valor(es) inválidos no se guardan.</span>}
          <Button disabled={!changed.length || !req} onClick={process}><Save size={14} /> Procesar ({changed.length})</Button>
        </div>
      </div>
      <p className="px-4 pt-3 text-xs text-slate-500">
        {isUnits
          ? "Escribe el total de unidades hechas hasta la fecha (no las de hoy). Tope: las unidades requeridas."
          : "Escribe el % (0–100). Un 0 significa \"completado sin nota\": queda registrado pero no entra en el promedio ni en el SAP."}{" "}
        Solo se guardan las filas nuevas o cambiadas.
      </p>
      {req ? (
        <Table>
          <thead><tr><Th>Estudiante</Th><Th>Estado</Th><Th>Actual</Th><Th className="w-36">{isUnits ? `Unidades (de ${req.unitsRequired})` : "%"}</Th>{!isUnits && <Th>Letra</Th>}<Th></Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s.id}>
                <Td><Link to={`/students/${r.s.id}?tab=academic`} className="font-medium hover:underline">{fullName(r.s)}</Link><div className="text-xs text-slate-400">#{r.s.badge}</div></Td>
                <Td>{r.s.status === "LOA" ? <Badge tone="amber">LOA</Badge> : <span className="text-xs text-slate-400">Inscrito</span>}</Td>
                <Td className="text-xs text-slate-500">{r.g ? <>{isUnits ? `${r.g.unitsDone ?? 0} u.` : r.g.percent === 0 ? "Completado sin nota" : `${r.g.percent}%`} · {fmtDate(r.g.date)}</> : "—"}</Td>
                <Td>
                  <Input
                    type="number" min={0} max={isUnits ? req.unitsRequired : 100} value={r.input}
                    onChange={(e) => setValues({ ...values, [r.s.id]: e.target.value })}
                    className={r.invalid ? "!border-red-400" : ""}
                  />
                </Td>
                {!isUnits && <Td className="tabular-nums">{r.num ? letterFor(r.num, program) : r.num === 0 ? "—" : ""}</Td>}
                <Td>{r.state === "new" ? <Badge tone="blue">Nuevo</Badge> : r.state === "changed" ? <Badge tone="amber">Cambiado</Badge> : r.state === "saved" ? <Badge tone="green">Guardado</Badge> : null}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>Este programa no tiene funciones activas de tipo {KIND_LABEL[kind]}.</Empty>
      )}
      {req && !rows.length && <Empty>No hay estudiantes inscritos en este programa.</Empty>}
    </Card>
  );
}

// ── Cola de midpoints (Check Midpoints de Genesis) ────────────────

function MidpointQueue() {
  const { db, user, saveMany, remove } = useStore();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showReviewed, setShowReviewed] = useState(false);
  const isInstructor = user?.role === "instructor";
  const mine = (sid: string) => !isInstructor || db.students.find((s) => s.id === sid)?.instructorId === user?.id;

  const pending = useMemo(
    () => pendingMidpoints(db).filter((m) => mine(m.student.id)).map((m) => ({ ...m, key: `${m.student.id}|${m.units}`, sap: evaluateSap(m.student, db, m.reachedOn) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, user],
  );
  const reviewed = db.midpointReviews.filter((r) => mine(r.studentId) && r.by !== "Migración").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  const all = selected.size === pending.length && pending.length > 0;

  const process = () => {
    const at = nowISO();
    const chosen = pending.filter((m) => selected.has(m.key));
    const evals: SapEvaluation[] = chosen.map((m) => ({ ...m.sap, id: uid(), midpoint: m.units, by: user?.id, at }));
    const reviews: MidpointReview[] = chosen.map((m, i) => ({ id: uid(), studentId: m.student.id, units: m.units, reachedOn: m.reachedOn, sapId: evals[i].id, by: user?.id, at }));
    saveMany("sapEvaluations", evals, "SAP en lote (midpoints)");
    saveMany("midpointReviews", reviews, "Midpoints revisados");
    setSelected(new Set());
    const critical = evals.filter((e) => e.overall === "Critical").length;
    toast(`${reviews.length} midpoint(s) revisados con su SAP.${critical ? ` ${critical} en Critical: revisa la probation en su ficha.` : ""}`);
  };

  return (
    <div className="space-y-4">
      <Card
        title={`Midpoints pendientes de revisar (${pending.length})`}
        actions={
          <div className="no-print flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={13} /> Imprimir</Button>
            <Button size="sm" disabled={!selected.size} onClick={process}><Calculator size={13} /> Calcular SAP y marcar revisados ({selected.size})</Button>
          </div>
        }
      >
        <p className="px-4 pt-3 text-xs text-slate-500">
          Estudiantes que cruzaron un midpoint del programa. El SAP se calcula a la fecha en que lo alcanzaron y queda en su historial. Si el estudiante tiene ayuda financiera, es el momento de pedir el desembolso.
        </p>
        {pending.length ? (
          <Table>
            <thead>
              <tr>
                <Th className="w-8"><input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(pending.map((m) => m.key)))} aria-label="Seleccionar todos" /></Th>
                <Th>Estudiante</Th><Th>Midpoint</Th><Th>Alcanzado</Th><Th>Académico</Th><Th>Asistencia</Th><Th>SAP</Th><Th>Probation</Th>
              </tr>
            </thead>
            <tbody>
              {pending.map((m) => (
                <tr key={m.key}>
                  <Td><input type="checkbox" checked={selected.has(m.key)} onChange={() => { const n = new Set(selected); n.has(m.key) ? n.delete(m.key) : n.add(m.key); setSelected(n); }} aria-label={`Seleccionar ${fullName(m.student)}`} /></Td>
                  <Td><Link to={`/students/${m.student.id}?tab=sap`} className="font-medium hover:underline">{fullName(m.student)}</Link><div className="text-xs text-slate-400">#{m.student.badge} · {programOf(m.student, db)?.code}</div></Td>
                  <Td className="tabular-nums">{m.number}.º · {m.units} h</Td>
                  <Td>{fmtDate(m.reachedOn)}</Td>
                  <Td className="tabular-nums">{m.sap.academicPct ?? "—"}{m.sap.academicPct != null && "%"} <SapBadge level={m.sap.academic} /></Td>
                  <Td className="tabular-nums">{m.sap.attendancePct ?? "—"}{m.sap.attendancePct != null && "%"} <SapBadge level={m.sap.attendance} /></Td>
                  <Td><SapBadge level={m.sap.overall} /></Td>
                  <Td className="text-xs">{m.student.probation ? <Badge tone="red">{m.student.probation}</Badge> : probationFor(m.sap) ? <span className="text-red-600">Proponer {probationFor(m.sap)}</span> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>No hay midpoints pendientes. 🎉</Empty>
        )}
      </Card>

      <Card
        title="Revisados"
        actions={<Button size="sm" variant="ghost" onClick={() => setShowReviewed(!showReviewed)}><Eye size={13} /> {showReviewed ? "Ocultar" : "Mostrar"}</Button>}
      >
        {showReviewed && (
          <Table>
            <thead><tr><Th>Estudiante</Th><Th>Midpoint</Th><Th>Alcanzado</Th><Th>Revisado</Th><Th>SAP</Th><Th></Th></tr></thead>
            <tbody>
              {reviewed.map((r) => {
                const s = db.students.find((x) => x.id === r.studentId);
                const e = db.sapEvaluations.find((x) => x.id === r.sapId);
                return (
                  <tr key={r.id}>
                    <Td>{s ? <Link to={`/students/${s.id}?tab=sap`} className="font-medium hover:underline">{fullName(s)}</Link> : "—"}</Td>
                    <Td className="tabular-nums">{r.units} h</Td>
                    <Td>{fmtDate(r.reachedOn)}</Td>
                    <Td className="text-xs">{fmtDate(r.at.slice(0, 10))} · {db.users.find((u) => u.id === r.by)?.name ?? r.by}</Td>
                    <Td><SapBadge level={e?.overall} /></Td>
                    <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => { remove("midpointReviews", r.id); toast("Vuelve a aparecer en pendientes."); }}><RotateCcw size={13} /> Volver a mostrar</Button></Td>
                  </tr>
                );
              })}
              {!reviewed.length && <tr><Td colSpan={6} className="text-center text-slate-400">Todavía no se ha revisado ninguno en este sistema.</Td></tr>}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Colocación (Placement) ────────────────────────────────────────

function Placement() {
  const { db } = useStore();
  const [from, setFrom] = useState(addMonths(today(), -12));
  const [to, setTo] = useState(today());
  const [programId, setProgramId] = useState("");
  const grads = db.students
    .filter((s) => s.status === "Graduated" && s.completionDate && s.completionDate >= from && s.completionDate <= to)
    .filter((s) => !programId || s.programId === programId)
    .sort((a, b) => (b.completionDate ?? "").localeCompare(a.completionDate ?? ""));
  const board = grads.filter((s) => s.placement.passedBoard === "Yes").length;
  const boardTaken = grads.filter((s) => s.placement.passedBoard === "Yes" || s.placement.passedBoard === "No").length;
  const placed = grads.filter((s) => s.placement.hireDate || s.placement.company).length;
  const rate = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const BOARD: Record<string, string> = { Yes: "Sí", No: "No", Pending: "Pendiente", "": "—" };

  const exportCSV = () =>
    downloadFile(`colocacion-${from}-a-${to}.csv`, toCSV(grads.map((s) => ({
      badge: s.badge, apellido: s.lastName, nombre: s.firstName, programa: programOf(s, db)?.code, graduacion: s.completionDate,
      board: BOARD[s.placement.passedBoard], fecha_board: s.placement.boardDate ?? "", contratacion: s.placement.hireDate ?? "", empresa: s.placement.company ?? "",
      contacto: s.placement.contact ?? "", telefono: s.placement.phone ?? "",
    }))));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Graduados en el rango" value={grads.length} />
        <Stat label="Pasaron el State Board" value={rate(board, boardTaken)} sub={`${board} de ${boardTaken} que lo tomaron`} tone="green" />
        <Stat label="Colocados (con empleo)" value={rate(placed, grads.length)} sub={`${placed} de ${grads.length}`} tone="blue" />
      </div>
      <Card
        title="Graduados y colocación"
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Graduación desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
            <Field label="hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
            <Field label="Programa">
              <Select value={programId} onChange={(e) => setProgramId(e.target.value)} className="w-44">
                <option value="">Todos</option>
                {db.programs.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
              </Select>
            </Field>
            <Button variant="secondary" onClick={exportCSV}><Download size={14} /> Exportar</Button>
          </div>
        }
      >
        <Table>
          <thead><tr><Th>Estudiante</Th><Th>Programa</Th><Th>Graduación</Th><Th>State Board</Th><Th>Contratación</Th><Th>Empresa</Th></tr></thead>
          <tbody>
            {grads.map((s) => (
              <tr key={s.id}>
                <Td><Link to={`/students/${s.id}?tab=placement`} className="font-medium hover:underline">{fullName(s)}</Link><div className="text-xs text-slate-400">#{s.badge}</div></Td>
                <Td className="text-xs">{programOf(s, db)?.code}</Td>
                <Td>{fmtDate(s.completionDate)}</Td>
                <Td>
                  {s.placement.passedBoard === "Yes" ? <Badge tone="green">Sí</Badge> : s.placement.passedBoard === "No" ? <Badge tone="red">No</Badge> : s.placement.passedBoard === "Pending" ? <Badge tone="amber">Pendiente</Badge> : <span className="text-slate-400">Sin dato</span>}
                  {s.placement.boardDate && <div className="text-xs text-slate-400">{fmtDate(s.placement.boardDate)}</div>}
                </Td>
                <Td>{fmtDate(s.placement.hireDate)}</Td>
                <Td className="text-sm">{s.placement.company || <span className="text-slate-400">—</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!grads.length && <Empty>No hay graduados en ese rango.</Empty>}
      </Card>
      <p className="text-xs text-slate-400">Para registrar el State Board o el empleo, abre la ficha del graduado › Colocación.</p>
    </div>
  );
}

