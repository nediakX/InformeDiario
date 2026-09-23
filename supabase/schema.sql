-- Ejecuta este script UNA VEZ en el SQL Editor de tu proyecto Supabase
-- (https://supabase.com/dashboard/project/_/sql/new). Crea la tabla compartida
-- de borradores, el bucket de fotos y las políticas de acceso "sin login"
-- (todo el equipo lee/escribe con la misma clave anon).

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

-- Acceso compartido sin login: cualquiera con la anon key del proyecto puede leer/escribir.
-- (Es la opción elegida: todo el equipo ve y edita todo, sin cuentas individuales.)
drop policy if exists "borradores_select_shared" on public.borradores;
create policy "borradores_select_shared" on public.borradores
for select to anon, authenticated using (true);

drop policy if exists "borradores_insert_shared" on public.borradores;
create policy "borradores_insert_shared" on public.borradores
for insert to anon, authenticated with check (true);

drop policy if exists "borradores_update_shared" on public.borradores;
create policy "borradores_update_shared" on public.borradores
for update to anon, authenticated using (true) with check (true);

drop policy if exists "borradores_delete_shared" on public.borradores;
create policy "borradores_delete_shared" on public.borradores
for delete to anon, authenticated using (true);

-- Mantiene updated_at al día en cada edición.
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

drop trigger if exists borradores_set_updated_at on public.borradores;
create trigger borradores_set_updated_at
before update on public.borradores
for each row execute function public.set_updated_at();

-- Habilita Realtime para que los cambios se vean al instante en otros dispositivos.
alter publication supabase_realtime add table public.borradores;

-- Bucket público para las fotos de evidencia.
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

drop policy if exists "evidencias_public_read" on storage.objects;
create policy "evidencias_public_read" on storage.objects
for select to anon, authenticated using (bucket_id = 'evidencias');

drop policy if exists "evidencias_shared_insert" on storage.objects;
create policy "evidencias_shared_insert" on storage.objects
for insert to anon, authenticated with check (bucket_id = 'evidencias');

drop policy if exists "evidencias_shared_update" on storage.objects;
create policy "evidencias_shared_update" on storage.objects
for update to anon, authenticated using (bucket_id = 'evidencias') with check (bucket_id = 'evidencias');

-- IMPORTANTE: si tu proyecto es reciente, ve a
-- Project Settings > Data API > y confirma que el esquema "public" está expuesto
-- (algunos proyectos nuevos ya no exponen tablas nuevas automáticamente).
