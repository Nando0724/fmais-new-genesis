# FMAIS — Sistema Administrativo Centralizado (reemplazo de Genesis-SMSS)

**Fecha:** 2026-11-09 · **Estado:** v0.3 — especificación alineada con el manual oficial de Genesis-SMSS (`genesis-manual.pdf`, 115 págs.). Lo nuevo de v0.3 está marcado con 🆕. **Las fases 1 a 5 (§11) ya están en la demo**; el resto de lo marcado 🆕 aún no. Preguntas abiertas en §12.

## 1. Objetivo

Unificar en el portal existente (`thefmais-enrollment.lovable.app`) toda la información administrativa de Florida Medical & Aesthetic International School (FMAIS):

| Módulo | Hoy vive en | Destino |
|---|---|---|
| Inscripciones (enrollment online, firma, depósito) | Portal Lovable ✅ | Se mantiene |
| Cobros automáticos + recordatorios Zelle | Portal Lovable ✅ | Se integra con el Ledger del estudiante |
| Base de datos de estudiantes (expediente académico, asistencia, ledger, colocación, SAP) | **Genesis-SMSS v2.84 (2009, Windows)** | **Módulo "Estudiantes"** |
| CRM de admisiones (leads) | Genesis "Student Leads" + otras fuentes | **Módulo "Admisiones / CRM"** |
| Configuración académica (programas, costos, horarios, SAP, catálogos) | Genesis "Maintenance" | **Módulo "Configuración"** 🆕 ampliado |
| Inventario y servicios (kits, productos, clínica) | Genesis "Inventory / Services / POS" | **Módulo "Inventario"** 🆕 (fase posterior) |

Principio: **un solo registro por persona** que avanza Lead → Aplicante → Inscrito → Activo → Graduado/Baja, sin volver a teclear datos.

Principio 2 (del manual): **dos formas de trabajar** — una a una desde la ficha del estudiante, y **en lote** desde "Tareas" (notas, asistencia y pagos de muchos estudiantes a la vez). La app debe tener las dos.

---

## 2. Inventario de Genesis

### 2.1 Menús (de las fotos)

| Menú | Opciones |
|---|---|
| **File** | Backup Database · Import ▸ · Print Setup · Exit |
| **Maintenance** | School · Program ▸ (Add / Edit / Copy Program) · Student ▸ (Add / Edit Student) · Reports · Inventory · Selections · User Security · Holidays / Adjustments · Check Midpoints · Services · Labels |
| **Tasks** | Ledger · Academics · Attendance · **Student Leads** · Setup Clinic/Non-Clinic Hours · Assign Clinic/Non-Clinic Hours |
| **Options** | Toolbar Settings · Activate Genesis · Credit Hour Module · POS Setup · ITA Setup · ITA Check Swipes · ITA Check Attendance · Check Consecutive Absences · Check for Students About To Grad · Customize Auto Features |
| **Window / Help** | Organización de ventanas · About · User Manual (no se replican) |

Barra de herramientas: Program · Student · Ledger · Academic · R-Reports · Labels · ITA Setup · Chk Swipes · Attendance · Chk MidPnt · Exit.
Login: usuario + contraseña + selector de base de datos ("Remote Access for Multi-School Locations").

### 2.2 Ficha del estudiante ("Student Maintenance Form")

**Encabezado fijo:** Nombre · Badge # · Programa · Horario (Schedule) · Estado de inscripción · Estado del registro · Fecha de graduación por contrato · Fecha de graduación proyectada.

| Pestaña | Campos / funciones |
|---|---|
| **Exam** | Exámenes de un solo intento (midterm, final): nombre · fecha · letra · %. Se edita con doble clic. (Confirmado por el manual §6.3.) |
| **Written** | Trabajos diarios (quiz, tarea, test): nombre · fecha completado · letra · %. |
| **Requirement** | Requisitos prácticos con unidades múltiples: nombre · completado · letra · % · unidades · hechas · faltan · Summary / Add / Remove. |
| **Placement** | ¿Pasó State Board Exam? + fecha. Empleo: empresa (de catálogo, autollenado de contacto/dirección editable), fecha de contratación, contacto, dirección, teléfono, fax. |
| **Ledger** | Fecha · registrado por · concepto · cargo · pago · recibo # · método · cuenta · institucional · anulado · totales y **balance** · Add / Edit / Print. |
| **Attendance** | Fecha · tipo · entrada · salida · breaks (minutos) · total horas · Add / Remove · **Midpoints Reached** (unidades + fecha en que se alcanzó). |
| **Detail** | Datos personales, dirección, SSN, nacimiento, sexo, estado civil, etnia, licencia, email, escuela secundaria, educación, badge, combination, locker, alien #, teléfonos, fecha de matrícula, datos FISAP (EFC, Auto Zero EFC, AGI, dependientes, dependency, exceptions). |
| **Enrollment** | Status · record · first class · enroll date (firma del contrato) · contract graduation · completion · horario 1/2/3 con fecha de cambio · horas programadas · transfer / re-enrollment hours · **horas importadas del sistema anterior + fecha "empezar a contar en Genesis"** · LOA · horas extra · último día asistido · horas asistidas · probation · instructor. |
| **SAP** 🆕 | Botón **Calcular SAP**: resultado académico (cualitativo) y de asistencia (cuantitativo) contra los niveles Critical / OK / Superior del programa. |
| **FAS** | Deshabilitada (ayuda financiera federal) — ver §12. |

