// ============================================================================
// js/supabaseClient.js — cliente Supabase único, compartilhado por todos os
// módulos que precisam falar com o backend (sync, dashboard, admin, relatório).
//
// Usamos o SDK oficial @supabase/supabase-js via CDN (ESM) em vez de montar
// um cliente REST na mão: ele já resolve corretamente embeds relacionais do
// PostgREST (essencial para não repetir o bug de URL gigante com lista de
// UUIDs — Seção 46) e a autenticação de administradores (GoTrue).
//
// Só a anon key vive aqui. RLS é quem decide o que essa chave pode fazer
// (ver supabase-policies.sql) — nunca a service_role key.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.SUPABASE_CONFIG;

export const supabase = createClient(cfg.url, cfg.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "eleitoral-to-admin-auth",
  },
});
