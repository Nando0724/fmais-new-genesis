// Seguimientos del CRM (Genesis: Follow Up) y métricas de admisiones — fase 7.
import { CalendarPlus, Check, ListPlus, Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { bucketOf, byRep, closeFor, FOLLOWUP_LABEL, fmtMinutes, funnel, isPending, pendingFollowUps, planFor } from "../lib/crm";
import { useStore, userName } from "../lib/store";
import { LEAD_SOURCES, type ActivityType, type FollowUp, type FollowUpType, type Lead } from "../lib/types";
import { addDays, displayName, fmtDate, fmtDateTime, nowISO, SOURCE_LABEL, STAGE_LABEL, today, uid } from "../lib/utils";
import { useToast } from "./Layout";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Stat, Table, Td, Textarea, Th } from "./ui";

const TYPES = Object.keys(FOLLOWUP_LABEL) as FollowUpType[];
const toActivity = (t: FollowUpType): ActivityType => (t === "other" ? "note" : t);
const dueTone = (f: FollowUp) => (bucketOf(f) === "overdue" ? "red" : bucketOf(f) === "today" ? "amber" : "slate");

/** Modal para completar un seguimiento y, si hace falta, programar el siguiente. */
function CompleteModal({ f, lead, onClose, onLogged }: { f: FollowUp; lead: Lead; onClose: () => void; onLogged?: (type: ActivityType, note: string) => void }) {
  const { user, save } = useStore();
  const toast = useToast();
  const [result, setResult] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextType, setNextType] = useState<FollowUpType>("call");
  const [nextNote, setNextNote] = useState("");
  const submit = () => {
    const at = nowISO();
    save("followUps", { ...f, completedAt: at, completedBy: user?.id, result: result.trim() || undefined }, "Seguimiento completado");
    const note = `Seguimiento (${FOLLOWUP_LABEL[f.type]}): ${f.note}${result.trim() ? ` — ${result.trim()}` : ""}`;
    if (onLogged) onLogged(toActivity(f.type), note);
    else {
      save("leadActivities", { id: uid(), leadId: lead.id, type: toActivity(f.type), note, at, userId: user?.id });
      if (!lead.firstContactAt && f.type !== "other") save("leads", { ...lead, firstContactAt: at, stage: lead.stage === "new" ? "contacted" : lead.stage });
    }
    if (nextDate) save("followUps", { id: uid(), leadId: lead.id, due: nextDate, type: nextType, note: nextNote.trim() || FOLLOWUP_LABEL[nextType], ownerId: f.ownerId ?? lead.ownerId, createdAt: at, createdBy: user?.id });
    toast(nextDate ? `Completado. Siguiente seguimiento el ${fmtDate(nextDate)}.` : "Seguimiento completado.");
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Completar: ${displayName(lead)}`} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit}><Check size={14} /> Completar</Button></>}>
      <p className="text-sm text-slate-600"><Badge>{FOLLOWUP_LABEL[f.type]}</Badge> {f.note} · vencía {fmtDate(f.due)}</p>
      <Field label="¿Qué pasó?" className="mt-3"><Textarea rows={2} value={result} onChange={(e) => setResult(e.target.value)} placeholder="Ej. Le interesa la noche, viene el jueves al tour" /></Field>
      <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Siguiente seguimiento (opcional)</h4>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Fecha">
          <Input type="date" value={nextDate} min={today()} onChange={(e) => setNextDate(e.target.value)} />
        </Field>
        <Field label="Tipo">
          <Select value={nextType} onChange={(e) => setNextType(e.target.value as FollowUpType)}>{TYPES.map((t) => <option key={t} value={t}>{FOLLOWUP_LABEL[t]}</option>)}</Select>
        </Field>
        <Field label="Nota"><Input value={nextNote} onChange={(e) => setNextNote(e.target.value)} /></Field>
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 3, 7].map((d) => <Button key={d} size="sm" variant="ghost" onClick={() => setNextDate(addDays(today(), d))}>+{d} día{d > 1 ? "s" : ""}</Button>)}
      </div>
    </Modal>
  );
}

/** Seguimientos de un lead (dentro de su ficha). */
export function LeadFollowUps({ lead, onDone }: { lead: Lead; onDone: (type: ActivityType, note: string) => void }) {
  const { db, user, save, saveMany } = useStore();
  const toast = useToast();
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [due, setDue] = useState(addDays(today(), 1));
  const [type, setType] = useState<FollowUpType>("call");
  const [note, setNote] = useState("");
  const [showDone, setShowDone] = useState(false);
  const mine = db.followUps.filter((f) => f.leadId === lead.id);
  const pending = mine.filter(isPending).sort((a, b) => a.due.localeCompare(b.due));
  const done = mine.filter((f) => !isPending(f)).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const closed = lead.stage === "lost" || lead.stage === "enrolled";

  const add = () => {
    save("followUps", { id: uid(), leadId: lead.id, due, type, note: note.trim() || FOLLOWUP_LABEL[type], ownerId: lead.ownerId, createdAt: nowISO(), createdBy: user?.id });
    setNote("");
  };
  const applyPlan = () => {
    saveMany("followUps", planFor(lead, db.settings.followUpPlan, user?.id), "Plan de seguimiento");
    toast(`${db.settings.followUpPlan.length} seguimientos creados desde hoy.`);
  };

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Seguimientos ({pending.length} pendientes)</h4>
        <div className="flex gap-1">
          {!closed && !pending.length && <Button size="sm" variant="ghost" onClick={applyPlan}><ListPlus size={13} /> Aplicar plan</Button>}
          {pending.length > 0 && <Button size="sm" variant="ghost" onClick={() => { saveMany("followUps", closeFor(db, lead.id, "Cancelado a mano", user?.id)); toast("Seguimientos pendientes cancelados."); }}>Cancelar todos</Button>}
        </div>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {pending.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <Badge tone={dueTone(f)}>{fmtDate(f.due)}</Badge>
            <Badge>{FOLLOWUP_LABEL[f.type]}</Badge>
            <span className="flex-1 truncate text-slate-700" title={f.note}>{f.note}</span>
            <button className="text-xs text-slate-500 hover:text-brand-600" title="Pasar a mañana" onClick={() => save("followUps", { ...f, due: addDays(f.due < today() ? today() : f.due, 1) })}><CalendarPlus size={14} /></button>
            <Button size="sm" variant="secondary" onClick={() => setCompleting(f)}><Check size={13} /></Button>
          </li>
        ))}
        {!pending.length && <li className="px-3 py-3 text-sm text-slate-400">{closed ? "Lead cerrado: sin seguimientos." : "Sin seguimientos pendientes."}</li>}
      </ul>
      {!closed && (
        <div className="mt-2 flex gap-2">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-36" />
          <Select value={type} onChange={(e) => setType(e.target.value as FollowUpType)} className="w-32">{TYPES.map((t) => <option key={t} value={t}>{FOLLOWUP_LABEL[t]}</option>)}</Select>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué hay que hacer" />
          <Button disabled={!due} onClick={add}>Agregar</Button>
        </div>
      )}
      {done.length > 0 && (
        <button className="mt-2 text-xs text-slate-500 hover:underline" onClick={() => setShowDone(!showDone)}>{showDone ? "Ocultar" : "Ver"} completados ({done.length})</button>
      )}
      {showDone && (
        <ul className="mt-1 space-y-1 text-xs text-slate-500">
          {done.map((f) => (
            <li key={f.id}>
              {f.canceled ? "✕" : "✓"} {fmtDate(f.due)} · {FOLLOWUP_LABEL[f.type]} · {f.note}
              {f.result ? ` — ${f.result}` : ""} <span className="text-slate-400">({fmtDateTime(f.completedAt)} · {userName(db, f.completedBy)})</span>
            </li>
          ))}
        </ul>
      )}
      {completing && <CompleteModal f={completing} lead={lead} onClose={() => setCompleting(null)} onLogged={onDone} />}
    </div>
  );
}

/** Lista general de seguimientos (pestaña Follow Up de Genesis): vencidos, hoy y próximos. */
export function FollowUpList({ onOpen }: { onOpen: (leadId: string) => void }) {
  const { db, user, save } = useStore();
  const [owner, setOwner] = useState(user?.role === "admissions" ? user.id : "");
  const [range, setRange] = useState(7);
  const [completing, setCompleting] = useState<{ f: FollowUp; lead: Lead } | null>(null);
  const reps = db.users.filter((u) => u.active && u.role !== "instructor");
  const all = pendingFollowUps(db, owner === "none" ? undefined : owner || undefined).filter((x) => owner !== "none" || !(x.f.ownerId ?? x.lead.ownerId));
  const until = addDays(today(), range);
  const groups = [
    { id: "overdue", title: "Vencidos", tone: "red" as const, list: all.filter((x) => bucketOf(x.f) === "overdue") },
    { id: "today", title: "Hoy", tone: "amber" as const, list: all.filter((x) => bucketOf(x.f) === "today") },
    { id: "upcoming", title: `Próximos ${range} días`, tone: "blue" as const, list: all.filter((x) => bucketOf(x.f) === "upcoming" && x.f.due <= until) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <Field label="Asesor">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-48">
              <option value="">Todos</option>
              <option value="none">Sin asignar</option>
              {reps.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Próximos">
            <Select value={range} onChange={(e) => setRange(Number(e.target.value))} className="w-28">
              {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} días</option>)}
            </Select>
          </Field>
          <p className="ml-auto max-w-md text-xs text-slate-500">Un seguimiento sale de la lista al completarlo. Si el lead se pierde o se inscribe, sus seguimientos se cierran solos; si se pasa a inactivo, dejan de aparecer.</p>
        </div>
      </Card>
      {groups.map((g) => (
        <Card key={g.id} title={<span className="flex items-center gap-2">{g.title} <Badge tone={g.tone}>{g.list.length}</Badge></span>}>
          {g.list.length ? (
            <Table>
              <thead><tr><Th>Fecha</Th><Th>Lead</Th><Th>Teléfono</Th><Th>Etapa</Th><Th>Qué hacer</Th><Th>Asesor</Th><Th></Th></tr></thead>
              <tbody>
                {g.list.map(({ f, lead }) => (
                  <tr key={f.id}>
                    <Td><Badge tone={dueTone(f)}>{fmtDate(f.due)}</Badge></Td>
                    <Td><button className="font-medium hover:underline" onClick={() => onOpen(lead.id)}>{displayName(lead)}</button><div className="text-xs text-slate-400">{db.programs.find((p) => p.id === lead.programId)?.code ?? "Sin programa"}</div></Td>
                    <Td className="text-xs"><a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-brand-600"><Phone size={12} /> {lead.phone}</a></Td>
                    <Td><Badge>{STAGE_LABEL[lead.stage]}</Badge></Td>
                    <Td className="text-sm"><Badge>{FOLLOWUP_LABEL[f.type]}</Badge> {f.note}</Td>
                    <Td className="text-xs">{userName(db, f.ownerId ?? lead.ownerId)}</Td>
                    <Td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" title="Pasar a mañana" onClick={() => save("followUps", { ...f, due: addDays(today(), 1) })}><CalendarPlus size={13} /></Button>
                      <Button size="sm" variant="secondary" onClick={() => setCompleting({ f, lead })}><Check size={13} /> Completar</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>{g.id === "overdue" ? "Nada vencido. 👏" : "Nada por aquí."}</Empty>
          )}
        </Card>
      ))}
      {completing && <CompleteModal f={completing.f} lead={completing.lead} onClose={() => setCompleting(null)} />}
    </div>
  );
}

/** Métricas de admisiones: embudo, tiempo de respuesta, desempeño por asesor y por fuente. */
export function CrmMetrics() {
  const { db } = useStore();
  const [from, setFrom] = useState(addDays(today(), -90));
  const [to, setTo] = useState(today());
  const reps = db.users.filter((u) => u.active && (u.role === "admissions" || u.role === "owner" || u.role === "admin"));
  const data = useMemo(() => {
    const ls = db.leads.filter((l) => l.createdAt.slice(0, 10) >= from && l.createdAt.slice(0, 10) <= to);
    const contacted = ls.filter((l) => l.firstContactAt);
    const mins = contacted.map((l) => (new Date(l.firstContactAt!).getTime() - new Date(l.createdAt).getTime()) / 60000);
    const inSla = mins.filter((m) => m <= db.settings.leadResponseMinutes).length;
    return {
      ls,
      contacted: contacted.length,
      response: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : undefined,
      inSla,
      enrolled: ls.filter((l) => l.stage === "enrolled").length,
      fun: funnel(db, from, to),
      reps: byRep(db, reps, from, to).filter((r) => r.leads || r.done || r.overdue),
      sources: LEAD_SOURCES.map((s) => {
        const x = ls.filter((l) => l.source === s);
        const e = x.filter((l) => l.stage === "enrolled").length;
        return { s, leads: x.length, enrolled: e };
      }).filter((x) => x.leads),
    };
  }, [db, from, to, reps]);
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const max = Math.max(1, data.fun.total);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <Field label="Leads creados desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Leads" value={data.ls.length} />
        <Stat label="Contactados" value={pct(data.contacted, data.ls.length)} sub={`${data.contacted} de ${data.ls.length}`} tone="violet" />
        <Stat label="Respuesta promedio" value={fmtMinutes(data.response)} sub={`${pct(data.inSla, data.contacted)} dentro de ${db.settings.leadResponseMinutes} min`} tone="amber" />
        <Stat label="Inscritos" value={data.enrolled} sub={`Conversión ${pct(data.enrolled, data.ls.length)}`} tone="green" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Embudo (llegaron al menos a la etapa)">
          <div className="space-y-2 p-4">
            {data.fun.steps.map((s, i) => (
              <div key={s.name}>
                <div className="flex justify-between text-xs text-slate-600"><span>{s.name}</span><span className="tabular-nums">{s.count} {i > 0 && <span className="text-slate-400">({pct(s.count, data.fun.steps[i - 1].count)} de la anterior)</span>}</span></div>
                <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-brand-600" style={{ width: `${(s.count / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Por fuente">
          <Table>
            <thead><tr><Th>Fuente</Th><Th className="text-right">Leads</Th><Th className="text-right">Inscritos</Th><Th className="text-right">Conversión</Th></tr></thead>
            <tbody>
              {data.sources.map((x) => (
                <tr key={x.s}><Td>{SOURCE_LABEL[x.s]}</Td><Td className="text-right tabular-nums">{x.leads}</Td><Td className="text-right tabular-nums">{x.enrolled}</Td><Td className="text-right tabular-nums">{pct(x.enrolled, x.leads)}</Td></tr>
              ))}
            </tbody>
          </Table>
          <p className="px-4 py-2 text-xs text-slate-400">El costo por inscrito necesita el gasto en anuncios (integración con Meta Ads, fase de marketing).</p>
        </Card>
      </div>
      <Card title="Por asesor">
        <Table>
          <thead><tr><Th>Asesor</Th><Th className="text-right">Leads</Th><Th className="text-right">Contactados</Th><Th className="text-right">Respuesta prom.</Th><Th className="text-right">Inscritos</Th><Th className="text-right">Conversión</Th><Th className="text-right">Seguimientos hechos</Th><Th className="text-right">A tiempo</Th><Th className="text-right">Vencidos hoy</Th></tr></thead>
          <tbody>
            {data.reps.map((r) => (
              <tr key={r.user.id}>
                <Td className="font-medium">{r.user.name}</Td>
                <Td className="text-right tabular-nums">{r.leads}</Td>
                <Td className="text-right tabular-nums">{r.contacted}</Td>
                <Td className="text-right tabular-nums">{fmtMinutes(r.response)}</Td>
                <Td className="text-right tabular-nums">{r.enrolled}</Td>
                <Td className="text-right tabular-nums">{r.conversion == null ? "—" : `${Math.round(r.conversion * 100)}%`}</Td>
                <Td className="text-right tabular-nums">{r.done}</Td>
                <Td className="text-right tabular-nums">{r.onTime == null ? "—" : `${Math.round(r.onTime * 100)}%`}</Td>
                <Td className="text-right">{r.overdue ? <Badge tone="red">{r.overdue}</Badge> : <span className="text-slate-400">0</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!data.reps.length && <Empty>Sin datos en este rango.</Empty>}
      </Card>
    </div>
  );
}
