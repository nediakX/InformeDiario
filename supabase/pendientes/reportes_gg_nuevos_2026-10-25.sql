-- Reportes de la planilla "Reporte de Generados" desde el 22-10-2026 (44 filas, hasta el 25-10-2026).
-- Se puede correr más de una vez y no duplica: se salta un reporte si ya existe el mismo sitio con la misma
-- marca temporal, o el mismo sitio, fecha y horómetro (por si ya se había ingresado desde la app).

insert into public.reportes_gg (id, division, marca_temporal, fecha, hora, sitio, turno, reporta, combustible, horometro, nro_partidas, nivel_refrigerante, nivel_aceite, temperatura)
select md5(v.marca || '|' || v.sitio)::uuid, 'el_salvador', (v.marca || ' America/Santiago')::timestamptz, v.fecha::date, v.hora::time, v.sitio, v.turno, v.reporta,
       v.combustible, v.horometro, v.nro_partidas, v.nivel_refrigerante, v.nivel_aceite, v.temperatura
from (values
('2026-10-21 23:02:16', '2026-10-22', '00:05', 'LTE_CM_MMOO_01', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 403.5, 264, 'Alta', 'Optimo', 16),
('2026-10-21 23:21:06', '2026-10-22', '00:30', 'LTE_CMM_03', 'TURNO A', 'Vanesa Aguilar', '3/4', 5143.3, 1932, 'Medio', 'Optimo', 85),
('2026-10-21 23:34:11', '2026-10-22', '00:45', 'LTE_CMF_02', 'TURNO A', 'Vanesa Aguilar', '3/4', 3208.4, 906, 'Alta', 'Optimo', 21),
('2026-10-21 23:58:19', '2026-10-22', '01:15', 'LTE_CMM_07', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 2583.1, 4605, 'Alta', 'Optimo', 14),
('2026-10-22 00:19:11', '2026-10-22', '02:00', 'LTE_CMF_08', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 3317.2, 1886, 'Alta', 'Optimo', 69),
('2026-10-22 00:34:54', '2026-10-22', '02:30', 'LTE_CMM_10', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 4682.5, 11577, 'Alta', 'Optimo', 19),
('2026-10-22 00:56:05', '2026-10-22', '04:00', 'LTE_CMF_09', 'TURNO A', 'Vanesa Aguilar', '1/2', 5627, 2498, 'Alta', 'Optimo', 71),
('2026-10-22 01:14:14', '2026-10-22', '04:30', 'LTE_11', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 1317.6, 709, 'Alta', 'Optimo', 11),
('2026-10-22 01:27:38', '2026-10-22', '04:50', 'LTE_CMM_06', 'TURNO A', 'Vanesa Aguilar', '3/4', 4728, 135, 'Alta', 'Optimo', 70),
('2026-10-22 01:43:38', '2026-10-22', '05:00', 'LTE_CMF_04', 'TURNO A', 'Vanesa Aguilar', '3/4', 5034.7, 1555, 'Alta', 'Optimo', 62),
('2026-10-22 02:01:37', '2026-10-22', '06:00', 'LTE_CMF_01', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 4067.9, 1610, 'Medio', 'Optimo', 24),
('2026-10-22 20:59:44', '2026-10-23', '00:01', 'LTE_CMF_01', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 4072.5, 1611, 'Alta', 'Optimo', 26),
('2026-10-22 22:53:47', '2026-10-23', '02:00', 'LTE_CMF_04', 'TURNO A', 'Vanesa Aguilar', '3/4', 5038.3, 1556, 'Alta', 'Optimo', 29),
('2026-10-22 22:55:32', '2026-10-23', '03:00', 'LTE_CMM_07', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 2583.1, 4605, 'Alta', 'Optimo', 21),
('2026-10-22 23:52:05', '2026-10-23', '00:30', 'LTE_CMM_03', 'TURNO A', 'Vanesa Aguilar', '3/4', 5152.9, 1934, 'Alta', 'Optimo', 83),
('2026-10-23 00:05:12', '2026-10-23', '01:00', 'LTE_CMF_02', 'TURNO A', 'Vanesa Aguilar', '3/4', 3214.4, 907, 'Alta', 'Optimo', 20),
('2026-10-23 00:28:49', '2026-10-23', '01:50', 'LTE_CMF_08', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 3322.4, 1888, 'Alta', 'Optimo', 69),
('2026-10-23 00:48:14', '2026-10-23', '02:40', 'LTE_CMM_10', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 4688.5, 11578, 'Alta', 'Optimo', 14),
('2026-10-23 01:11:28', '2026-10-23', '03:30', 'LTE_CMF_09', 'TURNO A', 'Vanesa Aguilar', '1/2', 5278.9, 2500, 'Alta', 'Optimo', 70),
('2026-10-23 01:27:51', '2026-10-23', '04:08', 'LTE_11', 'TURNO A', 'Vanesa Aguilar', '3/4', 1323.6, 710, 'Alta', 'Optimo', 16),
('2026-10-23 01:41:15', '2026-10-23', '04:55', 'LTE_CMM_06', 'TURNO A', 'Vanesa Aguilar', '3/4', 4734.4, 1352, 'Alta', 'Optimo', 44),
('2026-10-23 02:19:38', '2026-10-23', '01:10', 'LTE_CM_MMOO_01', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 403.5, 264, 'Alta', 'Optimo', 18),
('2026-10-23 22:08:05', '2026-10-24', '00:06', 'LTE_CMM_06', 'TURNO A', 'Vanesa Aguilar', '3/4', 4738.6, 1355, 'Alta', 'Optimo', 69),
('2026-10-23 22:09:33', '2026-10-24', '00:30', 'LTE_CMM_03', 'TURNO A', 'Vanesa Aguilar', '3/4', 5160.4, 1935, 'Alta', 'Optimo', 73),
('2026-10-23 22:10:30', '2026-10-24', '01:02', 'LTE_CMF_02', 'TURNO A', 'Vanesa Aguilar', '3/4', 3218.8, 908, 'Alta', 'Optimo', 80),
('2026-10-23 22:11:36', '2026-10-24', '01:06', 'LTE_11', 'TURNO A', 'Vanesa Aguilar', '3/4', 1323.8, 711, 'Alta', 'Optimo', 73),
('2026-10-23 22:12:31', '2026-10-24', '02:01', 'LTE_CM_MMOO_01', 'TURNO A', 'Vanesa Aguilar', '3/4', 403.5, 264, 'Alta', 'Optimo', 17),
('2026-10-23 23:02:25', '2026-10-24', '02:21', 'LTE_CMF_01', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 4077.2, 1612, 'Alta', 'Optimo', 20),
('2026-10-23 23:30:22', '2026-10-24', '02:57', 'LTE_CMM_07', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 2583.2, 4606, 'Alta', 'Optimo', 14),
('2026-10-23 23:49:24', '2026-10-24', '03:14', 'LTE_CMF_08', 'TURNO A', 'Vanesa Aguilar', '3/4', 3326.8, 1889, 'Alta', 'Optimo', 69),
('2026-10-24 00:05:27', '2026-10-24', '03:00', 'LTE_CMM_10', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 4694.5, 11579, 'Alta', 'Optimo', 14),
('2026-10-24 00:27:46', '2026-10-24', '03:40', 'LTE_CMF_09', 'TURNO A', 'Vanesa Aguilar', '1/4', 5288.8, 2502, 'Alta', 'Optimo', 69),
('2026-10-24 01:14:03', '2026-10-24', '04:44', 'LTE_CMF_04', 'TURNO A', 'Vanesa Aguilar', '3/4', 5047.9, 1560, 'Alta', 'Optimo', 72),
('2026-10-25 00:17:10', '2026-10-25', '00:14', 'LTE_CMM_03', 'TURNO A', 'Vanesa Aguilar', '3/4', 5172, 1938, 'Alta', 'Optimo', 86),
('2026-10-25 00:30:37', '2026-10-25', '00:29', 'LTE_CMF_02', 'TURNO A', 'Vanesa Aguilar', '3/4', 3226.4, 909, 'Alta', 'Optimo', 19),
('2026-10-25 00:52:45', '2026-10-25', '00:50', 'LTE_CMF_08', 'TURNO A', 'Vanesa Aguilar', '3/4', 3331.9, 1890, 'Alta', 'Optimo', 68),
('2026-10-25 01:09:12', '2026-10-25', '01:06', 'LTE_CMM_10', 'TURNO A', 'Vanesa Aguilar', '3/4', 4700.5, 11580, 'Alta', 'Optimo', 13),
('2026-10-25 01:32:06', '2026-10-25', '01:29', 'LTE_CMF_09', 'TURNO A', 'Vanesa Aguilar', '1/4', 5301.5, 2504, 'Alta', 'Optimo', 71),
('2026-10-25 01:46:15', '2026-10-25', '01:42', 'LTE_11', 'TURNO A', 'Vanesa Aguilar', '3/4', 1323.8, 711, 'Alta', 'Optimo', 11),
('2026-10-25 01:58:22', '2026-10-25', '01:56', 'LTE_CMM_06', 'TURNO A', 'Vanesa Aguilar', '3/4', 4746, 1357, 'Alta', 'Optimo', 58),
('2026-10-25 02:16:28', '2026-10-25', '02:14', 'LTE_CMF_04', 'TURNO A', 'Vanesa Aguilar', '1/2', 5056.3, 1562, 'Alta', 'Optimo', 57),
('2026-10-25 02:39:57', '2026-10-25', '02:45', 'LTE_CMM_07', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 2583.2, 4606, 'Alta', 'Optimo', 13),
('2026-10-25 02:41:40', '2026-10-25', '02:55', 'LTE_CM_MMOO_01', 'TURNO A', 'Vanesa Aguilar', '3/4', 403.5, 264, 'Alta', 'Optimo', 16),
('2026-10-25 02:46:25', '2026-10-25', '03:12', 'LTE_CMF_01', 'TURNO A', 'Vanesa Aguilar', 'Lleno', 4081.8, 1613, 'Alta', 'Optimo', 15)
) as v(marca, fecha, hora, sitio, turno, reporta, combustible, horometro, nro_partidas, nivel_refrigerante, nivel_aceite, temperatura)
where not exists (
  select 1 from public.reportes_gg r
  where r.sitio = v.sitio
    and (date_trunc('second', r.marca_temporal) = (v.marca || ' America/Santiago')::timestamptz
         or (r.fecha = v.fecha::date and r.horometro is not distinct from v.horometro::numeric))
)
on conflict (id) do nothing;
