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
| **Admisiones (CRM)** | Kanban con arrastrar y soltar por etapa, o vista de tabla. Filtros por fuente, asesor y programa. Alerta de "sin contactar" cuando se pasa el tiempo de respuesta (SLA). Asignación por turnos. |
| **Ficha del lead** | Llamar, WhatsApp, email de seguimiento, enviar link de inscripción, convertir a estudiante y marcar como perdido con motivo. Guarda el historial de actividades y la próxima acción con fecha. |
| **Formulario web** (`/#/form`) | Formulario público bilingüe para captar leads, con casilla de consentimiento de marketing (sin marcar). Acepta `?utm_campaign=`. |
| **Marketing** | Campañas por Constant Contact (simulado). El agente de IA (simulado) prepara el borrador a partir de un segmento y un template, escribe un párrafo personalizado para cada contacto y deja notas: exclusiones, hora sugerida y advertencias. Una persona revisa la vista previa con contactos reales en su idioma y aprueba, programa, envía o rechaza. Hay campañas recurrentes (bienvenida). Los resultados (aperturas, clics, bajas) vuelven al historial del lead, y un clic crea una tarea de llamada para el asesor. Pestañas: Segmentos, Templates, Contactos y consentimiento, Constant Contact. Lo pueden usar los roles Dueño, Administrador y Admisiones. |
| **Inscripciones** | Solicitudes de inscripción en línea con sus 7 pasos, estado y depósito. Permite enviar un recordatorio para continuar y crear el estudiante cuando la solicitud está completa. |
| **Estudiantes** | Lista con búsqueda (nombre en cualquier orden, badge, email, celular) y filtros por estado, registro, programa, horario, instructor, balance pendiente, por graduar y ausencias. Exportación a CSV. Los instructores no ven balances. |
| **Nuevo estudiante** | Trae los datos de un lead del CRM, marca en amarillo los campos obligatorios, avisa si ya existe alguien con el mismo email o celular y permite elegir si se cargan los costos del programa (auto-ledger). Para quien ya venía cursando en Genesis se ponen las horas hechas y la fecha desde la que se cuenta la asistencia, sin cargar día por día. |
| **Ficha del estudiante** | Encabezado igual al de Genesis y pestañas: Resumen, Detalle, Inscripción, Académico, Asistencia, Ledger y pagos, Colocación, Documentos, Notas e Historial. |
| **Cobros** | Planes de pago automáticos y por Zelle, con estado (vencido, vence pronto, al día). Envía recordatorios de Zelle en lote, ejecuta los cobros automáticos del día (simulados), registra los Zelle recibidos y guarda el registro de emails. |
| **Asistencia** | Hoja diaria manual por horario (marca todos presentes de una vez y ajusta entradas y salidas). Alertas de ausencias consecutivas, estudiantes por graduar, midpoints alcanzados y LOA. |
| **Reportes** | Roster, asistencia por rango de fechas, morosidad, graduados y colocación, admisiones por fuente, ingresos y etiquetas. Todos se exportan a CSV o se imprimen. |
| **Configuración** | Escuela (con licencia estatal y aviso de vencimiento) · **Catálogos** (etnia, dependencia, empresas, cuentas… se desactivan, no se borran) · Programas (agregar, editar o copiar) con pestañas Información, Costos (cargar al inscribir / institucional), Escala de notas, Académico (Exam / Written / Requirement) y SAP y midpoints · Horarios · Feriados y ajustes (todo el día o unas horas, para todos o un programa) · Usuarios y permisos · Plantillas de email · Automatizaciones (incluye cierre de sesión por inactividad) · Fuentes de leads · Importación CSV y respaldo. |

## Equivalencias con Genesis

| Genesis | Aquí |
|---|---|
| Maintenance › School | Configuración › Escuela |
| Maintenance › Program (Add / Edit / Copy) | Configuración › Programas |
| Maintenance › Student (Add / Edit) | Estudiantes › Nuevo estudiante / ficha |
| Maintenance › User Security | Configuración › Usuarios y roles |
| Maintenance › Holidays / Adjustments | Configuración › Feriados |
| Maintenance › Check Midpoints · Chk MidPnt | Ficha › Asistencia (midpoints) y Asistencia › Alertas |
| Maintenance › Labels · Labels | Reportes › Etiquetas |
| Maintenance › Reports · R-Reports | Reportes |
| Tasks › Ledger | Ficha › Ledger y pagos, Cobros |
| Tasks › Academics | Ficha › Académico |
| Tasks › Attendance · Attendance | Asistencia › Hoja diaria, Ficha › Asistencia |
| Tasks › Student Leads | Admisiones (CRM) |
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

**Pendiente de construir (especificación v0.3):**

| Genesis (manual) | Aquí (planeado) |
|---|---|
| Tasks › Academic · Attendance · Ledger (desembolso de un cheque) | Menú **Tareas** (en lote) |
| Ledger: tipos, cuenta, institucional, anular, reembolso negativo, por verificar | Ficha › Ledger |
| Pestaña SAP · Check Midpoints con SAP en lote | Ficha › SAP · Centro de alertas |
| ITA Check Attendance y hojas de firma | Asistencia |
| 29 reportes del manual | Reportes |
| Inventory · Services · POS | Inventario (fase 10, si se confirma) |
| ITA Setup / Chk Swipes (reloj con badge) | Kiosco opcional (fase 11) |

Detalle y reglas en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md) §2.3, §4, §5 y §11.

**No se replica:** Window / Help (menús de app de escritorio) y el respaldo a disquete (lo reemplazan los backups de Supabase).

## Estructura

```
src/
  lib/types.ts      modelo de datos (= tablas de supabase/schema.sql)
  lib/store.tsx     capa de datos (localStorage en la demo) + permisos por rol
  lib/calc.ts       horas (programadas con feriados parciales), balance, ausencias consecutivas, midpoints, graduación proyectada
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
