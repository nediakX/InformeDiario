-- Ejecuta este script en el SQL Editor de tu proyecto Supabase
-- (https://supabase.com/dashboard/project/_/sql/new). Se puede volver a ejecutar sin problema.
--
-- Crea: usuarios (perfiles con aprobación manual y rol de administrador), las tablas
-- compartidas de borradores, el bucket de fotos y las políticas de acceso.
--
-- ACCESO: solo las cuentas APROBADAS por un administrador pueden leer o modificar informes.
-- Al registrarse, la cuenta queda "pendiente". Para crear el PRIMER administrador, regístrate
-- en la app y luego ejecuta (con tu correo):
--
--   update public.perfiles set estado = 'aprobado', es_admin = true where email = 'tu-correo@ejemplo.cl';
--
-- Después, los demás usuarios se aprueban desde la app (Panel de administración → Usuarios).

-- ===========================================================================
-- Usuarios: perfiles, aprobación y rol de administrador
-- ===========================================================================

-- Mantiene updated_at al día en cada edición (se usa en varias tablas).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text not null default '',
  rut text,
  faena text check (faena in ('rajo_inca', 'andina')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  es_admin boolean not null default false,
  aprobado_por uuid references auth.users (id) on delete set null,
  aprobado_at timestamptz,
  ultimo_acceso timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists perfiles_rut_unico on public.perfiles (rut) where rut is not null;
create index if not exists perfiles_estado_idx on public.perfiles (estado);

drop trigger if exists perfiles_set_updated_at on public.perfiles;
create trigger perfiles_set_updated_at
before update on public.perfiles
for each row execute function public.set_updated_at();

-- Al registrarse (auth.users), se crea su perfil "pendiente" con los datos del formulario.
-- Solo se toman nombre, RUT y faena: el estado y el rol NUNCA vienen del navegador.
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre, rut, faena)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    nullif(new.raw_user_meta_data ->> 'rut', ''),
    nullif(new.raw_user_meta_data ->> 'faena', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.crear_perfil_usuario();

-- Funciones que usan las políticas (security definer: leen perfiles sin quedar en bucle con su RLS).
create or replace function public.es_usuario_aprobado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and estado = 'aprobado');
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and estado = 'aprobado' and es_admin);
$$;

-- Cada usuario registra su último acceso (no puede cambiar nada más de su perfil).
create or replace function public.registrar_acceso()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.perfiles set ultimo_acceso = now() where id = auth.uid();
$$;

revoke all on function public.registrar_acceso() from public, anon;
grant execute on function public.registrar_acceso() to authenticated;

alter table public.perfiles enable row level security;

-- Cada uno ve su propio perfil; los administradores ven todos.
drop policy if exists "perfiles_select" on public.perfiles;
create policy "perfiles_select" on public.perfiles
for select to authenticated using (id = auth.uid() or public.es_admin());

-- Solo un administrador cambia estados y roles (nadie puede aprobarse a sí mismo).
drop policy if exists "perfiles_update_admin" on public.perfiles;
create policy "perfiles_update_admin" on public.perfiles
for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- Quién guardó por última vez cada borrador (para las estadísticas del panel de administración).
-- Lo completa la base de datos con el usuario de la sesión: no depende del navegador.
create or replace function public.set_actualizado_por()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.actualizado_por = auth.uid();
  return new;
end;
$$;

-- ===========================================================================
-- Informe Diario
-- ===========================================================================

create table if not exists public.borradores (
  id uuid primary key,
  turno text not null check (turno in ('dia', 'noche')),
  fecha date not null,
  faena text,
  letra_turno text,
  contrato text,
  version text,
  servicio text,
  creado_nombre text,
  creado_cargo text,
  revisado_text text,
  autorizado_nombre text,
  autorizado_cargo text,
  personal jsonb not null default '[]',
  actividades jsonb not null default '[]',
  observaciones jsonb not null default '[]',
  evidence_blocks jsonb not null default '[]',
  vertiv_carro_photos jsonb not null default '[]',
  vertiv_item_photos jsonb not null default '[]',
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.borradores enable row level security;

-- Acceso compartido entre cuentas APROBADAS: todo el equipo ve y edita todos los informes.
drop policy if exists "borradores_select_shared" on public.borradores;
create policy "borradores_select_shared" on public.borradores
for select to authenticated using (public.es_usuario_aprobado());

drop policy if exists "borradores_insert_shared" on public.borradores;
create policy "borradores_insert_shared" on public.borradores
for insert to authenticated with check (public.es_usuario_aprobado());

drop policy if exists "borradores_update_shared" on public.borradores;
create policy "borradores_update_shared" on public.borradores
for update to authenticated using (public.es_usuario_aprobado()) with check (public.es_usuario_aprobado());

drop policy if exists "borradores_delete_shared" on public.borradores;
create policy "borradores_delete_shared" on public.borradores
for delete to authenticated using (public.es_usuario_aprobado());

drop trigger if exists borradores_set_updated_at on public.borradores;
create trigger borradores_set_updated_at
before update on public.borradores
for each row execute function public.set_updated_at();

-- Habilita Realtime para que los cambios se vean al instante en otros dispositivos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'borradores'
  ) then
    alter publication supabase_realtime add table public.borradores;
  end if;
