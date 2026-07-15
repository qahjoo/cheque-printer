-- =============================================================================
-- supabase_setup.sql — إعداد قاعدة بيانات Supabase (النسخة السحابية)
-- Run this once in the Supabase SQL editor.
-- Tables mirror the local SQLite schema (same column names) so upserts by `id`
-- work verbatim from supabaseService.js. RLS enabled; authenticated users get
-- full access. The app uses the anon key + (optionally) an auth session.
-- =============================================================================

-- ---- banks -----------------------------------------------------------------
create table if not exists public.banks (
  id              bigint primary key,
  name_ar         text not null,
  name_en         text,
  check_width_mm  double precision not null default 175.0,
  check_height_mm double precision not null default 80.0,
  print_template  text not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---- checks ----------------------------------------------------------------
create table if not exists public.checks (
  id              text primary key,
  check_number    text not null,
  bank_id         bigint,
  payee_ar        text not null,
  payee_en        text,
  amount          double precision not null default 0,
  amount_words_ar text not null default '',
  currency        text not null default 'دينار',
  issue_date      date not null,
  due_date        date not null,
  status          text not null default 'open'
                    check (status in ('open','collected','returned','cancelled')),
  collected_by    text,
  collected_at    timestamptz,
  notes           text,
  google_event_id text,
  printed_at      timestamptz,
  is_deleted      boolean not null default false,
  deleted_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  synced_at       timestamptz
);

create index if not exists idx_checks_due_date on public.checks(due_date);
create index if not exists idx_checks_status   on public.checks(status);

-- ---- incoming_checks -------------------------------------------------------
create table if not exists public.incoming_checks (
  id              text primary key,
  check_number    text not null,
  drawer_name     text not null,
  drawer_phone    text,
  bank_name       text not null,
  amount          double precision not null default 0,
  currency        text not null default 'دينار أردني',
  issue_date      date not null,
  due_date        date not null,
  received_date   date not null,
  status          text not null default 'received'
                    check (status in ('received', 'under_collection', 'collected', 'returned', 'endorsed')),
  notes           text,
  image_path      text,
  is_deleted      boolean not null default false,
  deleted_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  synced_at       timestamptz
);

create index if not exists idx_incoming_due_date on public.incoming_checks(due_date);
create index if not exists idx_incoming_status   on public.incoming_checks(status);
create index if not exists idx_incoming_drawer   on public.incoming_checks(drawer_name);

-- ---- settings --------------------------------------------------------------
create table if not exists public.settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ---- reminder_log ----------------------------------------------------------
create table if not exists public.reminder_log (
  id         bigint generated always as identity primary key,
  check_id   text,
  channel    text not null,
  success    boolean not null default false,
  message    text,
  error      text,
  created_at timestamptz not null default now()
);

-- ---- audit_log -------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  entity     text not null,
  action     text not null,
  entity_id  text,
  details    text,
  created_at timestamptz not null default now()
);

-- ---- templates -------------------------------------------------------------
create table if not exists public.templates (
  id               bigint primary key,
  name             text not null,
  width_mm         double precision not null default 165,
  height_mm        double precision not null default 82,
  background_image text,
  is_default       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---- template_fields -------------------------------------------------------
create table if not exists public.template_fields (
  id          bigint primary key,
  template_id bigint references public.templates(id) on delete cascade,
  field_name  text not null,
  x_mm        double precision not null default 20,
  y_mm        double precision not null default 20,
  font_family text not null default 'Cairo',
  font_size   double precision not null default 12,
  font_weight text not null default '400',
  color       text not null default '#000000',
  align       text not null default 'right',
  direction   text not null default 'rtl',
  visible     boolean not null default true
);

create index if not exists idx_tfields_template on public.template_fields(template_id);

-- ---- print_history ---------------------------------------------------------
create table if not exists public.print_history (
  id            bigint primary key,
  print_date    timestamptz not null,
  cheque_date   date,
  payee         text not null,
  amount        double precision not null default 0,
  amount_words  text,
  purpose       text,
  cheque_number text,
  currency      text not null default 'دينار أردني',
  crossed       boolean not null default false,
  template_id   bigint,
  template_name text,
  printed_by    text not null default 'المستخدم',
  status        text not null default 'printed',
  created_at    timestamptz not null default now()
);

create index if not exists idx_history_date  on public.print_history(print_date);
create index if not exists idx_history_payee on public.print_history(payee);

-- =============================================================================
-- Row Level Security — allow all operations for authenticated users.
-- (Single-tenant desktop app. Anon inserts can be permitted too if you do not
--  wire up Supabase Auth; flip the policies below accordingly.)
-- =============================================================================
alter table public.banks          enable row level security;
alter table public.checks         enable row level security;
alter table public.incoming_checks enable row level security;
alter table public.settings       enable row level security;
alter table public.reminder_log   enable row level security;
alter table public.audit_log      enable row level security;
alter table public.templates      enable row level security;
alter table public.template_fields enable row level security;
alter table public.print_history  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'banks','checks','incoming_checks','settings','reminder_log','audit_log',
    'templates','template_fields','print_history'
  ]
  loop
    -- Authenticated users
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$s;', t);
    execute format($f$
      create policy "auth_all_%1$s" on public.%1$s
        for all to authenticated using (true) with check (true);
    $f$, t);
    -- Anon key (desktop app uses anon key directly)
    execute format('drop policy if exists "anon_all_%1$s" on public.%1$s;', t);
    execute format($f$
      create policy "anon_all_%1$s" on public.%1$s
        for all to anon using (true) with check (true);
    $f$, t);
  end loop;
end $$;

-- Keep updated_at fresh on cloud-side writes too.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_checks_touch on public.checks;
create trigger trg_checks_touch before update on public.checks
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_banks_touch on public.banks;
create trigger trg_banks_touch before update on public.banks
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_templates_touch on public.templates;
create trigger trg_templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_incoming_checks_touch on public.incoming_checks;
create trigger trg_incoming_checks_touch before update on public.incoming_checks
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Storage Policies for 'milano' bucket
-- Allows Anon/Authenticated users to upload, download, and delete images.
-- =============================================================================
-- Note: the bucket "milano" must be created manually in the Supabase UI first.

insert into storage.buckets (id, name, public) 
values ('milano', 'milano', true) 
on conflict (id) do update set public = true;

drop policy if exists "allow_all_storage_select" on storage.objects;
create policy "allow_all_storage_select" on storage.objects
  for select using (bucket_id = 'milano');

drop policy if exists "allow_all_storage_insert" on storage.objects;
create policy "allow_all_storage_insert" on storage.objects
  for insert with check (bucket_id = 'milano');

drop policy if exists "allow_all_storage_update" on storage.objects;
create policy "allow_all_storage_update" on storage.objects
  for update using (bucket_id = 'milano');

drop policy if exists "allow_all_storage_delete" on storage.objects;
create policy "allow_all_storage_delete" on storage.objects
  for delete using (bucket_id = 'milano');
