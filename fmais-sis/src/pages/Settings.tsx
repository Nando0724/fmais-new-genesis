import { Copy, Download, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import ImportData from "../components/ImportData";
import { useToast } from "../components/Layout";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Tabs, Td, Textarea, Th } from "../components/ui";
import { weeklyHours } from "../lib/calc";
import { canAccess, useStore, type Area } from "../lib/store";
import type { Program, Requirement, RequirementKind, Role, Schedule, Settings, User } from "../lib/types";
import { DAY_SHORT, downloadFile, fmtDate, money, ROLE_LABEL, today, uid } from "../lib/utils";

type Tab = "school" | "programs" | "schedules" | "holidays" | "users" | "templates" | "automation" | "integrations" | "data";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("school");
  return (
    <div>
      <PageHeader title="Configuración" subtitle="Equivale a Maintenance y Options de Genesis." />
      <Tabs
        value={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: "school", label: "Escuela" }, { id: "programs", label: "Programas" }, { id: "schedules", label: "Horarios" }, { id: "holidays", label: "Feriados" },
          { id: "users", label: "Usuarios y roles" }, { id: "templates", label: "Plantillas de email" }, { id: "automation", label: "Automatizaciones" },
          { id: "integrations", label: "Fuentes de leads" }, { id: "data", label: "Datos e importación" },
        ]}
      />
      <div className="mt-4">
        {tab === "school" && <SchoolTab />}
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

