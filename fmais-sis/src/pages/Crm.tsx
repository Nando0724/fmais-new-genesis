import { Columns3, ExternalLink, List, Mail, MessageCircle, Phone, Plus, Send, Shuffle, UserCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "../components/Layout";
import ConsentEditor from "../components/ConsentEditor";
import NewStudentModal from "../components/NewStudentModal";
import { Badge, Button, Card, cx, Drawer, Empty, Field, Input, Modal, PageHeader, Select, Table, Tabs, Td, Textarea, Th, type Tone } from "../components/ui";
import { sendTemplate } from "../lib/actions";
import { activeOptions } from "../lib/config";
import { closeFor, FOLLOWUP_LABEL, isOpenLead, isPending, planFor } from "../lib/crm";
import { CrmMetrics, FollowUpList, LeadFollowUps } from "../components/CrmFollowUps";
import { useStore, userName } from "../lib/store";
import { LEAD_SOURCES, LEAD_STAGES, type ActivityType, type FollowUp, type Lead, type LeadSource, type LeadStage } from "../lib/types";
import { ACTIVITY_LABEL, displayName, fmtDate, fmtDateTime, nowISO, SOURCE_LABEL, STAGE_LABEL, today, uid } from "../lib/utils";

const STAGE_TONE: Record<LeadStage, Tone> = { new: "blue", contacted: "violet", tour_scheduled: "amber", toured: "amber", applied: "brand", enrolled: "green", lost: "slate" };
const SOURCE_TONE: Record<LeadSource, Tone> = { meta_ads: "blue", web_form: "violet", whatsapp: "green", phone: "slate", walk_in: "amber", referral: "brand", import: "slate" };

const ageLabel = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
};

