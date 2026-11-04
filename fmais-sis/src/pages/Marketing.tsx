import { Bot, CheckCircle2, Clock, Pencil, Play, Repeat, Send, Sparkles, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../components/Layout";
import { ConnectionTab, ContactsTab, SegmentsTab, TemplatesTab } from "../components/MarketingTabs";
import { Badge, Button, Card, Drawer, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Tabs, Td, Textarea, Th, type Tone } from "../components/ui";
import { agentDraft, mergeSend, rate, renderEmail, segmentContacts, simulateSend } from "../lib/marketing";
import { useStore, userName } from "../lib/store";
import type { Campaign, CampaignStatus, DB } from "../lib/types";
import { displayName, fmtDateTime } from "../lib/utils";

const ST_LABEL: Record<CampaignStatus, string> = { draft: "Borrador", pending_approval: "Pendiente de aprobar", scheduled: "Programada", sent: "Enviada", rejected: "Rechazada" };
const ST_TONE: Record<CampaignStatus, Tone> = { draft: "slate", pending_approval: "amber", scheduled: "blue", sent: "green", rejected: "red" };

type Tab = "campaigns" | "segments" | "templates" | "contacts" | "connection";

export default function Marketing() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "campaigns";
  return (
    <div>
      <PageHeader title="Marketing" subtitle="Campañas por Constant Contact preparadas por un agente de IA y aprobadas por una persona. En la demo el agente y los envíos son simulados." />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[{ id: "campaigns", label: "Campañas" }, { id: "segments", label: "Segmentos" }, { id: "templates", label: "Templates" }, { id: "contacts", label: "Contactos y consentimiento" }, { id: "connection", label: "Constant Contact" }]}
      />
      <div className="mt-4">
        {tab === "campaigns" && <CampaignsTab />}
        {tab === "segments" && <SegmentsTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "contacts" && <ContactsTab />}
        {tab === "connection" && <ConnectionTab />}
      </div>
    </div>
  );
}

/** Campañas listas para salir ahora: programadas con fecha cumplida y recurrentes con contactos nuevos. */
function dueCampaigns(db: DB) {
  const now = new Date().toISOString();
  return db.campaigns.filter((c) => (c.status === "scheduled" && !c.recurring && c.scheduledFor && c.scheduledFor <= now) || (c.recurring && (c.status === "scheduled" || c.status === "sent")));
}

