-- Checklist de camioneta, PASO 2 de 2: cada checklist es solo de la cuenta que lo creó.
-- Ejecutar en el SQL Editor de Supabase SOLO después de:
--   1) ejecutar checklist_1_vehiculos.sql, y
--   2) publicar la versión de la app que lee las camionetas con vehiculos_checklist().
-- Si se ejecuta antes, las versiones viejas de la app dejan de mostrar las camionetas que cargaron otras cuentas.
-- Los administradores siguen viendo, editando y borrando todos los checklists. Todo corre en una sola transacción: si algo falla, no queda nada a medias.
-- Dueño de un checklist: datos.propietarioId (checklists nuevos) o, en los anteriores, quien lo guardó por última vez.

begin;

-- Columna de la última cuenta que guardó cada borrador (normalmente ya existe; esto la asegura).
alter table public.borradores_otros add column if not exists actualizado_por uuid references auth.users (id) on delete set null;

drop policy if exists "borradores_otros_select_shared" on public.borradores_otros;
create policy "borradores_otros_select_shared" on public.borradores_otros
for select to authenticated using (
  public.puede_ver_division(division)
  and (tipo <> 'checklist_camioneta'
       or public.es_admin()
       or coalesce(datos->>'propietarioId', actualizado_por::text) = auth.uid()::text)
);

drop policy if exists "borradores_otros_insert_shared" on public.borradores_otros;
create policy "borradores_otros_insert_shared" on public.borradores_otros
for insert to authenticated with check (
  public.puede_ver_division(division)
  and (tipo <> 'checklist_camioneta'
       or coalesce(datos->>'propietarioId', auth.uid()::text) = auth.uid()::text)
);

drop policy if exists "borradores_otros_update_shared" on public.borradores_otros;
create policy "borradores_otros_update_shared" on public.borradores_otros
for update to authenticated
using (
  public.puede_ver_division(division)
  and (tipo <> 'checklist_camioneta'
       or public.es_admin()
       or coalesce(datos->>'propietarioId', actualizado_por::text) = auth.uid()::text)
)
with check (
  public.puede_ver_division(division)
  and (tipo <> 'checklist_camioneta'
       or public.es_admin()
       or coalesce(datos->>'propietarioId', auth.uid()::text) = auth.uid()::text)
);

drop policy if exists "borradores_otros_delete_shared" on public.borradores_otros;
create policy "borradores_otros_delete_shared" on public.borradores_otros
for delete to authenticated using (
  public.puede_ver_division(division)
  and (tipo <> 'checklist_camioneta'
       or public.es_admin()
       or coalesce(datos->>'propietarioId', actualizado_por::text) = auth.uid()::text)
);

commit;
