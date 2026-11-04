import { Link2, Pencil, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { consentState, segmentContacts, toContact } from "../lib/marketing";
import { useStore } from "../lib/store";
import { LEAD_SOURCES, LEAD_STAGES, type Audience, type EnrollmentStatus, type Lead, type MarketingTemplate, type Segment, type Student } from "../lib/types";
import { displayName, fmtDate, fmtDateTime, nowISO, SOURCE_LABEL, STAGE_LABEL, uid } from "../lib/utils";
import { STATUS_LABEL } from "../pages/Students";
import { useToast } from "./Layout";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Table, Td, Textarea, Th, type Tone } from "./ui";

const LOST_REASONS = ["Precio", "Horario no le sirve", "Eligió otra escuela", "No contesta", "No califica", "Otro"];

function Checks<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T[] | undefined; onChange: (v: T[]) => void; label: string }) {
  const v = value ?? [];
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600">{label} <span className="text-slate-400">(ninguno = todos)</span></div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={v.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...v, o.id] : v.filter((x) => x !== o.id))} /> {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function filterSummary(s: Segment, programs: { id: string; code: string }[]) {
  const f = s.filters;
  const parts: string[] = [];
  if (f.stages?.length) parts.push(f.stages.map((x) => STAGE_LABEL[x]).join(", "));
  if (f.sources?.length) parts.push(f.sources.map((x) => SOURCE_LABEL[x]).join(", "));
  if (f.lostReasons?.length) parts.push(`motivo: ${f.lostReasons.join(", ")}`);
  if (f.studentStatuses?.length) parts.push(f.studentStatuses.map((x) => STATUS_LABEL[x]).join(", "));
  if (f.programIds?.length) parts.push(f.programIds.map((id) => programs.find((p) => p.id === id)?.code).join(", "));
  if (f.language) parts.push(f.language === "es" ? "español" : "inglés");
  if (f.createdWithinDays) parts.push(`creados en los últimos ${f.createdWithinDays} días`);
  if (f.minDaysSinceCreated) parts.push(`con ${f.minDaysSinceCreated}+ días`);
  return parts.join(" · ") || "Todos";
}

