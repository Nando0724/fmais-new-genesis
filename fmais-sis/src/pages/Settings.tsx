import { Copy, Download, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import ImportData from "../components/ImportData";
import { useToast } from "../components/Layout";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Tabs, Td, Textarea, Th } from "../components/ui";
import { weeklyHours } from "../lib/calc";
import { activeOptions, costsFrom, DEFAULT_GRADE_SCALE, defaultSap, programTotal, SELECTION_INFO } from "../lib/config";
import { DEFAULT_FOLLOWUP_PLAN, FOLLOWUP_LABEL } from "../lib/crm";
import { canAccess, useStore, type Area } from "../lib/store";
import {
  SELECTION_TYPES, type FollowUpStep, type FollowUpType, type GradeBand, type Holiday, type Program, type ProgramCost, type Requirement, type RequirementKind, type Role,
  type SapLevels, type SapPolicy, type Schedule, type Selection, type SelectionType, type Settings, type User,
} from "../lib/types";
import { DAY_SHORT, diffDays, downloadFile, fmtDate, money, ROLE_LABEL, today, uid } from "../lib/utils";

type Tab = "school" | "catalogs" | "programs" | "schedules" | "holidays" | "users" | "templates" | "automation" | "integrations" | "data";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("school");
  return (
    <div>
      <PageHeader title="Configuración" subtitle="Equivale a Maintenance y Options de Genesis." />
      <Tabs
        value={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: "school", label: "Escuela" }, { id: "catalogs", label: "Catálogos" }, { id: "programs", label: "Programas" }, { id: "schedules", label: "Horarios" }, { id: "holidays", label: "Feriados y ajustes" },
          { id: "users", label: "Usuarios y roles" }, { id: "templates", label: "Plantillas de email" }, { id: "automation", label: "Automatizaciones" },
          { id: "integrations", label: "Fuentes de leads" }, { id: "data", label: "Datos e importación" },
        ]}
      />
      <div className="mt-4">
        {tab === "school" && <SchoolTab />}
        {tab === "catalogs" && <CatalogsTab />}
        {tab === "programs" && <ProgramsTab />}
        {tab === "schedules" && <SchedulesTab />}
        {tab === "holidays" && <HolidaysTab />}
        {tab === "users" && <UsersTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "automation" && <AutomationTab />}
        {tab === "integrations" && <IntegrationsTab />}
        {tab === "data" && <DataTab />}
      </div>
    </div>
  );
}

type SettingField = { key: keyof Settings; label: string; type?: "text" | "number" | "date" | "checkbox"; hint?: string; wide?: boolean };

