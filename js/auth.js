// ============================================================================
// js/auth.js — autenticação de pesquisadores (token de campo) e de
// administradores/supervisores (Supabase Auth, usado no dashboard/admin).
//
// São dois mecanismos deliberadamente diferentes:
//  - Pesquisador: token curto validado pela função `rpc_login` (SECURITY
//    DEFINER) — pensado para digitação rápida em campo, sem senha.
//  - Admin/Supervisor: conta real do Supabase Auth (e-mail/senha), porque as
//    telas de dashboard/relatório/admin leem dados agregados de todas as
//    entrevistas e exigem uma sessão autenticável de verdade para a RLS
//    (ver supabase-policies.sql). Contas são criadas pela Foccus no painel
//    do Supabase — este app não faz cadastro de admin.
// ============================================================================

import { supabase } from "./supabaseClient.js";
import { salvarSessaoPesquisador, obterSessaoPesquisador, limparSessaoPesquisador } from "./db.js";
import { estaOnline, coletarDeviceInfo } from "./utils.js";

/**
 * Valida o token digitado contra o Supabase via RPC (SECURITY DEFINER).
 * A função no banco nunca expõe a tabela `equipes` inteira ao anon — apenas
 * retorna os dados do próprio pesquisador se o token for válido e ativo,
 * o que evita enumeração de tokens por varredura de SELECT.
 */
export async function loginPesquisador(tokenDigitado) {
  const token = (tokenDigitado || "").trim().toUpperCase();
  if (!token) throw new Error("Informe o código do pesquisador.");

  if (!estaOnline()) {
    throw new Error(
      "É necessário estar online para o primeiro login. Depois de autenticado, o app funciona offline."
    );
  }

  const { data, error } = await supabase.rpc("rpc_login", { p_token: token });
  if (error) throw new Error("Não foi possível validar o token: " + error.message);
  if (!data || data.length === 0) {
    throw new Error("Código inválido ou pesquisador inativo. Confira com a supervisão.");
  }

  const equipe = Array.isArray(data) ? data[0] : data;

  const sessao = {
    token,
    equipe_id: equipe.equipe_id,
    nome: equipe.nome,
    municipio: equipe.municipio,
    perfil: equipe.perfil,
    rodada_id: equipe.rodada_id,
    pesquisa_id: equipe.pesquisa_id,
    rodada_codigo: equipe.rodada_codigo,
    device_info: coletarDeviceInfo(),
    logado_em: new Date().toISOString(),
  };

  await salvarSessaoPesquisador(sessao);
  return sessao;
}

export async function obterSessaoAtual() {
  return obterSessaoPesquisador();
}

export async function logoutPesquisador() {
  return limparSessaoPesquisador();
}

/** Usado no topo de coleta.html/index.html: sem sessão local, volta ao login. */
export async function exigirLoginPesquisador() {
  const sessao = await obterSessaoAtual();
  if (!sessao || !sessao.equipe_id) {
    window.location.href = "login.html";
    return null;
  }
  return sessao;
}

// ---------------------------------------------------------------------------
// Admin / Supervisor (Supabase Auth)
// ---------------------------------------------------------------------------

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
    window.location.href = "login.html?admin=1";
    return null;
  }
  return usuario;
}
