// Consulta de Power Query para la planilla "Reporte de Generados".
// Trae los reportes de GG desde la app (tabla reportes_gg) con las mismas columnas de la planilla.
// Pegar completa en Excel: Datos > Consultas y conexiones > clic derecho en la consulta > Editar >
// Inicio > Editor avanzado (reemplaza todo lo que hay). Requiere haber ejecutado planilla_reportes_gg.sql.
let
    Url = "https://nbiqakhsfotewrctkzxx.supabase.co",
    ApiKey = "__API_KEY__",
    // Clave: en Supabase > SQL Editor:  select clave from public.claves_planilla where nombre = 'reportes_gg';
    Clave = "PEGA_AQUI_LA_CLAVE",
    Division = "el_salvador",
    Pagina = 1000,

    Leer = (desde as number) as list =>
        Json.Document(
            Web.Contents(Url, [
                RelativePath = "rest/v1/rpc/planilla_reportes_gg",
                Query = [p_clave = Clave, p_division = Division, offset = Text.From(desde), limit = Text.From(Pagina)],
                Headers = [apikey = ApiKey, Accept = "application/json"]
            ])
        ),

    Paginas = List.Generate(
        () => [desde = 0, filas = Leer(0)],
        each List.Count([filas]) > 0,
        each if List.Count([filas]) < Pagina
             then [desde = [desde], filas = {}]
             else [desde = [desde] + Pagina, filas = Leer([desde] + Pagina)],
        each [filas]
    ),
    Filas = List.Combine(Paginas),

    Columnas = {"Marca temporal", "Fecha", "Hora", "SITIO", "TURNO", "P Q REPORTA", "Combustible", "Horómetro",
                "Nro Partidas", "Nivel de Refrigerante", "Nivel de Aceite", "Temperatura del Generador"},
    Tabla = if List.IsEmpty(Filas) then #table(Columnas, {}) else Table.FromRecords(Filas, Columnas, MissingField.UseNull),

    #"Tipo cambiado" = Table.TransformColumnTypes(Tabla, {
        {"Marca temporal", type datetime}, {"Fecha", type date}, {"Hora", type time}, {"SITIO", type text},
        {"TURNO", type text}, {"P Q REPORTA", type text}, {"Combustible", type text}, {"Horómetro", type number},
        {"Nro Partidas", Int64.Type}, {"Nivel de Refrigerante", type text}, {"Nivel de Aceite", type text},
        {"Temperatura del Generador", type number}
    }, "en-US")
in
    #"Tipo cambiado"