end $$;

-- Bucket público para las fotos de evidencia.
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

drop policy if exists "evidencias_public_read" on storage.objects;
create policy "evidencias_public_read" on storage.objects
for select to authenticated using (bucket_id = 'evidencias' and public.es_usuario_aprobado());

drop policy if exists "evidencias_shared_insert" on storage.objects;
create policy "evidencias_shared_insert" on storage.objects
for insert to authenticated with check (bucket_id = 'evidencias' and public.es_usuario_aprobado());

drop policy if exists "evidencias_shared_update" on storage.objects;
create policy "evidencias_shared_update" on storage.objects
for update to authenticated using (bucket_id = 'evidencias' and public.es_usuario_aprobado()) with check (bucket_id = 'evidencias' and public.es_usuario_aprobado());

drop policy if exists "evidencias_shared_delete" on storage.objects;
create policy "evidencias_shared_delete" on storage.objects
for delete to authenticated using (bucket_id = 'evidencias' and public.es_usuario_aprobado());

-- ---------------------------------------------------------------------------
-- Borradores de Mantenimiento de Generador, Informe de Falla — Carro e Informe
-- de Cierre: una sola tabla genérica. "tipo" los distingue y "datos" (JSONB)
-- guarda el formulario completo, así no hace falta migrar al agregar campos.
-- ---------------------------------------------------------------------------
create table if not exists public.borradores_otros (
  id uuid primary key,
  tipo text not null check (tipo in ('mantenimiento', 'falla', 'cierre')),
  titulo text,
  fecha date not null,
  datos jsonb not null default '{}',
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists borradores_otros_tipo_saved_at_idx
  on public.borradores_otros (tipo, saved_at desc);

alter table public.borradores_otros enable row level security;

drop policy if exists "borradores_otros_select_shared" on public.borradores_otros;
create policy "borradores_otros_select_shared" on public.borradores_otros
for select to authenticated using (public.es_usuario_aprobado());

drop policy if exists "borradores_otros_insert_shared" on public.borradores_otros;
create policy "borradores_otros_insert_shared" on public.borradores_otros
for insert to authenticated with check (public.es_usuario_aprobado());

drop policy if exists "borradores_otros_update_shared" on public.borradores_otros;
create policy "borradores_otros_update_shared" on public.borradores_otros
for update to authenticated using (public.es_usuario_aprobado()) with check (public.es_usuario_aprobado());

drop policy if exists "borradores_otros_delete_shared" on public.borradores_otros;
create policy "borradores_otros_delete_shared" on public.borradores_otros
for delete to authenticated using (public.es_usuario_aprobado());

drop trigger if exists borradores_otros_set_updated_at on public.borradores_otros;
create trigger borradores_otros_set_updated_at
before update on public.borradores_otros
for each row execute function public.set_updated_at();

-- Realtime (solo la agrega si todavía no está en la publicación).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'borradores_otros'
  ) then
    alter publication supabase_realtime add table public.borradores_otros;
  end if;
end $$;

-- IMPORTANTE: si tu proyecto es reciente, ve a
-- Project Settings > Data API > y confirma que el esquema "public" está expuesto
-- (algunos proyectos nuevos ya no exponen tablas nuevas automáticamente).

-- ===========================================================================
-- Autoría de los borradores (para el panel de administración)
-- ===========================================================================
alter table public.borradores add column if not exists actualizado_por uuid references auth.users (id) on delete set null;
alter table public.borradores_otros add column if not exists actualizado_por uuid references auth.users (id) on delete set null;

drop trigger if exists borradores_set_actualizado_por on public.borradores;
create trigger borradores_set_actualizado_por
before insert or update on public.borradores
for each row execute function public.set_actualizado_por();

drop trigger if exists borradores_otros_set_actualizado_por on public.borradores_otros;
create trigger borradores_otros_set_actualizado_por
before insert or update on public.borradores_otros
for each row execute function public.set_actualizado_por();

-- Realtime de perfiles: la app se entera al instante cuando un administrador aprueba una cuenta.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'perfiles'
  ) then
    alter publication supabase_realtime add table public.perfiles;
  end if;
end $$;
