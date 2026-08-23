// ============================================================================
// js/auth.js — autenticação de administradores/supervisores (dashboard,
// relatório, admin). O app de campo (coleta) não tem autenticação: usa
// apenas o nome do pesquisador guardado localmente (ver js/db.js).
//
// Contas de admin são contas reais do Supabase Auth (e-mail/senha), criadas
// pela Foccus no painel do Supabase — este app não faz cadastro de admin.
// ============================================================================

import { supabase } from "./supabaseClient.js";

export async function loginAdmin(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error("Login inválido: " + error.message);
  return data.user;
}

export async function obterUsuarioAdmin() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export async function logoutAdmin() {
  await supabase.auth.signOut();
}

/** Usado no topo de dashboard.html/relatorio.html/admin.html. */
export async function exigirLoginAdmin() {
  const usuario = await obterUsuarioAdmin();
  if (!usuario) {
    window.location.href = "login.html";
    return null;
  }
  return usuario;
}
