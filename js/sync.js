// ============================================================================
// js/sync.js — sincronização da fila local com o Supabase.
//
// Regra de ouro: nunca apagar o registro local antes de o servidor confirmar
// o recebimento. `session_id` é a chave de upsert em `entrevistas`
// (idempotência), e (entrevista_id, questao) é a chave de upsert em
// `respostas`. Isso significa que reenviar a mesma entrevista depois de uma
// falha de rede nunca cria duplicata — o Supabase simplesmente sobrescreve a
// linha existente.
//
// A escrita não usa `.from('entrevistas').upsert(...)` diretamente: em vez
// de abrir INSERT/UPDATE direto nas tabelas, toda gravação passa pelas
// funções SECURITY DEFINER `rpc_sync_entrevista`/`rpc_sync_respostas`. Ver
// supabase-policies.sql para o racional completo.
// ============================================================================

import { supabase } from "./supabaseClient.js";
import {
  listarPendentesSync,
  marcarSincronizada,
  marcarErroSync,
  salvarEntrevista,
} from "./db.js";
import { montarRespostasParaSync } from "./questionario.js";
import { estaOnline } from "./utils.js";

let sincronizando = false;

function dispararEvento(nome, detalhe) {
  window.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
}

function payloadEntrevista(e) {
  return {
    session_id: e.session_id,
    pesquisa_id: e.pesquisa_id,
    pesquisador: e.pesquisador,
    status: e.status,
    municipio: e.municipio,
    coletado_em: e.coletado_em,
    duracao_seg: e.duracao_seg,
  };
}

async function sincronizarUmaEntrevista(entrevista) {
  const { data: idServidor, error: erroEntrevista } = await supabase.rpc("rpc_sync_entrevista", {
    p_payload: payloadEntrevista(entrevista),
  });

  if (erroEntrevista) throw erroEntrevista;

  const linhasRespostas = montarRespostasParaSync(entrevista);

  if (linhasRespostas.length > 0) {
    const { error: erroRespostas } = await supabase.rpc("rpc_sync_respostas", {
      p_entrevista_id: idServidor,
      p_respostas: linhasRespostas,
    });
    if (erroRespostas) throw erroRespostas;
  }

  entrevista.id_servidor = idServidor;
  await salvarEntrevista(entrevista);
  await marcarSincronizada(entrevista.session_id);
}

/** Executa uma rodada completa de sincronização. Seguro de chamar em paralelo — reentra sem efeito. */
export async function sincronizarTudo() {
  if (sincronizando) return { ok: true, jaEmAndamento: true };
  if (!estaOnline()) return { ok: false, motivo: "offline" };

  sincronizando = true;
  const pendentes = await listarPendentesSync();
  dispararEvento("sync:inicio", { total: pendentes.length });

  let sucesso = 0;
  let falha = 0;

  for (const entrevista of pendentes) {
    try {
      await sincronizarUmaEntrevista(entrevista);
      sucesso++;
    } catch (erro) {
      falha++;
      await marcarErroSync(entrevista.session_id, erro.message || String(erro));
    }
  }

  sincronizando = false;
  const restantes = (await listarPendentesSync()).length;
  dispararEvento("sync:fim", { sucesso, falha, restantes });
  return { ok: true, sucesso, falha, restantes };
}

/** Liga os gatilhos automáticos: reconexão de rede e verificação periódica. */
export function iniciarSincronizacaoAutomatica(intervaloMs = 30000) {
  window.addEventListener("online", () => sincronizarTudo());
  setInterval(() => {
    if (estaOnline()) sincronizarTudo();
  }, intervaloMs);
  // Primeira tentativa ao carregar a página, caso já existam pendências.
  if (estaOnline()) sincronizarTudo();
}

export async function contarPendentes() {
  return (await listarPendentesSync()).length;
}
