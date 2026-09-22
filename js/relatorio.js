// ============================================================================
// js/relatorio.js — resultados da pesquisa por pergunta, sempre em
// percentual. Nunca exibe N/contagens absolutas — nem o total de
// entrevistados.
//
// Página pública (sem login) — ver nota equivalente em js/dashboard.js.
// ============================================================================

import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { escapeHtml, agregarTextoLivre, distribuirPercentuais, LIMITE_MENCOES_ESPONTANEAS } from "./utils.js";

let municipioSelecionado = null;

function config() {
  return window.encontrarPesquisaPorMunicipio(municipioSelecionado) || window.listarPesquisasDisponiveis()[0];
}

// "papel" é o id semântico da disputa (ver PERGUNTAS_SEMANTICAS_* em
// config/pesquisa.js), não o id literal da pergunta — o Tocantins e o
// Maranhão usam questionários com ordens diferentes (ex.: "Presidente" é
// q2 no Tocantins e q3 no Maranhão), então o id real é resolvido por
// município em tempo de render (ver idParaBloco). Blocos cujo papel não
// existe no questionário do município ativo são omitidos.
const BLOCOS_FECHADOS = [
  { titulo: "Avaliação do Governo do Estado", papel: "avaliacaoEstadual" },
  { titulo: "Avaliação do Governo Federal", papel: "avaliacaoPresidente" },
  { titulo: "Presidente", papel: "presidente1Turno" },
  { titulo: "2º turno Presidente", papel: "presidente2Turno" },
  { titulo: "Governador", papel: "governadorEstimulada" },
  { titulo: "2º turno Governador", papel: "governador2Turno" },
  { titulo: "Senado — 1º voto", papel: "senado", sufixoDb: "_1voto" },
  { titulo: "Senado — 2º voto", papel: "senado", sufixoDb: "_2voto" },
  { titulo: "Deputado Federal", papel: "depFederalEstimulada" },
  { titulo: "Deputado Estadual", papel: "depEstadualEstimulada" },
  { titulo: "Avaliação do Prefeito", papel: "avaliacaoPrefeito" },
];

const BLOCOS_ABERTOS = [
  { titulo: "Governador(a) — resposta espontânea", papel: "governadorAberta", candidatosRef: "governador" },
  { titulo: "Deputado Federal — resposta espontânea", papel: "depFederalAberta", candidatosRef: "deputadoFederal" },
  { titulo: "Deputado Estadual — resposta espontânea", papel: "depEstadualAberta", candidatosRef: "deputadoEstadual" },
];

function idParaBloco(papel) {
  return config().perguntasSemanticas?.[papel];
}

/** Recebe itens já com percentual calculado (soma exata em 100%, ver
 *  distribuirPercentuais em utils.js) e apenas formata a tabela. */
function tabelaPercentual(itens) {
  const linhas = itens
    .map(({ label, pct }) => `<tr><td>${escapeHtml(label)}</td><td class="mono">${pct.toFixed(2)}%</td></tr>`)
    .join("");
  return `
    <table class="tabela-simples">
      <thead><tr><th>Resposta</th><th>%</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}

async function buscarRespostasPorQuestao(questao) {
  const registros = [];
  let de = 0;
  const passo = 1000;
  while (true) {
    let query = supabase.from("vw_respostas_dashboard").select("valor").eq("questao", questao);
    if (municipioSelecionado) query = query.eq("municipio", municipioSelecionado);
    const { data, error } = await query.range(de, de + passo - 1);
    if (error || !data || data.length === 0) break;
    registros.push(...data);
    if (data.length < passo) break;
    de += passo;
  }
  return registros;
}

async function renderizarBlocosFechados(alvo) {
  let html = "";
  for (const bloco of BLOCOS_FECHADOS) {
    const questao = idParaBloco(bloco.papel);
    if (!questao) continue;
    const registros = await buscarRespostasPorQuestao(questao + (bloco.sufixoDb || ""));
    const contagem = {};
    for (const r of registros) contagem[r.valor || "Não informado"] = (contagem[r.valor || "Não informado"] || 0) + 1;
    const entradas = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    const percentuais = distribuirPercentuais(entradas.map(([, qtd]) => qtd), registros.length);
    const itens = entradas.map(([label], i) => ({ label, pct: percentuais[i] }));
    html += `<div class="mb-1"><h3 class="titulo-secao">${escapeHtml(bloco.titulo)} (${questao.toUpperCase()})</h3>${tabelaPercentual(itens)}</div>`;
  }
  alvo.innerHTML += html;
}

async function renderizarBlocosAbertos(alvo) {
  let html = "";
  for (const bloco of BLOCOS_ABERTOS) {
    const questao = idParaBloco(bloco.papel);
    if (!questao) continue;
    const registros = await buscarRespostasPorQuestao(questao);
    const candidatos = config().candidatos[bloco.candidatosRef] || [];
    const { itens } = agregarTextoLivre(
      registros.map((r) => r.valor),
      { limite: LIMITE_MENCOES_ESPONTANEAS, candidatos }
    );
    html += `<div class="mb-1"><h3 class="titulo-secao">${escapeHtml(bloco.titulo)} (${questao.toUpperCase()})</h3>${tabelaPercentual(itens)}<p class="texto-suave">Menções mais citadas, em % do total de respostas à pergunta. "Demais menções (dispersas)" soma as citações fora das ${LIMITE_MENCOES_ESPONTANEAS} mais lembradas; não equivale a "não sabe/não respondeu".</p></div>`;
  }
  alvo.innerHTML += html;
}

async function renderizarBlocos() {
  const container = document.getElementById("secao-blocos");
  container.innerHTML = `<h2 class="titulo-secao">Resultados por pergunta</h2><div id="blocos-conteudo"><p class="texto-suave">Carregando...</p></div>`;
  const alvo = document.getElementById("blocos-conteudo");
  alvo.innerHTML = "";
  await renderizarBlocosFechados(alvo);
  await renderizarBlocosAbertos(alvo);
}

async function renderizarResumo() {
  document.getElementById("resumo-executivo").innerHTML = `
    <p><strong>Pesquisa:</strong> ${escapeHtml(config().pesquisa.nome)}</p>
    <p><strong>Município:</strong> ${escapeHtml(config().pesquisa.municipio)}</p>
  `;
}

function preencherFiltroMunicipio() {
  const select = document.getElementById("filtro-municipio");
  const disponiveis = window.listarPesquisasDisponiveis();
  select.innerHTML = disponiveis
    .map((p) => `<option value="${p.pesquisa.municipio}">${p.pesquisa.municipio}</option>`)
    .join("");
  municipioSelecionado = disponiveis[0]?.pesquisa.municipio || null;
  select.value = municipioSelecionado;
}

async function recarregarTudo() {
  await renderizarResumo();
  await renderizarBlocos();
}

async function inicializar() {
  registrarServiceWorker();
  iniciarIndicadorConexao();

  preencherFiltroMunicipio();
  document.getElementById("filtro-municipio").addEventListener("change", (evt) => {
    municipioSelecionado = evt.target.value;
    recarregarTudo();
  });

  await recarregarTudo();
}

inicializar();
