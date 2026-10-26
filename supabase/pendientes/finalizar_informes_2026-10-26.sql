-- Marca de "finalizado a mano" para los informes guardados en la nube: Informe Diario, Mantención
-- preventiva / Mantenimiento de generador y Falla. Un informe finalizado deja de aparecer en la lista
-- para continuar. Se puede correr más de una vez: no borra ni duplica nada.

alter table public.borradores add column if not exists finalizado_en timestamptz;
alter table public.borradores_otros add column if not exists finalizado_en timestamptz;
