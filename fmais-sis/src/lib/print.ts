// Documentos imprimibles que se abren en una ventana nueva.
import { fmtDate } from "./utils";

const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface SignInGroup {
  title: string; // p. ej. "MAÑANA (09:00–13:00)"
  students: { name: string; badge: string; program: string }[];
}

/** Hojas de firma (ITA › Print Sign-In Sheets de Genesis): una página por horario. */
export function printSignInSheets(schoolName: string, date: string, groups: SignInGroup[]) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  const pages = groups
    .filter((g) => g.students.length)
    .map(
      (g) => `<section>
        <header><div><h1>${esc(schoolName)}</h1><h2>Hoja de firmas · ${esc(g.title)}</h2></div><div class="date">${fmtDate(date)}</div></header>
        <table>
          <thead><tr><th>#</th><th>Estudiante</th><th>Badge</th><th>Programa</th><th>Entrada</th><th>Firma</th><th>Salida</th><th>Firma</th></tr></thead>
          <tbody>${g.students
            .map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.badge)}</td><td>${esc(s.program)}</td><td></td><td></td><td></td><td></td></tr>`)
            .join("")}</tbody>
        </table>
        <p class="foot">Total: ${g.students.length} estudiantes. Escribir la hora real de entrada y salida.</p>
      </section>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Hojas de firma ${fmtDate(date)}</title><style>
    body{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:24px}
    section{page-break-after:always}section:last-child{page-break-after:auto}
    header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px}
    h1{font-size:16px;margin:0}h2{font-size:13px;margin:2px 0 0;font-weight:500;color:#334155}.date{font-size:14px;font-weight:600}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #94a3b8;padding:8px 6px;text-align:left}
    th{background:#f1f5f9;font-size:11px;text-transform:uppercase}td:nth-child(n+5){width:12%}
    .foot{font-size:11px;color:#64748b;margin-top:8px}
  </style></head><body>${pages || "<p>No hay estudiantes para esta fecha.</p>"}<script>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

export interface DisbursementLine {
  name: string;
  badge: string;
  account: string;
  institutional: boolean;
  amount: string;
  receipt: string;
  voided?: boolean;
}

/** Comprobante de un desembolso en lote: encabezado del cheque y un renglón por estudiante con su recibo. */
export function printDisbursement(
  schoolName: string,
  b: { date: string; method: string; reference: string; description: string; total: string },
  lines: DisbursementLine[],
) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Desembolso ${esc(b.reference)}</title><style>
    body{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:24px}
    h1{font-size:16px;margin:0}h2{font-size:13px;margin:4px 0 12px;font-weight:500;color:#334155}
    dl{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 12px;font-size:12px;margin:0 0 14px}dt{color:#64748b}dd{margin:0;font-weight:600}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #94a3b8;padding:6px;text-align:left}
    th{background:#f1f5f9;font-size:11px;text-transform:uppercase}td.n{text-align:right;font-variant-numeric:tabular-nums}
    tr.v td{color:#94a3b8;text-decoration:line-through}
  </style></head><body>
    <h1>${esc(schoolName)}</h1><h2>Desembolso en lote · recibos</h2>
    <dl><dt>Fecha</dt><dd>${fmtDate(b.date)}</dd><dt>Método</dt><dd>${esc(b.method)}</dd>
    <dt>Cheque / referencia</dt><dd>${esc(b.reference || "—")}</dd><dt>Total</dt><dd>${esc(b.total)}</dd>
    <dt>Concepto</dt><dd>${esc(b.description)}</dd></dl>
    <table><thead><tr><th>Recibo</th><th>Estudiante</th><th>Badge</th><th>Cuenta</th><th>Inst.</th><th>Monto</th></tr></thead>
    <tbody>${lines.map((l) => `<tr${l.voided ? ' class="v"' : ""}><td>${esc(l.receipt)}</td><td>${esc(l.name)}</td><td>${esc(l.badge)}</td><td>${esc(l.account)}</td><td>${l.institutional ? "Sí" : "No"}</td><td class="n">${esc(l.amount)}</td></tr>`).join("")}</tbody></table>
    <script>window.print()</script></body></html>`);
  w.document.close();
  return true;
}
