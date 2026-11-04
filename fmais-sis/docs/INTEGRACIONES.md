# Integraciones de leads y pagos

## Entrada única de leads: función `lead-intake`

Todas las fuentes automáticas llegan a una sola Edge Function de Supabase. Esta función normaliza el lead, lo deduplica por email, teléfono y `external_id`, lo asigna por turnos entre los asesores y le avisa al asesor.

```
POST /functions/v1/lead-intake
{ "source": "web_form" | "meta_ads" | "whatsapp", "first_name", "last_name", "email", "phone",
  "program_code"?, "campaign"?, "external_id"?, "language"? }
```

| Fuente | Cómo llega | Estado en el clon |
|---|---|---|
| **Meta / Facebook Lead Ads** | Webhook `leadgen` de Meta → `lead-intake`. Lee el formulario con la Graph API usando el `leadgen_id`, que se guarda como `external_id`. Requiere una app de Meta y un token de página. | Se importa el CSV de Meta en Configuración › Datos › Leads. |
| **Formulario web** | El formulario de `/#/form` se incrusta en la web de la escuela (iframe o componente) y hace POST a `lead-intake`. | Funciona: escribe en el CRM de la demo. |
| **WhatsApp** | WhatsApp Business Cloud API: cada conversación nueva crea un lead (o actividad si ya existe). | Botón WhatsApp (wa.me) en la ficha del lead; registra la actividad. |
| **Llamadas** | Manual en el CRM. Opcional: webhook de la central telefónica. | Manual. |
| **Walk-in / referidos** | Manual en el CRM. | Manual. |

## Del lead a la inscripción

1. El asesor pulsa **Enviar link de inscripción**. Se crea un `online_enrollment` y se envía el link `portal?ref=<id>&lang=es`.
2. El portal Lovable lee `ref` y prellena los datos del lead. **Este es el único cambio que pide la app existente, y se hace en la fase de integración.**
3. Cuando el portal marca la inscripción como completada (firma y depósito), se crea el estudiante con sus cargos y su plan de pago, y el lead pasa a "Inscrito".

## Cobros

- **Cobro automático:** se usa el procesador que ya tiene el portal. Un cron diario (`pg_cron` o un scheduled function) cobra los planes con `next_due <= hoy`. Cada cobro se registra en `ledger_entries` y se envía el recibo por email.
- **Zelle:** el mismo cron envía el recordatorio `reminder_days_before` días antes del vencimiento y vuelve a avisar cuando el pago está vencido. Finanzas marca el pago como recibido. Opcional más adelante: conciliar automáticamente con el estado de cuenta del banco.
- **Seguridad:** el sistema nunca guarda números de tarjeta, solo el id del cliente en el procesador y los últimos 4 dígitos.

## Emails

Se usan las plantillas de Configuración › Plantillas, con variables `{{nombre}}`, `{{monto}}`, etc. En la demo los emails no se envían: quedan en Cobros › Registro de emails. En producción salen por el proveedor que ya usa el portal.

Estos son los emails **transaccionales**: cobros, recibos, ausencias e inscripción. El marketing va aparte, por Constant Contact.

## Constant Contact (marketing)

Diseño completo en ESPECIFICACION.md §7. Piezas técnicas:

| Pieza | Qué hace |
|---|---|
| Conexión OAuth2 | Configuración › Integraciones › "Conectar Constant Contact". Guarda el token de acceso y el de renovación como secreto de Supabase, nunca en el navegador. |
| `cc-sync-contacts` (Edge Function) | Crea o actualiza contactos en Constant Contact con los campos personalizados (programa, idioma, etapa, fuente). Corre al cambiar un lead o estudiante con consentimiento, y además una vez al día. Guarda `cc_contact_id`. |
| `cc-webhook` (Edge Function) | Recibe bajas y rebotes de Constant Contact y marca `unsubscribed_at` en la plataforma. Si el webhook no está disponible en el plan, se consultan una vez al día. |
| `cc-campaigns` (Edge Function) | Crea la campaña y su actividad de email desde el contenido aprobado, asigna las listas del segmento y la programa. Solo acepta campañas en estado `approved`. |
| `cc-reports` (cron diario) | Trae aperturas, clics y rebotes por contacto y los guarda en `marketing_events` y en el historial del lead. |
| Agente de campañas | Tarea programada que arma el borrador de cada campaña (segmento, asunto, texto ES/EN, campos personalizados) y la deja en `pending_approval`. No tiene permiso para llamar a `cc-campaigns` directamente. |

Los recordatorios de Zelle y los recibos **nunca** pasan por Constant Contact, para que una baja de marketing no detenga los avisos de pago.
