import { Download, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, cx, Empty, Field, Input, PageHeader, Select, Table, Td, Th } from "../components/ui";
import { programOf } from "../lib/calc";
import { printSignInSheets } from "../lib/print";
import { expectedOn, filteredStudents, REPORT_GROUPS, REPORTS, STATUS_ES, type Filters, type ReportResult } from "../lib/reports";
import { useStore } from "../lib/store";
import { addDays, downloadFile, fmtDate, fullName, toCSV, today } from "../lib/utils";

export default function Reports() {
  const { db, user } = useStore();
  // El ledger (pagos, 1098-T) solo lo ven dueño, administración y finanzas.
  const allowed = REPORTS.filter((r) => r.group !== "Ledger" || ["owner", "admin", "finance"].includes(user?.role ?? ""));
  const [rid, setRid] = useState("stu_roster");
  const [q, setQ] = useState("");
  const report = REPORTS.find((r) => r.id === rid)!;
  const [f, setF] = useState<Filters>({ from: addDays(today(), -30), to: today(), year: new Date().getFullYear() - (new Date().getMonth() < 2 ? 1 : 0), program: "", status: "Enrolled", schedule: "", student: "", sort: "name" });
  const set = (patch: Partial<Filters>) => setF({ ...f, ...patch });
  const has = (k: (typeof report.filters)[number]) => report.filters.includes(k);

  const choose = (id: string) => {
    const r = REPORTS.find((x) => x.id === id)!;
    setRid(id);
    // Cada reporte arranca con su estado por defecto; un día solo usa "hoy".
    setF({ ...f, status: r.defaultStatus ?? "", student: "", to: r.filters.includes("date") ? today() : f.to });
  };

  const result = useMemo<ReportResult>(() => (report.run ? report.run(db, f) : { rows: [] }), [db, f, report]);
  const rows = result.rows;
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const shown = allowed.filter((r) => !q || `${r.name} ${r.desc} ${r.genesis ?? ""} ${r.group}`.toLowerCase().includes(q.toLowerCase()));
  const studentOptions = has("student") ? filteredStudents(db, { ...f, student: "" }) : [];
  const years = [...new Set(db.ledger.map((l) => Number(l.date.slice(0, 4))))].sort((a, b) => b - a);

  const exportCSV = () => downloadFile(`${report.id}-${today()}.csv`, toCSV(result.totals ? [...rows, result.totals] : rows));
  const signIn = () =>
    printSignInSheets(
      db.settings.schoolName,
      f.to,
      db.schedules.filter((s) => !f.schedule || s.id === f.schedule).map((x) => ({
        title: `${x.name} (${x.start}–${x.end})`,
        students: expectedOn(db, f.to, x.id).map((s) => ({ name: fullName(s), badge: s.badge, program: programOf(s, db)?.code ?? "" })),
      })),
    );
  const labelStudents = report.kind === "labels" ? filteredStudents(db, f) : [];

  return (
    <div>
      <PageHeader title="Reportes" subtitle={`Catálogo de reportes de Genesis (${allowed.filter((r) => !r.pending).length} disponibles). Todos se imprimen o exportan a CSV (abre en Excel).`} />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="no-print space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <Input placeholder="Buscar reporte…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          {REPORT_GROUPS.map((g) => {
            const list = shown.filter((r) => r.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g}</div>
                {list.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => !r.pending && choose(r.id)}
                    disabled={!!r.pending}
                    title={r.pending ?? r.desc}
                    className={cx("w-full rounded-lg px-3 py-1.5 text-left text-sm transition", rid === r.id ? "bg-brand-700 font-medium text-white" : r.pending ? "cursor-not-allowed text-slate-400" : "hover:bg-white")}
                  >
                    {r.name}
                    {r.pending && <span className="ml-1 text-[10px]">· pronto</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <Card
          title={<span>{report.name} {report.genesis && <span className="ml-1 text-xs font-normal text-slate-400">Genesis: {report.genesis}</span>}</span>}
          actions={
            <div className="no-print flex gap-2">
              {report.kind === "signin" ? (
                <Button size="sm" onClick={signIn}><Printer size={13} /> Imprimir hojas</Button>
              ) : (
                <>
                  {report.kind !== "labels" && <Button size="sm" variant="secondary" disabled={!rows.length} onClick={exportCSV}><Download size={13} /> CSV / Excel</Button>}
                  <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer size={13} /> Imprimir / PDF</Button>
                </>
              )}
            </div>
          }
        >
          <p className="px-4 pt-3 text-xs text-slate-500">{report.desc}</p>
          <div className="no-print flex flex-wrap gap-3 border-b border-slate-100 p-3">
            {has("range") && (
              <>
                <Field label="Desde"><Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
                <Field label="Hasta"><Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
              </>
            )}
            {has("date") && <Field label={report.id.startsWith("stu_sap") ? "A la fecha" : "Fecha"}><Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value || today() })} /></Field>}
            {has("year") && (
              <Field label="Año">
                <Select value={f.year} onChange={(e) => set({ year: Number(e.target.value) })} className="w-28">
                  {(years.length ? years : [f.year]).map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              </Field>
            )}
            {(has("program") || has("programRequired")) && (
              <Field label="Programa">
                <Select value={f.program} onChange={(e) => set({ program: e.target.value, student: "" })} className="w-52">
                  {has("program") && <option value="">Todos</option>}
                  {has("programRequired") && !f.program && <option value="">— elegir —</option>}
                  {db.programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            )}
            {has("schedule") && (
              <Field label="Horario">
                <Select value={f.schedule} onChange={(e) => set({ schedule: e.target.value })} className="w-36">
                  <option value="">Todos</option>
                  {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            {has("status") && (
              <Field label="Estado">
                <Select value={f.status} onChange={(e) => set({ status: e.target.value, student: "" })} className="w-36">
                  <option value="">Todos</option>
                  {Object.entries(STATUS_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  <option value="NoStart">No-start (sin horas)</option>
                </Select>
              </Field>
            )}
            {has("student") && (
              <Field label="Estudiante">
                <Select value={f.student} onChange={(e) => set({ student: e.target.value })} className="w-56">
                  <option value="">Todos ({studentOptions.length})</option>
                  {studentOptions.map((s) => <option key={s.id} value={s.id}>{fullName(s)} · #{s.badge}</option>)}
                </Select>
              </Field>
            )}
            {has("sort") && (
              <Field label="Ordenar por">
                <Select value={f.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })} className="w-32">
                  <option value="name">Nombre</option>
                  <option value="number">Número</option>
                </Select>
              </Field>
            )}
          </div>

          {/* Encabezado que solo aparece al imprimir */}
          <div className="hidden px-4 pt-3 text-xs text-slate-600 print:block">
            {db.settings.schoolName} · {report.name} · {has("range") ? `${fmtDate(f.from)} – ${fmtDate(f.to)}` : has("date") ? fmtDate(f.to) : has("year") ? f.year : ""} · Impreso {fmtDate(today())}
          </div>
          {result.note && <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{result.note}</div>}

          {report.kind === "signin" ? (
            <div className="space-y-2 p-4 text-sm">
              {db.schedules.filter((s) => !f.schedule || s.id === f.schedule).map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <span className="font-medium">{s.name} ({s.start}–{s.end})</span>
                  <Badge tone="blue">{expectedOn(db, f.to, s.id).length} estudiantes</Badge>
                </div>
              ))}
              <p className="text-xs text-slate-500">Se abre una ventana para imprimir con una página por horario. También está en Asistencia › Check Attendance.</p>
            </div>
          ) : report.kind === "labels" ? (
            <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3 print:grid-cols-3 print:gap-0 print:p-0">
              {labelStudents.map((s) => (
                <div key={s.id} className="rounded border border-dashed border-slate-300 p-3 text-sm leading-tight print:h-[1in] print:rounded-none print:border-0 print:px-4 print:py-2">
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
              <thead><tr>{columns.map((k) => <Th key={k}>{k}</Th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => <tr key={i}>{columns.map((k) => <Td key={k} className={cx("text-xs", typeof r[k] === "number" && "tabular-nums")}>{r[k]}</Td>)}</tr>)}
                {result.totals && <tr className="bg-slate-50 font-semibold">{columns.map((k) => <Td key={k} className="text-xs tabular-nums">{result.totals![k] ?? ""}</Td>)}</tr>}
              </tbody>
            </Table>
          ) : (
            <Empty>Sin datos para estos filtros.</Empty>
          )}
          {!report.kind && rows.length > 0 && <div className="px-4 py-2 text-xs text-slate-500">{rows.length} filas</div>}
        </Card>
      </div>
    </div>
  );
}
