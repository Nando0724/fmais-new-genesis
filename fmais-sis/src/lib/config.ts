// Configuración académica (fase 1): valores por defecto, catálogos y migración de datos guardados.
import type { DB, GradeBand, Program, ProgramCost, Selection, SelectionType, SapPolicy } from "./types";

// Confirmada por la escuela: A = 90–100, etc.
export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { letter: "A", min: 90, max: 100 },
  { letter: "B", min: 80, max: 89.99 },
  { letter: "C", min: 70, max: 79.99 },
  { letter: "D", min: 60, max: 69.99 },
  { letter: "F", min: 0, max: 59.99 },
];

// VALORES DE EJEMPLO: la escuela todavía no los tiene. Ver README › "Pendiente de verificar".
export const defaultSap = (): SapPolicy => ({
  academic: { critical: 70, ok: 75, superior: 90 },
  attendance: { critical: 67, ok: 75, superior: 95 },
  weightExam: 40,
  weightWritten: 30,
  excusedCountsAsAttended: false,
  verified: false,
});

export const costsFrom = (tuition: number, registration: number, supplies: number, newId: (p: string) => string): ProgramCost[] => [
  { id: newId("pc"), description: "School Registration Fee", amount: registration, account: "Registration", autoPost: true, institutional: true },
  { id: newId("pc"), description: "Supplies & Educational Resources", amount: supplies, account: "Supplies", autoPost: true, institutional: true },
  { id: newId("pc"), description: "Tuition/Fees", amount: tuition, account: "Tuition", autoPost: true, institutional: true },
];

export const programTotal = (p?: Program) => (p ? p.costs.reduce((t, c) => t + c.amount, 0) : 0);

export const SELECTION_INFO: Record<SelectionType, { label: string; use: string; ready: boolean }> = {
  ethnicity: { label: "Etnia", use: "Ficha › Detalle", ready: true },
  dependency: { label: "Dependencia", use: "Ficha › Detalle (ayuda financiera)", ready: true },
  company: { label: "Empresas (colocación)", use: "Ficha › Colocación: llena contacto y dirección", ready: true },
  account: { label: "Cuentas", use: "Costos del programa · Ledger", ready: true },
  payment_method: { label: "Métodos de pago", use: "Ledger (pagos)", ready: true },
  lead_source: { label: "Fuentes de leads", use: "CRM (fase 7)", ready: false },
  vendor: { label: "Proveedores", use: "Inventario (fase 10)", ready: false },
  product_class: { label: "Clases de producto", use: "Inventario (fase 10)", ready: false },
  distributor: { label: "Distribuidores", use: "Inventario (fase 10)", ready: false },
};

const SEED_VALUES: Record<SelectionType, string[]> = {
  ethnicity: ["Hispanic", "White", "Black or African American", "Asian", "American Indian", "Pacific Islander", "Two or more", "Not reported"],
  dependency: ["Dependent", "Independent", "Unknown"],
  company: ["Smooth Skin Laser Center", "Miami Aesthetic Clinic", "Glow MedSpa Doral", "Baptist Health", "Hialeah Dermatology Group"],
  account: ["Registration", "Supplies", "Tuition", "Kit", "Other"],
  payment_method: ["Card", "Affirm", "FMAIS Plan", "Zelle", "Cash", "Check"],
  lead_source: ["Meta Ads", "Formulario web", "WhatsApp", "Llamada", "Walk-in", "Referido"],
  vendor: [],
  product_class: ["Kit", "Producto", "Material de clínica"],
  distributor: [],
};

export function seedSelections(): Selection[] {
  return (Object.keys(SEED_VALUES) as SelectionType[]).flatMap((type) =>
    SEED_VALUES[type].map((value, i) => ({
      id: `sel_${type}_${i}`,
      type,
      value,
      active: true,
      sort: i,
      extra: type === "company" ? { city: "Miami", state: "FL", phone: "(305) 555-0199" } : undefined,
    })),
  );
}

export const activeOptions = (db: DB, type: SelectionType, current?: string) => {
  const list = db.selections.filter((s) => s.type === type && (s.active || s.value === current)).sort((a, b) => a.sort - b.sort);
  // Un valor guardado que ya no está en el catálogo (p. ej. importado de Genesis) se sigue mostrando.
  return current && !list.some((s) => s.value === current) ? [...list, { id: "_cur", type, value: current, active: false, sort: 999 } as Selection] : list;
};

/** Letra según la escala del programa. */
export const letterFor = (percent: number | undefined, p?: Program) => {
  if (percent == null) return "—";
  const scale = p?.gradeScale?.length ? p.gradeScale : DEFAULT_GRADE_SCALE;
  return [...scale].sort((a, b) => b.min - a.min).find((b) => percent >= b.min)?.letter ?? "—";
};

/** Cuenta que corresponde a un concepto (para asientos viejos o importados que no la traen). */
export const accountFor = (description: string) => {
  const d = description.toLowerCase();
  if (d.includes("registration")) return "Registration";
  if (d.includes("suppl")) return "Supplies";
  if (d.includes("kit") || d.includes("uniform")) return "Kit";
  if (d.includes("tuition") || d.includes("depósito") || d.includes("deposit") || d.includes("cuota")) return "Tuition";
  return "Other";
};

/** Completa asientos guardados antes de la fase 3 (sin cuenta, sin fecha de creación). */
function ensureLedger(db: DB): DB {
  if (db.ledger.every((l) => l.account && l.createdAt)) return db;
  return {
    ...db,
    ledger: db.ledger.map((l) =>
      l.account && l.createdAt
        ? l
        : { ...l, account: l.account ?? accountFor(l.description), institutional: l.institutional ?? true, createdAt: l.createdAt ?? `${l.date}T12:00:00.000Z` },
    ),
  };
}

/** Completa datos guardados antes de la fase 1 (programas con 3 montos fijos, sin catálogos, etc.). */
export function ensurePhase1(db: DB): DB {
  let n = 0;
  const newId = (p: string) => `${p}_m${(++n).toString(36)}`;
  const programs = db.programs.map((raw) => {
    const p = raw as Program & { tuition?: number; registrationFee?: number; suppliesFee?: number };
    if (p.costs && p.gradeScale && p.sap && p.unitType) return p;
    const { tuition = 0, registrationFee = 0, suppliesFee = 0, ...rest } = p;
    return {
      ...rest,
      unitType: p.unitType ?? "clock",
      costs: p.costs ?? costsFrom(tuition, registrationFee, suppliesFee, newId),
      gradeScale: p.gradeScale ?? DEFAULT_GRADE_SCALE,
      sap: p.sap ?? defaultSap(),
    } as Program;
  });
  return ensureLedger({
    ...db,
    programs,
    selections: db.selections ?? seedSelections(),
    settings: {
      ...db.settings,
      autoLogoutMinutes: db.settings.autoLogoutMinutes ?? 30,
      checkMidpointsOnLogin: db.settings.checkMidpointsOnLogin ?? true,
      checkMissingOutOnLogin: db.settings.checkMissingOutOnLogin ?? true,
    },
  });
}
