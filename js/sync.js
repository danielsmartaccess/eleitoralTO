// ============================================================================
// js/sync.js — sincronização da fila local com o Supabase (Seção 28).
//
// Regra de ouro: nunca apagar o registro local antes de o servidor confirmar
// o recebimento. `session_id` é a chave de upsert em `entrevistas`
// (Seção 3.4 — idempotência), e (entrevista_id, questao) é a chave de upsert
// em `respostas`. Isso significa que reenviar a mesma entrevista depois de
// uma falha de rede nunca cria duplicata — o Supabase simplesmente
// sobrescreve a linha existente.
//
// A escrita NÃO usa `.from('entrevistas').upsert(...)` diretamente: a anon
// key não tem como provar criptograficamente qual pesquisador está por trás
// dela, então em vez de abrir INSERT/UPDATE direto nas tabelas (o problema
// do Canaã — Seção 22), toda gravação passa pelas funções SECURITY DEFINER
// `rpc_sync_entrevista`/`rpc_sync_respostas`, que validam server-side que o
// equipe_id informado corresponde a um token ativo antes de gravar qualquer
// linha. Ver supabase-policies.sql para o racional completo.
// ============================================================================

import { supabase } from "./supabaseClient.js";
import {
  listarPendentesSync,
  marcarSincronizada,
  marcarErroSync,
  salvarEntrevista,
  listarAuditoriaPendenteSync,
  marcarAuditoriaSincronizada,
} from "./db.js";
import { montarRespostasParaSync } from "./questionario.js";
import { registrarEvento, EVENTOS } from "./auditoria.js";
import { estaOnline } from "./utils.js";

let sincronizando = false;

function dispararEvento(nome, detalhe) {
  window.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
}

function payloadEntrevista(e) {
  return {
    session_id: e.session_id,
    pesquisa_id: e.pesquisa_id,
    rodada_id: e.rodada_id,
    equipe_id: e.equipe_id,
    pesquisador: e.pesquisador,
    status: e.status,
    municipio: e.municipio,
    regiao: e.regiao,
    zona: e.zona_eleitoral,
    sexo: e.sexo,
    faixa_etaria: e.faixa_etaria,
    escolaridade: e.escolaridade,
    local_coleta: e.local_coleta,
    consentimento: !!e.consentimento,
    coletado_em: e.coletado_em,
    duracao_seg: e.duracao_seg,
    geo_lat: e.geo_lat ?? null,
    geo_lng: e.geo_lng ?? null,
    geo_accuracy: e.geo_accuracy ?? null,
    geo_status: e.geo_status || "pendente",
    device_info: e.device_info,
    suspeita_duracao: !!e.suspeita_duracao,
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
      p_equipe_id: entrevista.equipe_id,
      p_respostas: linhasRespostas,
    });
    if (erroRespostas) throw erroRespostas;
  }

  entrevista.id_servidor = idServidor;
  await salvarEntrevista(entrevista);
  await marcarSincronizada(entrevista.session_id);
  await registrarEvento(EVENTOS.SYNC_OK, {
    entrevistaSessionId: entrevista.session_id,
    equipeId: entrevista.equipe_id,
    metadata: { id_servidor: idServidor },
  });
}

async function sincronizarAuditoriaPendente() {
  const pendentes = await listarAuditoriaPendenteSync();
  for (const registro of pendentes) {
    const { error } = await supabase.rpc("rpc_registrar_auditoria", {
      p_evento: registro.evento,
      p_entrevista_session_id: registro.entrevista_session_id,
      p_equipe_id: registro.equipe_id,
      p_metadata: registro.metadata,
    });
    if (!error) await marcarAuditoriaSincronizada(registro.id);
  }
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
      await registrarEvento(EVENTOS.SYNC_ERRO, {
        entrevistaSessionId: entrevista.session_id,
        equipeId: entrevista.equipe_id,
        metadata: { erro: erro.message || String(erro) },
      });
    }
  }

  try {
    await sincronizarAuditoriaPendente();
  } catch (erro) {
    console.warn("Falha ao sincronizar auditoria (não bloqueia entrevistas):", erro);
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
