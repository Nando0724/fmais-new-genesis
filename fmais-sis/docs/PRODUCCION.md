# Plan para pasar del clon a producción

El clon sirve para que el equipo pruebe los flujos y pida cambios **antes** de tocar la app real. Cuando se apruebe:

| Paso | Qué | Detalle |
|---|---|---|
| 1 | Base de datos | Correr `supabase/schema.sql` en el Supabase del portal (o en uno nuevo para staging). |
| 2 | Capa de datos | Reemplazar `src/lib/store.tsx` por consultas a Supabase. Las páginas no cambian, porque solo usan `db`, `save`, `remove` y `saveMany`. |
| 3 | Login | Supabase Auth con email y contraseña. La tabla `staff` define el rol de cada usuario y RLS aplica los permisos en el servidor. |
| 4 | Datos sensibles | SSN, licencia y Alien # se guardan cifrados (`pgcrypto`). Solo se revelan con la función `student_ssn`, que deja registro en la auditoría. |
| 5 | Cobros y emails | Conectar el procesador de pagos y el proveedor de email del portal (ver INTEGRACIONES.md). Programar el cron diario. |
| 6 | Leads | Activar `lead-intake`, el formulario web y el webhook de Meta. |
| 7 | Portal | Hacer que el portal lea `?ref=` y que marque los `online_enrollments` como completados. |
| 8 | Migración Genesis | Exportar a CSV desde Genesis e importar en este orden: estudiantes → ledger → asistencia. Verificar que coincidan las horas, el balance y el estado de cada estudiante. Operar los dos sistemas en paralelo de 2 a 4 semanas. |
| 9 | Integración al admin actual | Mover estas páginas dentro de `/admin` del proyecto Lovable (mismo stack: React + Tailwind + Supabase). |
| 10 | Marketing | Agregar el consentimiento al formulario web y al portal. Conectar Constant Contact por OAuth, sincronizar contactos, crear la pantalla de campañas pendientes de aprobar y activar el agente de campañas (ver ESPECIFICACION.md §7 e INTEGRACIONES.md). Antes de importar contactos existentes, confirmar que tienen consentimiento registrado. |

## Migración desde Genesis

Todavía no sabemos en qué formato salen los datos de Genesis. Opciones a probar en la PC de Genesis:

1. **R-Reports:** buscar reportes de roster, ledger y asistencia y exportarlos a Excel o CSV.
2. **File › Backup Database:** ver qué archivo genera (extensión y tamaño). Si es una base de datos (Access, SQL Server, dBase), se pueden extraer las tablas directamente.
3. Preguntar al proveedor (genesis-smss.com) por una exportación completa.

El importador (Configuración › Datos) acepta CSV con fechas MM/DD/YYYY, horas "09:00 AM" y montos "$1,500.00", y reconoce solo los nombres de columna típicos de Genesis.
