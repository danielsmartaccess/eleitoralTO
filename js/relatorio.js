// ============================================================================
// js/relatorio.js — resultados da pesquisa por pergunta, sempre em
// percentual. Nunca exibe N/contagens absolutas — nem o total de
// entrevistados.
//
// Página pública (sem login) — ver nota equivalente em js/dashboard.js.
// ============================================================================

import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { escapeHtml, agregarTextoLivre } from "./utils.js";

let municipioSelecionado = null;

function config() {
  return window.encontrarPesquisaPorMunicipio(municipioSelecionado) || window.listarPesquisasDisponiveis()[0];
}

const BLOCOS_FECHADOS = [
  { titulo: "Avaliação do Governo do Estado (Q1)", questao: "q1" },
  { titulo: "Presidente (Q2)", questao: "q2" },
  { titulo: "2º turno Presidente (Q3)", questao: "q3" },
  { titulo: "Governador (Q5)", questao: "q5" },
  { titulo: "2º turno Governador (Q6)", questao: "q6" },
  { titulo: "Senado — 1º voto (Q7)", questao: "q7_1voto" },
  { titulo: "Senado — 2º voto (Q7)", questao: "q7_2voto" },
  { titulo: "Deputado Federal (Q9)", questao: "q9" },
  { titulo: "Deputado Estadual (Q11)", questao: "q11" },
  { titulo: "Avaliação do Prefeito (Q12)", questao: "q12" },
];

const BLOCOS_ABERTOS = [
  { titulo: "Governador(a) — resposta espontânea (Q4)", questao: "q4" },
  { titulo: "Deputado Federal — resposta espontânea (Q8)", questao: "q8" },
  { titulo: "Deputado Estadual — resposta espontânea (Q10)", questao: "q10" },
];

function tabelaPercentual(contagem, total) {
  const linhas = Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .map(([label, qtd]) => {
      const pct = total > 0 ? ((qtd / total) * 100).toFixed(1) : "0.0";
      return `<tr><td>${escapeHtml(label)}</td><td class="mono">${pct}%</td></tr>`;
    })
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
    const registros = await buscarRespostasPorQuestao(bloco.questao);
    const contagem = {};
    for (const r of registros) contagem[r.valor || "Não informado"] = (contagem[r.valor || "Não informado"] || 0) + 1;
    html += `<div class="mb-1"><h3 class="titulo-secao">${escapeHtml(bloco.titulo)}</h3>${tabelaPercentual(contagem, registros.length)}</div>`;
  }
  alvo.innerHTML += html;
}

async function renderizarBlocosAbertos(alvo) {
  let html = "";
  for (const bloco of BLOCOS_ABERTOS) {
    const registros = await buscarRespostasPorQuestao(bloco.questao);
    const { itens, total } = agregarTextoLivre(
      registros.map((r) => r.valor),
      { limite: 10 }
    );
    const contagem = Object.fromEntries(itens.map((i) => [i.label, i.contagem]));
    html += `<div class="mb-1"><h3 class="titulo-secao">${escapeHtml(bloco.titulo)}</h3>${tabelaPercentual(contagem, total)}<p class="texto-suave">Menções mais citadas, em % do total de respostas à pergunta.</p></div>`;
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
