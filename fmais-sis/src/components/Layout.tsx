import { BarChart3, BookOpenCheck, CalendarCheck, ClipboardList, CreditCard, GraduationCap, LayoutDashboard, LogOut, Megaphone, Menu, Settings, Users } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { canAccess, useStore, type Area } from "../lib/store";
import { ROLE_LABEL } from "../lib/utils";
import { cx, Toast } from "./ui";

const NAV: { to: string; label: string; area: Area; icon: ReactNode }[] = [
  { to: "/", label: "Dashboard", area: "dashboard", icon: <LayoutDashboard size={18} /> },
  { to: "/crm", label: "Admisiones (CRM)", area: "crm", icon: <Users size={18} /> },
  { to: "/marketing", label: "Marketing", area: "marketing", icon: <Megaphone size={18} /> },
  { to: "/enrollments",label: "Inscripciones", area: "enrollments", icon: <ClipboardList size={18} /> },
  { to: "/students", label: "Estudiantes", area: "students", icon: <GraduationCap size={18} /> },
  { to: "/academic", label: "Académico", area: "academic", icon: <BookOpenCheck size={18} /> },
  { to: "/billing", label: "Cobros", area: "billing", icon: <CreditCard size={18} /> },
  { to: "/attendance", label: "Asistencia", area: "attendance", icon: <CalendarCheck size={18} /> },
  { to: "/reports", label: "Reportes", area: "reports", icon: <BarChart3 size={18} /> },
  { to: "/settings", label: "Configuración", area: "settings", icon: <Settings size={18} /> },
];

const ToastCtx = createContext<(m: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export default function Layout() {
  const { db, user, logout } = useStore();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string>();
  const clear = useCallback(() => setToast(undefined), []);

  // Cierre de sesión por inactividad (Customize Auto Features › Auto Log Out).
  const idleMinutes = db.settings.autoLogoutMinutes;
  useEffect(() => {
    if (!user || !idleMinutes) return;
    let t: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(t);
      t = setTimeout(logout, idleMinutes * 60_000);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [user, idleMinutes, logout]);
  const nav = NAV.filter((n) => canAccess(user?.role, n.area));

  return (
    <ToastCtx.Provider value={setToast}>
      <div className="min-h-screen bg-slate-50">
        <aside
          className={cx(
            "fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-brand-900 text-slate-200 transition-transform lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="px-5 py-5">
            <div className="text-lg font-bold tracking-tight text-white">FMAIS</div>
            <div className="text-xs text-slate-400">Sistema Administrativo</div>
          </div>
          <nav className="flex-1 space-y-0.5 px-3">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", isActive ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")
                }
              >
                {n.icon}
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-white/10 p-4">
            <div className="text-sm font-medium text-white">{user?.name}</div>
            <div className="text-xs text-slate-400">{user && ROLE_LABEL[user.role]}</div>
            <button onClick={logout} className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white">
              <LogOut size={14} /> Cambiar usuario
            </button>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="lg:pl-60">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:px-8">
            <button className="rounded p-1 text-slate-600 lg:hidden" onClick={() => setOpen(true)} aria-label="Menú">
              <Menu size={20} />
            </button>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">DEMO · datos ficticios</span>
            <span className="ml-auto hidden text-xs text-slate-500 sm:block">Florida Medical & Aesthetic International School</span>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
        <Toast message={toast} onDone={clear} />
      </div>
    </ToastCtx.Provider>
  );
}
