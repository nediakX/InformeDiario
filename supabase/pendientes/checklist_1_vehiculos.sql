-- Checklist de camioneta, PASO 1 de 2: datos de la camioneta para todas las cuentas.
-- Ejecutar en el SQL Editor de Supabase. Puede ejecutarse antes o después de publicar la app, y no cambia
-- lo que ve cada cuenta hoy. Se puede ejecutar más de una vez sin problema.
-- Crea vehiculos_checklist(): entrega a las cuentas de la división los datos de cada camioneta (marca, modelo,
-- año, mantenciones, licencia y extintor), SIN el contenido de los checklists (marcas, aptitudes, firmas, observaciones).

create or replace function public.vehiculos_checklist(p_division text)
returns table (id uuid, fecha date, datos jsonb, saved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (upper(regexp_replace(coalesce(b.datos->>'patente', ''), '[^A-Za-z0-9]', '', 'g')))
    b.id,
    b.fecha,
    jsonb_build_object(
      'patente', b.datos->>'patente',
      'marca', b.datos->>'marca',
      'modelo', b.datos->>'modelo',
      'anio', b.datos->>'anio',
      'fechaUltimaMantencion', b.datos->>'fechaUltimaMantencion',
      'kmProximaMantencion', b.datos->>'kmProximaMantencion',
      'fechaControlLicencia', b.datos->>'fechaControlLicencia',
      'fechaExtintor', b.datos->>'fechaExtintor'
    ) as datos,
    b.saved_at
  from public.borradores_otros b
  where b.tipo = 'checklist_camioneta'
    and b.division = p_division
    and coalesce(b.datos->>'patente', '') <> ''
    and public.puede_ver_division(p_division)
  order by upper(regexp_replace(coalesce(b.datos->>'patente', ''), '[^A-Za-z0-9]', '', 'g')), b.saved_at desc;
$$;

revoke execute on function public.vehiculos_checklist(text) from public, anon;
grant execute on function public.vehiculos_checklist(text) to authenticated;
