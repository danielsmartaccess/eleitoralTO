// ============================================================================
// js/utils.js — funções utilitárias puras, sem dependência de IndexedDB,
// Supabase ou DOM específico de tela. Mantido pequeno de propósito.
// ============================================================================

/** Gera um identificador único e estável para uma entrevista (idempotência). */
export function gerarSessionId() {
  return crypto.randomUUID();
}

/** Embaralha uma cópia do array (Fisher-Yates). Não muta o array original. */
export function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Monta a lista de opções final de uma pergunta estimulada: randomiza os
 * candidatos reais quando `randomize` é true, mas mantém "Não sabe/Não
 * opinou" sempre na última posição (Seção 7). A ordem resultante é
 * determinística por entrevista — deve ser calculada uma vez e persistida,
 * nunca recalculada a cada renderização (senão o pesquisador veria a lista
 * "embaralhar" a cada tela e a auditoria da ordem ficaria inconsistente).
 */
export function montarOpcoesComNSNO(opcoesReais, nsnoId, nsnoTexto, randomize) {
  const ordenadas = randomize ? embaralhar(opcoesReais) : [...opcoesReais];
  ordenadas.push({ id: nsnoId, texto: nsnoTexto });
  return ordenadas;
}

/** Formata segundos como "MM:SS" para exibição de duração. */
export function formatarDuracao(segundos) {
  if (segundos == null || Number.isNaN(segundos)) return "--:--";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Formata data/hora local pt-BR curta. */
export function formatarDataHora(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Escapa texto para uso seguro em innerHTML (evita XSS via respostas abertas). */
export function escapeHtml(texto) {
  if (texto == null) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Debounce simples para inputs de texto (evita gravar no IndexedDB a cada tecla). */
export function debounce(fn, esperaMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), esperaMs);
  };
}

/** true se o navegador reporta conexão de rede. Não garante alcance real ao Supabase. */
export function estaOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/** Gera um código curto e legível para exibir ao pesquisador (não é o id real). */
export function codigoCurto(uuid) {
  return uuid ? uuid.replace(/-/g, "").slice(0, 8).toUpperCase() : "--------";
}