function SettingsForm({ fields }: { fields: { key: keyof Settings; label: string; type?: string; hint?: string }[] }) {
  const { db, updateSettings } = useStore();
  const toast = useToast();
  const [d, setD] = useState(db.settings);
  return (
    <Card>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <Input type={f.type ?? "text"} value={d[f.key] as string | number} onChange={(e) => setD({ ...d, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="flex justify-end border-t border-slate-100 px-4 py-3">
        <Button onClick={() => { updateSettings(Object.fromEntries(fields.map((f) => [f.key, d[f.key]]))); toast("Configuración guardada."); }}>Guardar</Button>
      </div>
    </Card>
  );
}

const SchoolTab = () => (
  <SettingsForm
    fields={[
      { key: "schoolName", label: "Nombre de la escuela" }, { key: "address", label: "Dirección" }, { key: "phone", label: "Teléfono" }, { key: "email", label: "Email" },
      { key: "zelleRecipient", label: "Destinatario Zelle", hint: "Aparece en los recordatorios de pago." },
      { key: "enrollmentPortalUrl", label: "URL del portal de inscripción", hint: "Se usa en los links que se envían a los leads." },
    ]}
  />
);

const AutomationTab = () => (
  <SettingsForm
    fields={[
      { key: "absenceThreshold", label: "Alerta de ausencias consecutivas (días de clase)", type: "number", hint: "Check Consecutive Absences de Genesis." },
      { key: "aboutToGradHours", label: "\"Por graduar\" cuando falten (horas)", type: "number", hint: "Check for Students About To Grad." },
      { key: "reminderDaysBefore", label: "Recordatorio Zelle: días antes del vencimiento", type: "number" },
      { key: "leadResponseMinutes", label: "Tiempo máximo para primer contacto de un lead (min)", type: "number", hint: "Los leads que lo superan se marcan en rojo en el CRM." },
    ]}
  />
);

function ProgramsTab() {
  const { db, save } = useStore();
  const [edit, setEdit] = useState<Program | null>(null);
  const blank = (): Program => ({ id: uid(), code: "", name: "", totalHours: 0, tuition: 0, registrationFee: 150, suppliesFee: 0, active: true, requirements: [], midpoints: [] });
  return (
    <Card title="Programas" actions={<Button size="sm" onClick={() => setEdit(blank())}><Plus size={13} /> Agregar programa</Button>}>
      <Table>
        <thead><tr><Th>Código</Th><Th>Nombre</Th><Th className="text-right">Horas</Th><Th className="text-right">Costo total</Th><Th>Exámenes</Th><Th>Prácticos</Th><Th>Midpoints</Th><Th>Estado</Th><Th></Th></tr></thead>
        <tbody>
          {db.programs.map((p) => (
            <tr key={p.id}>
              <Td className="font-mono text-xs">{p.code}</Td>
              <Td className="font-medium">{p.name}</Td>
              <Td className="text-right tabular-nums">{p.totalHours}</Td>
              <Td className="text-right tabular-nums">{money(p.tuition + p.registrationFee + p.suppliesFee)}</Td>
              <Td>{p.requirements.filter((r) => r.kind !== "practical").length}</Td>
              <Td>{p.requirements.filter((r) => r.kind === "practical").length}</Td>
              <Td className="text-xs">{p.midpoints.join(", ") || "—"}</Td>
              <Td>{p.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</Td>
              <Td className="whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" onClick={() => setEdit(p)}><Pencil size={13} /> Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...p, id: uid(), code: p.code + "-2", name: p.name + " (copia)", requirements: p.requirements.map((r) => ({ ...r, id: uid() })) })}><Copy size={13} /> Copiar</Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {edit && <ProgramModal p={edit} onClose={() => setEdit(null)} onSave={(p) => { save("programs", p); setEdit(null); }} />}
    </Card>
  );
}

function ProgramModal({ p: initial, onClose, onSave }: { p: Program; onClose: () => void; onSave: (p: Program) => void }) {
  const [p, setP] = useState(initial);
  const [mids, setMids] = useState(initial.midpoints.join(", "));
  const setReq = (i: number, patch: Partial<Requirement>) => setP({ ...p, requirements: p.requirements.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={initial.name ? `Programa · ${initial.name}` : "Nuevo programa"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!p.code || !p.name || !p.totalHours} onClick={() => onSave({ ...p, midpoints: mids.split(",").map((x) => Number(x.trim())).filter((x) => x > 0).slice(0, 10) })}>Guardar</Button></>}
    >
      <div className="grid grid-cols-6 gap-3">
        <Field label="Código" className="col-span-1"><Input value={p.code} onChange={(e) => setP({ ...p, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Nombre" className="col-span-4"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label="Activo" className="col-span-1"><Select value={p.active ? "1" : "0"} onChange={(e) => setP({ ...p, active: e.target.value === "1" })}><option value="1">Sí</option><option value="0">No</option></Select></Field>
        <Field label="Horas totales" className="col-span-2"><Input type="number" value={p.totalHours} onChange={(e) => setP({ ...p, totalHours: Number(e.target.value) })} /></Field>
        <Field label="Matrícula (tuition)" className="col-span-2"><Input type="number" value={p.tuition} onChange={(e) => setP({ ...p, tuition: Number(e.target.value) })} /></Field>
        <Field label="Registration fee" className="col-span-1"><Input type="number" value={p.registrationFee} onChange={(e) => setP({ ...p, registrationFee: Number(e.target.value) })} /></Field>
        <Field label="Supplies" className="col-span-1"><Input type="number" value={p.suppliesFee} onChange={(e) => setP({ ...p, suppliesFee: Number(e.target.value) })} /></Field>
        <Field label="Midpoints (horas, separadas por coma, máx. 10)" className="col-span-6"><Input value={mids} onChange={(e) => setMids(e.target.value)} placeholder="Ej. 90, 175, 260" /></Field>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Exámenes y requisitos</h4>
        <Button size="sm" variant="secondary" onClick={() => setP({ ...p, requirements: [...p.requirements, { id: uid(), name: "", kind: "written", unitsRequired: 0 }] })}><Plus size={13} /> Agregar</Button>
      </div>
      <div className="mt-2 space-y-2">
        {p.requirements.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[1fr_150px_110px_auto] items-center gap-2">
            <Input value={r.name} placeholder="Nombre" onChange={(e) => setReq(i, { name: e.target.value })} />
            <Select value={r.kind} onChange={(e) => setReq(i, { kind: e.target.value as RequirementKind })}>
              <option value="written">Examen escrito</option><option value="exam">Examen práctico</option><option value="practical">Requisito (unidades)</option>
            </Select>
            <Input type="number" disabled={r.kind !== "practical"} value={r.unitsRequired} onChange={(e) => setReq(i, { unitsRequired: Number(e.target.value) })} />
            <button className="text-slate-400 hover:text-red-600" onClick={() => setP({ ...p, requirements: p.requirements.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 size={15} /></button>
          </div>
        ))}
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
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState("");
  return (
    <Card title="Feriados y ajustes (Holidays / Adjustments)">
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3">
        <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Descripción"><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Button disabled={!desc} onClick={() => { save("holidays", { id: uid(), date, description: desc }); setDesc(""); }}><Plus size={15} /> Agregar</Button>
      </div>
      <Table>
        <thead><tr><Th>Fecha</Th><Th>Descripción</Th><Th></Th></tr></thead>
        <tbody>
          {[...db.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
            <tr key={h.id}><Td>{fmtDate(h.date)}</Td><Td>{h.description}</Td><Td className="text-right"><button className="text-slate-400 hover:text-red-600" onClick={() => remove("holidays", h.id)} aria-label="Eliminar"><Trash2 size={14} /></button></Td></tr>
          ))}
        </tbody>
      </Table>
      <p className="px-4 py-2 text-xs text-slate-400">Los feriados no cuentan como ausencia ni como día de clase para la graduación proyectada.</p>
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
