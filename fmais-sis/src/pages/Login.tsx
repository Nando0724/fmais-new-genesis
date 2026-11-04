import { useStore } from "../lib/store";
import { ROLE_LABEL } from "../lib/utils";

export default function Login() {
  const { db, login } = useStore();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-brand-900">FMAIS Staff Portal</h1>
        <p className="mt-1 text-sm text-slate-500">
          Modo demo: elige con qué usuario entrar. Cada rol ve solo los módulos que le corresponden. En producción esto se reemplaza por inicio de sesión con email y contraseña.
        </p>
        <div className="mt-5 space-y-2">
          {db.users
            .filter((u) => u.active)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => login(u.id)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left transition hover:border-brand-500 hover:bg-brand-50"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-800">{u.name}</span>
                  <span className="block text-xs text-slate-500">{u.email}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{ROLE_LABEL[u.role]}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
