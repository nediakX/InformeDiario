-- Tabla de Reportabilidad de GG (también está al final de supabase/schema.sql).
-- Se puede correr sola y más de una vez. Correr ANTES de los archivos reportes_gg_historico_*.sql.

-- ===========================================================================
-- Reportabilidad de GG (grupos generadores): una fila por reporte, con las
-- mismas columnas del formulario "REPORTABILIDAD DE GG" de Google Forms.
-- El histórico de la planilla se carga con supabase/reportes_gg_historico_*.sql.
-- ===========================================================================
create table if not exists public.reportes_gg (
  id uuid primary key default gen_random_uuid(),
  division text not null default 'el_salvador' check (division in ('el_salvador', 'andina')),
  marca_temporal timestamptz not null default now(),
  fecha date not null,
  hora time,
  sitio text not null,
  turno text not null check (turno in ('TURNO A', 'TURNO B')),
  reporta text not null,
  combustible text,
  horometro numeric,
  nro_partidas integer,
  nivel_refrigerante text,
  nivel_aceite text,
  temperatura numeric,
  creado_por uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

-- Una sola temperatura: si la tabla se creó antes con dos columnas, se juntan en "temperatura".
alter table public.reportes_gg add column if not exists temperatura numeric;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reportes_gg' and column_name = 'temperatura_1') then
    execute 'update public.reportes_gg set temperatura = coalesce(temperatura, temperatura_1, temperatura_2)';
    execute 'alter table public.reportes_gg drop column temperatura_1';
    execute 'alter table public.reportes_gg drop column if exists temperatura_2';
  end if;
end $$;

create index if not exists reportes_gg_division_fecha_idx on public.reportes_gg (division, fecha desc, hora desc);
create index if not exists reportes_gg_division_sitio_fecha_idx on public.reportes_gg (division, sitio, fecha desc);

alter table public.reportes_gg enable row level security;

-- Todos los de la división ven y agregan reportes; corregir o borrar uno: quien lo hizo o un administrador.
drop policy if exists "reportes_gg_select" on public.reportes_gg;
create policy "reportes_gg_select" on public.reportes_gg
for select to authenticated using (public.puede_ver_division(division));

drop policy if exists "reportes_gg_insert" on public.reportes_gg;
create policy "reportes_gg_insert" on public.reportes_gg
for insert to authenticated with check (public.puede_ver_division(division));

drop policy if exists "reportes_gg_update" on public.reportes_gg;
create policy "reportes_gg_update" on public.reportes_gg
for update to authenticated
using (public.puede_ver_division(division) and (creado_por = auth.uid() or public.es_admin()))
with check (public.puede_ver_division(division));

drop policy if exists "reportes_gg_delete" on public.reportes_gg;
create policy "reportes_gg_delete" on public.reportes_gg
for delete to authenticated
using (public.puede_ver_division(division) and (creado_por = auth.uid() or public.es_admin()));

drop trigger if exists reportes_gg_set_updated_at on public.reportes_gg;
create trigger reportes_gg_set_updated_at
before update on public.reportes_gg
for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reportes_gg'
  ) then
    alter publication supabase_realtime add table public.reportes_gg;
  end if;
end $$;
