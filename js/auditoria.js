// ============================================================================
// js/auditoria.js — registro de eventos de auditoria (Seção 31).
//
// Cada chamada aqui grava um evento no IndexedDB imediatamente (funciona
// offline) e o evento entra na fila para ser replicado à tabela `auditoria`
// do Supabase pelo módulo de sincronização (js/sync.js). Este módulo nunca
// decide se uma entrevista é inválida — ele só sinaliza; quem decide o que
// fazer com a sinalização é a supervisão, na tela de auditoria.
// ============================================================================

import { registrarAuditoriaLocal } from "./db.js";

export const EVENTOS = {
  LOGIN: "login",
  INICIO_ENTREVISTA: "inicio_entrevista",
  RETOMADA_ENTREVISTA: "retomada_entrevista",
  FIM_ENTREVISTA: "fim_entrevista",
  SYNC_OK: "sync_ok",
  SYNC_ERRO: "sync_erro",
  TENTATIVA_DUPLICACAO: "tentativa_duplicacao",
  DESCARTE_ENTREVISTA: "descarte_entrevista",
};

export async function registrarEvento(evento, { entrevistaSessionId = null, equipeId = null, metadata = {} } = {}) {
  return registrarAuditoriaLocal({
    entrevista_session_id: entrevistaSessionId,
    equipe_id: equipeId,
    evento,
    metadata,
  });
}

/** Duração em segundos entre início e fim (Seção 31: calculada automaticamente). */
export function calcularDuracaoSegundos(inicioIso, fimIso) {
  const inicio = new Date(inicioIso).getTime();
  const fim = new Date(fimIso).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) return null;
  return Math.round((fim - inicio) / 1000);
}

/**
 * Sinaliza (não bloqueia) entrevistas com duração abaixo do limite
 * operacional configurado — indício de preenchimento apressado demais para
 * 12 perguntas + bloco sociodemográfico (Seção 32).
 */
export function avaliarSuspeitaDuracao(duracaoSegundos, config) {
  if (duracaoSegundos == null) return false;
  return duracaoSegundos < (config.auditoria?.duracaoMinimaSegundos ?? 90);
}
