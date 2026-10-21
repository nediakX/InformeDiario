-- Rol de cada persona, asignado por un administrador (pestaña Usuarios del panel de administración).
-- Vacío = automático: se toma del cargo en el listado de trabajadores. El rol ordena la pantalla de
-- inicio y, si es "supervisor" o "jefe", permite corregir o borrar reportes de GG.
-- Se puede ejecutar más de una vez.

alter table public.perfiles add column if not exists rol text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_rol_valido') then
    alter table public.perfiles add constraint perfiles_rol_valido
      check (rol is null or rol in ('contrato', 'jefe', 'supervisor', 'electromecanico', 'electrico', 'tecnico'));
  end if;
end $$;
-- Solo los administradores pueden cambiarlo: la política "perfiles_update_admin" ya limita los cambios
-- a perfiles a los administradores, y "actualizar_mi_perfil" no toca esta columna.

-- Supervisor para la Reportabilidad de GG: rol asignado supervisor/jefe, o (sin rol asignado) el
-- cargo "Supervisor de Operaciones" del listado (tabla supervisores).
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
     where p.id = auth.uid() and p.estado = 'aprobado'
       and (p.rol in ('supervisor', 'jefe')
            or (p.rol is null and exists (
                  select 1 from public.supervisores s
                   where s.rut = upper(regexp_replace(coalesce(p.rut, ''), '[^0-9kK]', '', 'g')))))
  );
$$;

-- Bitácora: queda registrado quién cambió el rol de quién.
create or replace function public.auditar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (new.id, 'cuenta_registrada', coalesce(nullif(new.nombre, ''), new.email), new.id::text);
    return null;
  end if;
  if new.estado is distinct from old.estado then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (auth.uid(), 'cuenta_' || new.estado, coalesce(nullif(new.nombre, ''), new.email), new.id::text);
  end if;
  if new.es_admin is distinct from old.es_admin then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (auth.uid(), case when new.es_admin then 'admin_otorgado' else 'admin_quitado' end,
            coalesce(nullif(new.nombre, ''), new.email), new.id::text);
  end if;
  if new.faena is distinct from old.faena then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (auth.uid(), 'division_cambiada',
            coalesce(nullif(new.nombre, ''), new.email) || ' → '
              || case new.faena when 'andina' then 'División Andina' else 'División El Salvador' end,
            new.id::text);
  end if;
  if new.rol is distinct from old.rol then
    insert into public.actividad (usuario_id, tipo, detalle, referencia)
    values (auth.uid(), 'rol_cambiado',
            coalesce(nullif(new.nombre, ''), new.email) || ' → ' || coalesce(new.rol, 'automático'),
            new.id::text);
  end if;
  return null;
end;
$$;
