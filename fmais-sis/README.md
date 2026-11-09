# FMAIS · Sistema Administrativo (clon de prueba)

Prototipo funcional e **independiente** del sistema centralizado de Florida Medical & Aesthetic International School. Reúne en una sola app:

- Inscripciones en línea (lo que hoy hace el portal Lovable)
- Cobros automáticos y recordatorios de Zelle
- **Base de datos de estudiantes**: réplica modernizada de Genesis-SMSS
- **CRM de admisiones** para los leads

No toca la app existente (`thefmais-enrollment.lovable.app`). **Todos los datos son ficticios** y se guardan en el navegador de quien la abre.

## Cómo correrla

```bash
cd fmais-sis
npm install
npm run dev        # http://localhost:5180
npm run build      # versión estática en dist/
```

Al entrar eliges un usuario de demostración. Cada rol ve solo sus módulos:

| Usuario | Rol | Ve |
|---|---|---|
| Dirección FMAIS | Dueño | Todo |
| Laura Méndez / Carlos Ruiz | Admisiones | Dashboard, CRM, Inscripciones, Estudiantes, Reportes |
| Patricia Gómez | Registro académico | Dashboard, Inscripciones, Estudiantes, Asistencia, Reportes + datos sensibles |
| Daniel Torres | Finanzas | Dashboard, Inscripciones, Estudiantes, Cobros, Reportes |
| Mariela Soto / Yanelis Acosta | Instructor | Solo sus estudiantes y su asistencia (sin pagos) |

Para volver al estado inicial usa **Configuración › Datos e importación › Reiniciar demo**. (Si ya habías abierto la demo antes de la fase 1, reiníciala para ver los horarios Mañana / Noche.)

## ⚠️ Pendiente de verificar con la escuela

Estos valores de la demo son **de ejemplo**. Hay que confirmarlos antes de usar el sistema de verdad:

| Qué | Valor de ejemplo en la demo | Dónde se cambia |
|---|---|---|
| Mínimos de SAP por programa (Critical / OK / Superior) | Académico 70 / 75 / 90 · Asistencia 67 / 75 / 95 | Configuración › Programas › SAP y midpoints |
| Pesos de las notas | Exam 40% · Written 30% · Requirement 30% | ídem |
| ¿Las horas excusadas cuentan como asistidas? | No | ídem |
| Midpoints de cada programa | 25%, 50% y 75% de las horas | ídem |
| Días de clase de los horarios | Lunes a jueves (Mañana 9:00–13:00, Noche 18:00–22:00) | Configuración › Horarios |
| Horas reloj o créditos | Horas reloj | Configuración › Programas › Información |
| Costos de cada programa y su cuenta | Registration $150, Supplies $350, Tuition según programa | Configuración › Programas › Costos |
| Número y fechas de la licencia estatal | "CIE-0000 (ejemplo)" | Configuración › Escuela |

Mientras los valores de SAP no estén confirmados, el programa muestra la etiqueta **"Ejemplo"**. Cuando la escuela los confirme, se marca la casilla de confirmación en la pestaña SAP del programa.

**Confirmado por la escuela:** escala de notas A = 90–100, B = 80–89, C = 70–79, D = 60–69, F = menos de 60 · no se cobran horas extra (overtime) · dos horarios: Mañana 9:00 AM–1:00 PM y Noche 6:00 PM–10:00 PM.

## Módulos

