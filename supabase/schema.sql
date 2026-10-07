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

-- Cuentas que se registraron ANTES de ejecutar este script: se les crea su perfil (pendiente).
insert into public.perfiles (id, email, nombre, rut, faena)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'nombre', ''),
  nullif(u.raw_user_meta_data ->> 'rut', ''),
  case when u.raw_user_meta_data ->> 'faena' in ('rajo_inca', 'andina') then u.raw_user_meta_data ->> 'faena' end
from auth.users u
where u.email is not null
on conflict do nothing;

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

-- División de la cuenta (según la faena del registro). Cada usuario ve y modifica solo los informes
-- de su división; los administradores ven ambas.
create or replace function public.mi_division()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case faena when 'andina' then 'andina' else 'el_salvador' end
  from public.perfiles where id = auth.uid();
$$;

create or replace function public.puede_ver_division(p_division text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_usuario_aprobado() and (public.es_admin() or p_division = public.mi_division());
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

-- División a la que pertenece cada informe (los existentes son de El Salvador).
alter table public.borradores add column if not exists division text not null default 'el_salvador'
  check (division in ('el_salvador', 'andina'));
create index if not exists borradores_division_fecha_idx on public.borradores (division, fecha);

alter table public.borradores enable row level security;

-- Acceso compartido entre cuentas APROBADAS de la misma división (los administradores ven ambas).
drop policy if exists "borradores_select_shared" on public.borradores;
create policy "borradores_select_shared" on public.borradores
for select to authenticated using (public.puede_ver_division(division));

drop policy if exists "borradores_insert_shared" on public.borradores;
create policy "borradores_insert_shared" on public.borradores
for insert to authenticated with check (public.puede_ver_division(division));

drop policy if exists "borradores_update_shared" on public.borradores;
create policy "borradores_update_shared" on public.borradores
for update to authenticated using (public.puede_ver_division(division)) with check (public.puede_ver_division(division));

drop policy if exists "borradores_delete_shared" on public.borradores;
create policy "borradores_delete_shared" on public.borradores
for delete to authenticated using (public.puede_ver_division(division));

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
  tipo text not null check (tipo in ('mantenimiento', 'falla', 'cierre', 'checklist_camioneta')),
  titulo text,
  fecha date not null,
  datos jsonb not null default '{}',
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tipos de informe admitidos (se actualiza en bases creadas con versiones anteriores).
alter table public.borradores_otros drop constraint if exists borradores_otros_tipo_check;
alter table public.borradores_otros add constraint borradores_otros_tipo_check
  check (tipo in ('mantenimiento', 'falla', 'cierre', 'checklist_camioneta'));

create index if not exists borradores_otros_tipo_saved_at_idx
  on public.borradores_otros (tipo, saved_at desc);

alter table public.borradores_otros add column if not exists division text not null default 'el_salvador'
  check (division in ('el_salvador', 'andina'));
create index if not exists borradores_otros_division_tipo_idx on public.borradores_otros (division, tipo, saved_at desc);

alter table public.borradores_otros enable row level security;

drop policy if exists "borradores_otros_select_shared" on public.borradores_otros;
create policy "borradores_otros_select_shared" on public.borradores_otros
for select to authenticated using (public.puede_ver_division(division));

drop policy if exists "borradores_otros_insert_shared" on public.borradores_otros;
create policy "borradores_otros_insert_shared" on public.borradores_otros
for insert to authenticated with check (public.puede_ver_division(division));

drop policy if exists "borradores_otros_update_shared" on public.borradores_otros;
create policy "borradores_otros_update_shared" on public.borradores_otros
for update to authenticated using (public.puede_ver_division(division)) with check (public.puede_ver_division(division));

drop policy if exists "borradores_otros_delete_shared" on public.borradores_otros;
create policy "borradores_otros_delete_shared" on public.borradores_otros
for delete to authenticated using (public.puede_ver_division(division));

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

-- ===========================================================================
-- Panel de administración: usuarios en línea (presencia)
-- ===========================================================================
-- Cada sesión abierta envía un "latido" cada minuto con la pantalla en que está. Un usuario se
-- considera "en línea" si su último latido tiene menos de 2 minutos. Solo los administradores
-- pueden ver esta tabla; cada usuario solo escribe su propia fila (a través de las funciones).
create table if not exists public.presencia (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  ultimo_visto timestamptz not null default now(),
  conectado_desde timestamptz not null default now(),
  pantalla text,
  dispositivo text
);

alter table public.presencia enable row level security;

drop policy if exists "presencia_select_admin" on public.presencia;
create policy "presencia_select_admin" on public.presencia
for select to authenticated using (public.es_admin());

-- Latido: actualiza (o crea) la presencia del usuario actual. Si llevaba más de 5 minutos sin
-- latidos, se cuenta como una conexión nueva ("conectado desde").
create or replace function public.latido(p_pantalla text, p_dispositivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.es_usuario_aprobado() then
    return;
  end if;
  insert into public.presencia (usuario_id, ultimo_visto, conectado_desde, pantalla, dispositivo)
  values (auth.uid(), now(), now(), left(p_pantalla, 80), left(p_dispositivo, 40))
  on conflict (usuario_id) do update set
    conectado_desde = case
      when public.presencia.ultimo_visto < now() - interval '5 minutes' then now()
      else public.presencia.conectado_desde
    end,
    ultimo_visto = now(),
    pantalla = excluded.pantalla,
    dispositivo = excluded.dispositivo;
end;
$$;

-- Al cerrar sesión: deja de aparecer en línea de inmediato.
create or replace function public.salir()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.presencia set ultimo_visto = now() - interval '10 minutes' where usuario_id = auth.uid();
$$;

revoke all on function public.latido(text, text) from public, anon;
revoke all on function public.salir() from public, anon;
grant execute on function public.latido(text, text) to authenticated;
grant execute on function public.salir() to authenticated;

-- ===========================================================================
-- Panel de administración: registro de actividad (bitácora)
-- ===========================================================================
create table if not exists public.actividad (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users (id) on delete set null default auth.uid(),
  tipo text not null,
  detalle text not null default '',
  referencia text,
  creado_at timestamptz not null default now()
);

create index if not exists actividad_creado_at_idx on public.actividad (creado_at desc);
create index if not exists actividad_usuario_idx on public.actividad (usuario_id, creado_at desc);

alter table public.actividad enable row level security;

-- Solo los administradores leen la bitácora; cada usuario aprobado registra SUS propios eventos
-- (inicio/cierre de sesión, Word generados). Nadie puede editar ni borrar registros desde la app.
drop policy if exists "actividad_select_admin" on public.actividad;
create policy "actividad_select_admin" on public.actividad
for select to authenticated using (public.es_admin());

drop policy if exists "actividad_insert_propia" on public.actividad;
create policy "actividad_insert_propia" on public.actividad
for insert to authenticated with check (usuario_id = auth.uid() and public.es_usuario_aprobado());

-- Eventos que registra la base de datos sola: informes creados/eliminados y cambios de cuentas.
create or replace function public.auditar_borrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_detalle text;
  v_ref text;
begin
  if TG_TABLE_NAME = 'borradores' then
    v_ref := coalesce(new.id, old.id)::text;
    v_detalle := 'Informe Diario ' || to_char(coalesce(new.fecha, old.fecha), 'DD-MM-YYYY') || ' · '
      || case coalesce(new.turno, old.turno) when 'dia' then 'Día' else 'Noche' end;
  else
    v_ref := coalesce(new.id, old.id)::text;
    v_detalle := case coalesce(new.tipo, old.tipo)
        when 'checklist_camioneta' then 'Checklist camioneta'
        else initcap(coalesce(new.tipo, old.tipo)) end
      || ' · ' || coalesce(new.titulo, old.titulo, '');
  end if;
  if coalesce(new.division, old.division) = 'andina' then
    v_detalle := v_detalle || ' · Andina';
  end if;
  v_tipo := case TG_OP when 'INSERT' then 'informe_creado' else 'informe_eliminado' end;
  insert into public.actividad (usuario_id, tipo, detalle, referencia) values (auth.uid(), v_tipo, v_detalle, v_ref);
  return null;
end;
$$;

drop trigger if exists borradores_auditar on public.borradores;
create trigger borradores_auditar
after insert or delete on public.borradores
for each row execute function public.auditar_borrador();

drop trigger if exists borradores_otros_auditar on public.borradores_otros;
create trigger borradores_otros_auditar
after insert or delete on public.borradores_otros
for each row execute function public.auditar_borrador();

create or replace function public.auditar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (new.id, 'cuenta_registrada', coalesce(nullif(new.nombre, ''), new.email), new.id::text);
    return null;
  end if;
  if new.estado is distinct from old.estado then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (auth.uid(), 'cuenta_' || new.estado, coalesce(nullif(new.nombre, ''), new.email), new.id::text);
  end if;
  if new.es_admin is distinct from old.es_admin then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (auth.uid(), case when new.es_admin then 'admin_otorgado' else 'admin_quitado' end,
            coalesce(nullif(new.nombre, ''), new.email), new.id::text);
  end if;
  if new.faena is distinct from old.faena then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (auth.uid(), 'division_cambiada',
            coalesce(nullif(new.nombre, ''), new.email) || ' → '
              || case new.faena when 'andina' then 'División Andina' else 'División El Salvador' end,
            new.id::text);
  end if;
  return null;
end;
$$;

drop trigger if exists perfiles_auditar on public.perfiles;
create trigger perfiles_auditar
after insert or update on public.perfiles
for each row execute function public.auditar_perfil();

-- ===========================================================================
-- Panel de administración: uso de almacenamiento y fotos huérfanas
-- ===========================================================================
-- Tamaño de la base de datos y de las fotos (para compararlo con el límite del plan).
create or replace function public.uso_almacenamiento()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo administradores';
  end if;
  return json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'fotos_bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects where bucket_id = 'evidencias'),
    'fotos_cantidad', (select count(*) from storage.objects where bucket_id = 'evidencias')
  );
end;
$$;

-- Fotos del bucket que ningún informe usa (copias duplicadas antiguas, borradores eliminados…).
-- Se excluyen las subidas en las últimas 24 h, por si pertenecen a un informe que aún se está guardando.
-- Las fotos se borran desde la app (API de Storage), nunca con SQL, para que se eliminen de verdad.
create or replace function public.fotos_huerfanas()
returns table (nombre text, bytes bigint, creado_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_texto text;
begin
  if not public.es_admin() then
    raise exception 'Solo administradores';
  end if;
  select coalesce(string_agg(t, ' '), '') into v_texto from (
    select evidence_blocks::text || ' ' || vertiv_carro_photos::text || ' ' || vertiv_item_photos::text as t from public.borradores
    union all
    select datos::text from public.borradores_otros
  ) refs;
  return query
    select o.name, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at
    from storage.objects o
    where o.bucket_id = 'evidencias'
      and o.created_at < now() - interval '24 hours'
      and position(o.name in v_texto) = 0
    order by o.created_at;
end;
$$;

revoke all on function public.uso_almacenamiento() from public, anon;
revoke all on function public.fotos_huerfanas() from public, anon;
grant execute on function public.uso_almacenamiento() to authenticated;
grant execute on function public.fotos_huerfanas() to authenticated;

-- Realtime de presencia y actividad para el panel de administración (solo la agrega si falta).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'presencia') then
    alter publication supabase_realtime add table public.presencia;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'actividad') then
    alter publication supabase_realtime add table public.actividad;
  end if;
end $$;

