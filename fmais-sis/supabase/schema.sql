-- FMAIS SIS · Esquema para Supabase (Postgres)
-- Mismas entidades que src/lib/types.ts. Pensado para correr en el mismo proyecto
-- Supabase del portal de inscripción cuando se integre (o en uno nuevo para pruebas).

create extension if not exists pgcrypto;

-- ── Usuarios y roles ────────────────────────────────────────────────
create type app_role as enum ('owner','admin','admissions','registrar','finance','instructor');

create table staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function current_role_is(roles app_role[]) returns boolean
language sql stable security definer as $$
  select exists (select 1 from staff where id = auth.uid() and active and role = any(roles));
$$;

-- ── Configuración ──────────────────────────────────────────────────
create table school_settings (
  id int primary key default 1 check (id = 1),
  school_name text not null,
  address text, phone text, email text,
  zelle_recipient text,
  absence_threshold int not null default 3,
  about_to_grad_hours int not null default 40,
  reminder_days_before int not null default 3,
  lead_response_minutes int not null default 15,
  enrollment_portal_url text,
  templates jsonb not null default '{}'
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  total_hours numeric not null,
  tuition numeric not null default 0,
  registration_fee numeric not null default 0,
  supplies_fee numeric not null default 0,
  midpoints numeric[] not null default '{}',
  active boolean not null default true,
  copied_from uuid references programs(id)
);

create type requirement_kind as enum ('exam','written','practical');
create table program_requirements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  kind requirement_kind not null,
  units_required int not null default 0,
  sort int not null default 0
);

create table schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  days int[] not null,            -- 0 = domingo … 6 = sábado
  start_time time not null,
  end_time time not null,
  break_minutes int not null default 0
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  description text not null
);

-- ── CRM de admisiones ─────────────────────────────────────────────
create type lead_stage as enum ('new','contacted','tour_scheduled','toured','applied','enrolled','lost');
create type lead_source as enum ('meta_ads','web_form','whatsapp','phone','walk_in','referral','import');

create table leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null default '',
  email text, phone text,
  language text not null default 'es',
  source lead_source not null,
  campaign text,
  external_id text unique,         -- p. ej. leadgen_id de Meta, para no duplicar
  program_id uuid references programs(id),
  stage lead_stage not null default 'new',
  owner_id uuid references staff(id),
  first_contact_at timestamptz,
  next_action text, next_action_date date,
  lost_reason text,
  student_id uuid,
  online_enrollment_id uuid,
  created_at timestamptz not null default now()
);
create index on leads (stage, owner_id);

create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  type text not null check (type in ('call','email','whatsapp','sms','tour','note','stage')),
  note text not null,
  user_id uuid references staff(id),
  at timestamptz not null default now()
);

-- ── Inscripción en línea (lo que hoy guarda el portal) ─────────────
create table online_enrollments (
  id uuid primary key default gen_random_uuid(),
  first_name text, last_name text, email text, phone text,
  program_id uuid references programs(id),
  schedule_id uuid references schedules(id),
  steps_done int not null default 0 check (steps_done between 0 and 7),
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  deposit_amount numeric not null default 0,
  payment_method text,
  lead_id uuid references leads(id),
  student_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Estudiantes (reemplazo de Genesis) ─────────────────────────────
create type enrollment_status as enum ('Applicant','Enrolled','LOA','Graduated','Withdrawn','Dropped');

create table students (
  id uuid primary key default gen_random_uuid(),
  badge text not null unique,
  first_name text not null, last_name text not null, mi text,
  email text, cell text, home_phone text, work_phone text,
  address1 text, address2 text, city text, state text default 'FL', zip text,
  ssn_encrypted bytea,             -- pgp_sym_encrypt(ssn, key); nunca en texto plano
  birthdate date, birthplace text, sex text, marital text, ethnicity text,
  driver_license_encrypted bytea, alien_registration_encrypted bytea,
  education text, high_school text, hs_city text,
  locker text, combination text, matriculation_date date,
  efc numeric, adj_gross_income numeric, dependents int, dependency text,
  program_id uuid not null references programs(id),
  status enrollment_status not null default 'Enrolled',
  record text not null default 'Active' check (record in ('Active','Inactive')),
  enrollment_date date not null,
  first_class date not null,
  contract_grad date,
  completion_date date,
  transfer_hours numeric not null default 0,
  imported_hours numeric not null default 0,
  overtime_hours numeric not null default 0,
  probation text, probation_date date,
  instructor_id uuid references staff(id),
  lead_id uuid references leads(id),
  online_enrollment_id uuid references online_enrollments(id),
  created_at timestamptz not null default now()
);

create table student_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  schedule_id uuid not null references schedules(id),
  from_date date not null
);