export function SegmentsTab() {
  const { db, save } = useStore();
  const [edit, setEdit] = useState<Segment | null>(null);
  const [viewing, setViewing] = useState<Segment | null>(null);
  const rows = useMemo(() => db.segments.map((s) => ({ s, ...segmentContacts(db, s) })), [db]);

  return (
    <Card title="Segmentos" actions={<Button size="sm" onClick={() => setEdit({ id: uid(), name: "", audience: "leads", filters: {} })}><Plus size={13} /> Nuevo segmento</Button>}>
      <Table>
        <thead><tr><Th>Segmento</Th><Th>Público</Th><Th>Filtros</Th><Th className="text-right">Contactos</Th><Th className="text-right">Pueden recibir</Th><Th>Lista en Constant Contact</Th><Th></Th></tr></thead>
        <tbody>
          {rows.map(({ s, all, eligible }) => (
            <tr key={s.id}>
              <Td><div className="font-medium">{s.name}</div>{s.description && <div className="text-xs text-slate-400">{s.description}</div>}</Td>
              <Td>{s.audience === "leads" ? "Leads" : "Estudiantes"}</Td>
              <Td className="max-w-xs text-xs text-slate-500">{filterSummary(s, db.programs)}</Td>
              <Td className="text-right tabular-nums">{all.length}</Td>
              <Td className="text-right tabular-nums font-medium">{eligible.length}</Td>
              <Td className="font-mono text-xs text-slate-400">{s.ccListId ?? "se crea al sincronizar"}</Td>
              <Td className="whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" onClick={() => setViewing(s)}>Ver contactos</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(s)}><Pencil size={13} /></Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {edit && <SegmentModal s={edit} onClose={() => setEdit(null)} onSave={(s) => { save("segments", { ...s, ccListId: s.ccListId ?? `cc_list_${s.id}` }); setEdit(null); }} />}
      {viewing && <SegmentContactsModal s={viewing} onClose={() => setViewing(null)} />}
    </Card>
  );
}

function SegmentModal({ s: initial, onClose, onSave }: { s: Segment; onClose: () => void; onSave: (s: Segment) => void }) {
  const { db } = useStore();
  const [s, setS] = useState(initial);
  const f = s.filters;
  const setF = (patch: Partial<Segment["filters"]>) => setS({ ...s, filters: { ...f, ...patch } });
  const count = segmentContacts(db, s);
  const programs = db.programs.map((p) => ({ id: p.id, label: p.code }));
  return (
    <Modal open wide onClose={onClose} title={initial.name ? `Segmento · ${initial.name}` : "Nuevo segmento"} footer={<><span className="mr-auto text-sm text-slate-500">{count.all.length} contactos · {count.eligible.length} pueden recibir</span><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!s.name} onClick={() => onSave(s)}>Guardar</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Nombre" className="col-span-2"><Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
          <Field label="Público">
            <Select value={s.audience} onChange={(e) => setS({ ...s, audience: e.target.value as Audience, filters: {} })}>
              <option value="leads">Leads del CRM</option><option value="students">Estudiantes y graduados</option>
            </Select>
          </Field>
          <Field label="Descripción" className="col-span-3"><Input value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} /></Field>
        </div>
        {s.audience === "leads" ? (
          <>
            <Checks label="Etapa" options={LEAD_STAGES.map((x) => ({ id: x, label: STAGE_LABEL[x] }))} value={f.stages} onChange={(v) => setF({ stages: v })} />
            <Checks label="Fuente" options={LEAD_SOURCES.map((x) => ({ id: x, label: SOURCE_LABEL[x] }))} value={f.sources} onChange={(v) => setF({ sources: v })} />
            <Checks label="Motivo de pérdida" options={LOST_REASONS.map((x) => ({ id: x, label: x }))} value={f.lostReasons} onChange={(v) => setF({ lostReasons: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Creados en los últimos N días"><Input type="number" min={0} value={f.createdWithinDays ?? ""} onChange={(e) => setF({ createdWithinDays: Number(e.target.value) || undefined })} /></Field>
              <Field label="Con al menos N días desde que llegaron"><Input type="number" min={0} value={f.minDaysSinceCreated ?? ""} onChange={(e) => setF({ minDaysSinceCreated: Number(e.target.value) || undefined })} /></Field>
            </div>
          </>
        ) : (
          <Checks label="Estado" options={(Object.keys(STATUS_LABEL) as EnrollmentStatus[]).map((x) => ({ id: x, label: STATUS_LABEL[x] }))} value={f.studentStatuses} onChange={(v) => setF({ studentStatuses: v })} />
        )}
        <Checks label="Programa" options={programs} value={f.programIds} onChange={(v) => setF({ programIds: v })} />
        <Field label="Idioma">
          <Select value={f.language ?? ""} onChange={(e) => setF({ language: e.target.value as "" | "es" | "en" })} className="w-40">
            <option value="">Ambos</option><option value="es">Español</option><option value="en">Inglés</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function SegmentContactsModal({ s, onClose }: { s: Segment; onClose: () => void }) {
  const { db } = useStore();
  const { all } = segmentContacts(db, s);
  return (
    <Modal open wide onClose={onClose} title={`Contactos · ${s.name}`}>
      <Table>
        <thead><tr><Th>Nombre</Th><Th>Email</Th><Th>Idioma</Th><Th>Consentimiento</Th></tr></thead>
        <tbody>
          {all.map((c) => (
            <tr key={c.id}>
              <Td>{c.audience === "leads" ? <Link className="hover:underline" to={`/crm?lead=${c.id}`}>{displayName(c)}</Link> : <Link className="hover:underline" to={`/students/${c.id}`}>{displayName(c)}</Link>}</Td>
              <Td className="text-xs">{c.email}</Td>
              <Td className="text-xs uppercase">{c.language}</Td>
              <Td><ConsentBadge c={c.raw} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!all.length && <Empty>Sin contactos.</Empty>}
    </Modal>
  );
}

const CONSENT: Record<string, { label: string; tone: Tone }> = {
  ok: { label: "Acepta marketing", tone: "green" },
  no_consent: { label: "Sin consentimiento", tone: "slate" },
  unsubscribed: { label: "Dado de baja", tone: "red" },
  no_email: { label: "Sin email", tone: "amber" },
};

export const ConsentBadge = ({ c }: { c: { marketingOptIn?: boolean; unsubscribedAt?: string; email?: string } }) => {
  const s = CONSENT[consentState(c)];
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

export function TemplatesTab() {
  const { db, save } = useStore();
  const [edit, setEdit] = useState<MarketingTemplate | null>(null);
  const blank = (): MarketingTemplate => ({ id: uid(), name: "", subject: { es: "", en: "" }, body: { es: "Hola {{nombre}},\n\n{{parrafo_ia}}\n\nFMAIS", en: "Hi {{nombre}},\n\n{{parrafo_ia}}\n\nFMAIS" }, cta: { es: "Inscribirme", en: "Enroll" } });
  return (
    <Card title="Templates de marketing" actions={<Button size="sm" onClick={() => setEdit(blank())}><Plus size={13} /> Nuevo template</Button>}>
      <ul className="divide-y divide-slate-100">
        {db.marketingTemplates.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t.name}</div>
              <div className="truncate text-xs text-slate-500">ES: {t.subject.es} · EN: {t.subject.en}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEdit(t)}><Pencil size={13} /> Editar</Button>
          </li>
        ))}
      </ul>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        {"{{parrafo_ia}}"} es el párrafo que el agente escribe para cada contacto. Las demás variables se llenan con datos del CRM: {"{{nombre}} {{programa}} {{proximo_grupo}} {{asesor}} {{link}}"}.
      </p>
      {edit && (
        <Modal open wide onClose={() => setEdit(null)} title={edit.name || "Nuevo template"} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.name} onClick={() => { save("marketingTemplates", edit); setEdit(null); }}>Guardar</Button></>}>
          <Field label="Nombre"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {(["es", "en"] as const).map((l) => (
              <div key={l} className="space-y-2">
                <div className="text-xs font-semibold uppercase text-slate-500">{l === "es" ? "Español" : "English"}</div>
                <Field label="Asunto"><Input value={edit.subject[l]} onChange={(e) => setEdit({ ...edit, subject: { ...edit.subject, [l]: e.target.value } })} /></Field>
                <Field label="Mensaje"><Textarea rows={8} value={edit.body[l]} onChange={(e) => setEdit({ ...edit, body: { ...edit.body, [l]: e.target.value } })} /></Field>
                <Field label="Botón"><Input value={edit.cta[l]} onChange={(e) => setEdit({ ...edit, cta: { ...edit.cta, [l]: e.target.value } })} /></Field>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Card>
  );
}

export function ContactsTab() {
  const { db, saveMany, updateSettings } = useStore();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [kind, setKind] = useState("");
  const contacts = useMemo(
    () =>
      [...db.leads.map((l) => toContact(db, "leads", l)), ...db.students.map((s) => toContact(db, "students", s))]
        // Un estudiante que vino de un lead aparece una sola vez (como estudiante).
        .filter((c) => !(c.audience === "leads" && (c.raw as Lead).studentId))
        .filter((c) => !kind || c.audience === kind)
        .filter((c) => !state || consentState(c.raw) === state)
        .filter((c) => !q || `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q.toLowerCase())),
    [db, q, state, kind],
  );

  const sync = () => {
    const now = nowISO();
    const leads = db.leads.filter((l) => consentState(l) === "ok").map((l) => ({ ...l, ccContactId: l.ccContactId ?? `cc_${l.id}`, ccSyncedAt: now }));
    const students = db.students.filter((s) => consentState(s) === "ok").map((s) => ({ ...s, ccContactId: s.ccContactId ?? `cc_${s.id}`, ccSyncedAt: now }));
    saveMany("leads", leads, "cc:sync");
    saveMany("students", students, "cc:sync");
    updateSettings({ ccLastSyncAt: now });
    toast(`${leads.length + students.length} contactos sincronizados con Constant Contact (simulado).`);
  };

  const counts = { ok: 0, no_consent: 0, unsubscribed: 0, no_email: 0 };
  contacts.forEach((c) => counts[consentState(c.raw)]++);

  return (
    <Card title="Contactos y consentimiento" actions={<Button size="sm" variant="secondary" onClick={sync}><RefreshCw size={13} /> Sincronizar con Constant Contact</Button>}>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
        <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-40"><option value="">Leads y estudiantes</option><option value="leads">Solo leads</option><option value="students">Solo estudiantes</option></Select>
        <Select value={state} onChange={(e) => setState(e.target.value)} className="w-48">
          <option value="">Todos</option><option value="ok">Aceptan marketing ({counts.ok})</option><option value="no_consent">Sin consentimiento</option><option value="unsubscribed">Dados de baja</option>
        </Select>
      </div>
      <Table>
        <thead><tr><Th>Contacto</Th><Th>Tipo</Th><Th>Email</Th><Th>Idioma</Th><Th>Consentimiento</Th><Th>Origen del consentimiento</Th><Th>Constant Contact</Th></tr></thead>
        <tbody>
          {contacts.slice(0, 250).map((c) => {
            const r = c.raw as Lead | Student;
            return (
              <tr key={c.audience + c.id}>
                <Td>{c.audience === "leads" ? <Link className="font-medium hover:underline" to={`/crm?lead=${c.id}`}>{displayName(c)}</Link> : <Link className="font-medium hover:underline" to={`/students/${c.id}?tab=detail`}>{displayName(c)}</Link>}</Td>
                <Td className="text-xs">{c.audience === "leads" ? "Lead" : "Estudiante"}</Td>
                <Td className="text-xs">{c.email}</Td>
                <Td className="text-xs uppercase">{c.language}</Td>
                <Td><ConsentBadge c={r} />{r.unsubscribedAt && <div className="text-[11px] text-slate-400">{fmtDate(r.unsubscribedAt.slice(0, 10))}</div>}</Td>
                <Td className="text-xs text-slate-500">{r.optInSource ? `${r.optInSource} · ${fmtDate(r.optInAt?.slice(0, 10))}` : "—"}</Td>
                <Td className="text-xs">{r.ccContactId ? <span className="text-emerald-700">Sincronizado {fmtDateTime(r.ccSyncedAt)}</span> : <span className="text-slate-400">No se envía</span>}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        El consentimiento se cambia desde la ficha del lead o del estudiante. Las bajas de Constant Contact llegan solas y bloquean el marketing, pero no los recordatorios de pago.
      </p>
    </Card>
  );
}

export function ConnectionTab() {
  const { db, updateSettings } = useStore();
  const st = db.settings;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Conexión">
        <div className="space-y-3 p-4 text-sm">
          <div className="flex items-center gap-2">
            <Link2 size={16} className={st.ccConnected ? "text-emerald-600" : "text-slate-400"} />
            {st.ccConnected ? <><b>Conectado</b> a {st.ccAccountName}</> : <b>Desconectado</b>}
          </div>
          <div className="text-slate-500">Última sincronización: {fmtDateTime(st.ccLastSyncAt)}</div>
          <div className="flex gap-2">
            {st.ccConnected ? (
              <Button variant="secondary" onClick={() => updateSettings({ ccConnected: false })}>Desconectar (demo)</Button>
            ) : (
              <Button onClick={() => updateSettings({ ccConnected: true, ccAccountName: "FMAIS (Constant Contact · demo)", ccLastSyncAt: nowISO() })}>Conectar Constant Contact (demo)</Button>
            )}
          </div>
          <p className="text-xs text-slate-400">En producción este botón abre el inicio de sesión de Constant Contact (OAuth) y el token queda guardado en el servidor.</p>
        </div>
      </Card>
      <Card title="Qué es real y qué es simulado en la demo">
        <ul className="list-disc space-y-1.5 py-4 pl-9 pr-4 text-sm text-slate-600">
          <li>Segmentos, consentimiento, templates, aprobación y el registro en el CRM funcionan como en producción.</li>
          <li>El <b>agente</b> escribe el párrafo personalizado con reglas fijas. En producción lo escribe un modelo de IA con los mismos datos y los mismos límites.</li>
          <li>Los <b>envíos, aperturas, clics y bajas</b> son simulados. No sale ningún email.</li>
          <li>Un clic en el botón del email crea una tarea de llamada para el asesor del lead.</li>
          <li>Los recordatorios de Zelle y los recibos nunca pasan por Constant Contact.</li>
        </ul>
      </Card>
    </div>
  );
}
