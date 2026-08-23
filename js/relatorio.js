// ============================================================================
// js/relatorio.js — resultados da pesquisa por pergunta, sempre em
// percentual. Nunca exibe N/contagens absolutas — nem o total de
// entrevistados.
// ============================================================================

import { exigirLoginAdmin, logoutAdmin } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { escapeHtml } from "./utils.js";

const config = window.PESQUISA_CONFIG;

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
    const { data, error } = await supabase
      .from("vw_respostas_dashboard")
      .select("valor")
      .eq("questao", questao)
      .range(de, de + passo - 1);
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
    const contagem = {};
    for (const r of registros) {
      const chave = (r.valor || "Não informado").trim() || "Não informado";
      contagem[chave] = (contagem[chave] || 0) + 1;
    }
    const top10 = Object.fromEntries(
      Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    );
    html += `<div class="mb-1"><h3 class="titulo-secao">${escapeHtml(bloco.titulo)}</h3>${tabelaPercentual(top10, registros.length)}<p class="texto-suave">Menções mais citadas, em % do total de respostas à pergunta.</p></div>`;
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
    <p><strong>Pesquisa:</strong> ${escapeHtml(config.pesquisa.nome)}</p>
    <p><strong>Município:</strong> ${escapeHtml(config.pesquisa.municipio)}</p>
  `;
}

async function inicializar() {
  const usuario = await exigirLoginAdmin();
  if (!usuario) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();

  await renderizarResumo();
  await renderizarBlocos();

  document.getElementById("btn-sair-admin").addEventListener("click", async () => {
    await logoutAdmin();
    window.location.href = "login.html";
  });
}

inicializar();
