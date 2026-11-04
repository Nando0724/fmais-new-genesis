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

Para volver al estado inicial usa **Configuración › Datos e importación › Reiniciar demo**.

## Módulos

| Módulo | Qué hace |
|---|---|
| **Dashboard** | Muestra leads de los últimos 7 días, inscritos del mes, estudiantes activos, monto por cobrar, pagos vencidos y alertas de ausencia. Incluye gráficos por fuente y por mes, el embudo de admisiones y las tareas del día. |
| **Admisiones (CRM)** | Kanban con arrastrar y soltar por etapa, o vista de tabla. Filtros por fuente, asesor y programa. Alerta de "sin contactar" cuando se pasa el tiempo de respuesta (SLA). Asignación por turnos. |
| **Ficha del lead** | Llamar, WhatsApp, email de seguimiento, enviar link de inscripción, convertir a estudiante y marcar como perdido con motivo. Guarda el historial de actividades y la próxima acción con fecha. |
| **Formulario web** (`/#/form`) | Formulario público bilingüe para captar leads, con casilla de consentimiento de marketing (sin marcar). Acepta `?utm_campaign=`. |
| **Marketing** | Campañas por Constant Contact (simulado). El agente de IA (simulado) prepara el borrador a partir de un segmento y un template, escribe un párrafo personalizado para cada contacto y deja notas: exclusiones, hora sugerida y advertencias. Una persona revisa la vista previa con contactos reales en su idioma y aprueba, programa, envía o rechaza. Hay campañas recurrentes (bienvenida). Los resultados (aperturas, clics, bajas) vuelven al historial del lead, y un clic crea una tarea de llamada para el asesor. Pestañas: Segmentos, Templates, Contactos y consentimiento, Constant Contact. Lo pueden usar los roles Dueño, Administrador y Admisiones. |
| **Inscripciones** | Solicitudes de inscripción en línea con sus 7 pasos, estado y depósito. Permite enviar un recordatorio para continuar y crear el estudiante cuando la solicitud está completa. |
| **Estudiantes** | Lista con búsqueda y filtros (programa, horario, estado, balance pendiente, por graduar, ausencias) y exportación a CSV. |
| **Ficha del estudiante** | Encabezado igual al de Genesis y pestañas: Resumen, Detalle, Inscripción, Académico, Asistencia, Ledger y pagos, Colocación, Documentos, Notas e Historial. |
| **Cobros** | Planes de pago automáticos y por Zelle, con estado (vencido, vence pronto, al día). Envía recordatorios de Zelle en lote, ejecuta los cobros automáticos del día (simulados), registra los Zelle recibidos y guarda el registro de emails. |
| **Asistencia** | Hoja diaria manual por horario (marca todos presentes de una vez y ajusta entradas y salidas). Alertas de ausencias consecutivas, estudiantes por graduar, midpoints alcanzados y LOA. |
| **Reportes** | Roster, asistencia por rango de fechas, morosidad, graduados y colocación, admisiones por fuente, ingresos y etiquetas. Todos se exportan a CSV o se imprimen. |
| **Configuración** | Escuela, programas (agregar, editar o copiar, con exámenes, requisitos y midpoints), horarios, feriados, usuarios y permisos, plantillas de email, umbrales de las automatizaciones, fuentes de leads, importación desde CSV y respaldo. |

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

**No replicado por ahora:**
- **ITA Setup / Chk Swipes** (lector de badge): ustedes toman la asistencia a mano.
- **POS / Inventory** y **FAS / Credit Hour Module**: pendientes de confirmar si se usan.
- **Window / Help**: son menús propios de una app de escritorio.

## Estructura

```
src/
  lib/types.ts      modelo de datos (= tablas de supabase/schema.sql)
  lib/store.tsx     capa de datos (localStorage en la demo) + permisos por rol
  lib/calc.ts       horas, balance, ausencias consecutivas, midpoints, graduación proyectada
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
