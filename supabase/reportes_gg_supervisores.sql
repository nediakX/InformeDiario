-- Reportabilidad de GG: solo los supervisores (y administradores) corrigen o eliminan reportes.
-- Los técnicos siguen pudiendo ingresar reportes. Se puede ejecutar más de una vez.

-- Supervisores según el listado de trabajadores (cargo "Supervisor de Operaciones"), por RUT
-- sin puntos ni guion. La cuenta se reconoce por el RUT de su perfil.
create table if not exists public.supervisores (
  rut text primary key,
  nombre text not null default '',
  division text not null default 'el_salvador'
);
alter table public.supervisores enable row level security;
drop policy if exists "supervisores_select" on public.supervisores;
create policy "supervisores_select" on public.supervisores for select to authenticated using (true);

insert into public.supervisores (rut, nombre, division) values
  ('143521761', 'Díaz Cornejo Max Andrés', 'el_salvador'),
  ('179072378', 'Fernández Ortega Luis Humberto', 'el_salvador'),
  ('177384836', 'Pailapan Hormazabal Camilo Andrés', 'el_salvador'),
  ('187106818', 'Santana Ramos Patricio Ernesto', 'el_salvador')
on conflict (rut) do update set nombre = excluded.nombre, division = excluded.division;

create or replace function public.es_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.perfiles p
      join public.supervisores s on s.rut = upper(regexp_replace(coalesce(p.rut, ''), '[^0-9kK]', '', 'g'))
     where p.id = auth.uid() and p.estado = 'aprobado'
  );
$$;

drop policy if exists "reportes_gg_update" on public.reportes_gg;
create policy "reportes_gg_update" on public.reportes_gg
for update to authenticated
using (public.puede_ver_division(division) and (public.es_supervisor() or public.es_admin()))
with check (public.puede_ver_division(division));

drop policy if exists "reportes_gg_delete" on public.reportes_gg;
create policy "reportes_gg_delete" on public.reportes_gg
for delete to authenticated
using (public.puede_ver_division(division) and (public.es_supervisor() or public.es_admin()));
