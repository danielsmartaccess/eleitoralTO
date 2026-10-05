// ============================================================================
// js/acuracia.js — métricas "Pesquisa × Urna", sem DOM nem Supabase.
//
// Funções puras usadas por js/desempenho.js (e pelos testes em
// tests/acuracia.test.js). As definições seguem a régua que imprensa e
// agregadores usaram para avaliar os institutos no 1º turno de 2026:
//
// - Comparação sempre em VOTOS VÁLIDOS: a pesquisa exclui NS/NO e é
//   renormalizada entre os candidatos apresentados no disco; a urna usa o
//   percentual oficial do TSE.
// - Erro médio absoluto (p.p.) só sobre candidatos relevantes — com 2% ou
//   mais na urna, ou entre os 4 mais votados —, para que nanicos com 0,1%
//   não "diluam" o erro.
// - Erro na margem: diferença entre a vantagem do 1º sobre o 2º colocado
//   da urna medida pela pesquisa e a vantagem real.
// - Senado (dois votos): pesquisa = menções do 1º + 2º voto; urna = % dos
//   votos válidos de Senado (que também somam os dois votos do eleitor).
// - Deputados: comparação restrita aos nomes testados no disco, nos dois
//   lados (pesquisa e urna renormalizadas entre esses nomes).
// ============================================================================

export const Z_95 = 1.96;
export const PCT_MINIMO_RELEVANTE = 2;
export const TOP_URNA_RELEVANTE = 4;

/** Margem de erro máxima declarada (p = 0,5), em p.p., para amostra de n entrevistas. */
export function margemDeErro(n, z = Z_95) {
  return n > 0 ? 100 * z * Math.sqrt(0.25 / n) : null;
}

export function media(lista) {
  return lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : null;
}

export function mediana(lista) {
  if (!lista.length) return null;
  const o = [...lista].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  return o.length % 2 ? o[meio] : (o[meio - 1] + o[meio]) / 2;
}

