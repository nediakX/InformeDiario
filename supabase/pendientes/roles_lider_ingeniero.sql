-- Roles nuevos en el panel de Usuarios: "Líder Técnico" (lider_tecnico) e "Ingeniero Especialista"
-- (ingeniero_especialista). Ejecutarlo ANTES de asignar cualquiera de los dos: la restricción
-- perfiles_rol_valido todavía no los acepta.
-- Solo ordenan la pantalla de inicio: no dan permisos nuevos (corregir reportes de GG sigue siendo de
-- supervisor y jefe). Se puede ejecutar más de una vez sin problema.

alter table public.perfiles drop constraint if exists perfiles_rol_valido;
alter table public.perfiles add constraint perfiles_rol_valido
  check (rol is null or rol in ('contrato', 'jefe', 'supervisor', 'lider_tecnico', 'ingeniero_especialista', 'electromecanico', 'electrico', 'tecnico'));