Barra lateral de la ficha: R-Reports · Comments (notas) · Labels · Close · ITA Setup · Chk Swipes · Attendance · Chk MidPnt.

### 2.3 Lo que agrega el manual oficial 🆕

| Área (cap. del manual) | Qué hace Genesis | Estado en la demo v0.2 | Decisión |
|---|---|---|---|
| **Selections** (cap. 3) | 12 catálogos editables: niveles de asistencia, dependency, estado del estudiante, proveedor, etnia, método de pago, clase de producto, fuente de lead, cuenta, staff, distribuidor, empresa. **No se borran**, solo se desactivan. | Valores fijos en el código | **Tabla `selections`** genérica, editable en Configuración. Nunca se borra un valor usado; se desactiva. |
| **School** (4.1) | Nombre, fechas de aprobación y vencimiento de la licencia estatal, dirección, contactos, oficiales corporativos. El nombre sale en todos los reportes. | Nombre, dirección, teléfono | Agregar licencia (número, aprobación, vencimiento con alerta 60 días antes) y oficiales. |
| **Program – Info** (4.2) | Largo del programa (horas/créditos), Exit Analysis, Academic Year, acreditación con fechas. | Solo horas totales | Agregar `unit_type` (clock/credit), `exit_analysis_units`, `academic_year_units`, acreditadora y fechas. |
| **Program – Parameters** (4.3) | Parámetros de pago y **escala de notas** (letra ↔ % mínimo y máximo). | Sin escala | Tabla `grade_scale` por programa; al escribir el % se calcula la letra sola. |
| **Program – Costs** (4.4) | Costos detallados. Casilla **Add** = se cargan solos al ledger al inscribir (auto-post). Casilla **Inst** = cargo institucional (cuenta en reembolsos). **Horas extra:** al llegar a X horas programadas se cobra el resto a $Y/hora. | 3 montos fijos | Tabla `program_costs` (concepto, monto, auto_post, institutional). Overtime automático. |
| **Program – Academics** (4.5) | Funciones académicas tipo Exam / Written / Requirement, unidades (1 para Exam/Written, N para Requirement), activa. Botón **"Actualizar estudiantes existentes"** al agregar una. Desactivar no afecta a los ya inscritos. | Lista de requisitos | Igual al manual, más el botón de actualizar inscritos. |
| **Program – Schedule** (4.6) | Por cada **nivel de asistencia** (Full Time, Part Time…): horario por día con entrada, salida y break; horas/semana calculadas. Es una guía, no impide asistir fuera de horario. | Horarios globales | Horarios por programa + nivel, con horario distinto por día. |
| **Program – SAP** (4.7) | Tres niveles **Critical / OK / Superior** para académico y para asistencia. Pesos Exam + Written + Requirement = 100%. Opción "contar horas excusadas como asistidas". **Midpoints** automáticos. | Solo midpoints | SAP completo (ver §5.3). |
| **Leads** (cap. 5) | Activo/inactivo, fecha, fuente, representante, programa / horario / fecha de inicio deseada. **Follow-ups** con fecha y fecha de completado; pestaña con los vencidos. Botón **Lead** al crear estudiante importa los datos. | CRM más completo | Mantener CRM; agregar fecha de inicio y horario deseados, y vista "Seguimientos vencidos". |
| **Nuevo estudiante** (6.1) | Campos obligatorios en amarillo. Datos FISAP. Casilla **Auto-ledger**. | Parcial | Marcar obligatorios; casilla auto-ledger que aplica los costos con "Add". |
| **Ledger** (6.7) | Tipos: **Cargo**, **Pago**, **Cargo con pago automático** (2 líneas). Método solo en pagos. **Cuenta** a la que se aplica. **Institucional**. **Anular** (sigue visible, no sale en reportes). **Reembolso = pago negativo** (para el 1098-T). Guarda quién y cuándo modificó; si la fecha del asiento ≠ fecha de modificación, se marca para verificar. Recibo con número automático e impresión. | Cargo/pago simple | Todo lo del manual (ver §5.1). |
| **Asistencia** (6.8, 6.10) | Midpoints alcanzados con fecha; horas importadas + fecha de inicio de conteo (el SAP ignora lo anterior). | Parcial | Agregar `tracking_start_date` y horas excusadas. |
| **Tareas en lote** (cap. 7) | **Academic:** programa → tipo → función → lista de estudiantes → notas → Procesar (solo guarda lo que cambió; 0 = completado sin nota). **Attendance:** fecha → programa → horario → lista prellenada con el horario → quitar ausentes → Procesar. **Ledger (desembolso):** un cheque repartido entre varios estudiantes, con cuenta e institucional por línea, total sin repartir en vivo, recibos. | Solo hoja de asistencia diaria | **Nuevo menú "Tareas"** con las tres. |
| **Holidays / Adjustments** (8.1) | Fecha + "Todos los programas" o uno, con hora de inicio y fin (cierre parcial, p. ej. 2 horas por tormenta). Reduce las horas **programadas**, no las asistidas. | Feriados de día completo | Agregar programa y rango de horas. |
| **Inventory** (8.2) | Artículos, existencia, punto de reorden (en rojo si está debajo), proveedor, distribuidor, clase; agregar existencias; el POS descuenta al vender. | No existe | Módulo Inventario (fase 8). |
| **Check Midpoints** (8.3) | Al iniciar sesión muestra los estudiantes que alcanzaron un midpoint; se calcula SAP en lote, se imprime y se decide si vuelven a aparecer. Recordatorio para pedir desembolsos de ayuda financiera. | Lista de midpoints | Cola de midpoints con "revisado" y SAP en lote. |
| **Services** (8.4) | Servicio (p. ej. "Corte y secado") = varios requisitos de uno o más programas + costo + inventario usado. Al registrarlo suma unidades a los requisitos y descuenta inventario. | No existe | Fase 8, junto con la clínica. |
| **Customize Auto Features** (8.5) | Activar/desactivar los chequeos al iniciar sesión (swipes faltantes, midpoints). **Cierre de sesión por inactividad** (minutos). | Umbrales de alertas | Agregar los interruptores y el auto-logout. |
| **Reports** (cap. 9) | 29 reportes (ver §5.6). Ledger – Payments avisa de asientos modificados fuera del rango de fechas. | 7 reportes | Completar el catálogo. |
| **ITA** (cap. 10) | Reloj con badge: incrementos de tiempo, ignorar swipes duplicados, redondeo a la hora de entrada/salida del programa. **Check Swipes:** faltó marcar salida. **Check Attendance:** quién no llegó (con teléfono) a los 5 min del inicio, quién está presente, hojas de firma. | No existe (asistencia manual) | Kiosco opcional (fase 9). **Check Attendance** y las hojas de firma sí se hacen ya, porque sirven con asistencia manual. |
| **Backup** (cap. 11) | Copia a disquete en `c:\genbkup`. | Descarga de respaldo | Backups automáticos de Supabase + exportación. |