/** Correlação de Pearson; null se não houver variação. */
export function correlacao(xs, ys) {
  const mx = media(xs), my = media(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

const IGUAL = 1e-9;

/** Ordena [rotulo, valor] por valor desc. e diz se há empate na 1ª posição. */
function ordenar(pares) {
  const o = [...pares].sort((a, b) => b[1] - a[1]);
  const empate = o.length > 1 && Math.abs(o[0][1] - o[1][1]) < IGUAL;
  return { ordem: o.map(([r]) => r), empate };
}

/**
 * true se `rotulo` está garantidamente entre os k primeiros: menos de k
 * OUTROS nomes têm valor maior OU IGUAL ao dele. Empate na fronteira nunca
 * conta como acerto — desempatar pela ordem da urna inflaria o placar.
 */
function entreOsPrimeiros(rotulo, pares, k) {
  const alvo = pares.find(([r]) => r === rotulo);
  if (!alvo) return false;
  return pares.filter(([r, v]) => r !== rotulo && v >= alvo[1] - IGUAL).length < k;
}

/**
 * Compara uma disputa majoritária (Presidente, Governador, Senado).
 *
 * @param {object} p
 * @param {Object<string, number>} p.contagem  rótulo → menções (sem NS/NO)
 * @param {Array<{nome, rotulo, partido, pct}>} p.candidatosUrna  resultado oficial, ordem desc.
 * @param {Set<string>|null} p.ofertados  rótulos apresentados no disco (null = todos com rótulo)
 * @param {number|null} p.n  entrevistas (para a margem de erro)
 * @param {boolean} p.doisVotos  Senado: conta quantos dos 2 mais votados a pesquisa acertou
 */
export function compararMajoritaria({ contagem, candidatosUrna, ofertados = null, n = null, doisVotos = false }) {
  const noDisco = (c) => c.rotulo && (!ofertados || ofertados.has(c.rotulo));
  const validos = candidatosUrna.filter(noDisco).reduce((s, c) => s + (contagem[c.rotulo] || 0), 0);
  if (!validos) return null;

  const linhas = candidatosUrna.map((c, posicao) => {
    if (!noDisco(c)) return null;
    const pesquisa = (100 * (contagem[c.rotulo] || 0)) / validos;
    return {
      rotulo: c.rotulo, nome: c.nome, partido: c.partido, urna: c.pct, pesquisa, erro: pesquisa - c.pct,
      relevante: c.pct >= PCT_MINIMO_RELEVANTE || posicao < TOP_URNA_RELEVANTE,
    };
  }).filter(Boolean);

  const foraDoDisco = candidatosUrna.filter((c) => !noDisco(c)).map((c) => ({ nome: c.nome, partido: c.partido, urna: c.pct }));
  const relevantes = linhas.filter((l) => l.relevante);
  const moe = margemDeErro(n);

  const urna = ordenar(linhas.map((l) => [l.rotulo, l.urna]));
  const paresPesquisa = linhas.map((l) => [l.rotulo, l.pesquisa]);
  const pesq = ordenar(paresPesquisa);
  const vencedor = candidatosUrna[0];
  const porRotulo = Object.fromEntries(linhas.map((l) => [l.rotulo, l]));
  const [v1, v2] = urna.ordem;
  const erroMargem = v1 && v2
    ? (porRotulo[v1].pesquisa - porRotulo[v2].pesquisa) - (porRotulo[v1].urna - porRotulo[v2].urna)
    : null;

  const resultado = {
    linhas,
    foraDoDisco,
    pctForaDoDisco: foraDoDisco.reduce((s, c) => s + c.urna, 0),
    erroMedio: media(relevantes.map((l) => Math.abs(l.erro))),
    vencedorUrna: vencedor.rotulo || vencedor.nome,
    liderPesquisa: pesq.empate ? null : pesq.ordem[0],
    empatePesquisa: pesq.empate,
    acertouVencedor: !pesq.empate && noDisco(vencedor) && pesq.ordem[0] === vencedor.rotulo,
    acertouTop2: !pesq.empate && pesq.ordem[0] === v1 && pesq.ordem[1] === v2 && entreOsPrimeiros(v2, paresPesquisa, 2),
    erroMargem,
    margemDeErro: moe,
    dentroDaMargem: moe == null ? null : {
      dentro: relevantes.filter((l) => Math.abs(l.erro) <= moe).length,
      total: relevantes.length,
    },
  };
  if (doisVotos) {
    resultado.doisMaisVotadosAcertados = urna.ordem.slice(0, 2).filter((r) => entreOsPrimeiros(r, paresPesquisa, 2)).length;
  }
  return resultado;
}

/**
 * Compara disputa proporcional (Deputado) restrita aos nomes testados.
 * @param {Object<string, number>} p.contagem  rótulo → menções (sem NS/NO)
 * @param {Array<{rotulo, nome, partido, votos}>} p.testados  nomes do disco localizados na urna
 * @param {Set<string>|null} p.ofertados
 */
export function compararProporcional({ contagem, testados, ofertados = null }) {
  const nomes = testados.filter((t) => !ofertados || ofertados.has(t.rotulo));
  const totalPesquisa = nomes.reduce((s, t) => s + (contagem[t.rotulo] || 0), 0);
  const totalUrna = nomes.reduce((s, t) => s + t.votos, 0);
  if (!totalPesquisa || !totalUrna || nomes.length < 2) return null;

  const linhas = nomes.map((t) => {
    const pesquisa = (100 * (contagem[t.rotulo] || 0)) / totalPesquisa;
    const urna = (100 * t.votos) / totalUrna;
    return { rotulo: t.rotulo, nome: t.nome, partido: t.partido, pesquisa, urna, erro: pesquisa - urna };
  }).sort((a, b) => b.urna - a.urna);

  const paresPesquisa = linhas.map((l) => [l.rotulo, l.pesquisa]);
  const pesq = ordenar(paresPesquisa);
  const liderUrna = linhas[0]; // linhas já vêm em ordem de votos na urna
  return {
    linhas,
    nomesComparados: linhas.length,
    liderUrna: liderUrna.rotulo,
    liderPesquisa: pesq.empate ? null : pesq.ordem[0],
    empatePesquisa: pesq.empate,
    acertouLider: !pesq.empate && pesq.ordem[0] === liderUrna.rotulo,
    liderUrnaNoTop3: entreOsPrimeiros(liderUrna.rotulo, paresPesquisa, 3),
    erroMedio: media(linhas.map((l) => Math.abs(l.erro))),
  };
}

/**
 * Régua de mercado: mesma métrica aplicada a uma pesquisa publicada.
 * `valores` = rótulo → % de votos válidos divulgado pelo instituto.
 */
export function compararReferencia(valores, candidatosUrna) {
  const linhas = candidatosUrna
    .map((c, posicao) => (c.rotulo && c.rotulo in valores ? {
      rotulo: c.rotulo, urna: c.pct, pesquisa: valores[c.rotulo], erro: valores[c.rotulo] - c.pct,
      relevante: c.pct >= PCT_MINIMO_RELEVANTE || posicao < TOP_URNA_RELEVANTE,
    } : null))
    .filter(Boolean);
  const relevantes = linhas.filter((l) => l.relevante);
  const pesq = ordenar(linhas.map((l) => [l.rotulo, l.pesquisa]));
  const [u1, u2] = candidatosUrna;
  const porRotulo = Object.fromEntries(linhas.map((l) => [l.rotulo, l]));
  const temTop2 = porRotulo[u1.rotulo] && porRotulo[u2.rotulo];
  return {
    linhas,
    erroMedio: media(relevantes.map((l) => Math.abs(l.erro))),
    acertouVencedor: !pesq.empate && pesq.ordem[0] === u1.rotulo,
    erroMargem: temTop2
      ? (porRotulo[u1.rotulo].pesquisa - porRotulo[u2.rotulo].pesquisa) - (u1.pct - u2.pct)
      : null,
  };
}

/** {acertos, total} de um predicado sobre uma lista (ignora itens null). */
export function taxa(itens, predicado) {
  const validos = itens.filter((i) => i != null);
  return { acertos: validos.filter(predicado).length, total: validos.length };
}

/**
 * Viés por candidato: erro assinado (pesquisa − urna) de cada candidato
 * relevante em cada município, e a média. Só candidatos presentes em
 * `minMunicipios` ou mais pesquisas — abaixo disso a média não é padrão.
 * @param {Array<{municipio, comparacao}>} itens
 */
export function viesPorCandidato(itens, minMunicipios = 3) {
  const porCandidato = new Map();
  for (const { municipio, comparacao } of itens) {
    if (!comparacao) continue;
    for (const l of comparacao.linhas) {
      if (!l.relevante) continue;
      if (!porCandidato.has(l.rotulo)) porCandidato.set(l.rotulo, []);
      porCandidato.get(l.rotulo).push({ municipio, erro: l.erro });
    }
  }
  return [...porCandidato]
    .filter(([, erros]) => erros.length >= minMunicipios)
    .map(([rotulo, erros]) => ({ rotulo, erros, media: media(erros.map((e) => e.erro)) }))
    .sort((a, b) => b.media - a.media);
}

/** Dias corridos entre a data (YYYY-MM-DD) de fim do campo e a eleição. */
export function diasAteEleicao(dataFimCampo, dataEleicao) {
  const ms = Date.parse(`${dataEleicao}T12:00:00Z`) - Date.parse(`${dataFimCampo}T12:00:00Z`);
  return Math.round(ms / 86400000);
}
