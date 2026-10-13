-- Enlace de la planilla Excel "Reporte de Generados" con la tabla reportes_gg.
-- Excel (Power Query) llama a la función planilla_reportes_gg con una clave secreta y recibe
-- los reportes con las mismas columnas que la planilla del formulario de Google.
-- Se puede ejecutar más de una vez sin problema.

-- Claves de solo lectura para planillas externas. Sin políticas: nadie la lee desde la app,
-- solo la función de abajo (security definer) y el editor SQL de Supabase.
create table if not exists public.claves_planilla (
  nombre text primary key,
  clave text not null
);
alter table public.claves_planilla enable row level security;

insert into public.claves_planilla (nombre, clave)
values ('reportes_gg', md5(random()::text || clock_timestamp()::text))
on conflict (nombre) do nothing;

create or replace function public.planilla_reportes_gg(p_clave text, p_division text default 'el_salvador')
returns table (
  "Marca temporal" timestamp,
  "Fecha" date,
  "Hora" time,
  "SITIO" text,
  "TURNO" text,
  "P Q REPORTA" text,
  "Combustible" text,
  "Horómetro" numeric,
  "Nro Partidas" integer,
  "Nivel de Refrigerante" text,
  "Nivel de Aceite" text,
  "Temperatura del Generador" numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_clave is null or not exists (
    select 1 from public.claves_planilla c where c.nombre = 'reportes_gg' and c.clave = p_clave
  ) then
    raise exception 'Clave de planilla incorrecta' using errcode = '28000';
  end if;

  return query
    select (r.marca_temporal at time zone 'America/Santiago')::timestamp,
           r.fecha, r.hora, r.sitio, r.turno, r.reporta, r.combustible, r.horometro,
           r.nro_partidas, r.nivel_refrigerante, r.nivel_aceite, r.temperatura
      from public.reportes_gg r
     where r.division = p_division
     order by r.marca_temporal, r.id;
end;
$$;

revoke all on function public.planilla_reportes_gg(text, text) from public;
grant execute on function public.planilla_reportes_gg(text, text) to anon, authenticated;

-- Para ver la clave que va en Excel:
-- select clave from public.claves_planilla where nombre = 'reportes_gg';
-- Para cambiarla (si se filtra), y luego ponerla de nuevo en Excel:
-- update public.claves_planilla set clave = md5(random()::text || clock_timestamp()::text) where nombre = 'reportes_gg';
