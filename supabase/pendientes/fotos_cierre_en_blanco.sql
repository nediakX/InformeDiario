-- Informe de Cierre (El Salvador): las fotos quedan en blanco para el turno actual.
-- Ejecutar UNA sola vez, en el SQL Editor de Supabase, con el Informe de Cierre cerrado en todos los equipos.
-- Los textos no cambian. Al abrir el cierre, la app vacía las fotos sola: la semana de las fotos queda como la
-- del turno anterior (14/10/2026). Las fotos siguen en el almacenamiento, pero ya no aparecen en el cierre.
-- El cierre de Andina no se toca.

update public.borradores_otros
set datos = jsonb_set(datos, '{semanaFotos}', to_jsonb('2026-10-14'::text)),
    saved_at = now()
where id = '00000000-0000-4000-8000-00000000c1e2'::uuid
  and tipo = 'cierre';