function SettingsForm({ title, fields }: { title?: string; fields: SettingField[] }) {
  const { db, updateSettings } = useStore();
  const toast = useToast();
  const [d, setD] = useState(db.settings);
  return (
    <Card title={title}>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {fields.map((f) =>
          f.type === "checkbox" ? (
            <label key={f.key} className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" className="mt-0.5" checked={!!d[f.key]} onChange={(e) => setD({ ...d, [f.key]: e.target.checked })} />
              <span>{f.label}{f.hint && <span className="block text-xs text-slate-400">{f.hint}</span>}</span>
            </label>
          ) : (
            <Field key={f.key} label={f.label} hint={f.hint} className={f.wide ? "sm:col-span-2" : undefined}>
              <Input type={f.type ?? "text"} value={(d[f.key] as string | number) ?? ""} onChange={(e) => setD({ ...d, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} />
            </Field>
          ),
        )}
      </div>
      <div className="flex justify-end border-t border-slate-100 px-4 py-3">
        <Button onClick={() => { updateSettings(Object.fromEntries(fields.map((f) => [f.key, d[f.key]]))); toast("Configuración guardada."); }}>Guardar</Button>
      </div>
    </Card>
  );
}

function SchoolTab() {
  const { db } = useStore();
  const exp = db.settings.licenseExpires;
  const days = exp ? diffDays(exp, today()) : undefined;
  return (
    <div className="space-y-4">
      {days != null && days <= 60 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {days < 0 ? `La licencia estatal venció el ${fmtDate(exp!)}.` : `La licencia estatal vence el ${fmtDate(exp!)} (en ${days} días).`}
        </div>
      )}
      <SettingsForm
        title="Escuela"
        fields={[
          { key: "schoolName", label: "Nombre de la escuela", hint: "Sale en todos los reportes.", wide: true }, { key: "address", label: "Dirección" }, { key: "phone", label: "Teléfono" }, { key: "email", label: "Email" },
          { key: "zelleRecipient", label: "Destinatario Zelle", hint: "Aparece en los recordatorios de pago." },
          { key: "enrollmentPortalUrl", label: "URL del portal de inscripción", hint: "Se usa en los links que se envían a los leads.", wide: true },
        ]}
      />
      <SettingsForm
        title="Licencia estatal y datos corporativos"
        fields={[
          { key: "licenseNumber", label: "Número de licencia (Commission for Independent Education)" },
          { key: "licenseApproved", label: "Fecha de aprobación", type: "date" },
          { key: "licenseExpires", label: "Fecha de vencimiento", type: "date", hint: "Se avisa 60 días antes." },
          { key: "officers", label: "Oficiales corporativos", hint: "Nombres y cargos, separados por coma.", wide: true },
        ]}
      />
    </div>
  );
}

const AutomationTab = () => (
  <div className="space-y-4">
    <SettingsForm
      title="Alertas"
      fields={[
        { key: "absenceThreshold", label: "Alerta de ausencias consecutivas (días de clase)", type: "number", hint: "Check Consecutive Absences de Genesis." },
        { key: "aboutToGradHours", label: "\"Por graduar\" cuando falten (horas)", type: "number", hint: "Check for Students About To Grad." },
        { key: "reminderDaysBefore", label: "Recordatorio Zelle: días antes del vencimiento", type: "number" },
        { key: "leadResponseMinutes", label: "Tiempo máximo para primer contacto de un lead (min)", type: "number", hint: "Los leads que lo superan se marcan en rojo en el CRM." },
      ]}
    />
    <SettingsForm
      title="Al iniciar sesión (Customize Auto Features)"
      fields={[
        { key: "checkMidpointsOnLogin", label: "Avisar de estudiantes que alcanzaron un midpoint", type: "checkbox", hint: "Se muestra en el Centro de alertas (fase 5)." },
        { key: "checkMissingOutOnLogin", label: "Avisar de salidas sin marcar del día anterior", type: "checkbox", hint: "Equivale a Check Swipes (fase 4)." },
        { key: "autoLogoutMinutes", label: "Cerrar sesión tras minutos sin actividad (0 = nunca)", type: "number" },
      ]}
    />
    <FollowUpPlanEditor />
  </div>
);

/** Plan de seguimiento que se crea con cada lead nuevo (CRM, fase 7). */
function FollowUpPlanEditor() {
  const { db, updateSettings } = useStore();
  const toast = useToast();
  const [plan, setPlan] = useState<FollowUpStep[]>(db.settings.followUpPlan);
  const [auto, setAuto] = useState(db.settings.autoFollowUpPlan);
  const set = (i: number, patch: Partial<FollowUpStep>) => setPlan(plan.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <Card title="Plan de seguimiento de leads">
      <div className="space-y-3 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Crear estos seguimientos al registrar un lead nuevo (a mano o desde el formulario web)
        </label>
        <Table>
          <thead><tr><Th className="w-28">Día</Th><Th className="w-40">Tipo</Th><Th>Qué hacer</Th><Th></Th></tr></thead>
          <tbody>
            {plan.map((s, i) => (
              <tr key={i}>
                <Td><Input type="number" min={0} value={s.day} onChange={(e) => set(i, { day: Math.max(0, Number(e.target.value)) })} /></Td>
                <Td>
                  <Select value={s.type} onChange={(e) => set(i, { type: e.target.value as FollowUpType })}>
                    {(Object.keys(FOLLOWUP_LABEL) as FollowUpType[]).map((t) => <option key={t} value={t}>{FOLLOWUP_LABEL[t]}</option>)}
                  </Select>
                </Td>
                <Td><Input value={s.note} onChange={(e) => set(i, { note: e.target.value })} /></Td>
                <Td className="text-right"><button onClick={() => setPlan(plan.filter((_, k) => k !== i))} className="text-slate-400 hover:text-red-600" aria-label="Quitar paso"><Trash2 size={14} /></button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="text-xs text-slate-500">Día 0 = el mismo día en que entra el lead. Los seguimientos de un lead se cierran solos si se pierde o se inscribe.</p>
      </div>
      <div className="flex justify-between border-t border-slate-100 px-4 py-3">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPlan([...plan, { day: (plan[plan.length - 1]?.day ?? 0) + 7, type: "call", note: "" }])}><Plus size={14} /> Agregar paso</Button>
          <Button variant="ghost" onClick={() => setPlan(DEFAULT_FOLLOWUP_PLAN)}><RotateCcw size={14} /> Plan sugerido</Button>
        </div>
        <Button onClick={() => { updateSettings({ followUpPlan: [...plan].sort((a, b) => a.day - b.day).map((s) => ({ ...s, note: s.note.trim() || FOLLOWUP_LABEL[s.type] })), autoFollowUpPlan: auto }); toast("Plan de seguimiento guardado."); }}>Guardar</Button>
      </div>
    </Card>
  );
}

// ── Catálogos (Selections) ─────────────────────────────────────────

function CatalogsTab() {
  const { db, save } = useStore();
  const toast = useToast();
  const [type, setType] = useState<SelectionType>("ethnicity");
  const [value, setValue] = useState("");
  const [company, setCompany] = useState<Selection | null>(null);
  const items = db.selections.filter((s) => s.type === type).sort((a, b) => a.sort - b.sort);
  const info = SELECTION_INFO[type];
  const add = () => {
    const v = value.trim();
    if (!v) return;
    if (items.some((i) => i.value.toLowerCase() === v.toLowerCase())) return toast("Ese valor ya existe.");
    save("selections", { id: uid(), type, value: v, active: true, sort: items.length });
    setValue("");
  };
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <Card>
        <ul className="p-2">
          {SELECTION_TYPES.map((t) => (
            <li key={t}>
              <button onClick={() => setType(t)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${t === type ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
                {SELECTION_INFO[t].label}
                <span className="text-xs text-slate-400">{db.selections.filter((s) => s.type === t && s.active).length}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={info.label} actions={info.ready ? <Badge tone="green">En uso</Badge> : <Badge tone="amber">Se conecta más adelante</Badge>}>
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          Se usa en: {info.use}. Los valores no se borran (pueden estar en registros viejos): desactívalos para que no salgan en las listas.
        </p>
        <div className="flex gap-2 border-b border-slate-100 p-3">
          <Input value={value} placeholder="Nuevo valor" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button disabled={!value.trim()} onClick={add}><Plus size={15} /> Agregar</Button>
        </div>
        <Table>
          <thead><tr><Th>Valor</Th><Th>Activo</Th><Th></Th></tr></thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <Td className={s.active ? "font-medium" : "text-slate-400 line-through"}>{s.value}</Td>
                <Td><input type="checkbox" checked={s.active} onChange={(e) => save("selections", { ...s, active: e.target.checked })} aria-label={`Activo: ${s.value}`} /></Td>
                <Td className="text-right">{type === "company" && <Button size="sm" variant="ghost" onClick={() => setCompany(s)}><Pencil size={13} /> Contacto y dirección</Button>}</Td>
              </tr>
            ))}
            {!items.length && <tr><Td colSpan={3} className="text-center text-slate-400">Sin valores todavía.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      {company && (
        <Modal open onClose={() => setCompany(null)} title={company.value} footer={<><Button variant="secondary" onClick={() => setCompany(null)}>Cancelar</Button><Button onClick={() => { save("selections", company); setCompany(null); }}>Guardar</Button></>}>
          <div className="grid grid-cols-6 gap-3">
            {([["contact", "Contacto", 3], ["phone", "Teléfono", 3], ["address1", "Dirección", 6], ["city", "Ciudad", 3], ["state", "Estado", 1], ["zip", "Zip", 2]] as const).map(([k, label, span]) => (
              <Field key={k} label={label} className={`col-span-${span}`}>
                <Input value={company.extra?.[k] ?? ""} onChange={(e) => setCompany({ ...company, extra: { ...company.extra, [k]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Programas ──────────────────────────────────────────────────────

const KIND_LABEL: Record<RequirementKind, string> = { exam: "Exam (parcial / final)", written: "Written (quiz / tarea)", practical: "Requirement (unidades)" };

function ProgramsTab() {
  const { db, save } = useStore();
  const [edit, setEdit] = useState<Program | null>(null);
  const blank = (): Program => ({
    id: uid(), code: "", name: "", unitType: "clock", totalHours: 0, active: true,
    costs: costsFrom(0, 150, 0, uid), gradeScale: DEFAULT_GRADE_SCALE, requirements: [], sap: defaultSap(), midpoints: [],
  });
  const copy = (p: Program): Program => ({
    ...structuredClone(p), id: uid(), code: p.code + "-2", name: p.name + " (copia)", copiedFrom: p.id,
    costs: p.costs.map((c) => ({ ...c, id: uid() })), requirements: p.requirements.map((r) => ({ ...r, id: uid() })),
  });
  const unverified = db.programs.filter((p) => !p.sap.verified).length;
  return (
    <div className="space-y-3">
      {unverified > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {unverified} programa(s) tienen valores de SAP y midpoints <b>de ejemplo</b>. Confírmalos en la pestaña "SAP y midpoints" de cada programa.
        </div>
      )}
      <Card title="Programas" actions={<Button size="sm" onClick={() => setEdit(blank())}><Plus size={13} /> Agregar programa</Button>}>
        <Table>
          <thead><tr><Th>Código</Th><Th>Nombre</Th><Th className="text-right">Largo</Th><Th className="text-right">Costo total</Th><Th>Exam / Written</Th><Th>Requirements</Th><Th>SAP</Th><Th>Estado</Th><Th></Th></tr></thead>
          <tbody>
            {db.programs.map((p) => (
              <tr key={p.id}>
                <Td className="font-mono text-xs">{p.code}</Td>
                <Td className="font-medium">{p.name}</Td>
                <Td className="text-right tabular-nums">{p.totalHours} {p.unitType === "clock" ? "h" : "cr"}</Td>
                <Td className="text-right tabular-nums">{money(programTotal(p))}</Td>
                <Td>{p.requirements.filter((r) => r.kind !== "practical").length}</Td>
                <Td>{p.requirements.filter((r) => r.kind === "practical").length}</Td>
                <Td>{p.sap.verified ? <Badge tone="green">Confirmado</Badge> : <Badge tone="amber">Ejemplo</Badge>}</Td>
                <Td>{p.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</Td>
                <Td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(p)}><Pencil size={13} /> Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(copy(p))}><Copy size={13} /> Copiar</Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {edit && <ProgramModal p={edit} onClose={() => setEdit(null)} onSave={(p) => { save("programs", p); setEdit(null); }} />}
    </div>
  );
}

type ProgramTab = "info" | "costs" | "grades" | "academics" | "sap";

function ProgramModal({ p: initial, onClose, onSave }: { p: Program; onClose: () => void; onSave: (p: Program) => void }) {
  const { db } = useStore();
  const [p, setP] = useState(initial);
  const [tab, setTab] = useState<ProgramTab>("info");
  const [mids, setMids] = useState(initial.midpoints.join(", "));
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const setReq = (i: number, patch: Partial<Requirement>) => setP({ ...p, requirements: p.requirements.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const setCost = (i: number, patch: Partial<ProgramCost>) => setP({ ...p, costs: p.costs.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setBand = (i: number, patch: Partial<GradeBand>) => setP({ ...p, gradeScale: p.gradeScale.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setSap = (patch: Partial<SapPolicy>) => setP({ ...p, sap: { ...p.sap, ...patch } });
  const setLevel = (area: "academic" | "attendance", k: keyof SapLevels, v: number) => setSap({ [area]: { ...p.sap[area], [k]: v } });
  const weightReq = 100 - p.sap.weightExam - p.sap.weightWritten;
  const errors = [
    !p.code && "Falta el código.",
    !p.name && "Falta el nombre.",
    !p.totalHours && "Falta el largo del programa.",
    weightReq < 0 && "Los pesos de Exam y Written suman más de 100%.",
    (["academic", "attendance"] as const).some((a) => !(p.sap[a].critical <= p.sap[a].ok && p.sap[a].ok <= p.sap[a].superior)) && "En SAP, Critical ≤ OK ≤ Superior.",
  ].filter(Boolean) as string[];
  const accounts = activeOptions(db, "account");
  const unit = p.unitType === "clock" ? "horas" : "créditos";

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={initial.name ? `Programa · ${initial.name}` : "Nuevo programa"}
      footer={
        <>
          {errors[0] && <span className="mr-auto self-center text-xs text-red-600">{errors[0]}</span>}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!!errors.length} onClick={() => onSave({ ...p, midpoints: mids.split(",").map((x) => Number(x.trim())).filter((x) => x > 0).sort((a, b) => a - b).slice(0, 10) })}>Guardar</Button>
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={(t) => setTab(t as ProgramTab)}
        tabs={[{ id: "info", label: "Información" }, { id: "costs", label: "Costos" }, { id: "grades", label: "Escala de notas" }, { id: "academics", label: "Académico" }, { id: "sap", label: "SAP y midpoints" }]}
      />
      <div className="pt-4">
        {tab === "info" && (
          <div className="grid grid-cols-6 gap-3">
            <Field label="Código" className="col-span-1"><Input value={p.code} onChange={(e) => setP({ ...p, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Nombre" className="col-span-4"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
            <Field label="Activo" className="col-span-1" hint="Inactivo = no se puede inscribir."><Select value={p.active ? "1" : "0"} onChange={(e) => setP({ ...p, active: e.target.value === "1" })}><option value="1">Sí</option><option value="0">No</option></Select></Field>
            <Field label="Se mide en" className="col-span-2"><Select value={p.unitType} onChange={(e) => setP({ ...p, unitType: e.target.value as Program["unitType"] })}><option value="clock">Horas reloj</option><option value="credit">Créditos</option></Select></Field>
            <Field label={`Largo del programa (${unit})`} className="col-span-2"><Input type="number" value={p.totalHours || ""} onChange={(e) => setP({ ...p, totalHours: Number(e.target.value) })} /></Field>
            <Field label={`Exit Analysis (${unit})`} hint="Revisión informal antes de graduar." className="col-span-2"><Input type="number" value={p.exitAnalysisUnits ?? ""} onChange={(e) => setP({ ...p, exitAnalysisUnits: num(e.target.value) })} /></Field>
            <Field label={`Año académico (${unit})`} hint="Unidades mínimas para medir el progreso." className="col-span-2"><Input type="number" value={p.academicYearUnits ?? ""} onChange={(e) => setP({ ...p, academicYearUnits: num(e.target.value) })} /></Field>
            <Field label="Acreditadora" className="col-span-4"><Input value={p.accreditor ?? ""} onChange={(e) => setP({ ...p, accreditor: e.target.value })} placeholder="Opcional" /></Field>
            <Field label="Acreditado desde" className="col-span-3"><Input type="date" value={p.accreditationFrom ?? ""} onChange={(e) => setP({ ...p, accreditationFrom: e.target.value })} /></Field>
            <Field label="Acreditado hasta" className="col-span-3"><Input type="date" value={p.accreditationTo ?? ""} onChange={(e) => setP({ ...p, accreditationTo: e.target.value })} /></Field>
          </div>
        )}

        {tab === "costs" && (
          <div>
            <p className="mb-3 text-xs text-slate-500">
              <b>Cargar al inscribir</b>: el costo entra solo al ledger cuando se crea el estudiante. <b>Institucional</b>: cuenta en el cálculo de reembolso.
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_110px_140px_90px_90px_auto] gap-2 text-xs font-medium text-slate-500"><span>Concepto</span><span>Monto</span><span>Cuenta</span><span>Al inscribir</span><span>Institucional</span><span /></div>
              {p.costs.map((c, i) => (
                <div key={c.id} className="grid grid-cols-[1fr_110px_140px_90px_90px_auto] items-center gap-2">
                  <Input value={c.description} onChange={(e) => setCost(i, { description: e.target.value })} />
                  <Input type="number" value={c.amount} onChange={(e) => setCost(i, { amount: Number(e.target.value) })} />
                  <Select value={c.account} onChange={(e) => setCost(i, { account: e.target.value })}>
                    {activeOptions(db, "account", c.account).map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
                  </Select>
                  <input type="checkbox" className="justify-self-center" checked={c.autoPost} onChange={(e) => setCost(i, { autoPost: e.target.checked })} aria-label="Cargar al inscribir" />
                  <input type="checkbox" className="justify-self-center" checked={c.institutional} onChange={(e) => setCost(i, { institutional: e.target.checked })} aria-label="Institucional" />
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setP({ ...p, costs: p.costs.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Button size="sm" variant="secondary" onClick={() => setP({ ...p, costs: [...p.costs, { id: uid(), description: "", amount: 0, account: accounts[0]?.value ?? "", autoPost: true, institutional: true }] })}><Plus size={13} /> Agregar costo</Button>
              <span className="text-sm">Total: <b className="tabular-nums">{money(programTotal(p))}</b></span>
            </div>
          </div>
        )}

        {tab === "grades" && (
          <div className="max-w-md">
            <p className="mb-3 text-xs text-slate-500">Al escribir el % de una nota, la letra se calcula sola con esta escala.</p>
            <div className="space-y-2">
              <div className="grid grid-cols-[70px_1fr_1fr_auto] gap-2 text-xs font-medium text-slate-500"><span>Letra</span><span>% mínimo</span><span>% máximo</span><span /></div>
              {p.gradeScale.map((b, i) => (
                <div key={i} className="grid grid-cols-[70px_1fr_1fr_auto] items-center gap-2">
                  <Input value={b.letter} onChange={(e) => setBand(i, { letter: e.target.value.toUpperCase() })} />
                  <Input type="number" value={b.min} onChange={(e) => setBand(i, { min: Number(e.target.value) })} />
                  <Input type="number" value={b.max} onChange={(e) => setBand(i, { max: Number(e.target.value) })} />
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setP({ ...p, gradeScale: p.gradeScale.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setP({ ...p, gradeScale: [...p.gradeScale, { letter: "", min: 0, max: 0 }] })}><Plus size={13} /> Agregar letra</Button>
              <Button size="sm" variant="ghost" onClick={() => setP({ ...p, gradeScale: DEFAULT_GRADE_SCALE })}>Restaurar A–F</Button>
            </div>
          </div>
        )}

        {tab === "academics" && (
          <div>
            <p className="mb-3 text-xs text-slate-500">
              <b>Exam</b>: parciales y finales (un intento). <b>Written</b>: quizzes y tareas. <b>Requirement</b>: prácticas que se repiten varias veces (unidades).
              Desactivar una no la quita a los estudiantes que ya la tienen.
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_190px_90px_60px_auto] gap-2 text-xs font-medium text-slate-500"><span>Nombre</span><span>Tipo</span><span>Unidades</span><span>Activa</span><span /></div>
              {p.requirements.map((r, i) => (
                <div key={r.id} className="grid grid-cols-[1fr_190px_90px_60px_auto] items-center gap-2">
                  <Input value={r.name} placeholder="Nombre" onChange={(e) => setReq(i, { name: e.target.value })} />
                  <Select value={r.kind} onChange={(e) => { const kind = e.target.value as RequirementKind; setReq(i, { kind, unitsRequired: kind === "practical" ? Math.max(1, r.unitsRequired) : 1 }); }}>
                    {(Object.keys(KIND_LABEL) as RequirementKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </Select>
                  <Input type="number" min={1} disabled={r.kind !== "practical"} value={r.kind === "practical" ? r.unitsRequired : 1} onChange={(e) => setReq(i, { unitsRequired: Number(e.target.value) })} />
                  <input type="checkbox" className="justify-self-center" checked={r.active !== false} onChange={(e) => setReq(i, { active: e.target.checked })} aria-label="Activa" />
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setP({ ...p, requirements: p.requirements.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => setP({ ...p, requirements: [...p.requirements, { id: uid(), name: "", kind: "written", unitsRequired: 1, active: true }] })}><Plus size={13} /> Agregar</Button>
          </div>
        )}

        {tab === "sap" && (
          <div className="space-y-4">
            <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${p.sap.verified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              <input type="checkbox" className="mt-0.5" checked={p.sap.verified} onChange={(e) => setSap({ verified: e.target.checked })} />
              <span>{p.sap.verified ? "Valores confirmados por la escuela." : "Valores de ejemplo. Márcalo cuando la escuela confirme los mínimos, los pesos y los midpoints."}</span>
            </label>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead><tr className="text-xs text-slate-500"><th className="pr-3 text-left font-medium">Mínimo (%)</th><th className="px-2 font-medium">Critical</th><th className="px-2 font-medium">OK</th><th className="px-2 font-medium">Superior</th></tr></thead>
                <tbody>
                  {([["academic", "Académico (notas ponderadas)"], ["attendance", "Asistencia (horas asistidas / programadas)"]] as const).map(([area, label]) => (
                    <tr key={area}>
                      <td className="py-1 pr-3 text-slate-700">{label}</td>
                      {(["critical", "ok", "superior"] as const).map((k) => (
                        <td key={k} className="px-2 py-1"><Input className="w-20" type="number" value={p.sap[area][k]} onChange={(e) => setLevel(area, k, Number(e.target.value))} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid max-w-xl grid-cols-3 gap-3">
              <Field label="Peso Exam (%)"><Input type="number" value={p.sap.weightExam} onChange={(e) => setSap({ weightExam: Number(e.target.value) })} /></Field>
              <Field label="Peso Written (%)"><Input type="number" value={p.sap.weightWritten} onChange={(e) => setSap({ weightWritten: Number(e.target.value) })} /></Field>
              <Field label="Peso Requirement (%)" hint="Se calcula: 100 − los otros dos."><Input disabled value={weightReq} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={p.sap.excusedCountsAsAttended} onChange={(e) => setSap({ excusedCountsAsAttended: e.target.checked })} /> Contar horas excusadas como asistidas
            </label>
            <Field label={`Midpoints (${unit}, separados por coma, máx. 10)`} hint="Al llegar a cada uno se revisa el SAP del estudiante.">
              <Input value={mids} onChange={(e) => setMids(e.target.value)} placeholder="Ej. 90, 175, 260" />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SchedulesTab() {
  const { db, save } = useStore();
  const [edit, setEdit] = useState<Schedule | null>(null);
  return (
    <Card title="Horarios" actions={<Button size="sm" onClick={() => setEdit({ id: uid(), name: "", days: [1, 2, 3, 4], start: "09:00", end: "13:00", breakMinutes: 0 })}><Plus size={13} /> Agregar</Button>}>
      <Table>
        <thead><tr><Th>Nombre</Th><Th>Días</Th><Th>Horas</Th><Th>Break</Th><Th className="text-right">Horas / semana</Th><Th></Th></tr></thead>
        <tbody>
          {db.schedules.map((s) => (
            <tr key={s.id}>
              <Td className="font-medium">{s.name}</Td>
              <Td>{s.days.map((d) => DAY_SHORT[d]).join(", ")}</Td>
              <Td>{s.start} – {s.end}</Td>
              <Td>{s.breakMinutes} min</Td>
              <Td className="text-right tabular-nums">{weeklyHours(s)}</Td>
              <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(s)}><Pencil size={13} /> Editar</Button></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Horario" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.name || !edit.days.length} onClick={() => { save("schedules", edit); setEdit(null); }}>Guardar</Button></>}>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Nombre" className="col-span-3"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value.toUpperCase() })} /></Field>
            <div className="col-span-3 flex flex-wrap gap-3">
              {DAY_SHORT.map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={edit.days.includes(i)} onChange={(e) => setEdit({ ...edit, days: e.target.checked ? [...edit.days, i].sort() : edit.days.filter((x) => x !== i) })} /> {d}
                </label>
              ))}
            </div>
            <Field label="Entrada"><Input type="time" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
            <Field label="Salida"><Input type="time" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field>
            <Field label="Break (min)"><Input type="number" value={edit.breakMinutes} onChange={(e) => setEdit({ ...edit, breakMinutes: Number(e.target.value) })} /></Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function HolidaysTab() {
  const { db, save, remove } = useStore();
  const blank = (): Holiday => ({ id: uid(), date: today(), description: "", programId: "", start: "", end: "" });
  const [h, setH] = useState<Holiday>(blank);
  const [partial, setPartial] = useState(false);
  const invalid = !h.description || (partial && (!h.start || !h.end || h.start >= h.end));
  const add = () => {
    save("holidays", { ...h, programId: h.programId || undefined, start: partial ? h.start : undefined, end: partial ? h.end : undefined });
    setH({ ...blank(), date: h.date });
  };
  // Al elegir "cierre parcial" se proponen la primera entrada y la última salida de los horarios.
  const togglePartial = (on: boolean) => {
    setPartial(on);
    if (on && !h.start) {
      const starts = db.schedules.map((s) => s.start).sort();
      const ends = db.schedules.map((s) => s.end).sort();
      setH({ ...h, start: starts[0] ?? "09:00", end: ends[ends.length - 1] ?? "22:00" });
    }
  };
  return (
    <Card title="Feriados y ajustes (Holidays / Adjustments)">
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3">
        <Field label="Fecha"><Input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /></Field>
        <Field label="Descripción"><Input value={h.description} placeholder="Ej. Thanksgiving, tormenta" onChange={(e) => setH({ ...h, description: e.target.value })} /></Field>
        <Field label="Programa">
          <Select value={h.programId} onChange={(e) => setH({ ...h, programId: e.target.value })}>
            <option value="">Todos los programas</option>
            {db.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <label className="mb-2 flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={partial} onChange={(e) => togglePartial(e.target.checked)} /> Solo unas horas</label>
        {partial && (
          <>
            <Field label="Desde"><Input type="time" value={h.start} onChange={(e) => setH({ ...h, start: e.target.value })} /></Field>
            <Field label="Hasta"><Input type="time" value={h.end} onChange={(e) => setH({ ...h, end: e.target.value })} /></Field>
          </>
        )}
        <Button disabled={invalid} onClick={add}><Plus size={15} /> Agregar</Button>
      </div>
      <Table>
        <thead><tr><Th>Fecha</Th><Th>Descripción</Th><Th>Programa</Th><Th>Horas cerradas</Th><Th></Th></tr></thead>
        <tbody>
          {[...db.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((x) => (
            <tr key={x.id}>
              <Td>{fmtDate(x.date)}</Td>
              <Td>{x.description}</Td>
              <Td>{x.programId ? db.programs.find((p) => p.id === x.programId)?.name ?? "—" : "Todos"}</Td>
              <Td>{x.start && x.end ? `${x.start} – ${x.end}` : "Día completo"}</Td>
              <Td className="text-right"><button className="text-slate-400 hover:text-red-600" onClick={() => remove("holidays", x.id)} aria-label="Eliminar"><Trash2 size={14} /></button></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="px-4 py-2 text-xs text-slate-400">
        Los feriados y ajustes bajan las horas <b>programadas</b> (no cuentan como ausencia ni para la graduación proyectada). Nunca cambian las horas asistidas.
        Un cierre parcial solo descuenta el tramo que se cruza con cada horario: por ejemplo, cerrar de 17:00 a 22:00 afecta a la noche y no a la mañana.
      </p>
    </Card>
  );
}

const AREAS: { id: Area; label: string }[] = [
  { id: "dashboard", label: "Dashboard" }, { id: "crm", label: "CRM" }, { id: "marketing", label: "Marketing" }, { id: "enrollments", label: "Inscripciones" }, { id: "students", label: "Estudiantes" },
  { id: "billing", label: "Cobros" }, { id: "attendance", label: "Asistencia" }, { id: "reports", label: "Reportes" }, { id: "settings", label: "Configuración" },
];

function UsersTab() {
  const { db, save } = useStore();
  const [edit, setEdit] = useState<User | null>(null);
  return (
    <div className="space-y-4">
      <Card title="Usuarios (User Security)" actions={<Button size="sm" onClick={() => setEdit({ id: uid(), name: "", email: "", role: "admissions", active: true })}><Plus size={13} /> Agregar usuario</Button>}>
        <Table>
          <thead><tr><Th>Nombre</Th><Th>Email</Th><Th>Rol</Th><Th>Estado</Th><Th></Th></tr></thead>
          <tbody>
            {db.users.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.name}</Td><Td>{u.email}</Td><Td>{ROLE_LABEL[u.role]}</Td>
                <Td>{u.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</Td>
                <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(u)}><Pencil size={13} /> Editar</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card title="Permisos por rol">
        <Table>
          <thead><tr><Th>Rol</Th>{AREAS.map((a) => <Th key={a.id} className="text-center">{a.label}</Th>)}</tr></thead>
          <tbody>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <tr key={r}><Td className="font-medium">{ROLE_LABEL[r]}</Td>{AREAS.map((a) => <Td key={a.id} className="text-center">{canAccess(r, a.id) ? "✓" : ""}</Td>)}</tr>
            ))}
          </tbody>
        </Table>
        <p className="px-4 py-2 text-xs text-slate-400">SSN, licencia y datos de ayuda financiera solo los ven Dueño, Administrador y Registro académico. Los instructores solo ven a sus estudiantes y no ven pagos.</p>
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Usuario" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.name || !edit.email} onClick={() => { save("users", edit); setEdit(null); }}>Guardar</Button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" className="col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Email" className="col-span-2"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Rol"><Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
            <Field label="Estado"><Select value={edit.active ? "1" : "0"} onChange={(e) => setEdit({ ...edit, active: e.target.value === "1" })}><option value="1">Activo</option><option value="0">Inactivo</option></Select></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

const TEMPLATE_INFO: Record<string, { name: string; vars: string }> = {
  zelle_reminder: { name: "Recordatorio de pago Zelle", vars: "nombre, monto, fecha, programa, zelle, badge" },
  autopay_receipt: { name: "Recibo de cobro automático", vars: "nombre, monto, recibo, tarjeta, balance" },
  enrollment_link: { name: "Link de inscripción (CRM)", vars: "nombre, programa, link, asesor" },
  lead_followup: { name: "Seguimiento de lead", vars: "nombre, programa, asesor" },
  absence_alert: { name: "Alerta de ausencias", vars: "nombre, dias" },
  resume_enrollment: { name: "Continuar inscripción", vars: "nombre, paso, link" },
};

function TemplatesTab() {
  const { db, updateSettings } = useStore();
  const toast = useToast();
  const [tpls, setTpls] = useState(db.settings.templates);
  return (
    <div className="space-y-4">
      {Object.entries(TEMPLATE_INFO).map(([k, info]) => (
        <Card key={k} title={info.name}>
          <div className="space-y-3 p-4">
            <Field label="Asunto"><Input value={tpls[k]?.subject ?? ""} onChange={(e) => setTpls({ ...tpls, [k]: { ...tpls[k], subject: e.target.value } })} /></Field>
            <Field label="Mensaje" hint={`Variables: ${info.vars.split(", ").map((v) => `{{${v}}}`).join(" ")}`}>
              <Textarea rows={6} value={tpls[k]?.body ?? ""} onChange={(e) => setTpls({ ...tpls, [k]: { ...tpls[k], body: e.target.value } })} />
            </Field>
          </div>
        </Card>
      ))}
      <div className="flex justify-end"><Button onClick={() => { updateSettings({ templates: tpls }); toast("Plantillas guardadas."); }}>Guardar plantillas</Button></div>
    </div>
  );
}

function IntegrationsTab() {
  const sources = [
    { name: "Meta / Facebook Lead Ads", how: "Webhook de Meta (leadgen) → función lead-intake → lead con fuente \"Meta Ads\" y nombre de campaña. Mientras tanto: exporta el CSV de Meta e impórtalo en Datos › Leads.", status: "CSV hoy · webhook en producción" },
    { name: "Formulario web", how: "Formulario bilingüe listo en /#/form (acepta ?utm_campaign=). En producción se incrusta en la web de la escuela y envía a lead-intake.", status: "Listo (demo)" },
    { name: "WhatsApp", how: "Botón de WhatsApp en cada lead (abre wa.me y registra la actividad). En producción: WhatsApp Business API para crear leads con cada mensaje nuevo.", status: "Manual hoy · API en producción" },
    { name: "Llamadas", how: "Se registran como lead (fuente Llamada) y como actividad. Opcional: integrar la central telefónica.", status: "Manual" },
    { name: "Walk-in / referidos", how: "Alta manual desde el CRM con fuente Walk-in o Referido.", status: "Manual" },
  ];
  return (
    <Card title="Cómo llegan los leads al CRM">
      <ul className="divide-y divide-slate-100">
        {sources.map((s) => (
          <li key={s.name} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2"><span className="font-medium text-slate-800">{s.name}</span><Badge tone="blue">{s.status}</Badge></div>
            <p className="mt-1 text-sm text-slate-600">{s.how}</p>
          </li>
        ))}
      </ul>
      <p className="px-4 pb-3 text-xs text-slate-400">Detalle técnico en docs/INTEGRACIONES.md.</p>
    </Card>
  );
}

function DataTab() {
  const { db, replaceDB, resetDemo } = useStore();
  const toast = useToast();
  return (
    <div className="space-y-4">
      <ImportData />
      <Card title="Respaldo (Backup Database)">
        <div className="flex flex-wrap gap-2 p-4">
          <Button variant="secondary" onClick={() => downloadFile(`fmais-respaldo-${today()}.json`, JSON.stringify(db), "application/json")}><Download size={15} /> Descargar respaldo</Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload size={15} /> Restaurar respaldo
            <input type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const next = JSON.parse(await f.text());
                if (!next.students || !next.settings) throw new Error();
                if (confirm("Esto reemplaza todos los datos actuales. ¿Continuar?")) { replaceDB(next); toast("Respaldo restaurado."); }
              } catch {
                toast("El archivo no es un respaldo válido.");
              }
              e.target.value = "";
            }} />
          </label>
          <Button variant="danger" onClick={() => confirm("¿Borrar todo y regenerar los datos de demostración?") && (resetDemo(), toast("Datos de demo regenerados."))}><RotateCcw size={15} /> Reiniciar demo</Button>
        </div>
        <p className="px-4 pb-4 text-xs text-slate-400">
          {db.students.length} estudiantes · {db.leads.length} leads · {db.attendance.length} registros de asistencia · {db.ledger.length} movimientos de ledger. Los datos de la demo viven solo en este navegador.
        </p>
      </Card>
    </div>
  );
}
