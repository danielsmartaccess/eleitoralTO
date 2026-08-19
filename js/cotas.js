// ============================================================================
// js/cotas.js — controle de cotas de amostragem (Seção 19).
//
// As cotas (alvo) vivem na tabela `cotas`; o "realizado" nunca é armazenado
// separadamente — ele é sempre calculado a partir de `entrevistas` (status
// completo), via a view `vw_cotas_progresso`, para nunca dessincronizar do
// dado real. O pesquisador só enxerga a cota do próprio município (a view
// já é filtrada pela RLS/consulta); a decisão de bloquear ou não a coleta
// quando uma cota está cheia é 100% controlada por configuração — nunca
// hard-coded aqui.
// ============================================================================

import { supabase } from "./supabaseClient.js";

export async function buscarCotasDoMunicipio(municipio) {
  if (!municipio) return [];
  const { data, error } = await supabase
    .from("vw_cotas_progresso")
    .select("*")
    .eq("municipio", municipio);

  if (error) {
    console.warn("Não foi possível carregar cotas (provavelmente offline):", error.message);
    return [];
  }
  return data || [];
}

/** OK / ALERTA / EXCEDIDA — limiar de alerta configurável, não é regra estatística. */
export function calcularStatusCota(alvo, realizado, config) {
  if (!alvo || alvo <= 0) return "OK";
  if (realizado >= alvo) return "EXCEDIDA";
  const limiarAlerta = config.cotas?.alertaPercentual ?? 0.8;
  if (realizado >= alvo * limiarAlerta) return "ALERTA";
  return "OK";
}

/**
 * Decide se a coleta pode prosseguir quando a cota da combinação
 * (município/sexo/faixa etária, etc.) está EXCEDIDA. Por padrão NÃO bloqueia
 * — a Seção 19 é explícita: nunca bloquear automaticamente sem uma regra
 * definida. Só impede o registro se `cotas.bloquearAoAtingirCota` for true.
 */
export function podeRegistrarComCotaExcedida(config) {
  return config.cotas?.bloquearAoAtingirCota !== true;
}