export default function Crm() {
  const store = useStore();
  const { db, user, save, saveMany } = store;
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [owner, setOwner] = useState(user?.role === "admissions" ? user.id : "");
  const [program, setProgram] = useState("");
  const [showLost, setShowLost] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [tab, setTab] = useState<"pipeline" | "followups" | "metrics">((params.get("tab") as "followups") || "pipeline");
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string>();
  const openId = params.get("lead");
  const openLead = db.leads.find((l) => l.id === openId);
  const admissionsUsers = db.users.filter((u) => u.active && (u.role === "admissions" || u.role === "owner" || u.role === "admin"));

  const leads = useMemo(() => {
    const s = q.toLowerCase();
    return db.leads
      .filter((l) => !s || `${l.firstName} ${l.lastName} ${l.email} ${l.phone}`.toLowerCase().includes(s))
      .filter((l) => !source || l.source === source)
      .filter((l) => !owner || (owner === "none" ? !l.ownerId : l.ownerId === owner))
      .filter((l) => !program || l.programId === program)
      .filter((l) => showInactive || l.active !== false)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [db.leads, q, source, owner, program, showInactive]);

  // Próximo seguimiento pendiente de cada lead.
  const nextFollowUp = useMemo(() => {
    const m = new Map<string, FollowUp>();
    db.followUps.filter(isPending).forEach((f) => { const cur = m.get(f.leadId); if (!cur || f.due < cur.due) m.set(f.leadId, f); });
    return m;
  }, [db.followUps]);
  const T = today();
  const myOverdue = db.followUps.filter((f) => isPending(f) && f.due <= T).filter((f) => { const l = db.leads.find((x) => x.id === f.leadId); return l && isOpenLead(l) && (user?.role !== "admissions" || (f.ownerId ?? l.ownerId) === user.id); }).length;

  const slaBreached = (l: Lead) => l.stage === "new" && !l.firstContactAt && Date.now() - new Date(l.createdAt).getTime() > db.settings.leadResponseMinutes * 60000;

  const moveStage = (lead: Lead, stage: LeadStage, note?: string) => {
    if (lead.stage === stage) return;
    save("leads", { ...lead, stage, firstContactAt: lead.firstContactAt ?? (stage !== "new" ? nowISO() : undefined) }, "stage");
    // Perdido o inscrito: sus seguimientos pendientes ya no aplican.
    if (stage === "lost" || stage === "enrolled") saveMany("followUps", closeFor(db, lead.id, stage === "lost" ? "Lead perdido" : "Inscrito", user?.id));
    save("leadActivities", { id: uid(), leadId: lead.id, type: "stage", note: note ?? `${STAGE_LABEL[lead.stage]} → ${STAGE_LABEL[stage]}`, at: nowISO(), userId: user?.id });
  };

  const roundRobin = () => {
    const reps = db.users.filter((u) => u.active && u.role === "admissions");
    const unowned = db.leads.filter((l) => !l.ownerId && l.stage !== "lost" && l.stage !== "enrolled");
    if (!reps.length || !unowned.length) return toast("No hay leads sin asignar.");
    const counts = new Map(reps.map((r) => [r.id, db.leads.filter((l) => l.ownerId === r.id && l.stage !== "lost" && l.stage !== "enrolled").length]));
    const updated = unowned.map((l) => {
      const next = [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
      counts.set(next, counts.get(next)! + 1);
      return { ...l, ownerId: next };
    });
    saveMany("leads", updated, "assign:round-robin");
    toast(`${updated.length} leads asignados por turno.`);
  };

  const stages = LEAD_STAGES.filter((s) => showLost || s !== "lost");

  return (
    <div>
      <PageHeader
        title="Admisiones · CRM"
        subtitle={`${leads.filter((l) => l.stage !== "lost" && l.stage !== "enrolled").length} leads abiertos`}
        actions={
          <>
            <a href="#/form" target="_blank" rel="noreferrer">
              <Button variant="secondary"><ExternalLink size={15} /> Formulario web</Button>
            </a>
            <Button variant="secondary" onClick={roundRobin}><Shuffle size={15} /> Asignar sin dueño</Button>
            <Button onClick={() => setCreating(true)}><Plus size={15} /> Nuevo lead</Button>
          </>
        }
      />

      <div className="mb-4">
        <Tabs
          tabs={[
            { id: "pipeline" as const, label: "Pipeline" },
            { id: "followups" as const, label: <>Seguimientos {myOverdue > 0 && <Badge tone="red">{myOverdue}</Badge>}</> },
            { id: "metrics" as const, label: "Métricas" },
          ]}
          value={tab}
          onChange={(t) => setTab(t as typeof tab)}
        />
      </div>
      {tab === "followups" && <FollowUpList onOpen={(id) => setParams({ lead: id })} />}
      {tab === "metrics" && <CrmMetrics />}
      {tab === "pipeline" && (<>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Input placeholder="Buscar nombre, email o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-40">
            <option value="">Todas las fuentes</option>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </Select>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-44">
            <option value="">Todos los asesores</option>
            <option value="none">Sin asignar</option>
            {admissionsUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Select value={program} onChange={(e) => setProgram(e.target.value)} className="w-44">
            <option value="">Todos los programas</option>
            {db.programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} /> Ver perdidos
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Ver inactivos
          </label>
          <div className="ml-auto flex rounded-lg border border-slate-300 p-0.5">
            <button onClick={() => setView("kanban")} className={cx("rounded-md p-1.5", view === "kanban" && "bg-slate-100")} aria-label="Kanban"><Columns3 size={16} /></button>
            <button onClick={() => setView("table")} className={cx("rounded-md p-1.5", view === "table" && "bg-slate-100")} aria-label="Tabla"><List size={16} /></button>
          </div>
        </div>
      </Card>

      {view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((st) => {
            const col = leads.filter((l) => l.stage === st);
            return (
              <div
                key={st}
                className="flex w-64 shrink-0 flex-col rounded-xl bg-slate-100/70"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const l = db.leads.find((x) => x.id === dragId);
                  if (l) moveStage(l, st);
                  setDragId(undefined);
                }}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{STAGE_LABEL[st]}</span>
                  <span className="rounded-full bg-white px-2 text-xs text-slate-500">{col.length}</span>
                </div>
                <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {col.slice(0, 60).map((l) => (
                    <button
                      key={l.id}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onClick={() => setParams({ lead: l.id })}
                      className={cx("rounded-lg border bg-white p-2.5 text-left shadow-sm transition hover:border-brand-500", slaBreached(l) ? "border-red-300" : "border-slate-200")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">{displayName(l)}</span>
                        <span className="text-[11px] text-slate-400">{ageLabel(l.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{db.programs.find((p) => p.id === l.programId)?.name ?? "Sin programa"}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Badge tone={SOURCE_TONE[l.source]}>{SOURCE_LABEL[l.source]}</Badge>
                        {slaBreached(l) && <Badge tone="red">Sin contactar</Badge>}
                        {nextFollowUp.get(l.id) && isOpenLead(l) && nextFollowUp.get(l.id)!.due < T && <Badge tone="red">Seguimiento vencido</Badge>}
                        {nextFollowUp.get(l.id) && isOpenLead(l) && nextFollowUp.get(l.id)!.due === T && <Badge tone="amber">Seguimiento hoy</Badge>}
                        {l.active === false && <Badge>Inactivo</Badge>}
                      </div>
                      <div className="mt-1.5 text-[11px] text-slate-400">{l.ownerId ? userName(db, l.ownerId) : "Sin asignar"}</div>
                    </button>
                  ))}
                  {!col.length && <div className="py-6 text-center text-xs text-slate-400">Arrastra leads aquí</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr><Th>Nombre</Th><Th>Contacto</Th><Th>Fuente</Th><Th>Programa</Th><Th>Etapa</Th><Th>Asesor</Th><Th>Creado</Th><Th>Próximo seguimiento</Th></tr>
            </thead>
            <tbody>
              {leads.filter((l) => showLost || l.stage !== "lost").map((l) => (
                <tr key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setParams({ lead: l.id })}>
                  <Td className="font-medium">{displayName(l)}</Td>
                  <Td><div className="text-xs">{l.phone}</div><div className="text-xs text-slate-400">{l.email}</div></Td>
                  <Td><Badge tone={SOURCE_TONE[l.source]}>{SOURCE_LABEL[l.source]}</Badge></Td>
                  <Td className="text-xs">{db.programs.find((p) => p.id === l.programId)?.code}</Td>
                  <Td><Badge tone={STAGE_TONE[l.stage]}>{STAGE_LABEL[l.stage]}</Badge></Td>
                  <Td className="text-xs">{userName(db, l.ownerId)}</Td>
                  <Td className="text-xs">{fmtDateTime(l.createdAt)}</Td>
                  <Td className="text-xs">{(() => { const f = nextFollowUp.get(l.id); return f && isOpenLead(l) ? <span className={f.due < T ? "text-red-600" : ""}>{FOLLOWUP_LABEL[f.type]} · {fmtDate(f.due)}</span> : "—"; })()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!leads.length && <Empty>No hay leads con esos filtros.</Empty>}
        </Card>
      )}

      </>)}

      <NewLeadModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => setParams({ lead: id })} />
      {openLead && <LeadDrawer lead={openLead} onClose={() => setParams({})} moveStage={moveStage} />}
    </div>
  );
}

function NewLeadModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { db, save, saveMany, user } = useStore();
  const blank = { firstName: "", lastName: "", email: "", phone: "", source: "phone" as LeadSource, sourceDetail: "", programId: "", desiredScheduleId: "", desiredStart: "", language: "es" as "es" | "en" };
  const [f, setF] = useState(blank);
  const dup = (f.email || f.phone.replace(/\D/g, "").length >= 7) && db.leads.find((l) => (f.email && l.email.toLowerCase() === f.email.toLowerCase()) || (f.phone.replace(/\D/g, "").length >= 7 && l.phone.replace(/\D/g, "").endsWith(f.phone.replace(/\D/g, "").slice(-10))));
  const submit = () => {
    const lead: Lead = {
      id: uid(), ...f, programId: f.programId || undefined, desiredScheduleId: f.desiredScheduleId || undefined, desiredStart: f.desiredStart || undefined, sourceDetail: f.sourceDetail || undefined,
      stage: "new", ownerId: user?.role === "admissions" ? user.id : undefined, createdAt: nowISO(),
    };
    save("leads", lead);
    if (db.settings.autoFollowUpPlan) saveMany("followUps", planFor(lead, db.settings.followUpPlan, user?.id), "Plan de seguimiento");
    onClose();
    setF({ ...blank, source: f.source });
    onCreated(lead.id);
  };
  return (
    <Modal open={open} onClose={onClose} title="Nuevo lead" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!f.firstName || (!f.phone && !f.email)} onClick={submit}>Guardar</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label="Apellido"><Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
        <Field label="Teléfono"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Fuente">
          <Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as LeadSource })}>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Idioma">
          <Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as "es" | "en" })}>
            <option value="es">Español</option><option value="en">English</option>
          </Select>
        </Field>
        <Field label="Detalle de la fuente">
          <Select value={f.sourceDetail} onChange={(e) => setF({ ...f, sourceDetail: e.target.value })}>
            <option value="">—</option>
            {activeOptions(db, "lead_source").map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
          </Select>
        </Field>
        <Field label="Programa de interés">
          <Select value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}>
            <option value="">—</option>
            {db.programs.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Horario deseado">
          <Select value={f.desiredScheduleId} onChange={(e) => setF({ ...f, desiredScheduleId: e.target.value })}>
            <option value="">—</option>
            {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}
          </Select>
        </Field>
        <Field label="Fecha de inicio deseada"><Input type="date" value={f.desiredStart} onChange={(e) => setF({ ...f, desiredStart: e.target.value })} /></Field>
      </div>
      {dup && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Ya existe un lead con ese email o teléfono: <b>{displayName(dup)}</b> ({STAGE_LABEL[dup.stage]}). Revisa antes de crear otro.</p>}
      {db.settings.autoFollowUpPlan && <p className="mt-2 text-xs text-slate-500">Se crearán {db.settings.followUpPlan.length} seguimientos según el plan (Configuración › Automatizaciones).</p>}
    </Modal>
  );
}

function LeadDrawer({ lead, onClose, moveStage }: { lead: Lead; onClose: () => void; moveStage: (l: Lead, s: LeadStage, note?: string) => void }) {
  const store = useStore();
  const { db, save, user } = store;
  const toast = useToast();
  const [actType, setActType] = useState<ActivityType>("call");
  const [actNote, setActNote] = useState("");
  const [converting, setConverting] = useState(false);
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState("Precio");
  const activities = db.leadActivities.filter((a) => a.leadId === lead.id).sort((a, b) => b.at.localeCompare(a.at));
  const program = db.programs.find((p) => p.id === lead.programId);
  const set = (patch: Partial<Lead>) => save("leads", { ...lead, ...patch });

  const log = (type: ActivityType, note: string) => {
    save("leadActivities", { id: uid(), leadId: lead.id, type, note, at: nowISO(), userId: user?.id });
    if (!lead.firstContactAt && type !== "note") set({ firstContactAt: nowISO(), stage: lead.stage === "new" ? "contacted" : lead.stage });
  };

  const sendLink = () => {
    let oe = db.onlineEnrollments.find((o) => o.id === lead.enrollmentId);
    if (!oe) {
      oe = {
        id: uid(), firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone,
        programId: lead.programId ?? db.programs[0].id, scheduleId: db.schedules[0].id, stepsDone: 0, status: "in_progress",
        depositAmount: 0, createdAt: nowISO(), updatedAt: nowISO(), leadId: lead.id,
      };
      save("onlineEnrollments", oe);
    }
    const link = `${db.settings.enrollmentPortalUrl}?ref=${oe.id}&lang=${lead.language}`;
    sendTemplate(store, "enrollment_link", lead.email, { nombre: lead.firstName, programa: program?.name ?? "nuestros programas", link, asesor: user?.name ?? "FMAIS" }, { leadId: lead.id, kind: "enrollment_link" });
    save("leads", { ...lead, enrollmentId: oe.id, stage: lead.stage === "enrolled" ? lead.stage : "applied", firstContactAt: lead.firstContactAt ?? nowISO() });
    save("leadActivities", { id: uid(), leadId: lead.id, type: "email", note: `Link de inscripción enviado: ${link}`, at: nowISO(), userId: user?.id });
    toast("Link de inscripción enviado (ver registro de emails en Cobros).");
  };

  const waLink = `https://wa.me/1${lead.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hola ${lead.firstName}, te escribe ${user?.name ?? ""} de FMAIS.`)}`;

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          {displayName(lead)} <Badge tone={STAGE_TONE[lead.stage]}>{STAGE_LABEL[lead.stage]}</Badge>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        <a href={`tel:${lead.phone}`} onClick={() => log("call", "Llamada saliente")}><Button size="sm" variant="secondary"><Phone size={14} /> Llamar</Button></a>
        <a href={waLink} target="_blank" rel="noreferrer" onClick={() => log("whatsapp", "Mensaje de WhatsApp enviado")}><Button size="sm" variant="secondary"><MessageCircle size={14} /> WhatsApp</Button></a>
        <Button size="sm" variant="secondary" onClick={() => {
          sendTemplate(store, "lead_followup", lead.email, { nombre: lead.firstName, programa: program?.name ?? "nuestros programas", asesor: user?.name ?? "FMAIS" }, { leadId: lead.id, kind: "lead_followup" });
          log("email", "Email de seguimiento enviado");
          toast("Email de seguimiento enviado.");
        }}><Mail size={14} /> Email</Button>
        <Button size="sm" onClick={sendLink}><Send size={14} /> Enviar link de inscripción</Button>
        {lead.studentId ? (
          <Link to={`/students/${lead.studentId}`}><Button size="sm" variant="success"><UserCheck size={14} /> Ver estudiante</Button></Link>
        ) : (
          <Button size="sm" variant="success" onClick={() => setConverting(true)}><UserCheck size={14} /> Convertir a estudiante</Button>
        )}
        {lead.stage !== "lost" && lead.stage !== "enrolled" && <Button size="sm" variant="ghost" onClick={() => setLosing(true)}><XCircle size={14} /> Perdido</Button>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={lead.firstName} onChange={(e) => set({ firstName: e.target.value })} /></Field>
        <Field label="Apellido"><Input value={lead.lastName} onChange={(e) => set({ lastName: e.target.value })} /></Field>
        <Field label="Teléfono"><Input value={lead.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Email"><Input value={lead.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Etapa">
          <Select value={lead.stage} onChange={(e) => moveStage(lead, e.target.value as LeadStage)}>
            {LEAD_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Asesor">
          <Select value={lead.ownerId ?? ""} onChange={(e) => set({ ownerId: e.target.value || undefined })}>
            <option value="">Sin asignar</option>
            {db.users.filter((u) => u.active && u.role !== "instructor").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Programa de interés">
          <Select value={lead.programId ?? ""} onChange={(e) => set({ programId: e.target.value || undefined })}>
            <option value="">—</option>
            {db.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Fuente">
          <Select value={lead.source} onChange={(e) => set({ source: e.target.value as LeadSource })}>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Detalle de la fuente">
          <Select value={lead.sourceDetail ?? ""} onChange={(e) => set({ sourceDetail: e.target.value || undefined })}>
            <option value="">—</option>
            {activeOptions(db, "lead_source", lead.sourceDetail).map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
          </Select>
        </Field>
        <Field label="Activo">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={lead.active !== false} onChange={(e) => set({ active: e.target.checked ? undefined : false })} />
            {lead.active === false ? "Inactivo (archivado)" : "Activo"}
          </label>
        </Field>
        <Field label="Horario deseado">
          <Select value={lead.desiredScheduleId ?? ""} onChange={(e) => set({ desiredScheduleId: e.target.value || undefined })}>
            <option value="">—</option>
            {db.schedules.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}
          </Select>
        </Field>
        <Field label="Fecha de inicio deseada"><Input type="date" value={lead.desiredStart ?? ""} onChange={(e) => set({ desiredStart: e.target.value || undefined })} /></Field>
      </div>
      <LeadFollowUps lead={lead} onDone={(type, note) => log(type, note)} />
      <ConsentEditor value={lead} onChange={(patch) => set(patch)} />
      <div className="mt-2 text-xs text-slate-400">
        Creado {fmtDateTime(lead.createdAt)}{lead.campaign ? ` · Campaña: ${lead.campaign}` : ""} · Primer contacto: {lead.firstContactAt ? fmtDateTime(lead.firstContactAt) : "pendiente"}
        {lead.lostReason ? ` · Motivo de pérdida: ${lead.lostReason}` : ""}
      </div>

      <h4 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Registrar actividad</h4>
      <div className="flex gap-2">
        <Select value={actType} onChange={(e) => setActType(e.target.value as ActivityType)} className="w-36">
          {(["call", "whatsapp", "email", "sms", "tour", "note"] as ActivityType[]).map((t) => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}
        </Select>
        <Textarea rows={1} value={actNote} onChange={(e) => setActNote(e.target.value)} placeholder="¿Qué pasó?" />
        <Button disabled={!actNote.trim()} onClick={() => { log(actType, actNote.trim()); setActNote(""); }}>Agregar</Button>
      </div>

      <h4 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Historial</h4>
      <ol className="space-y-3 border-l border-slate-200 pl-4">
        {activities.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
            <div className="text-xs text-slate-400">{fmtDateTime(a.at)} · {ACTIVITY_LABEL[a.type]} · {userName(db, a.userId)}</div>
            <div className="text-sm text-slate-700">{a.note}</div>
          </li>
        ))}
        {!activities.length && <li className="text-sm text-slate-400">Sin actividad todavía.</li>}
      </ol>

      <NewStudentModal
        open={converting}
        onClose={() => setConverting(false)}
        initial={{ firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone, programId: lead.programId, leadId: lead.id }}
      />
      <Modal open={losing} onClose={() => setLosing(false)} title="Marcar como perdido" footer={<><Button variant="secondary" onClick={() => setLosing(false)}>Cancelar</Button><Button variant="danger" onClick={() => { save("leads", { ...lead, stage: "lost", lostReason }); store.saveMany("followUps", closeFor(db, lead.id, `Perdido: ${lostReason}`, user?.id)); save("leadActivities",{ id: uid(), leadId: lead.id, type: "stage", note: `Perdido: ${lostReason}`, at: nowISO(), userId: user?.id }); setLosing(false); }}>Confirmar</Button></>}>
        <Field label="Motivo">
          <Select value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
            {["Precio", "Horario no le sirve", "Eligió otra escuela", "No contesta", "No califica", "Otro"].map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
      </Modal>
    </Drawer>
  );
}