create table leaves_of_absence (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  start_date date not null, end_date date, reason text
);

create table placements (
  student_id uuid primary key references students(id) on delete cascade,
  passed_board text check (passed_board in ('','Yes','No','Pending')),
  board_date date, hire_date date,
  company text, contact text, address1 text, address2 text, city text, state text, zip text, phone text
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  type text not null check (type in ('Regular','Makeup','Clinic','Non-Clinic','Absent')),
  time_in time, time_out time,
  break_minutes int not null default 0,
  hours numeric not null default 0,
  source text not null default 'manual' check (source in ('manual','import','kiosk')),
  unique (student_id, date, type)
);

create table grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  requirement_id uuid not null references program_requirements(id),
  date date not null,
  percent numeric, units_done int,
  unique (student_id, requirement_id)
);

-- ── Finanzas ──────────────────────────────────────────────────────
create table payment_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  mode text not null check (mode in ('autopay','zelle')),
  amount numeric not null,
  frequency text not null check (frequency in ('weekly','biweekly','monthly')),
  next_due date not null,
  installments_left int not null,
  processor_customer_id text,      -- id del cliente/método en el procesador (Stripe, etc.)
  card_last4 text,
  active boolean not null default true,
  last_reminder_at timestamptz
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  entered_by uuid references staff(id),
  description text not null,
  charge numeric not null default 0,
  payment numeric not null default 0,
  receipt text unique,
  method text,
  plan_id uuid references payment_plans(id),
  processor_txn_id text
);
create sequence receipt_seq start 8000;

-- ── Comunicación, documentos, auditoría ───────────────────────────
create table email_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  to_email text not null, subject text not null, body text not null,
  kind text not null,
  student_id uuid references students(id), lead_id uuid references leads(id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('student','lead')),
  entity_id uuid not null,
  text text not null,
  user_id uuid references staff(id),
  at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  name text not null, type text not null,
  storage_path text not null,      -- bucket privado "student-docs"
  size int, uploaded_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid, action text not null, entity text not null, entity_id uuid
);

-- ── Vistas de apoyo ───────────────────────────────────────────────
create view student_balances as
  select student_id, sum(charge - payment) as balance from ledger_entries group by student_id;

create view student_hours as
  select s.id as student_id,
         coalesce(sum(a.hours) filter (where a.type <> 'Absent'), 0) + s.transfer_hours + s.imported_hours as hours_attended,
         max(a.date) filter (where a.type <> 'Absent' and a.hours > 0) as last_attended
  from students s left join attendance a on a.student_id = s.id
  group by s.id;

-- ── Seguridad (RLS) ───────────────────────────────────────────────
alter table students enable row level security;
alter table attendance enable row level security;
alter table ledger_entries enable row level security;
alter table payment_plans enable row level security;
alter table leads enable row level security;
alter table lead_activities enable row level security;

create policy staff_read_students on students for select using (
  current_role_is(array['owner','admin','registrar','finance','admissions']::app_role[])
  or (current_role_is(array['instructor']::app_role[]) and instructor_id = auth.uid())
);
create policy staff_write_students on students for all using (current_role_is(array['owner','admin','registrar']::app_role[]));

create policy read_attendance on attendance for select using (
  current_role_is(array['owner','admin','registrar']::app_role[])
  or exists (select 1 from students s where s.id = student_id and s.instructor_id = auth.uid())
);
create policy write_attendance on attendance for all using (
  current_role_is(array['owner','admin','registrar']::app_role[])
  or exists (select 1 from students s where s.id = student_id and s.instructor_id = auth.uid())
);

create policy finance_ledger on ledger_entries for all using (current_role_is(array['owner','admin','finance']::app_role[]));
create policy finance_read_ledger on ledger_entries for select using (current_role_is(array['registrar','admissions']::app_role[]));
create policy finance_plans on payment_plans for all using (current_role_is(array['owner','admin','finance']::app_role[]));

create policy crm_leads on leads for all using (current_role_is(array['owner','admin','admissions']::app_role[]));
create policy crm_activities on lead_activities for all using (current_role_is(array['owner','admin','admissions']::app_role[]));

-- El SSN descifrado solo se expone por una función con chequeo de rol:
create or replace function student_ssn(p_student uuid) returns text
language plpgsql security definer as $$
begin
  if not current_role_is(array['owner','admin','registrar']::app_role[]) then
    raise exception 'not allowed';
  end if;
  insert into audit_log(user_id, action, entity, entity_id) values (auth.uid(), 'reveal_ssn', 'students', p_student);
  return (select pgp_sym_decrypt(ssn_encrypted, current_setting('app.ssn_key')) from students where id = p_student);
end $$;
