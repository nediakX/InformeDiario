-- Informe de Cierre (Andina): las fotos quedan en blanco para el turno actual.
-- Igual que fotos_cierre_en_blanco.sql (El Salvador), pero solo para el cierre de Andina.
-- Ejecutar UNA sola vez, en el SQL Editor de Supabase, con el Informe de Cierre de Andina cerrado en todos los equipos.
-- Los textos no cambian. Al abrir el cierre, la app vacía las fotos sola (la semana de las fotos queda como la del turno anterior, 14/10/2026).
-- Si Andina aún no tiene un cierre guardado, este SQL no cambia nada. El cierre de El Salvador no se toca.

update public.borradores_otros
set datos = jsonb_set(datos, '{semanaFotos}', to_jsonb('2026-10-14'::text)),
    saved_at = now()
where id = '00000000-0000-4000-8000-0000000a0d1e'::uuid
  and tipo = 'cierre';