| Módulo | Qué hace |
|---|---|
| **Dashboard** | Muestra leads de los últimos 7 días, inscritos del mes, estudiantes activos, monto por cobrar, pagos vencidos y alertas de ausencia. Incluye gráficos por fuente y por mes, el embudo de admisiones y las tareas del día. |
| **Admisiones (CRM)** | Tres pestañas. **Pipeline**: kanban con arrastrar y soltar por etapa, o tabla; filtros por fuente, asesor, programa, perdidos e inactivos; marca "sin contactar" (SLA), "seguimiento vencido" y "seguimiento hoy"; asignación por turnos. **Seguimientos** (Follow Up de Genesis): vencidos, hoy y próximos por asesor, con llamar, pasar a mañana y completar (con resultado y siguiente seguimiento). **Métricas**: embudo por etapa, respuesta promedio y % dentro del SLA, conversión por fuente y por asesor, seguimientos a tiempo. |
| **Ficha del lead** | Llamar, WhatsApp, email de seguimiento, enviar link de inscripción, convertir a estudiante y marcar como perdido con motivo. Datos de Genesis: horario y fecha de inicio deseados (pasan solos al convertirlo en estudiante), detalle de la fuente (catálogo) y activo / inactivo. Seguimientos del lead: agregar, completar, aplicar el plan. Al crear un lead se arma el **plan de seguimiento** de Configuración › Automatizaciones; al perderlo o inscribirlo, sus seguimientos se cierran solos. Aviso si ya existe un lead con el mismo email o teléfono. |
| **Formulario web** (`/#/form`) | Formulario público bilingüe para captar leads, con casilla de consentimiento de marketing (sin marcar). Acepta `?utm_campaign=`. |
| **Marketing** | Campañas por Constant Contact (simulado). El agente de IA (simulado) prepara el borrador a partir de un segmento y un template, escribe un párrafo personalizado para cada contacto y deja notas: exclusiones, hora sugerida y advertencias. Una persona revisa la vista previa con contactos reales en su idioma y aprueba, programa, envía o rechaza. Hay campañas recurrentes (bienvenida). Los resultados (aperturas, clics, bajas) vuelven al historial del lead, y un clic crea una tarea de llamada para el asesor. Pestañas: Segmentos, Templates, Contactos y consentimiento, Constant Contact. Lo pueden usar los roles Dueño, Administrador y Admisiones. |
| **Inscripciones** | Solicitudes de inscripción en línea con sus 7 pasos, estado y depósito. Permite enviar un recordatorio para continuar y crear el estudiante cuando la solicitud está completa. |
| **Estudiantes** | Lista con búsqueda (nombre en cualquier orden, badge, email, celular) y filtros por estado, registro, programa, horario, instructor, balance pendiente, ledger por verificar, último SAP bajo, probation, por graduar y ausencias. Exportación a CSV. Los instructores no ven balances. |
| **Nuevo estudiante** | Trae los datos de un lead del CRM, marca en amarillo los campos obligatorios, avisa si ya existe alguien con el mismo email o celular y permite elegir si se cargan los costos del programa (auto-ledger). Para quien ya venía cursando en Genesis se ponen las horas hechas y la fecha desde la que se cuenta la asistencia, sin cargar día por día. |
| **Ficha del estudiante** | Encabezado igual al de Genesis y pestañas: Resumen, Detalle, Inscripción, Académico, Asistencia, **SAP**, Ledger y pagos, Colocación, Documentos, Notas e Historial. |
| **Cobros** | Planes de pago automáticos y por Zelle, con estado (vencido, vence pronto, al día). Envía recordatorios de Zelle en lote, ejecuta los cobros automáticos del día (simulados), registra los Zelle recibidos y guarda el registro de emails. **Desembolso en lote**: un cheque o transferencia (beca, ayuda financiera, empleador) repartido entre varios estudiantes, con cuenta e institucional por línea, "sin repartir" en vivo (no se procesa si no cuadra) y recibos imprimibles. |
| **Asistencia** | **En lote** por fecha, programa y horario: viene prellenada con el horario, se marca Presente / Ausente / Excusado y "Procesar" guarda solo lo nuevo o cambiado. **Check Attendance**: quién no ha llegado (con teléfono y WhatsApp) y quién está en clase, con botones Llegó / Salió. **Hojas de firma** imprimibles. **Salidas sin marcar** para completar. **Alertas**: ausencias consecutivas, asistencia bajo el mínimo del SAP, por graduar, midpoints y LOA. |
| **Académico** | **Notas en lote**: programa → tipo (Exam / Written / Requirement) → función → % o unidades para todos los inscritos; "Procesar" guarda solo lo nuevo o cambiado. **Midpoints y SAP**: cola de los que cruzaron un midpoint, con su SAP a esa fecha; se seleccionan, se calcula el SAP en lote y quedan revisados (con "Volver a mostrar"). **Colocación**: graduados por rango de fecha con State Board y empleo, % aprobados y % colocados, exportable. Los instructores ven solo a sus estudiantes y no ven colocación. |
| **Centro de alertas** | En el Dashboard, según el rol: salidas sin marcar, ausencias, asistencia baja, midpoints por revisar, SAP Critical sin probation, seguimientos de leads vencidos, por graduar, LOA que terminan, pagos vencidos, asientos por verificar y licencia por vencer. Cada aviso lleva a donde se resuelve. |
| **Reportes** | Catálogo del manual de Genesis agrupado en Académico (completados, resumen, Exam / Written / Requirements por programa), Asistencia (detalle y resumen con programadas vs. asistidas), Ledger (pagos con aviso de "por verificar", resumen de pagos, resumen por programa, morosidad, datos 1098-T), Estudiantes (roster incluido no-start, badge #, locker #, educación, etnia, LOA, colocación, evaluación SAP a una fecha, resumen SAP), Operación (ausentes y presentes del día, hojas de firma, etiquetas) y Admisiones. Filtros por fechas, programa, horario, estado y estudiante; filas de totales; CSV (abre en Excel) e impresión / PDF. Los de Ledger solo los ven Dueño, Administración y Finanzas. |
| **Configuración** | Escuela (con licencia estatal y aviso de vencimiento) · **Catálogos** (etnia, dependencia, empresas, cuentas… se desactivan, no se borran) · Programas (agregar, editar o copiar) con pestañas Información, Costos (cargar al inscribir / institucional), Escala de notas, Académico (Exam / Written / Requirement) y SAP y midpoints · Horarios · Feriados y ajustes (todo el día o unas horas, para todos o un programa) · Usuarios y permisos · Plantillas de email · Automatizaciones (incluye cierre de sesión por inactividad) · Fuentes de leads · Importación CSV y respaldo. |

## Equivalencias con Genesis

| Genesis | Aquí |
|---|---|
| Maintenance › School | Configuración › Escuela |
| Maintenance › Program (Add / Edit / Copy) | Configuración › Programas |
| Maintenance › Student (Add / Edit) | Estudiantes › Nuevo estudiante / ficha |
| Maintenance › User Security | Configuración › Usuarios y roles |
| Maintenance › Holidays / Adjustments | Configuración › Feriados |
| Maintenance › Check Midpoints · Chk MidPnt | Académico › Midpoints y SAP |
| Maintenance › Labels · Labels | Reportes › Etiquetas |
| Maintenance › Reports · R-Reports | Reportes |
| Tasks › Ledger | Ficha › Ledger y pagos, Cobros › Desembolso en lote |
| Tasks › Academics | Académico › Notas en lote, Ficha › Académico |
| Tasks › Attendance · Attendance | Asistencia › Hoja diaria, Ficha › Asistencia |
| Tasks › Student Leads (pestañas Leads y Follow Up) | Admisiones (CRM) › Pipeline y Seguimientos |
| Options › Check Consecutive Absences | Asistencia › Alertas (umbral configurable) |
| Options › Check for Students About To Grad | Asistencia › Alertas, Dashboard |
| Options › Customize Auto Features | Configuración › Automatizaciones |
| File › Backup Database | Configuración › Datos › Descargar respaldo |
| File › Import | Configuración › Datos › Importar CSV |
| Pestañas Exam / Written / Requirement | Ficha › Académico |
| Pestaña Placement | Ficha › Colocación |
| Pestaña Detail | Ficha › Detalle (SSN enmascarado, se revela solo con permiso) |
| Pestaña Enrollment (estado, horarios 1-3, LOA, probation, horas) | Ficha › Inscripción (horarios y LOA sin límite) |
| Comments | Ficha › Notas |

**Fase 1 (hecha), a partir del manual oficial de Genesis:**

| Genesis (manual) | Aquí |
|---|---|
| Maintenance › School (licencia, oficiales) | Configuración › Escuela |
| Maintenance › Selections | Configuración › Catálogos. "Staff" = Usuarios; "Student Status" queda fijo porque el sistema calcula con él; "Attendance levels" = Horarios (Mañana / Noche). |
| Program › Info · Costs (Add / Inst) · Parameters (escala de notas) · Academics · SAP | Configuración › Programas (5 pestañas). Sin overtime: la escuela no lo cobra. |
| Holidays / Adjustments parciales (por programa y horas) | Configuración › Feriados y ajustes |
| Customize Auto Features | Configuración › Automatizaciones |

**Fase 2 (hecha):**

| Genesis (manual) | Aquí |
|---|---|
| Add Student: campos amarillos, botón Lead, Auto-ledger | Estudiantes › Nuevo estudiante |
| Detail: datos FISAP (Auto Zero EFC, Exceptions) | Ficha › Detalle |
| Enrollment: horas importadas + "Start Tracking Hours Using Genesis" | Ficha › Inscripción › Empezar a contar asistencia desde |
| Student Search System | Estudiantes (búsqueda y filtros) |

**Fase 3 (hecha):**

| Genesis (manual) | Aquí |
|---|---|
| Ledger › Add: Debit / Credit / Debit w/auto Credit | Ficha › Ledger › Cargo · Pago · Cargo + pago (dos asientos enlazados) |
| Apply To Account · Institutional | Cuenta (catálogo) e Institucional en cada asiento |
| Void Entry | Anular con motivo: queda tachado, no suma en balance ni reportes, nunca se borra |
| Refund = negative credit (1098-T) | Pago con casilla "Es un reembolso" (se guarda negativo) |
| Modified user / date · flagged for verification | "Por verificar" + botón Marcar verificado; historial al pasar el mouse |
| Receipt number + Print Receipt | Recibo automático y pregunta "¿Imprimir recibo?" al registrar un pago |

**Fase 4 (hecha):**

| Genesis (manual) | Aquí |
|---|---|
| Tasks › Attendance (Multiple Attendance Form) | Asistencia › Asistencia en lote |
| ITA › Check Attendance (ausentes con teléfono, presentes) | Asistencia › Check Attendance |
| Print Sign-In Sheets | Botón "Hoja de firmas" (por horario o todos) |
| ITA › Check Swipes (falta la salida) | Asistencia › Salidas sin marcar |
| Ventanas automáticas al iniciar sesión | Dashboard › Centro de alertas |
| Horas excusadas (SAP › "treat excused hours as actual") | Tipo de asistencia "Excusado" + política del programa |
| Scheduled vs. actual hours | Ficha › Asistencia: programadas, asistidas y % |

**Fase 5 (hecha):**

| Genesis (manual) | Aquí |
|---|---|
| Tasks › Academic (notas de una función para todo un programa) | Académico › Notas en lote (0 = completado sin nota) |
| Pestaña SAP · Calculate SAP | Ficha › SAP: a cualquier fecha, detalle Exam / Written / Requirement, historial y propuesta de probation |
| Check Midpoints (SAP en lote, imprimir, volver a mostrar) | Académico › Midpoints y SAP |
| Probation por SAP | Se propone cuando el SAP es Critical; una persona la confirma o la levanta |
| Placement (rango por fecha de graduación) | Académico › Colocación |

Reglas del SAP en la demo (ver especificación §5.3): académico = Exam y Written promediados (un 0 no cuenta) más Requirement medido contra lo esperado para las horas que lleva, con los pesos del programa; si falta una categoría su peso se reparte. Asistencia = asistidas / programadas. Nivel: debajo del mínimo Critical = **Critical**; entre Critical y OK = **Bajo OK**; luego **OK** y **Superior**. El general es el más bajo. Los midpoints alcanzados hace más de 3 semanas se marcan revisados al cargar la demo, para que la cola empiece con lo reciente.

**Fase 6 (hecha):**

| Genesis (manual) | Aquí |
|---|---|
| Tasks › Ledger (un cheque para varios estudiantes, "Unallocated") | Cobros › Desembolso en lote |
| R-Reports (Academic, Attendance, Ledger, Students) | Reportes, con el nombre de Genesis en cada uno |
| ITA › Check Attendance / Present / Sign-In Sheets | Reportes › Operación (y Asistencia › Check Attendance) |
| Labels | Reportes › Etiquetas (3 columnas, tipo Avery 5160) |
| — | Reportes › Datos 1098-T (nuevo; confirmar con el contador) |

**Fase 7 (hecha):**

| Genesis (manual) | Aquí |
|---|---|
| Lead: Active / Inactive, Rep, Shift y Start Date deseados | Ficha del lead (inactivo = archivado, se ve con "Ver inactivos") |
| Follow Ups con fecha y completado; pestaña de vencidos | CRM › Seguimientos y sección Seguimientos en la ficha del lead |
| Lead Source (Selections) | Fuente fija (la usan las integraciones) + **Detalle de la fuente** del catálogo |
| Botón Lead al crear estudiante | También trae horario y fecha de inicio deseados |
| — | Plan de seguimiento automático y métricas por asesor (nuevo) |

**Pendiente de construir (especificación v0.3):**

| Genesis (manual) | Aquí (planeado) |
|---|---|
| Reportes de inventario (4) | Aparecen en Reportes como "pronto" (fase 10) |
| Inventory · Services · POS | Inventario (fase 10, si se confirma) |
| ITA Setup (reloj con badge, redondeo de swipes) | Kiosco opcional (fase 11) |

Detalle y reglas en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md) §2.3, §4, §5 y §11.