---

## 3. Arquitectura

- **Frontend:** el mismo proyecto Lovable (React + Vite + Tailwind + shadcn/ui), nuevas rutas bajo `/admin`.
- **Backend:** Supabase del proyecto Lovable (Postgres + Auth + Storage + Edge Functions + RLS).
- **Reglas de negocio en la base de datos** 🆕: los cálculos que deben coincidir en pantalla y en reportes (horas programadas, horas asistidas, balance, SAP, midpoints, overtime) viven en vistas/funciones de Postgres. El frontend solo las muestra. En la demo están en `src/lib/calc.ts` con la misma lógica.
- **Trabajos programados** 🆕 (Supabase cron / Edge Functions): chequeo diario de midpoints, ausencias consecutivas, por graduar, cargos de overtime, vencimiento de licencia, cobros automáticos y recordatorios Zelle. Sus resultados llegan al **Centro de alertas**, que reemplaza las ventanas que Genesis abre al iniciar sesión.
- **Pagos:** se reutiliza la integración de cobros existente; cada cargo/pago se asienta en `ledger_entries`.
- **Emails:** el proveedor que ya usa el portal para recordatorios Zelle.
- **Marketing:** Constant Contact (API v3) para campañas; un agente de IA prepara el contenido y una persona aprueba (§9).
- **PDF / impresión:** recibos, reportes, etiquetas y hojas de firma se generan como PDF en el navegador.

Navegación del admin:

```
/admin
├── dashboard        KPIs + Centro de alertas (midpoints, swipes/salidas faltantes, ausencias, por graduar, SAP crítico, licencia por vencer)
├── crm              Pipeline de leads (kanban + tabla) + seguimientos vencidos
├── marketing        Segmentos, campañas pendientes de aprobar, resultados (Constant Contact)
├── enrollments      (existente)
├── students         Lista + ficha con pestañas (incluye SAP)
├── tasks            🆕 En lote: Notas · Asistencia · Desembolso (un cheque → varios estudiantes)
├── billing          (existente) cobros automáticos / Zelle
├── attendance       Hoja diaria, Check Attendance (quién falta ahora), hojas de firma, midpoints
├── inventory        🆕 (fase 8) Artículos, existencias, reorden, servicios
├── reports          Catálogo de reportes (§5.6), PDF y Excel
└── settings         Escuela · Catálogos (Selections) 🆕 · Programas (Info, Costos, Notas, Académico, Horarios, SAP) · Feriados y ajustes · Usuarios y roles · Plantillas · Automatizaciones · Datos
```

---

## 4. Modelo de datos (Postgres)

