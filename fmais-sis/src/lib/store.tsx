// Capa de datos. En la demo vive en localStorage; para producción se reemplaza
// este archivo por llamadas a Supabase (mismas colecciones, ver supabase/schema.sql).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildSeed } from "./seed";
import { ensureMarketing } from "./seedMarketing";
import type { Collection, DB, EmailLog, Role, Settings, User } from "./types";
import { nowISO, uid } from "./utils";

const DB_KEY = "fmais-sis-db-v1";
const USER_KEY = "fmais-sis-user";

export type Area = "dashboard" | "crm" | "marketing" | "enrollments" | "students" | "billing" | "attendance" | "reports" | "settings";

const ACCESS: Record<Role, Area[]> = {
  owner: ["dashboard", "crm", "marketing", "enrollments", "students", "billing", "attendance", "reports", "settings"],
  admin: ["dashboard", "crm", "marketing", "enrollments", "students", "billing", "attendance", "reports", "settings"],
  admissions: ["dashboard", "crm", "marketing", "enrollments", "students", "reports"],
  registrar: ["dashboard", "enrollments", "students", "attendance", "reports"],
  finance: ["dashboard", "enrollments", "students", "billing", "reports"],
  instructor: ["students", "attendance"],
};

export const canAccess = (role: Role | undefined, area: Area) => !!role && ACCESS[role].includes(area);
export const canSeeSensitive = (role?: Role) => role === "owner" || role === "admin" || role === "registrar";

type Item<K extends Collection> = DB[K][number];

interface StoreValue {
  db: DB;
  user?: User;
  login: (userId: string) => void;
  logout: () => void;
  save: <K extends Collection>(col: K, item: Item<K>, action?: string) => void;
  saveMany: <K extends Collection>(col: K, items: Item<K>[], action?: string) => void;
  remove: <K extends Collection>(col: K, id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  sendEmail: (e: Omit<EmailLog, "id" | "at">) => void;
  replaceDB: (db: DB) => void;
  resetDemo: () => void;
}

const Ctx = createContext<StoreValue | null>(null);

function load(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    // ensureMarketing completa datos guardados antes de que existiera el módulo de marketing.
    if (raw) return ensureMarketing(JSON.parse(raw));
  } catch {
    /* almacenamiento no disponible */
  }
  return buildSeed();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load);
  const [userId, setUserId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(USER_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  });
  const userRef = useRef(userId);
  userRef.current = userId;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
      } catch {
        /* lleno o bloqueado: la sesión sigue en memoria */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [db]);

  const audit = (d: DB, action: string, entity: string, entityId?: string): DB["audit"] =>
    [{ id: uid(), at: nowISO(), userId: userRef.current, action, entity, entityId }, ...d.audit].slice(0, 2000);

  const save = useCallback(<K extends Collection>(col: K, item: Item<K>, action?: string) => {
    setDb((d) => {
      const list = d[col] as Item<K>[];
      const exists = list.some((x: any) => x.id === (item as any).id);
      const next = exists ? list.map((x: any) => (x.id === (item as any).id ? item : x)) : [item, ...list];
      return { ...d, [col]: next, audit: col === "audit" ? d.audit : audit(d, action ?? (exists ? "update" : "create"), col, (item as any).id) };
    });
  }, []);

  const saveMany = useCallback(<K extends Collection>(col: K, items: Item<K>[], action?: string) => {
    if (!items.length) return;
    setDb((d) => {
      const map = new Map((d[col] as any[]).map((x) => [x.id, x]));
      const fresh: any[] = [];
      items.forEach((it: any) => (map.has(it.id) ? map.set(it.id, it) : fresh.push(it)));
      return { ...d, [col]: [...fresh, ...map.values()], audit: audit(d, action ?? `bulk:${items.length}`, col) };
    });
  }, []);

  const remove = useCallback(<K extends Collection>(col: K, id: string) => {
    setDb((d) => ({ ...d, [col]: (d[col] as any[]).filter((x) => x.id !== id), audit: audit(d, "delete", col, id) }));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, ...patch }, audit: audit(d, "update", "settings") }));
  }, []);

  const sendEmail = useCallback((e: Omit<EmailLog, "id" | "at">) => {
    setDb((d) => ({ ...d, emails: [{ ...e, id: uid(), at: nowISO() }, ...d.emails] }));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      db,
      user: db.users.find((u) => u.id === userId),
      login: (id) => {
        setUserId(id);
        try {
          localStorage.setItem(USER_KEY, id);
        } catch {}
      },
      logout: () => {
        setUserId(undefined);
        try {
          localStorage.removeItem(USER_KEY);
        } catch {}
      },
      save,
      saveMany,
      remove,
      updateSettings,
      sendEmail,
      replaceDB: (next) => setDb(next),
      resetDemo: () => setDb(buildSeed()),
    }),
    [db, userId, save, saveMany, remove, updateSettings, sendEmail],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore fuera de StoreProvider");
  return v;
}

export const userName = (db: DB, id?: string) => db.users.find((u) => u.id === id)?.name ?? id ?? "—";
