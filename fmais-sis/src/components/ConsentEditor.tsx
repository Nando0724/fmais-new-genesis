import { Link } from "react-router-dom";
import type { MarketingConsent } from "../lib/types";
import { fmtDate, nowISO } from "../lib/utils";
import { ConsentBadge } from "./MarketingTabs";

/** Bloque de consentimiento de marketing, usado en la ficha del lead y del estudiante. */
export default function ConsentEditor({ value, onChange, disabled }: { value: MarketingConsent & { email?: string }; onChange: (patch: Partial<MarketingConsent>) => void; disabled?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <span className="text-slate-600">Marketing:</span>
      <ConsentBadge c={value} />
      {value.optInSource && <span className="text-xs text-slate-400">{value.optInSource} · {fmtDate(value.optInAt?.slice(0, 10))}</span>}
      {!disabled && (
        <span className="ml-auto flex gap-2 text-xs">
          {value.unsubscribedAt ? (
            <button className="text-brand-600 hover:underline" onClick={() => confirm("¿La persona pidió volver a recibir emails de marketing?") && onChange({ unsubscribedAt: undefined, marketingOptIn: true, optInAt: nowISO(), optInSource: "Pedido por la persona" })}>
              Volver a suscribir
            </button>
          ) : value.marketingOptIn ? (
            <button className="text-slate-500 hover:underline" onClick={() => onChange({ unsubscribedAt: nowISO() })}>Dar de baja</button>
          ) : (
            <button className="text-brand-600 hover:underline" onClick={() => confirm("¿La persona aceptó recibir emails de marketing?") && onChange({ marketingOptIn: true, optInAt: nowISO(), optInSource: "Consentimiento verbal registrado por el staff" })}>
              Registrar consentimiento
            </button>
          )}
          <Link to="/marketing?tab=contacts" className="text-slate-400 hover:underline">Ver todos</Link>
        </span>
      )}
    </div>
  );
}
