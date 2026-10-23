-- Actividades sin bloque de evidencia (Informe Diario), compartidas entre todos los dispositivos.
-- Ejecutar en el SQL Editor de Supabase. Se puede ejecutar más de una vez sin problema.
-- Hasta ejecutarlo, las marcas quedan guardadas en cada equipo y se suben al ejecutarlo.

create table if not exists public.sin_evidencia (
  turno text not null check (turno in ('dia', 'noche')),
  division text not null check (division in ('el_salvador', 'andina')),
  actividad text not null,
  creado_at timestamptz not null default now(),
  primary key (turno, division, actividad)
);

alter table public.sin_evidencia enable row level security;

drop policy if exists "sin_evidencia_select_shared" on public.sin_evidencia;
create policy "sin_evidencia_select_shared" on public.sin_evidencia
for select to authenticated using (public.puede_ver_division(division));

drop policy if exists "sin_evidencia_insert_shared" on public.sin_evidencia;
create policy "sin_evidencia_insert_shared" on public.sin_evidencia
for insert to authenticated with check (public.puede_ver_division(division));

drop policy if exists "sin_evidencia_delete_shared" on public.sin_evidencia;
create policy "sin_evidencia_delete_shared" on public.sin_evidencia
for delete to authenticated using (public.puede_ver_division(division));

-- Avisa en tiempo real a los otros dispositivos cuando cambia una marca.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sin_evidencia'
  ) then
    alter publication supabase_realtime add table public.sin_evidencia;
  end if;
end $$;