> Sensibles (SSN, Alien #, licencia) en columnas cifradas y visibles solo con rol autorizado.

**Configuración**
- **school_settings** — nombre, dirección, logo, zona horaria, contactos, 🆕 licencia estatal (número, aprobación, vencimiento), oficiales corporativos, auto-logout (min), interruptores de chequeos al iniciar sesión.
- **selections** 🆕 — `type` (attendance_level · dependency · student_status · vendor · ethnicity · payment_method · product_class · lead_source · account · staff · distributor · company), valor, datos extra (JSON; p. ej. contacto y dirección de la empresa), `active`, orden. Sin borrado.
- **programs** — código, nombre, 🆕 `unit_type` (clock/credit), largo (unidades), exit analysis, academic year, acreditadora + fechas, overtime_after_hours, overtime_rate, `is_active`, `copied_from`.
- **program_costs** 🆕 — program_id, concepto, monto, cuenta, `auto_post`, `institutional`.
- **grade_scale** 🆕 — program_id, letra, % mínimo, % máximo.
- **academic_functions** (antes program_requirements) — program_id, nombre, tipo (`exam` · `written` · `requirement`), unidades (1 para exam/written), activa, orden.
- **program_schedules** 🆕 (antes schedules) — program_id, nivel de asistencia (selection), y por día: entrada, salida, break (min); horas/semana calculadas.
- **sap_policies** 🆕 — program_id, mínimos académicos y de asistencia para Critical / OK / Superior, pesos exam/written/requirement (suman 100), `excused_counts_as_attended`.
- **program_midpoints** — program_id, número, unidades del hito.
- **calendar_adjustments** 🆕 (antes holidays) — fecha, descripción, program_id (null = todos), hora inicio, hora fin.

**Personas y CRM**
- **people** — datos personales comunes a lead y estudiante.
- **leads** — person_id, activo, fecha, fuente, campaña/UTM, programa, 🆕 horario y fecha de inicio deseados, etapa, representante, puntaje, próxima acción, motivo de pérdida.
- **lead_activities** — tipo, resultado, fecha, usuario; 🆕 seguimientos con `due_date` y `completed_at`.

**Estudiantes**
- **students** — person_id, badge, SSN (cifrado), sexo, estado civil, etnia, lugar de nacimiento, licencia, alien #, educación, escuela secundaria, locker, combination, fecha de matrícula, FISAP (EFC, auto zero EFC, AGI, dependientes, dependency, exceptions).
- **enrollments** — student_id, program_id, status, record, enroll date, first class, contract grad, projected grad, completion, horas transferidas, horas importadas, 🆕 `tracking_start_date`, `auto_ledger`, probation + fecha, instructor_id.
- **enrollment_schedules** — enrollment_id, program_schedule_id, desde.
- **leaves_of_absence** — enrollment_id, inicio, fin, motivo.
- **attendance_records** — enrollment_id, fecha, tipo (regular, makeup, clinic, non-clinic, 🆕 excused, absent), entrada, salida, breaks, horas, fuente (`manual` · `batch` · `kiosk` · `import`).
- **attendance_swipes** 🆕 (fase 9) — enrollment_id, fecha-hora, crudo y redondeado, ignorado (duplicado).
- **midpoint_events** 🆕 — enrollment_id, midpoint, fecha alcanzado, revisado por / cuándo, resultado SAP.
- **grades** — enrollment_id, academic_function_id, fecha, letra (calculada), %, unidades hechas.
- **sap_evaluations** 🆕 — enrollment_id, fecha de evaluación, % académico, % asistencia, nivel resultante, calculado por.
- **placements** — enrollment_id, pasó board exam, fecha, empresa (selection), contacto, dirección, teléfono, fax, fecha de contratación.

**Finanzas**
- **ledger_entries** — enrollment_id, fecha, tipo (`charge` · `payment`), concepto, monto (los reembolsos son pagos negativos), método (selection), 🆕 cuenta (selection), `institutional`, `auto_posted`, `voided` + motivo, recibo #, `batch_id` (desembolso en lote), referencia de transacción, `payment_plan_id`, creado por/cuándo, modificado por/cuándo, `needs_verification` (fecha ≠ fecha de modificación).
- **disbursement_batches** 🆕 — fecha, método, cheque #, total, total repartido, creado por.
- **payment_plans** — (existente: cobros automáticos/Zelle) enlazado a enrollment.

**Inventario (fase 8)** 🆕
- **inventory_items** — descripción, clase, proveedor, distribuidor, costo, precio, existencia, punto de reorden.
- **inventory_movements** — item_id, cantidad (+/-), motivo (compra, venta, servicio, ajuste), referencia.
- **services / service_programs / service_requirements / service_inventory** — servicio con costo, programas asociados, requisitos con unidades e inventario que consume.

**Transversal**
- **comments** · **documents** · **audit_log** (quién cambió qué y cuándo; obligatorio para auditorías estatales).

Roles: `owner`, `admin`, `admissions`, `registrar`, `finance`, `instructor` (solo asistencia y notas de sus grupos).

---

## 5. Reglas de negocio 🆕

### 5.1 Ledger
1. Tipos: **Cargo**, **Pago**, **Cargo con pago automático** (crea dos asientos enlazados).
2. Método de pago solo en pagos. Todo asiento lleva **cuenta**.
3. **Institucional**: marca los asientos que cuentan en el cálculo de reembolso.
4. **Reembolso** = pago con monto negativo (requisito para el 1098-T).
5. **Anular** en vez de borrar: el asiento sigue visible tachado y no suma en balance ni reportes. Nunca se borra un asiento.
6. Cada asiento guarda creado por/cuándo y modificado por/cuándo. Si se modifica con fecha distinta a la del asiento, queda **"por verificar"** y aparece en el reporte Ledger – Payments.
7. Todo pago genera **número de recibo** consecutivo y ofrece imprimir el recibo.
8. **Auto-post**: al crear la inscripción con auto-ledger activo se cargan los costos del programa marcados "Add".
9. ~~**Overtime**~~: la escuela no cobra horas extra (§12 #17); no se construye.

### 5.2 Horas
- **Programadas** = suma diaria del horario asignado (según la fecha de cada cambio de horario) desde first class hasta hoy, menos feriados/ajustes (completos o parciales, del programa o de todos), menos días en LOA.
- **Asistidas** = asistencia registrada (+ excusadas si la política del programa lo permite) + transferidas + importadas.
- **Ausencia / Makeup** se calculan solo desde `tracking_start_date`; lo anterior entra como horas importadas.
- **Fecha de graduación proyectada** = hoy + (horas que faltan / ritmo real de las últimas 4 semanas, o el horario si no hay historial).

### 5.3 SAP
- **Académico (cualitativo):** promedio ponderado = Exam × peso + Written × peso + Requirement × (100 − los otros dos). Solo cuentan funciones activas cuando el estudiante se inscribió.
  - Exam y Written: promedio de los %; un 0 es "completado sin nota" y no entra.
  - Requirement: unidades hechas / unidades esperadas para las horas que lleva (tope 100). No se evalúa hasta la primera unidad o el primer midpoint.
  - Si una categoría aún no tiene datos, su peso se reparte entre las demás. *(Regla de la demo: confirmar con la escuela.)*
- **Niveles:** debajo del mínimo Critical = Critical; entre Critical y OK = Bajo OK; OK; Superior.
- **Asistencia (cuantitativo):** horas asistidas / horas programadas.
- El resultado se compara con los niveles **Critical / OK / Superior** del programa; el SAP general es el **más bajo** de los dos.
- Se calcula en la ficha (botón), en lote desde la cola de midpoints y en el reporte de evaluación a cualquier fecha. Cada cálculo se guarda en `sap_evaluations`.
- Resultado Critical → propuesta de probation (una persona confirma).

### 5.4 Midpoints
- Cuando las horas asistidas cruzan un midpoint del programa se crea un `midpoint_event` con la fecha.
- Aparecen en el Centro de alertas hasta que alguien los marca revisados (con SAP calculado). Opción "volver a mostrar".
- Sirven de recordatorio para pedir desembolsos de ayuda financiera, si aplica (§12).

### 5.5 Tareas en lote
- **Notas:** programa → tipo → función → estudiantes inscritos que la tienen → % (o 0 = completado sin nota) → Procesar. Solo se guardan las filas cambiadas.
- **Asistencia:** fecha → programa → horario → estudiantes con first class ≤ fecha, prellenados con entrada/salida/break del horario → quitar o ajustar → Procesar. (Reemplaza la "hoja diaria" actual.)
- **Desembolso:** fecha, método, cheque #, total → monto, cuenta e institucional por estudiante → "sin repartir" en vivo; no se procesa si no cuadra → recibos.

### 5.6 Reportes (catálogo del manual)
Académico: Completados (estudiante) · Resumen (estudiante) · Exam / Written / Requirements por programa.
Asistencia: Detalle (estudiante) · Resumen (programa).
Ledger: Pagos (con aviso de asientos por verificar) · Resumen de pagos · Resumen por programa · Morosidad · 🆕 Datos 1098-T.
Estudiantes: Roster inscritos / graduados / no-start / retirados · Badge # (por nombre y por número) · Locker # (por nombre y por número) · Educación previa · Etnia · LOA · Colocación (rango por fecha de graduación) · Evaluación SAP (a una fecha) · Resumen SAP.
Inventario: En existencia · Para reordenar · Servicios: inventario usado · Servicios: requisitos.
Operación: Check Attendance (ausentes ahora, con teléfono) · Presentes · Hojas de firma · Etiquetas.
Todos con filtros (programa, horario, estado, fechas), vista previa, PDF y Excel.

---

## 6. Módulo Estudiantes

1. **Lista** con búsqueda por nombre/badge/email/teléfono, filtros por programa, horario, estado, instructor, balance > 0, cerca de graduar, nivel SAP.
2. **Ficha** con el encabezado fijo y pestañas: Resumen · Detalle · Inscripción · Académico (Exam + Written + Requirement) · Asistencia · Ledger · SAP 🆕 · Colocación · Documentos · Notas · Historial.
3. **Alta**: desde un lead (botón que importa sus datos), desde una inscripción en línea o manual; campos obligatorios marcados; casilla auto-ledger.
4. **Ledger** unificado con las reglas de §5.1; los pagos del portal (tarjeta/Affirm/plan) se asientan solos; los Zelle se marcan manualmente o al conciliar.
5. **Asistencia:** registro manual individual o en lote (§5.5), importación CSV y (fase 9) kiosco.
6. **Automatizaciones** (equivalentes a Options de Genesis), todas al Centro de alertas y con interruptor en Configuración:
   - Ausencias consecutivas ≥ N días → alerta + email al estudiante.
   - Por graduar (≤ X horas).
   - Midpoints alcanzados (§5.4).
   - Salidas sin marcar del día anterior (equivale a Check Swipes).
   - SAP Critical → propuesta de probation.
   - Licencia estatal o acreditación por vencer.

## 7. Módulo Admisiones / CRM

1. **Captura de leads** desde: formulario web, Meta Lead Ads, WhatsApp, llamadas, walk-in, referidos, importación CSV. Las fuentes salen del catálogo `lead_source`.
2. **Pipeline** (kanban): Nuevo → Contactado → Cita/Tour agendado → Asistió → Aplicó → Inscrito · Perdido. Leads activos/inactivos.
3. **Datos del manual:** fecha del lead, representante (catálogo staff), programa, horario y fecha de inicio deseados.
4. **Seguimientos** con fecha; vista **"Vencidos"** (equivale a la pestaña Follow Up); al completarlo sale de la lista.
5. **Asignación** automática por round-robin o por programa; alerta si un lead nuevo no se contacta en X minutos.
6. **Enlace al portal de inscripción** con datos prellenados; al completar pasa a "Inscrito" y se crea el estudiante.
7. **Secuencias de seguimiento** por email (y SMS/WhatsApp si se aprueba) bilingües.
8. **Métricas:** leads por fuente, conversión por etapa, tiempo de respuesta, inscritos por asesor, costo por inscrito.

## 8. Módulo Inventario y Servicios (fase 8) 🆕

- Artículos con clase, proveedor, distribuidor, costo, precio, existencia y punto de reorden (en rojo cuando está debajo).
- Entradas de mercancía, ajustes y salidas con historial.
- **Kits del estudiante:** entrega de kit con cargo en el ledger y descuento de existencia.
- **Servicios de clínica:** servicio = requisitos de uno o más programas + costo + inventario. Registrar un servicio suma unidades a los requisitos del estudiante y descuenta inventario. Si hay cobro al cliente de la clínica, es el POS (§12).

## 9. Módulo Marketing (Constant Contact + agente de IA)

Objetivo: enviar campañas de email personalizadas a leads, estudiantes y graduados desde un template, con un agente de IA que prepara el contenido y la programación, sin escribir cada email a mano.

### 9.1 Flujo

1. **Sincronización de contactos.** La plataforma envía a Constant Contact (API v3, OAuth2) los leads y estudiantes **con consentimiento de marketing**. Van con campos personalizados: programa de interés, idioma, etapa del CRM, fuente, campaña de origen, estado de inscripción y fecha de inicio. La sincronización corre cuando cambia un contacto y además una vez al día para corregir diferencias.
2. **Segmentos.** Se definen en la plataforma con filtros del CRM y se reflejan como listas o etiquetas en Constant Contact. Ejemplos:
   - Leads de Meta interesados en Laser que no se inscribieron en 30 días.
   - Leads perdidos por precio (para promociones).
   - Graduados de los últimos 12 meses (referidos y cursos de continuación).
   - Leads nuevos (secuencia de bienvenida).
3. **El agente arma la campaña.** A partir del template y el segmento:
   - Escribe el asunto y el texto en el idioma de cada contacto (ES/EN).
   - Personaliza con los campos: nombre, programa, fecha del próximo grupo.
   - Si hace falta, genera un párrafo distinto para cada contacto y lo guarda en un campo personalizado que el template muestra.
   - Propone fecha y hora de envío.
4. **Aprobación.** La campaña aparece en "Pendientes de aprobar" con una vista previa, el número de destinatarios y ejemplos reales. Una persona con rol Admisiones o Dueño la aprueba con un clic. Las campañas recurrentes ya aprobadas, como la bienvenida, pueden marcarse para salir solas.
5. **Envío.** Lo hace Constant Contact, que se encarga de la entrega, el enlace de baja y el cumplimiento de CAN-SPAM.
6. **Resultados de vuelta al CRM.** Aperturas, clics, rebotes y bajas se registran como actividades en el historial de cada lead. Reglas automáticas, por ejemplo: un clic en "ver precios" o "inscribirme" crea una tarea para el asesor asignado.

### 9.2 Reglas

- **Consentimiento obligatorio.** Se agregan al lead y al estudiante los campos `marketing_opt_in` (sí/no, fecha y fuente del consentimiento) y `unsubscribed_at`. El formulario web y el portal de inscripción llevan una casilla de consentimiento sin marcar. Las bajas en Constant Contact se sincronizan de vuelta y bloquean futuros envíos de marketing.
- **Marketing separado de lo transaccional.** Recordatorios de Zelle, recibos, alertas de ausencia y links de inscripción **no** salen por Constant Contact: siguen por el proveedor de email del portal. Darse de baja del marketing no detiene los avisos de pago.
- **Límites del agente.** No envía sin aprobación hasta que la campaña esté marcada como recurrente. No escribe a contactos sin consentimiento. No inventa precios, fechas ni promociones: solo usa datos de la plataforma (programas, próximos grupos) y lo que diga el template.
- **Auditoría.** Cada campaña guarda quién la aprobó, el segmento, el número de destinatarios y el contenido enviado.

### 9.3 Modelo de datos adicional

- **marketing_segments:** nombre, filtros (JSON), id de lista o etiqueta en Constant Contact.
- **marketing_campaigns:** segmento, template, asunto, contenido por idioma, estado (`draft` · `pending_approval` · `approved` · `scheduled` · `sent`), aprobada por, programada para, id de campaña en Constant Contact, métricas.
- **marketing_events:** contacto, campaña, tipo (`open` · `click` · `bounce` · `unsubscribe`), URL, fecha.
- Campos nuevos en **leads** y **students:** `marketing_opt_in`, `opt_in_at`, `opt_in_source`, `unsubscribed_at`, `cc_contact_id`.

### 9.4 En el demo

El flujo completo ya se puede probar en **Marketing** (`src/pages/Marketing.tsx`, `src/lib/marketing.ts`):
- Segmentos, consentimiento, templates, aprobación y registro en el CRM funcionan igual que en producción.
- El agente escribe el párrafo personalizado con reglas fijas según la situación de cada contacto. En producción lo escribe un modelo de IA con los mismos datos y límites.
- No sale ningún email: los envíos, aperturas, clics y bajas se simulan.
- El agente no envía a quien recibió otra campaña en los últimos 7 días y avisa cuando un contacto ya recibió el mismo template en los últimos 30.

### 9.5 Requisitos

- Que la plataforma ya esté en Supabase (base de datos compartida); la demo actual en el navegador no sirve para esto.
- Cuenta de Constant Contact con acceso a la API (app registrada y conexión OAuth).
- Dominio de envío verificado (SPF/DKIM) para que los emails no caigan en spam.

## 10. Migración de Genesis

1. Obtener exportación de Genesis (File › Backup Database o R-Reports a Excel/CSV) — formato por confirmar.
2. Mapear tablas → modelo §4; script de importación idempotente (re-ejecutable).
3. Importar en este orden: **catálogos (Selections)** → escuela → programas (costos, escala, funciones, horarios, SAP, midpoints) → feriados → estudiantes → inscripciones → ledger (incluidos anulados y cuentas) → asistencia → notas → midpoints alcanzados → colocación → leads → inventario.
4. Si no se puede exportar la asistencia detallada: usar **horas importadas + fecha de inicio de conteo** (el mismo mecanismo que da Genesis, §6.10 del manual).
5. **Verificación de paridad:** por cada estudiante, comparar horas asistidas, horas programadas, balance del ledger, SAP y estado contra Genesis; 0 diferencias antes del corte.
6. Operar en paralelo 2–4 semanas; luego Genesis queda solo lectura.

## 11. Fases de entrega

| Fase | Contenido |
|---|---|
| 1 ✅ | Roles/permisos · escuela (licencia) · **catálogos (Selections)** · programas completos (info, costos, escala de notas, funciones académicas, SAP, midpoints) · horarios Mañana / Noche · feriados y ajustes parciales · auto-logout. **Hecha en la demo** (2026-11-09). |
| 2 ✅ | Estudiantes: alta (desde lead / inscripción / manual) con campos obligatorios, aviso de duplicados, auto-ledger y alta de estudiantes que ya venían cursando (horas importadas + fecha de inicio de conteo); ficha Detail (Auto Zero EFC, Exceptions) + Enrollment; lista con búsqueda y filtros por instructor y registro. **Hecha en la demo** (2026-11-09). |
| 3 ✅ | Ledger con las reglas de §5.1: tipos (cargo, pago, cargo con pago automático enlazado), cuenta en todo asiento, institucional, anular con motivo en vez de borrar, reembolsos como pago negativo, auto-post, recibo con número e impresión, creado/modificado por y "por verificar" con marca de verificado. Solo Dueño, Administrador y Finanzas escriben. Balance, Cobros y Reportes ignoran los anulados. (Sin overtime: no se cobra.) **Hecha en la demo** (2026-11-09). |
| 4 ✅ | Asistencia **en lote** por fecha, programa y horario (prellenada con el horario, Presente / Ausente / Excusado, "Procesar" guarda solo lo nuevo o cambiado); horas programadas vs. asistidas y % de asistencia (§5.2) con horas excusadas según la política SAP; Check Attendance (quién no ha llegado con teléfono y WhatsApp, Llegó / Salió con la hora actual) y hojas de firma imprimibles; Salidas sin marcar (Check Swipes); Centro de alertas en el Dashboard según rol y los interruptores de Automatizaciones. **Hecha en la demo** (2026-11-09). |
| 5 ✅ | Académico (Exam / Written / Requirement) individual y **en lote** (0 = completado sin nota); **SAP** en la ficha a cualquier fecha, con historial (`sap_evaluations`) y propuesta de probation; cola de **midpoints** con SAP en lote, "revisado" y "volver a mostrar" (`midpoint_events`); colocación de graduados por rango con % State Board y % colocados; alertas de midpoints por revisar y SAP Critical sin probation. **Hecha en la demo** (2026-11-09). |
| 6 | **Desembolso en lote**, catálogo completo de reportes (§5.6), etiquetas |
| 7 | CRM de admisiones + seguimientos + integración con el portal de inscripción |
| 8 | Migración de datos de Genesis y corte |
| 9 | Marketing (§9) |
| 10 | Inventario, servicios de clínica y POS (si se confirman, §12) |
| 11 | Kiosco de asistencia con badge/QR y reglas ITA de redondeo (opcional) |

## 12. Preguntas abiertas

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Cómo accedo al código del proyecto Lovable (GitHub conectado) y a su Supabase? | Conectar Lovable a GitHub y clonar el repo localmente; se construye ahí y Lovable sincroniza. Pendiente: URL del repo. |
| 2 | ¿En qué formato podemos sacar los datos de Genesis? | Desconocido. Pendiente de consultar al proveedor de Genesis o probar File › Backup Database / R-Reports. |
| 3 | ¿De dónde llegan los leads hoy? | Meta/Facebook Ads, formulario web, WhatsApp/llamadas, walk-in/referidos — las 4 fuentes. |
| 4 | ¿Cómo se toma la asistencia (lector de badge ITA, manual)? | Manual (la oficina la escribe). Se hace en lote por programa/horario (§5.5); kiosco con badge/QR queda para la fase 11. |
| 5 | ¿Usan ayuda financiera federal (pestaña FAS)? ¿Necesitan reporte 1098-T? | |
| 6 | ¿Qué contiene la pestaña "Exam"? | Resuelta por el manual: exámenes de un solo intento (midterm, final), con letra y %. |
| 7 | ¿Qué reportes usan de verdad (y cuáles pide el estado/acreditadora)? | Se construye el catálogo del manual (§5.6); confirmar prioridades. |
| 8 | ¿Usan Inventory / POS / Services (venta de kits, clínica)? | |
| 9 | ¿Una sola sede o varias ("Multi-School Locations")? | |
| 10 | ¿Quiénes usarán el sistema y con qué permisos? | |
| 11 | ¿Ya tienen cuenta de Constant Contact? ¿Qué plan y cuántos contactos? | Sí, tienen cuenta. Pendiente: plan y número de contactos. |
| 12 | ¿Los contactos actuales de Constant Contact tienen consentimiento registrado? | Sí. Se importa el estado de consentimiento existente y se respetan las bajas. |
| 13 | ¿Quién aprueba las campañas antes del envío? | |
| 14 | ¿Qué campañas quieren primero? | |
| 15 🆕 | ¿Cuáles son los valores de SAP de cada programa (mínimos Critical / OK / Superior, pesos Exam/Written/Requirement, ¿horas excusadas cuentan?) y en qué horas están los midpoints? | **Sin respuesta todavía.** La demo usa valores de ejemplo marcados "Ejemplo" (lista en README › Pendiente de verificar). |
| 16 🆕 | ¿Qué escala de notas usan? | A = 90–100, B = 80–89, C = 70–79, D = 60–69, F < 60. Editable por programa. |
| 17 🆕 | ¿Qué cuentas y métodos de pago usan en el ledger? ¿Cobran horas extra (overtime)? | **No cobran overtime** → se quita del alcance (§5.1 punto 9 no aplica). Cuentas: pendiente; la demo usa Registration, Supplies, Tuition, Kit, Other (editables en Catálogos). |
| 18 🆕 | ¿Los programas son por horas reloj o por créditos? | Sin respuesta; se asume horas reloj (por verificar). |
| 19 🆕 | Niveles de asistencia y horario de cada día. | Dos horarios: **Mañana 9:00 AM–1:00 PM** y **Noche 6:00 PM–10:00 PM**. Los "niveles de asistencia" de Genesis = estos horarios (no hace falta un catálogo aparte). Días de clase: por verificar (la demo usa lunes a jueves). |

> Nota de privacidad: las fotos de Genesis muestran datos reales (incluido un SSN). Este documento no los copia; los datos reales solo deben entrar al sistema por la migración, con cifrado y acceso por rol.
>
> Nota: el manual de Genesis-SMSS se usa solo como referencia funcional; la app no copia su nombre, textos ni diseño.