function CampaignsTab() {
  const { db, replaceDB, save } = useStore();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [openId, setOpenId] = useState<string>();
  const open = db.campaigns.find((c) => c.id === openId);
  const segName = (id: string) => db.segments.find((s) => s.id === id)?.name ?? "—";

  const sent = db.campaigns.filter((c) => c.stats.sent > 0);
  const tot = sent.reduce((t, c) => ({ sent: t.sent + c.stats.sent, opens: t.opens + c.stats.opens, clicks: t.clicks + c.stats.clicks }), { sent: 0, opens: 0, clicks: 0 });
  const pending = db.campaigns.filter((c) => c.status === "pending_approval").length;

  const runDue = () => {
    let next = db;
    let n = 0;
    let people = 0;
    dueCampaigns(db).forEach((c) => {
      const res = simulateSend(next, next.campaigns.find((x) => x.id === c.id)!);
      if (!res || !res.recipients) return;
      // Las recurrentes siguen activas para los próximos contactos nuevos.
      if (c.recurring) res.campaign.status = "sent";
      next = mergeSend(next, res);
      n++;
      people += res.recipients;
    });
    if (!n) return toast("No hay envíos pendientes en este momento.");
    replaceDB(next);
    toast(`${n} campaña(s) enviadas por Constant Contact (simulado) a ${people} contactos.`);
  };

  const sorted = [...db.campaigns].sort((a, b) => {
    const order = { pending_approval: 0, scheduled: 1, draft: 2, sent: 3, rejected: 4 };
    return order[a.status] - order[b.status] || (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt);
  });

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pendientes de aprobar" value={pending} tone="amber" icon={<Clock size={16} />} />
        <Stat label="Emails enviados" value={tot.sent} sub={`${sent.length} campañas`} tone="blue" icon={<Send size={16} />} />
        <Stat label="Tasa de apertura" value={rate(tot.opens, tot.sent)} tone="green" />
        <Stat label="Tasa de clics" value={rate(tot.clicks, tot.sent)} tone="brand" />
      </div>
      <Card
        title="Campañas"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={runDue}><Play size={13} /> Ejecutar envíos pendientes</Button>
            <Button size="sm" onClick={() => setAsking(true)}><Bot size={13} /> Pedir campaña al agente</Button>
          </>
        }
      >
        <Table>
          <thead><tr><Th>Campaña</Th><Th>Segmento</Th><Th>Estado</Th><Th>Creada por</Th><Th>Envío</Th><Th className="text-right">Enviados</Th><Th className="text-right">Apertura</Th><Th className="text-right">Clics</Th><Th className="text-right">Bajas</Th></tr></thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(c.id)}>
                <Td>
                  <div className="font-medium">{c.name}</div>
                  {c.recurring && <span className="inline-flex items-center gap-1 text-xs text-violet-700"><Repeat size={11} /> Recurrente</span>}
                </Td>
                <Td className="text-xs">{segName(c.segmentId)}</Td>
                <Td><Badge tone={ST_TONE[c.status]}>{c.recurring && c.status !== "pending_approval" ? "Activa" : ST_LABEL[c.status]}</Badge></Td>
                <Td className="text-xs">{c.createdBy === "agent" ? <span className="inline-flex items-center gap-1 text-violet-700"><Sparkles size={12} /> Agente IA</span> : userName(db, c.createdBy)}</Td>
                <Td className="text-xs">{c.sentAt ? fmtDateTime(c.sentAt) : c.recurring ? "Con cada contacto nuevo" : c.scheduledFor ? `${c.status === "pending_approval" ? "Propuesta" : "Programada"} ${fmtDateTime(c.scheduledFor)}` : "—"}</Td>
                <Td className="text-right tabular-nums">{c.stats.sent || "—"}</Td>
                <Td className="text-right tabular-nums">{rate(c.stats.opens, c.stats.sent)}</Td>
                <Td className="text-right tabular-nums">{rate(c.stats.clicks, c.stats.sent)}</Td>
                <Td className="text-right tabular-nums">{c.stats.unsubscribes || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!sorted.length && <Empty>Sin campañas todavía. Pídele una al agente.</Empty>}
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">En producción los envíos pendientes salen solos cada hora; aquí se ejecutan con el botón.</p>
      </Card>

      {asking && <AskAgentModal onClose={() => setAsking(false)} onCreated={(c) => { save("campaigns", c, "agent:draft"); setOpenId(c.id); }} />}
      {open && <CampaignDrawer c={open} onClose={() => setOpenId(undefined)} />}
    </div>
  );
}

function AskAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Campaign) => void }) {
  const { db } = useStore();
  const [segmentId, setSegmentId] = useState(db.segments[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(db.marketingTemplates[0]?.id ?? "");
  const [goal, setGoal] = useState("");
  const [personalize, setPersonalize] = useState(true);
  const [working, setWorking] = useState(false);
  const seg = db.segments.find((s) => s.id === segmentId);
  const preview = seg ? segmentContacts(db, seg) : undefined;

  const go = () => {
    setWorking(true);
    // Pausa breve para que se note que el agente "trabaja"; el resultado es inmediato.
    setTimeout(() => {
      onCreated(agentDraft(db, { segmentId, templateId, goal, personalize }));
      onClose();
    }, 900);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Bot size={18} /> Pedir campaña al agente</span>}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!segmentId || !templateId || working} onClick={go}>{working ? "El agente está preparando la campaña…" : <><Sparkles size={14} /> Preparar borrador</>}</Button></>}
    >
      <div className="space-y-3">
        <Field label="¿A quién?">
          <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            {db.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        {preview && <div className="text-xs text-slate-500">{preview.all.length} contactos en el segmento · {preview.eligible.length} pueden recibirlo hoy.</div>}
        <Field label="Template">
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {db.marketingTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Objetivo (opcional)"><Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ej. que se inscriban para el grupo de noviembre" /></Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={personalize} onChange={(e) => setPersonalize(e.target.checked)} />
          <span>Escribir un párrafo personalizado para cada contacto <span className="block text-xs text-slate-500">Según su programa, motivo por el que no se inscribió, días desde que preguntó y su asesor.</span></span>
        </label>
        <p className="rounded-lg bg-violet-50 p-3 text-xs text-violet-800">El agente deja la campaña como <b>Pendiente de aprobar</b>. No se envía nada hasta que una persona la apruebe.</p>
      </div>
    </Modal>
  );
}

function CampaignDrawer({ c, onClose }: { c: Campaign; onClose: () => void }) {
  const { db, user, save, replaceDB } = useStore();
  const toast = useToast();
  const seg = db.segments.find((s) => s.id === c.segmentId);
  const audience = useMemo(() => (seg ? segmentContacts(db, seg) : undefined), [db, seg]);
  const [previewId, setPreviewId] = useState<string>();
  const [lang, setLang] = useState<"auto" | "es" | "en">("auto");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c);
  const [when, setWhen] = useState((c.scheduledFor ?? new Date().toISOString()).slice(0, 16));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const sentEvents = db.marketingEvents.filter((e) => e.campaignId === c.id);
  const sentIds = [...new Set(sentEvents.filter((e) => e.type === "sent").map((e) => e.contactId))];
  const pool = audience?.eligible.length ? audience.eligible : audience?.all ?? [];
  const sample = pool.find((x) => x.id === previewId) ?? pool[0];
  const shown = sample ? renderEmail(db, editing ? draft : c, lang === "auto" ? sample : { ...sample, language: lang }) : undefined;
  const canApprove = c.status === "pending_approval" || c.status === "draft" || c.status === "rejected";

  const approve = (now: boolean) => {
    const approved: Campaign = { ...c, status: "scheduled", approvedBy: user?.id, approvedAt: new Date().toISOString(), scheduledFor: now ? new Date().toISOString() : new Date(when).toISOString() };
    if (!now) {
      save("campaigns", approved, "approve");
      return toast(approved.recurring ? "Aprobada: se enviará sola a cada contacto nuevo del segmento." : `Aprobada y programada para ${fmtDateTime(approved.scheduledFor)}.`);
    }
    const res = simulateSend(db, approved);
    if (!res) return;
    replaceDB(mergeSend(db, res));
    toast(`Enviada por Constant Contact (simulado) a ${res.recipients} contactos.`);
  };

  const sendNew = () => {
    const res = simulateSend(db, c);
    if (!res?.recipients) return toast("No hay contactos nuevos en el segmento.");
    replaceDB(mergeSend(db, res));
    toast(`Enviada a ${res.recipients} contactos nuevos.`);
  };

  const contactName = (id: string) => {
    const x = db.leads.find((l) => l.id === id) ?? db.students.find((s) => s.id === id);
    return x ? displayName(x) : id;
  };

  return (
    <Drawer open onClose={onClose} title={<span className="flex items-center gap-2">{c.name} <Badge tone={ST_TONE[c.status]}>{ST_LABEL[c.status]}</Badge></span>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {c.createdBy === "agent" ? <span className="inline-flex items-center gap-1 text-violet-700"><Sparkles size={12} /> Preparada por el agente IA</span> : <span>Creada por {userName(db, c.createdBy)}</span>}
          <span>· {fmtDateTime(c.createdAt)}</span>
          {c.approvedBy && <span>· Aprobada por {userName(db, c.approvedBy)} el {fmtDateTime(c.approvedAt)}</span>}
          {c.rejectedReason && <span className="text-red-600">· Rechazada: {c.rejectedReason}</span>}
        </div>
        {c.goal && <div className="text-sm"><span className="text-slate-500">Objetivo:</span> {c.goal}</div>}

        {/* Acciones según el estado */}
        <div className="rounded-lg border border-slate-200 p-3">
          {canApprove && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={c.recurring} onChange={(e) => save("campaigns", { ...c, recurring: e.target.checked })} />
                <Repeat size={14} /> Recurrente: después de aprobarla, se envía sola a cada contacto nuevo que entre al segmento
              </label>
              <div className="flex flex-wrap items-end gap-2">
                {!c.recurring && <Field label="Programar para"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-56" /></Field>}
                <Button variant="success" onClick={() => approve(false)}><CheckCircle2 size={15} /> {c.recurring ? "Aprobar y activar" : "Aprobar y programar"}</Button>
                {!c.recurring && <Button variant="secondary" onClick={() => approve(true)}><Send size={15} /> Aprobar y enviar ahora</Button>}
                <Button variant="ghost" onClick={() => setRejecting(true)}><XCircle size={15} /> Rechazar</Button>
              </div>
            </div>
          )}
          {c.status === "scheduled" && !c.recurring && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Sale el <b>{fmtDateTime(c.scheduledFor)}</b> a ~{audience?.eligible.length ?? 0} contactos.</span>
              <Button size="sm" variant="secondary" onClick={() => approve(true)}><Send size={13} /> Enviar ahora</Button>
              <Button size="sm" variant="ghost" onClick={() => save("campaigns", { ...c, status: "pending_approval" })}>Cancelar programación</Button>
            </div>
          )}
          {c.recurring && (c.status === "scheduled" || c.status === "sent") && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span><Repeat size={13} className="inline" /> Activa: ya salió a {sentIds.length} contactos. {audience?.eligible.filter((x) => !sentIds.includes(x.id)).length ?? 0} contactos nuevos esperan.</span>
              <Button size="sm" variant="secondary" onClick={sendNew}><Send size={13} /> Enviar a los nuevos ahora</Button>
              <Button size="sm" variant="ghost" onClick={() => save("campaigns", { ...c, recurring: false, status: "sent" })}>Pausar</Button>
            </div>
          )}
          {c.status === "sent" && !c.recurring && <div className="text-sm">Enviada el <b>{fmtDateTime(c.sentAt)}</b> por Constant Contact <span className="font-mono text-xs text-slate-400">({c.ccCampaignId})</span>.</div>}
        </div>

        {c.stats.sent > 0 && (
          <div className="grid grid-cols-5 gap-2 text-center">
            {[["Enviados", c.stats.sent], ["Aperturas", `${c.stats.opens} · ${rate(c.stats.opens, c.stats.sent)}`], ["Clics", `${c.stats.clicks} · ${rate(c.stats.clicks, c.stats.sent)}`], ["Rebotes", c.stats.bounces], ["Bajas", c.stats.unsubscribes]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-500">{k}</div><div className="text-sm font-semibold tabular-nums">{v}</div></div>
            ))}
          </div>
        )}

        {c.agentNotes?.length ? (
          <div className="rounded-lg bg-violet-50 p-3">
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-violet-800"><Bot size={13} /> Notas del agente</div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-violet-900">{c.agentNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        ) : null}

        {/* Vista previa personalizada */}
        <div>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <h4 className="mr-auto text-sm font-semibold">Vista previa</h4>
            <Select value={sample?.id ?? ""} onChange={(e) => setPreviewId(e.target.value)} className="w-56">
              {pool.slice(0, 80).map((x) => <option key={x.id} value={x.id}>{displayName(x)} ({x.language.toUpperCase()})</option>)}
            </Select>
            <Select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} className="w-36">
              <option value="auto">Su idioma</option><option value="es">Español</option><option value="en">English</option>
            </Select>
            {canApprove && !editing && <Button size="sm" variant="secondary" onClick={() => { setDraft(c); setEditing(true); }}><Pencil size={13} /> Editar</Button>}
          </div>
          {shown ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                Para: {sample?.email} · De: {db.settings.email}<div className="mt-0.5 text-sm font-semibold text-slate-800">{shown.subject}</div>
              </div>
              <div className="whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-slate-700">{shown.body}</div>
              <div className="px-4 pb-4"><span className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white">{shown.cta}</span></div>
              <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">{db.settings.schoolName} · {db.settings.address} · Darse de baja (lo agrega Constant Contact)</div>
            </div>
          ) : (
            <Empty>El segmento no tiene contactos.</Empty>
          )}
        </div>

        {editing && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            {(["es", "en"] as const).map((l) => (
              <div key={l} className="space-y-2">
                <div className="text-xs font-semibold uppercase text-slate-500">{l === "es" ? "Español" : "English"}</div>
                <Input value={draft.subject[l]} onChange={(e) => setDraft({ ...draft, subject: { ...draft.subject, [l]: e.target.value } })} />
                <Textarea rows={6} value={draft.body[l]} onChange={(e) => setDraft({ ...draft, body: { ...draft.body, [l]: e.target.value } })} />
                <Input value={draft.cta[l]} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, [l]: e.target.value } })} />
              </div>
            ))}
            <p className="text-xs text-slate-400">Variables: {"{{nombre}} {{programa}} {{proximo_grupo}} {{asesor}} {{parrafo_ia}} {{link}}"}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button onClick={() => { save("campaigns", draft); setEditing(false); }}>Guardar cambios</Button>
            </div>
          </div>
        )}

        {/* Destinatarios */}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Destinatarios</h4>
          {audience && (
            <div className="mb-2 flex flex-wrap gap-1 text-xs">
              <Badge tone="green">{audience.eligible.length} pueden recibirlo</Badge>
              {audience.excluded.no_consent > 0 && <Badge>{audience.excluded.no_consent} sin consentimiento</Badge>}
              {audience.excluded.unsubscribed > 0 && <Badge tone="red">{audience.excluded.unsubscribed} dados de baja</Badge>}
              {audience.excluded.recent > 0 && <Badge tone="amber">{audience.excluded.recent} contactados en los últimos 7 días</Badge>}
            </div>
          )}
          {sentIds.length > 0 && (
            <Table className="max-h-72 rounded-lg border border-slate-200">
              <thead><tr><Th>Contacto</Th><Th>Resultado</Th></tr></thead>
              <tbody>
                {sentIds.slice(0, 100).map((id) => {
                  const types = new Set(sentEvents.filter((e) => e.contactId === id).map((e) => e.type));
                  return (
                    <tr key={id}>
                      <Td className="text-xs">{contactName(id)}</Td>
                      <Td className="space-x-1">
                        {types.has("bounce") ? <Badge tone="red">Rebotó</Badge> : types.has("unsubscribe") ? <Badge tone="red">Se dio de baja</Badge> : types.has("click") ? <Badge tone="green">Hizo clic</Badge> : types.has("open") ? <Badge tone="blue">Abrió</Badge> : <Badge>Entregado</Badge>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </div>

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Rechazar campaña" footer={<><Button variant="secondary" onClick={() => setRejecting(false)}>Cancelar</Button><Button variant="danger" onClick={() => { save("campaigns", { ...c, status: "rejected", rejectedReason: reason || "Sin motivo" }); setRejecting(false); }}>Rechazar</Button></>}>
        <Field label="¿Qué hay que cambiar?" hint="Queda registrado en la campaña para que el agente lo tenga en cuenta.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </Drawer>
  );
}

