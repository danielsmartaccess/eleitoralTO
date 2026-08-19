// ============================================================================
// config/supabase.js
//
// Como o GitHub Pages é um host estático, não existe backend privado para
// esconder a anon key — ela é pública por natureza no ecossistema Supabase e
// é protegida pelas políticas de RLS (ver supabase-policies.sql), não por
// sigilo. NUNCA coloque aqui a service_role key, senhas ou tokens
// administrativos: isso daria acesso total ao banco a qualquer visitante.
// ============================================================================

const SUPABASE_CONFIG = {
  url: "https://jzwxzajarahrntbgijfz.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6d3h6YWphcmFocm50YmdpamZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNjEwNDksImV4cCI6MjEwMjczNzA0OX0.3ZwGFv8Mu9fXBQkmwdav8MOUyrtBnuXrhzmZ31ClhXw",
};

if (typeof window !== "undefined") {
  window.SUPABASE_CONFIG = SUPABASE_CONFIG;
}