**No se replica:** Window / Help (menús de app de escritorio) y el respaldo a disquete (lo reemplazan los backups de Supabase).

## Estructura

```
src/
  lib/types.ts      modelo de datos (= tablas de supabase/schema.sql)
  lib/store.tsx     capa de datos (localStorage en la demo) + permisos por rol
  lib/calc.ts       horas (programadas con feriados parciales), balance, ausencias consecutivas, midpoints, graduación proyectada
  lib/sap.ts        SAP (académico y asistencia), cola de midpoints
  lib/reports.ts    catálogo de reportes (una función por reporte)
  lib/crm.ts        seguimientos, plan automático y métricas de admisiones
  lib/alerts.ts     Centro de alertas por rol
  lib/config.ts     catálogos, escala de notas, SAP y costos por defecto + migración de datos guardados
  lib/actions.ts    crear estudiante, registrar pago, recordatorios
  lib/seed.ts       datos ficticios
  pages/            una página por módulo
  components/       UI, pestañas de la ficha, importador CSV
supabase/schema.sql esquema Postgres con RLS para producción
docs/               integraciones y plan de paso a producción
```

## Qué falta para producción

Ver [docs/PRODUCCION.md](docs/PRODUCCION.md). En resumen:
1. Cambiar `lib/store.tsx` por llamadas a Supabase.
2. Iniciar sesión con Supabase Auth.
3. Conectar los cobros reales al procesador que ya usa el portal.
4. Enviar los emails por el proveedor del portal.
5. Recibir leads de Meta con un webhook.
6. Migrar los datos de Genesis con el importador.
7. Conectar Constant Contact para campañas de marketing preparadas por un agente de IA y aprobadas por una persona.
