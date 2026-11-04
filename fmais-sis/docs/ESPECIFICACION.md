# FMAIS — Sistema Administrativo Centralizado (reemplazo de Genesis-SMSS)

**Fecha:** 2026-10-20 · **Estado:** v0.2 — clon de prueba construido en `fmais-sis/` (ver README). Preguntas abiertas en §10.

## 1. Objetivo

Unificar en el portal existente (`thefmais-enrollment.lovable.app`) toda la información administrativa de Florida Medical & Aesthetic International School (FMAIS):

| Módulo | Hoy vive en | Destino |
|---|---|---|
| Inscripciones (enrollment online, firma, depósito) | Portal Lovable ✅ | Se mantiene |
| Cobros automáticos + recordatorios Zelle | Portal Lovable ✅ | Se integra con el Ledger del estudiante |
| Base de datos de estudiantes (expediente académico, asistencia, ledger, colocación) | **Genesis-SMSS v2.84 (2009, Windows)** | **Nuevo módulo "Estudiantes"** |
| CRM de admisiones (leads) | Genesis "Student Leads" + otras fuentes | **Nuevo módulo "Admisiones / CRM"** |

Principio: **un solo registro por persona** que avanza Lead → Aplicante → Inscrito → Activo → Graduado/Baja, sin volver a teclear datos.

---

## 2. Inventario de Genesis (de las 17 fotos)

### 2.1 Menús

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

| Pestaña | Campos / funciones observadas |
|---|---|
| **Exam** | (no fotografiada — ver §10) |
| **Written** | Exámenes escritos: Nombre (ej. "ELE175 Clinical Applications", Final, Laser Exam, Mid Term) · Fecha completado · Letra · % |
| **Requirement** | Requisitos prácticos: Nombre · Completado · Letra · % · Unidades · Hechas · Faltan · botones Summary / Add / Remove |
| **Placement** | Certificación estatal: ¿Pasó State Board Exam? + fecha. Empleo: fecha de contratación, empresa, contacto, dirección 1/2, ciudad, estado, zip, teléfono, fax |
| **Ledger** | Fecha · Registrado por · Concepto (Registration Fee, Supplies & Educational Resources, Tuition/Fees) · Cargo · Pago · Recibo # · Método (Zelle, …) · Totales y **Balance** · Add / Edit / Print |
| **Attendance** | Fecha · Tipo (Regular…) · Entrada · Salida · Breaks · Total horas · Add / Remove · **Midpoints Reached** (10 hitos: unidades + fecha) |
| **Detail** | Apellido, Nombre, Inicial · Dirección (2 líneas), ciudad, estado, zip · SSN · Fecha y lugar de nacimiento · Sexo · Estado civil · Etnia · Licencia de conducir · Email · Escuela secundaria + ciudad · Educación · Badge # · Combination # · Locker # · Alien Registration # · Teléfonos (casa, trabajo, celular, fax, otro) · Fecha de matrícula · Datos de ayuda financiera: EFC, Auto Zero EFC, Adj. Gross Income, Dependientes, Dependency, Exceptions |
| **Enrollment** | Status · Record · First Class · Fecha de inscripción · Contract Graduation · Completion · Horario 1/2/3 con fecha de cambio · Total horas programadas · Horas de transferencia/re-inscripción · Horas importadas de sistema anterior · Leave of Absence (2 periodos inicio/fin) · Horas extra cobradas · Último día asistido · Total horas asistidas · Probation + fecha · Instructor |
| **FAS** | Deshabilitada (ayuda financiera federal) — ver §10 |

Barra lateral de la ficha: R-Reports · Comments (notas) · Labels · Close · ITA Setup · Chk Swipes · Attendance · Chk MidPnt.

---

## 3. Arquitectura propuesta

- **Frontend:** el mismo proyecto Lovable (React + Vite + Tailwind + shadcn/ui), nuevas rutas bajo `/admin`.
- **Backend:** Supabase del proyecto Lovable (Postgres + Auth + Storage + Edge Functions + RLS).
- **Pagos:** se reutiliza la integración de cobros existente; cada cargo/pago se asienta en `ledger_entries`.
- **Emails:** el proveedor que ya usa el portal para recordatorios Zelle.
- **Marketing:** Constant Contact (API v3) para campañas; un agente de IA prepara el contenido y una persona aprueba (§7).

Navegación del admin:

```
/admin
├── dashboard        KPIs: leads nuevos, inscritos del mes, activos, por graduar, morosos, ausencias
├── crm              Pipeline de leads (kanban + tabla)
├── marketing        Segmentos, campañas pendientes de aprobar, resultados (Constant Contact)
├── enrollments      (existente)
├── students         Lista + ficha con pestañas
├── billing          (existente) cobros automáticos / Zelle
├── attendance       Registro diario, ausencias consecutivas, midpoints
├── reports          Reportes y exportación
└── settings         Escuela, programas, horarios, feriados, usuarios y roles, plantillas de email
```

---

## 4. Modelo de datos (Postgres)

> Sensibles (SSN, Alien #, licencia) en columnas cifradas y visibles solo con rol autorizado.

- **school_settings** — nombre, dirección, logo, zona horaria, licencia CIE/estado.
- **programs** — código, nombre, horas totales, unidades, precio, cuotas, `is_active`, `copied_from`. (Add/Edit/**Copy** Program)
- **program_requirements** — program_id, nombre, tipo (`written_exam` | `practical`), unidades requeridas, orden.
- **program_midpoints** — program_id, número (1–10), horas/unidades del hito, acción (ej. cobro o aviso).
- **schedules** — nombre (PART TIME DAY…), días, hora entrada/salida, horas/semana.
- **holidays** — fecha, descripción, ajuste de horas.
- **people** — datos personales comunes a lead y estudiante (nombre, emails, teléfonos, dirección, fecha nacimiento, idioma preferido).
- **leads** — person_id, fuente, campaña/UTM, programa de interés, etapa, dueño (asesor), puntaje, próxima acción, motivo de pérdida.
- **lead_activities** — lead_id, tipo (llamada, email, WhatsApp, SMS, tour, nota), resultado, fecha, usuario.
- **students** — person_id, badge #, SSN (cifrado), sexo, estado civil, etnia, lugar nacimiento, licencia, alien #, educación, escuela secundaria, locker, combination, fecha matrícula, datos EFC/ingresos/dependientes.
- **enrollments** — student_id, program_id, status (`applicant` · `enrolled` · `active` · `loa` · `withdrawn` · `graduated` · `dropped`), record (`active` · `inactive`), fecha inscripción, first class, contract grad, projected grad, completion, horas transferidas, horas importadas, probation + fecha, instructor_id, enlace al enrollment online existente.
- **enrollment_schedules** — enrollment_id, schedule_id, desde (hasta 3 cambios como Genesis, sin límite aquí).
- **leaves_of_absence** — enrollment_id, inicio, fin, motivo.
- **attendance_records** — enrollment_id, fecha, tipo (regular, makeup, clinic, non-clinic), entrada, salida, breaks, horas, fuente (`manual` · `kiosk` · `import`).
- **grades** — enrollment_id, requirement_id, fecha, letra, %, unidades hechas.
- **placements** — enrollment_id, pasó board exam, fecha, empresa, contacto, dirección, teléfono, fecha contratación.
- **ledger_entries** — enrollment_id, fecha, registrado por, concepto, cargo, pago, recibo #, método (card, Affirm, plan FMAIS, Zelle, efectivo, cheque), referencia de transacción, `payment_plan_id`.
- **payment_plans** — (existente: cobros automáticos/Zelle) enlazado a enrollment.
- **comments** — entidad + id, texto, usuario, fecha.
- **documents** — entidad + id, tipo (ID, diploma, contrato firmado…), archivo en Storage.
- **inventory_items / inventory_movements** — kits y materiales entregados al estudiante (Maintenance › Inventory, POS).
- **audit_log** — quién cambió qué y cuándo (obligatorio para auditorías estatales).

Roles: `owner`, `admin`, `admissions`, `registrar`, `finance`, `instructor` (solo asistencia y notas de sus grupos).

---

## 5. Módulo Estudiantes (réplica de Genesis, modernizada)

1. **Lista** con búsqueda por nombre/badge/email/teléfono, filtros por programa, horario, estado, instructor, balance > 0, cerca de graduar.
2. **Ficha** con el mismo encabezado fijo y pestañas: Resumen · Datos personales (Detail) · Inscripción (Enrollment) · Académico (Exam + Written + Requirement) · Asistencia · Ledger · Colocación · Documentos · Notas · Historial.
3. **Ledger** unificado: los pagos del portal (tarjeta/Affirm/plan) se asientan solos; los Zelle se marcan manualmente o al conciliar; recibo imprimible/PDF; balance en vivo.
4. **Asistencia:** registro manual, importación CSV y (opcional) kiosco con badge/QR en tablet; cálculo de horas, horas restantes, fecha proyectada de graduación.
5. **Automatizaciones** (equivalentes a Options de Genesis):
   - Ausencias consecutivas ≥ N días → alerta al registrar + email al estudiante.
   - Estudiantes a punto de graduar (≤ X horas) → lista y aviso.
   - Midpoints alcanzados → se registran y pueden disparar cargo/recordatorio de pago.
   - Probation automática por asistencia o notas.
6. **Reportes:** roster por programa/horario, asistencia por rango, morosidad, graduados y colocación (para reporte anual del estado/acreditadora), etiquetas (Labels) en PDF, exportación Excel.

## 6. Módulo Admisiones / CRM

1. **Captura de leads** desde: formulario web, Meta Lead Ads, WhatsApp, llamadas, walk-in, referidos, importación CSV (fuentes por confirmar §10).
2. **Pipeline** (kanban): Nuevo → Contactado → Cita/Tour agendado → Asistió → Aplicó (inició enrollment) → Inscrito · Perdido.
3. **Asignación** automática por round-robin o por programa; alerta si un lead nuevo no se contacta en X minutos.
4. **Actividades y tareas:** registro de llamadas/emails/WhatsApp, próximas acciones, recordatorios.
5. **Enlace al portal de inscripción:** botón "Enviar link de inscripción" con datos prellenados; cuando el lead completa el enrollment pasa solo a "Inscrito" y se crea el estudiante.
6. **Secuencias de seguimiento** por email (y SMS/WhatsApp si se aprueba) bilingües.
7. **Métricas:** leads por fuente, tasa de conversión por etapa, tiempo de respuesta, inscritos por asesor, costo por inscrito (si se conecta gasto de anuncios).

## 7. Módulo Marketing (Constant Contact + agente de IA)

Objetivo: enviar campañas de email personalizadas a leads, estudiantes y graduados desde un template, con un agente de IA que prepara el contenido y la programación, sin escribir cada email a mano.

### 7.1 Flujo

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

### 7.2 Reglas

- **Consentimiento obligatorio.** Se agregan al lead y al estudiante los campos `marketing_opt_in` (sí/no, fecha y fuente del consentimiento) y `unsubscribed_at`. El formulario web y el portal de inscripción llevan una casilla de consentimiento sin marcar. Las bajas en Constant Contact se sincronizan de vuelta y bloquean futuros envíos de marketing.
- **Marketing separado de lo transaccional.** Recordatorios de Zelle, recibos, alertas de ausencia y links de inscripción **no** salen por Constant Contact: siguen por el proveedor de email del portal. Darse de baja del marketing no detiene los avisos de pago.
- **Límites del agente.** No envía sin aprobación hasta que la campaña esté marcada como recurrente. No escribe a contactos sin consentimiento. No inventa precios, fechas ni promociones: solo usa datos de la plataforma (programas, próximos grupos) y lo que diga el template.
- **Auditoría.** Cada campaña guarda quién la aprobó, el segmento, el número de destinatarios y el contenido enviado.

### 7.3 Modelo de datos adicional

- **marketing_segments:** nombre, filtros (JSON), id de lista o etiqueta en Constant Contact.
- **marketing_campaigns:** segmento, template, asunto, contenido por idioma, estado (`draft` · `pending_approval` · `approved` · `scheduled` · `sent`), aprobada por, programada para, id de campaña en Constant Contact, métricas.
- **marketing_events:** contacto, campaña, tipo (`open` · `click` · `bounce` · `unsubscribe`), URL, fecha.
- Campos nuevos en **leads** y **students:** `marketing_opt_in`, `opt_in_at`, `opt_in_source`, `unsubscribed_at`, `cc_contact_id`.

### 7.4 En el demo

El flujo completo ya se puede probar en **Marketing** (`src/pages/Marketing.tsx`, `src/lib/marketing.ts`):
- Segmentos, consentimiento, templates, aprobación y registro en el CRM funcionan igual que en producción.
- El agente escribe el párrafo personalizado con reglas fijas según la situación de cada contacto. En producción lo escribe un modelo de IA con los mismos datos y límites.
- No sale ningún email: los envíos, aperturas, clics y bajas se simulan.
- El agente no envía a quien recibió otra campaña en los últimos 7 días y avisa cuando un contacto ya recibió el mismo template en los últimos 30.

### 7.5 Requisitos

- Que la plataforma ya esté en Supabase (base de datos compartida); la demo actual en el navegador no sirve para esto.
- Cuenta de Constant Contact con acceso a la API (app registrada y conexión OAuth).
- Dominio de envío verificado (SPF/DKIM) para que los emails no caigan en spam.

## 8. Migración de Genesis

1. Obtener exportación de Genesis (File › Backup Database o R-Reports a Excel/CSV) — formato por confirmar.
2. Mapear tablas → modelo §4; script de importación idempotente (re-ejecutable).
3. Importar en este orden: programas → horarios → estudiantes → inscripciones → ledger → asistencia → notas → colocación.
4. **Verificación de paridad:** por cada estudiante, comparar total horas asistidas, balance del ledger y estado contra Genesis; 0 diferencias antes del corte.
5. Operar en paralelo 2–4 semanas; luego Genesis queda solo lectura.

## 9. Fases de entrega

| Fase | Contenido |
|---|---|
| 1 | Roles/permisos, programas, horarios, ficha de estudiante (Detail + Enrollment), lista y búsqueda |
| 2 | Ledger unificado con los cobros existentes, recibos |
| 3 | Asistencia + automatizaciones (ausencias, midpoints, por graduar) |
| 4 | Académico (exámenes/requisitos) y Colocación, reportes |
| 5 | CRM de admisiones + integración con el portal de inscripción |
| 6 | Migración de datos de Genesis y corte |
| 7 | Marketing: consentimiento en leads/estudiantes, sincronización con Constant Contact, segmentos, agente de campañas con aprobación, resultados en el CRM (§7). Requiere las fases anteriores en Supabase. |

## 10. Preguntas abiertas

Ver la conversación; las respuestas se anotan aquí.

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Cómo accedo al código del proyecto Lovable (GitHub conectado) y a su Supabase? | Conectar Lovable a GitHub y clonar el repo localmente; se construye ahí y Lovable sincroniza. Pendiente: URL del repo. |
| 2 | ¿En qué formato podemos sacar los datos de Genesis? | Desconocido. Pendiente de consultar al proveedor de Genesis o probar File › Backup Database / R-Reports. |
| 3 | ¿De dónde llegan los leads hoy? | Meta/Facebook Ads, formulario web, WhatsApp/llamadas, walk-in/referidos — las 4 fuentes. |
| 4 | ¿Cómo se toma la asistencia (lector de badge ITA, manual)? | Manual (la oficina la escribe). Fase 3: registro diario rápido por grupo; kiosco con badge/QR queda opcional para después. |
| 5 | ¿Usan ayuda financiera federal (pestaña FAS)? | |
| 6 | ¿Qué contiene la pestaña "Exam"? | |
| 7 | ¿Qué reportes de R-Reports usan de verdad (y cuáles pide el estado/acreditadora)? | |
| 8 | ¿Usan Inventory / POS (venta de kits/productos)? | |
| 9 | ¿Una sola sede o varias ("Multi-School Locations")? | |
| 10 | ¿Quiénes usarán el sistema y con qué permisos? | |
| 11 | ¿Ya tienen cuenta de Constant Contact? ¿Qué plan y cuántos contactos? | Sí, tienen cuenta. Pendiente: plan y número de contactos (define límites de envío y si el plan incluye webhooks/API). |
| 12 | ¿Los contactos actuales de Constant Contact tienen consentimiento registrado (fecha y fuente)? | Sí. En la primera sincronización se importa el estado de consentimiento de Constant Contact como `marketing_opt_in` (con su fecha y fuente) y se respetan las bajas existentes; la plataforma no sobrescribe el consentimiento que ya está allí. |
| 13 | ¿Quién aprueba las campañas antes del envío? | |
| 14 | ¿Qué campañas quieren primero (bienvenida a leads, promociones, referidos de graduados, nuevos grupos)? | |

> Nota de privacidad: las fotos de Genesis muestran datos reales (incluido un SSN). Este documento no los copia; los datos reales solo deben entrar al sistema por la migración, con cifrado y acceso por rol.
