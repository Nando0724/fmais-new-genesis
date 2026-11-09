import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { activeOptions } from "../../lib/config";
import { canSeeSensitive, useStore } from "../../lib/store";
import type { Student } from "../../lib/types";
import { maskSSN } from "../../lib/utils";
import ConsentEditor from "../ConsentEditor";
import { useToast } from "../Layout";
import { Button, Card, Field, Input, Select } from "../ui";

/** Hook común de las pestañas editables: copia local + guardar/descartar. */
export function useDraft(s: Student) {
  const { save } = useStore();
  const toast = useToast();
  const [d, setD] = useState(s);
  useEffect(() => setD(s), [s]);
  const dirty = JSON.stringify(d) !== JSON.stringify(s);
  const set = <K extends keyof Student>(k: K, v: Student[K]) => setD((x) => ({ ...x, [k]: v }));
  const commit = (patch: Partial<Student> = {}) => {
    save("students", { ...d, ...patch });
    toast("Cambios guardados.");
  };
  return { d, set, setD, dirty, commit, reset: () => setD(s) };
}

export function SaveBar({ dirty, commit, reset, readOnly }: { dirty: boolean; commit: () => void; reset: () => void; readOnly?: boolean }) {
  if (readOnly) return null;
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
      <Button variant="secondary" disabled={!dirty} onClick={reset}>Descartar</Button>
      <Button disabled={!dirty} onClick={() => commit()}>Guardar cambios</Button>
    </div>
  );
}

export default function DetailTab({ s }: { s: Student }) {
  const { db, user } = useStore();
  const { d, set, setD, dirty, commit, reset } = useDraft(s);
  const [reveal, setReveal] = useState(false);
  const ro = user?.role === "instructor";
  const sensitive = canSeeSensitive(user?.role);
  const txt = (k: keyof Student, label: string, cls = "") => (
    <Field label={label} className={cls}>
      <Input disabled={ro} value={(d[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  );

  return (
    <Card>
      <div className="grid gap-6 p-4 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Datos personales</h4>
          <div className="grid grid-cols-6 gap-3">
            {txt("lastName", "Apellido", "col-span-3")}
            {txt("firstName", "Nombre", "col-span-2")}
            {txt("mi", "Inicial", "col-span-1")}
            {txt("address1", "Dirección", "col-span-6")}
            {txt("address2", "Dirección (línea 2)", "col-span-6")}
            {txt("city", "Ciudad", "col-span-3")}
            {txt("state", "Estado", "col-span-1")}
            {txt("zip", "Zip", "col-span-2")}
            <Field label="SSN" className="col-span-2">
              <div className="flex gap-1">
                {sensitive && reveal ? (
                  <Input value={d.ssn ?? ""} onChange={(e) => set("ssn", e.target.value)} />
                ) : (
                  <Input disabled value={maskSSN(d.ssn)} />
                )}
                {sensitive && (
                  <button type="button" onClick={() => setReveal(!reveal)} className="rounded-lg border border-slate-300 px-2 text-slate-500" aria-label="Mostrar SSN">
                    {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                )}
              </div>
            </Field>
            <Field label="Fecha de nacimiento" className="col-span-2"><Input disabled={ro} type="date" value={d.birthdate ?? ""} onChange={(e) => set("birthdate", e.target.value)} /></Field>
            {txt("birthplace", "Lugar de nacimiento", "col-span-2")}
            <Field label="Sexo" className="col-span-2">
              <Select disabled={ro} value={d.sex ?? ""} onChange={(e) => set("sex", e.target.value)}>
                <option value="">—</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="X">Otro</option>
              </Select>
            </Field>
            <Field label="Estado civil" className="col-span-2">
              <Select disabled={ro} value={d.marital ?? ""} onChange={(e) => set("marital", e.target.value)}>
                {["", "Single", "Married", "Divorced", "Widowed", "Separated"].map((m) => <option key={m} value={m}>{m || "—"}</option>)}
              </Select>
            </Field>
            <Field label="Etnia" className="col-span-2">
              <Select disabled={ro} value={d.ethnicity ?? ""} onChange={(e) => set("ethnicity", e.target.value)}>
                <option value="">—</option>
                {activeOptions(db, "ethnicity", d.ethnicity).map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
              </Select>
            </Field>
            {sensitive && txt("driverLicense", "Licencia de conducir", "col-span-3")}
            {sensitive && txt("alienRegistration", "Alien Registration #", "col-span-3")}
          </div>

          <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Educación</h4>
          <div className="grid grid-cols-6 gap-3">
            <Field label="Educación" className="col-span-2">
              <Select disabled={ro} value={d.education ?? ""} onChange={(e) => set("education", e.target.value)}>
                {["", "High School Diploma", "GED", "Some College", "Associate", "Bachelor's", "Bachelor's (foreign)", "Master's"].map((m) => <option key={m} value={m}>{m || "—"}</option>)}
              </Select>
            </Field>
            {txt("highSchool", "Escuela secundaria", "col-span-2")}
            {txt("hsCity", "Ciudad de la secundaria", "col-span-2")}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto</h4>
          {txt("email", "Email")}
          {txt("cell", "Celular")}
          {txt("homePhone", "Teléfono casa")}
          {txt("workPhone", "Teléfono trabajo")}
          <ConsentEditor value={d} disabled={ro} onChange={(patch) => setD({ ...d, ...patch })} />
          <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Escuela</h4>
          <div className="grid grid-cols-2 gap-3">
            {txt("badge", "Badge #")}
            <Field label="Fecha de matrícula"><Input disabled={ro} type="date" value={d.matriculationDate ?? ""} onChange={(e) => set("matriculationDate", e.target.value)} /></Field>
            {txt("locker", "Locker #")}
            {txt("combination", "Combinación")}
          </div>
          {sensitive && (
            <>
              <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ayuda financiera</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="EFC"><Input type="number" value={d.efc ?? 0} onChange={(e) => set("efc", Number(e.target.value))} /></Field>
                <Field label="Ingreso bruto ajustado"><Input type="number" value={d.adjGrossIncome ?? 0} onChange={(e) => set("adjGrossIncome", Number(e.target.value))} /></Field>
                <Field label="Dependientes"><Input type="number" value={d.dependents ?? 0} onChange={(e) => set("dependents", Number(e.target.value))} /></Field>
                <Field label="Dependencia">
                  <Select value={d.dependency ?? ""} onChange={(e) => set("dependency", e.target.value)}>
                    <option value="">—</option>
                    {activeOptions(db, "dependency", d.dependency).map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
                  </Select>
                </Field>
              </div>
            </>
          )}
        </section>
      </div>
      <SaveBar dirty={dirty} commit={commit} reset={reset} readOnly={ro} />
    </Card>
  );
}
