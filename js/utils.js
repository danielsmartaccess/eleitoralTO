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

/** Chave de agrupamento para respostas espontâneas: remove acentos, caixa e
 *  espaços extras para que "Lula", "lula " e "LULA" caiam no mesmo grupo. */
export function normalizarChaveTexto(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Distribui `total` em percentuais (por contagem) que somam exatamente 100
 * (ou 0 quando total é 0), com `casas` decimais — método dos maiores restos
 * (Hamilton). Arredondar cada item de forma independente (ex.: toFixed por
 * item) pode fazer o total do gráfico/tabela fechar em 99,9% ou 100,1%; este
 * método distribui a sobra/falta de arredondamento para os itens com maior
 * resto, garantindo soma exata sem distorcer a ordem relativa dos valores.
 */
export function distribuirPercentuais(contagens, total, casas = 2) {
  if (!total) return contagens.map(() => 0);
  const fator = 10 ** casas;
  const alvo = Math.round(100 * fator);
  const brutos = contagens.map((c) => (c / total) * alvo);
  const bases = brutos.map(Math.floor);
  const somaBase = bases.reduce((s, b) => s + b, 0);
  const restante = alvo - somaBase;
  const ordemRestos = brutos
    .map((v, i) => ({ i, resto: v - bases[i] }))
    .sort((a, b) => b.resto - a.resto);
  const resultado = [...bases];
  for (let k = 0; k < restante; k++) {
    resultado[ordemRestos[k].i]++;
  }
  return resultado.map((v) => v / fator);
}

// Títulos/prefixos comuns em candidaturas que, sozinhos, não identificam uma
// pessoa específica (aparecem como possível token de várias respostas sem
// ligação com o nome real do candidato).
const TOKENS_IRRELEVANTES = new Set(["dr", "dra", "sr", "sra"]);

function tokensSignificativos(texto) {
  return normalizarChaveTexto(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !TOKENS_IRRELEVANTES.has(t));
}

/** Distância de Levenshtein entre duas strings curtas (tokens de nome). */
function distanciaLevenshtein(a, b) {
  if (a === b) return 0;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/** Quantos erros de digitação um token pode ter e ainda contar como o mesmo
 *  nome — escalado pelo tamanho do token de referência (candidato) para não
 *  deixar palavras curtas colidirem por acaso. */
function limiarDistancia(token) {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

/**
 * Tenta casar uma resposta espontânea (texto livre) com um candidato da
 * lista oficial da pergunta, por sobreposição de token "distintivo" — um
 * pedaço do nome (ou apelido) que aparece em só um candidato daquela lista,
 * tolerando pequenos erros de digitação (distância de Levenshtein). Um token
 * compartilhado por mais de um candidato (ex.: "Júnior" quando há vários
 * "Fulano Júnior" na disputa) nunca é usado sozinho para decidir, evitando
 * juntar pessoas diferentes. Cobre grafias como "vicentinho jr", "vicitinho"
 * (erro de digitação) e "vincentinho otb" caindo todas em "Vicentinho Júnior".
 */
function casarComCandidato(texto, candidatos) {
  const tokensResposta = tokensSignificativos(texto);
  if (tokensResposta.length === 0 || !candidatos.length) return null;

  const tokensPorCandidato = candidatos.map((c) => ({ candidato: c, tokens: tokensSignificativos(c.texto) }));

  const contagemToken = new Map();
  for (const { tokens } of tokensPorCandidato) {
    for (const t of new Set(tokens)) contagemToken.set(t, (contagemToken.get(t) || 0) + 1);
  }

  let encontrado = null;
  for (const { candidato, tokens } of tokensPorCandidato) {
    const distintivos = tokens.filter((t) => contagemToken.get(t) === 1);
    const casou = distintivos.some((t) => {
      const limiar = limiarDistancia(t);
      return tokensResposta.some((tr) => distanciaLevenshtein(t, tr) <= limiar);
    });
    if (casou) {
      if (encontrado && encontrado.id !== candidato.id) return null; // token bate em mais de um candidato: ambíguo, não força agrupamento
      encontrado = candidato;
    }
  }
  return encontrado;
}

/**
 * Agrega respostas de texto livre (Seções abertas do questionário) em menções
 * únicas, em % do total de respostas recebidas. Quando `candidatos` é
 * informado (lista oficial da pergunta estimulada equivalente), a resposta é
 * primeiro comparada a cada candidato por nome/apelido (ver casarComCandidato)
 * e agrupada sob o nome oficial — assim "vicentinho jr", "vicentinho otb" e
 * "vicentinho júnior" caem todos em "Vicentinho Júnior". O que não bate com
 * nenhum candidato segue o agrupamento por normalização de texto (acento/
 * caixa/espaço). Vazias viram "Não informado".
 *
 * Retorna as `limite` menções mais citadas; o restante é somado numa menção
 * "Demais menções (dispersas)" (quando houver) para que a soma dos percentuais
 * exibidos feche em 100% — nenhuma menção real fica escondida do denominador
 * nem do total. Esse rótulo NÃO representa "não sabe / não respondeu" (que vira
 * "Não informado" à parte); é só a cauda pulverizada de citações fora do topo.
 */
export const LIMITE_MENCOES_ESPONTANEAS = 10;
export const ROTULO_MENCOES_DISPERSAS = "Demais menções (dispersas)";

export function agregarTextoLivre(valores, { limite = LIMITE_MENCOES_ESPONTANEAS, candidatos = [] } = {}) {
  const grupos = new Map();
  let total = 0;

  for (const bruto of valores) {
    const rotuloOriginal = (bruto || "").trim() || "Não informado";
    total++;
    const candidato = rotuloOriginal !== "Não informado" ? casarComCandidato(rotuloOriginal, candidatos) : null;
    const rotulo = candidato ? candidato.texto : rotuloOriginal;
    const chave = candidato ? `candidato:${candidato.id}` : normalizarChaveTexto(rotulo);
    if (!grupos.has(chave)) grupos.set(chave, new Map());
    const rotulos = grupos.get(chave);
    rotulos.set(rotulo, (rotulos.get(rotulo) || 0) + 1);
  }

  const grupoItens = Array.from(grupos.values()).map((rotulos) => {
    const [rotuloMaisFrequente] = Array.from(rotulos.entries()).sort((a, b) => b[1] - a[1])[0];
    const contagem = Array.from(rotulos.values()).reduce((s, n) => s + n, 0);
    return { label: rotuloMaisFrequente, contagem };
  });
  grupoItens.sort((a, b) => b.contagem - a.contagem);

  const principais = grupoItens.slice(0, limite);
  const resto = grupoItens.slice(limite);
  const contagemResto = resto.reduce((s, i) => s + i.contagem, 0);
  const listaFinal = contagemResto > 0 ? [...principais, { label: ROTULO_MENCOES_DISPERSAS, contagem: contagemResto }] : principais;

  const percentuais = distribuirPercentuais(listaFinal.map((i) => i.contagem), total);
  const itens = listaFinal.map((i, idx) => ({ label: i.label, contagem: i.contagem, pct: percentuais[idx] }));

  return { itens, total };
}
