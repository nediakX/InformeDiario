import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: la sincronización en la nube no funcionará.");
}

// Cliente compartido sin login: todo el equipo lee/escribe con la misma clave anon.
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

export const BORRADORES_TABLE = "borradores";
export const EVIDENCIAS_BUCKET = "evidencias";
