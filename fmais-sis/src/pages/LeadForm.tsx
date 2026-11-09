import { useState } from "react";
import { Button, Field, Input, Select } from "../components/ui";
import { planFor } from "../lib/crm";
import { useStore } from "../lib/store";
import type { Lead } from "../lib/types";
import { nowISO, uid } from "../lib/utils";

/**
 * Formulario público "Solicita información". En producción se incrusta en la web de la escuela
 * y envía a la función `lead-intake` (ver docs/INTEGRACIONES.md). Aquí escribe directo al CRM de la demo.
 */
export default function LeadForm() {
  const { db, save, saveMany } = useStore();
  const [lang, setLang] = useState<"es" | "en">("es");
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "", programId: "" });
  const [sent, setSent] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const utm = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("utm_campaign") ?? undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const lead: Lead = { id: uid(), ...f, programId: f.programId || undefined, language: lang, source: "web_form", campaign: utm, stage: "new", createdAt: nowISO(),
      marketingOptIn: optIn, optInAt: optIn ? nowISO() : undefined, optInSource: optIn ? "Formulario web" : undefined };
    save("leads", lead);
    if (db.settings.autoFollowUpPlan) saveMany("followUps", planFor(lead, db.settings.followUpPlan));
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-white p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-brand-900">FMAIS</div>
          <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="text-xs text-brand-600 hover:underline">{lang === "es" ? "English" : "Español"}</button>
        </div>
        {sent ? (
          <div className="py-8 text-center">
            <h1 className="text-xl font-semibold text-slate-800">{t("¡Gracias!", "Thank you!")}</h1>
            <p className="mt-2 text-sm text-slate-500">{t("Un asesor de admisiones te contactará muy pronto.", "An admissions advisor will contact you shortly.")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <h1 className="text-xl font-semibold text-slate-800">{t("Solicita información", "Request information")}</h1>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Nombre", "First name")}><Input required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
              <Field label={t("Apellido", "Last name")}><Input required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
            </div>
            <Field label="Email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label={t("Teléfono", "Phone")}><Input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label={t("Programa de interés", "Program of interest")}>
              <Select value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}>
                <option value="">{t("No estoy seguro", "Not sure yet")}</option>
                {db.programs.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
              {t("Acepto recibir emails de FMAIS con información de programas, fechas y promociones. Puedo darme de baja cuando quiera.", "I agree to receive emails from FMAIS about programs, dates and promotions. I can unsubscribe at any time.")}
            </label>
            <Button type="submit" className="w-full">{t("Enviar", "Submit")}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
