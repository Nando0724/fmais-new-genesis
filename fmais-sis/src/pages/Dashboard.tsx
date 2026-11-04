import { AlertTriangle, CreditCard, GraduationCap, UserPlus, Users } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, Empty, PageHeader, Stat } from "../components/ui";
import { balance, consecutiveAbsences, isAboutToGrad, planStatus, remainingHours } from "../lib/calc";
import { useStore, userName } from "../lib/store";
import { LEAD_SOURCES, LEAD_STAGES } from "../lib/types";
import { addDays, addMonths, displayName, fmtDate, money, SOURCE_LABEL, STAGE_LABEL, today } from "../lib/utils";

export default function Dashboard() {
  const { db, user } = useStore();
  const T = today();

  const d = useMemo(() => {
    const active = db.students.filter((s) => s.status === "Enrolled");
    const monthStart = T.slice(0, 8) + "01";
    const leads7 = db.leads.filter((l) => l.createdAt.slice(0, 10) >= addDays(T, -7));
    const uncontacted = db.leads.filter((l) => l.stage === "new" && !l.firstContactAt);
    const enrolledMonth = db.students.filter((s) => s.enrollmentDate >= monthStart);
    const receivable = db.students.filter((s) => s.status === "Enrolled" || s.status === "LOA").reduce((t, s) => t + Math.max(0, balance(s.id, db)), 0);
    const overdue = db.plans.filter((p) => planStatus(p, db) === "overdue");
    const absences = active.map((s) => ({ s, n: consecutiveAbsences(s, db) })).filter((x) => x.n >= db.settings.absenceThreshold).sort((a, b) => b.n - a.n);
    const aboutToGrad = active.filter((s) => isAboutToGrad(s, db));
    const tasks = db.leads
      .filter((l) => l.nextActionDate && l.nextActionDate <= T && l.stage !== "lost" && l.stage !== "enrolled")
      .filter((l) => user?.role !== "admissions" || l.ownerId === user.id)
      .sort((a, b) => a.nextActionDate!.localeCompare(b.nextActionDate!));

    const since30 = addDays(T, -30);
    const bySource = LEAD_SOURCES.filter((s) => s !== "import").map((s) => ({
      name: SOURCE_LABEL[s],
      leads: db.leads.filter((l) => l.source === s && l.createdAt.slice(0, 10) >= since30).length,
      inscritos: db.leads.filter((l) => l.source === s && l.createdAt.slice(0, 10) >= since30 && l.stage === "enrolled").length,
    }));
    const months = Array.from({ length: 6 }, (_, i) => addMonths(monthStart, i - 5).slice(0, 7)).map((m) => ({
      name: m.slice(5) + "/" + m.slice(2, 4),
      inscritos: db.students.filter((s) => s.enrollmentDate.startsWith(m)).length,
      leads: db.leads.filter((l) => l.createdAt.startsWith(m)).length,
    }));
    const order = LEAD_STAGES.filter((s) => s !== "lost");
    const funnel = order.map((st, i) => ({ name: STAGE_LABEL[st], n: db.leads.filter((l) => l.stage !== "lost" && order.indexOf(l.stage) >= i).length }));
    return { active, leads7, uncontacted, enrolledMonth, receivable, overdue, absences, aboutToGrad, tasks, bySource, months, funnel };
  }, [db, T, user]);

  const sname = (id: string) => {
    const s = db.students.find((x) => x.id === id);
    return s ? displayName(s) : id;
  };

  return (
    <div>
      <PageHeader title={`Hola, ${user?.name.split(" ")[0]}`} subtitle={`Resumen al ${fmtDate(T)}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Leads (7 días)" value={d.leads7.length} sub={`${d.uncontacted.length} sin contactar`} tone="blue" icon={<UserPlus size={16} />} />
        <Stat label="Inscritos este mes" value={d.enrolledMonth.length} tone="green" icon={<Users size={16} />} />
        <Stat label="Estudiantes activos" value={d.active.length} sub={`${d.aboutToGrad.length} por graduar`} tone="brand" icon={<GraduationCap size={16} />} />
        <Stat label="Por cobrar" value={money(d.receivable)} sub={`${d.overdue.length} pagos vencidos`} tone="amber" icon={<CreditCard size={16} />} />
        <Stat label="Alertas de ausencia" value={d.absences.length} sub={`≥ ${db.settings.absenceThreshold} días seguidos`} tone="red" icon={<AlertTriangle size={16} />} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title="Leads por fuente (30 días)" className="lg:col-span-2">
          <div className="h-64 p-3">
            <ResponsiveContainer>
              <BarChart data={d.bySource}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={11} tickLine={false} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="leads" name="Leads" fill="#2b4597" radius={[4, 4, 0, 0]} />
                <Bar dataKey="inscritos" name="Inscritos" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Embudo de admisiones">
          <div className="space-y-2 p-4">
            {d.funnel.map((f, i) => (
              <div key={f.name}>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{f.name}</span>
                  <span className="tabular-nums">{f.n}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(f.n / Math.max(1, d.funnel[0].n)) * 100}%`, opacity: 1 - i * 0.1 }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Tareas de admisiones para hoy" actions={<Link to="/crm" className="text-xs text-brand-600 hover:underline">Ver CRM</Link>}>
          {d.tasks.length ? (
            <ul className="divide-y divide-slate-100">
              {d.tasks.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <div className="min-w-0">
                    <Link to={`/crm?lead=${l.id}`} className="font-medium text-slate-800 hover:underline">{displayName(l)}</Link>
                    <div className="truncate text-xs text-slate-500">{l.nextAction} · {userName(db, l.ownerId)}</div>
                  </div>
                  {l.nextActionDate! < T ? <Badge tone="red">Atrasada</Badge> : <Badge tone="blue">Hoy</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Sin tareas pendientes.</Empty>
          )}
        </Card>
        <Card title="Ausencias consecutivas" actions={<Link to="/attendance?tab=alerts" className="text-xs text-brand-600 hover:underline">Ver todas</Link>}>
          {d.absences.length ? (
            <ul className="divide-y divide-slate-100">
              {d.absences.slice(0, 8).map(({ s, n }) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <Link to={`/students/${s.id}`} className="font-medium text-slate-800 hover:underline">{displayName(s)}</Link>
                  <Badge tone="red">{n} días</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nadie con ausencias consecutivas.</Empty>
          )}
        </Card>
        <Card title="Pagos vencidos y por graduar">
          <ul className="divide-y divide-slate-100">
            {d.overdue.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <Link to={`/students/${p.studentId}?tab=ledger`} className="font-medium text-slate-800 hover:underline">{sname(p.studentId)}</Link>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{money(p.amount)} · {fmtDate(p.nextDue)}</span>
                  <Badge tone="amber">{p.mode === "zelle" ? "Zelle" : "Auto"}</Badge>
                </span>
              </li>
            ))}
            {d.aboutToGrad.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <Link to={`/students/${s.id}`} className="font-medium text-slate-800 hover:underline">{displayName(s)}</Link>
                <Badge tone="green">Faltan {remainingHours(s, db)} h</Badge>
              </li>
            ))}
            {!d.overdue.length && !d.aboutToGrad.length && <Empty>Todo al día.</Empty>}
          </ul>
        </Card>
      </div>

      <Card title="Leads vs. inscritos por mes" className="mt-4">
        <div className="h-56 p-3">
          <ResponsiveContainer>
            <BarChart data={d.months}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={11} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="leads" name="Leads" fill="#93a5d8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inscritos" name="Inscritos" fill="#182b6b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
