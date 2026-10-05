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

// Páginas para onde o login pode devolver o usuário (lista fechada: nunca
// redirecionar para um endereço vindo da URL sem conferir — open redirect).
export const PAGINAS_RESTRITAS = ["admin.html", "dashboard.html", "relatorio.html"];

/** Usado no topo de dashboard.html/relatorio.html/admin.html. `voltar` é a
 *  página atual: depois do login, login.js devolve o usuário para ela. */
export async function exigirLoginAdmin(voltar = "admin.html") {
  const usuario = await obterUsuarioAdmin();
  if (!usuario) {
    const destino = PAGINAS_RESTRITAS.includes(voltar) ? voltar : "admin.html";
    window.location.replace(`login.html?voltar=${encodeURIComponent(destino)}`);
    return null;
  }
  return usuario;
}
