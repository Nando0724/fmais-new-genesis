import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { programOf } from "../../lib/calc";
import { letterFor } from "../../lib/config";
import { useStore } from "../../lib/store";
import type { Grade, Requirement, Student } from "../../lib/types";
import { fmtDate, today, uid } from "../../lib/utils";
import { Badge, Button, Card, Empty, Field, Input, Modal, Progress, Select, Table, Td, Th } from "../ui";

const KIND_LABEL = { exam: "Exam", written: "Written", practical: "Requirement" } as const;

export default function AcademicTab({ s }: { s: Student }) {
  const { db, save, remove } = useStore();
  const program = programOf(s, db);
  const letter = (p?: number) => letterFor(p, program);
  const grades = db.grades.filter((g) => g.studentId === s.id);
  const [edit, setEdit] = useState<Grade | null>(null);
  if (!program) return <Empty>El estudiante no tiene programa.</Empty>;

  const written = program.requirements.filter((r) => r.kind !== "practical");
  const practical = program.requirements.filter((r) => r.kind === "practical");
  const gradeOf = (r: Requirement) => grades.find((g) => g.requirementId === r.id);
  const scored = written.map(gradeOf).filter((g) => g?.percent != null) as Grade[];
  const avg = scored.length ? Math.round(scored.reduce((t, g) => t + (g.percent ?? 0), 0) / scored.length) : undefined;
  const unitsReq = practical.reduce((t, r) => t + r.unitsRequired, 0);
  const unitsDone = practical.reduce((t, r) => t + Math.min(r.unitsRequired, gradeOf(r)?.unitsDone ?? 0), 0);

  const openFor = (r: Requirement) => setEdit(gradeOf(r) ?? { id: uid(), studentId: s.id, requirementId: r.id, date: today(), percent: r.kind === "practical" ? undefined : 0, unitsDone: r.kind === "practical" ? 0 : undefined });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><div className="p-4"><div className="text-xs text-slate-500">Promedio de exámenes</div><div className="mt-1 text-2xl font-semibold">{avg != null ? `${avg}% (${letter(avg)})` : "—"}</div></div></Card>
        <Card><div className="p-4"><div className="text-xs text-slate-500">Exámenes completados</div><div className="mt-1 text-2xl font-semibold">{scored.length} / {written.length}</div></div></Card>
        <Card><div className="p-4"><div className="text-xs text-slate-500">Requisitos prácticos</div><div className="mt-1 text-2xl font-semibold">{unitsDone} / {unitsReq}</div><div className="mt-2"><Progress value={unitsReq ? (unitsDone / unitsReq) * 100 : 0} tone="green" /></div></div></Card>
      </div>

      <Card title="Exámenes (Exam / Written)">
        <Table>
          <thead><tr><Th>Nombre</Th><Th>Tipo</Th><Th>Completado</Th><Th>Letra</Th><Th>%</Th><Th></Th></tr></thead>
          <tbody>
            {written.map((r) => {
              const g = gradeOf(r);
              return (
                <tr key={r.id}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td><Badge tone={r.kind === "exam" ? "violet" : "blue"}>{KIND_LABEL[r.kind]}</Badge></Td>
                  <Td>{g ? fmtDate(g.date) : <Badge>Pendiente</Badge>}</Td>
                  <Td>{letter(g?.percent)}</Td>
                  <Td className="tabular-nums">{g?.percent ?? "—"}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openFor(r)}>{g ? <Pencil size={13} /> : <Plus size={13} />} {g ? "Editar" : "Registrar"}</Button>
                    {g && <Button size="sm" variant="ghost" onClick={() => remove("grades", g.id)} aria-label="Eliminar"><Trash2 size={13} /></Button>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="Requisitos prácticos (Requirement)">
        <Table>
          <thead><tr><Th>Nombre</Th><Th>Actualizado</Th><Th>Unidades</Th><Th>Hechas</Th><Th>Faltan</Th><Th className="w-40">%</Th><Th></Th></tr></thead>
          <tbody>
            {practical.map((r) => {
              const g = gradeOf(r);
              const done = Math.min(r.unitsRequired, g?.unitsDone ?? 0);
              return (
                <tr key={r.id}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td>{g ? fmtDate(g.date) : "—"}</Td>
                  <Td className="tabular-nums">{r.unitsRequired}</Td>
                  <Td className="tabular-nums">{done}</Td>
                  <Td className="tabular-nums">{r.unitsRequired - done}</Td>
                  <Td><Progress value={(done / Math.max(1, r.unitsRequired)) * 100} tone={done >= r.unitsRequired ? "green" : "brand"} /></Td>
                  <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => openFor(r)}><Pencil size={13} /> Actualizar</Button></Td>
                </tr>
              );
            })}
            {!practical.length && <tr><Td colSpan={7} className="text-center text-slate-400">Este programa no tiene requisitos prácticos.</Td></tr>}
          </tbody>
        </Table>
      </Card>

      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={program.requirements.find((r) => r.id === edit.requirementId)?.name}
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={() => { save("grades", edit); setEdit(null); }}>Guardar</Button></>}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Requisito" className="col-span-2">
              <Select value={edit.requirementId} disabled>
                {program.requirements.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Fecha"><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            {edit.unitsDone != null ? (
              <Field label="Unidades hechas"><Input type="number" min={0} value={edit.unitsDone} onChange={(e) => setEdit({ ...edit, unitsDone: Number(e.target.value) })} /></Field>
            ) : (
              <Field label="Porcentaje" hint={`Letra: ${letter(edit.percent)}`}><Input type="number" min={0} max={100} value={edit.percent ?? 0} onChange={(e) => setEdit({ ...edit, percent: Number(e.target.value) })} /></Field>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
