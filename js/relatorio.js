// ============================================================================
// js/relatorio.js — resumo executivo, perfil da amostra, blocos por pergunta
// e cruzamentos (Seções 35/36/37).
//
// Nunca inventamos margem de erro/nível de confiança: o relatório sempre
// mostra o N real da amostra e deixa explícito quando o cálculo estatístico
// formal não está configurado (Seção 37/49).
// ============================================================================

import { exigirLoginAdmin, logoutAdmin } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { escapeHtml } from "./utils.js";

const config = window.PESQUISA_CONFIG;

const BLOCOS = [
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

function tabelaDistribuicao(contagem, n) {
  const linhas = Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .map(([label, qtd]) => {
      const pct = n > 0 ? ((qtd / n) * 100).toFixed(1) : "0.0";
      return `<tr><td>${escapeHtml(label)}</td><td class="mono">${qtd}</td><td class="mono">${pct}%</td></tr>`;
    })
    .join("");
  return `
    <table class="tabela-simples">
      <thead><tr><th>Resposta</th><th>N</th><th>%</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="texto-suave">Amostra do bloco: N = ${n}</p>
  `;
}

async function buscarRespostasPorQuestao(questao) {
  const registros = [];
  let de = 0;
  const passo = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("vw_respostas_dashboard")
      .select("valor, sexo, faixa_etaria, regiao, escolaridade")
      .eq("questao", questao)
      .range(de, de + passo - 1);
    if (error || !data || data.length === 0) break;
    registros.push(...data);
    if (data.length < passo) break;
    de += passo;
  }
  return registros;
}

async function renderizarBlocos() {
  const container = document.getElementById("secao-blocos");
  container.innerHTML = `<h2 class="titulo-secao">Resultados por pergunta</h2><div id="blocos-conteudo"><p class="texto-suave">Carregando...</p></div>`;
  const alvo = document.getElementById("blocos-conteudo");

  let html = "";
  for (const bloco of BLOCOS) {
    const registros = await buscarRespostasPorQuestao(bloco.questao);
    const contagem = {};
    for (const r of registros) contagem[r.valor || "Não informado"] = (contagem[r.valor || "Não informado"] || 0) + 1;
    html += `<div class="mb-1"><h3 class="titulo-secao">${escapeHtml(bloco.titulo)}</h3>${tabelaDistribuicao(contagem, registros.length)}</div>`;
  }
  alvo.innerHTML = html;
}

async function renderizarResumoExecutivo() {
  const { count: totalCompletas } = await supabase.from("entrevistas").select("id", { count: "exact", head: true }).eq("status", "completo");
  const { count: totalMunicipios } = await supabase.from("entrevistas").select("municipio", { count: "exact", head: true }).eq("status", "completo");

  document.getElementById("resumo-executivo").innerHTML = `
    <p><strong>Pesquisa:</strong> ${escapeHtml(config.pesquisa.nome)}</p>
    <p><strong>Amostra realizada (N):</strong> ${totalCompletas ?? 0}</p>
    <p><strong>Amostra planejada:</strong> ${config.metodologia?.amostraPlanejada ?? "não configurado"}</p>
    <p><strong>Margem de erro:</strong> ${config.metodologia?.margemErroPercentual != null ? config.metodologia.margemErroPercentual + "%" : "não configurado"}</p>
    <p><strong>Nível de confiança:</strong> ${config.metodologia?.nivelConfiancaPercentual != null ? config.metodologia.nivelConfiancaPercentual + "%" : "não configurado"}</p>
    <p><strong>Responsável técnico:</strong> ${escapeHtml(config.metodologia?.responsavelTecnico || "TODO_CONFIGURAR")}</p>
  `;
}

async function renderizarPerfilAmostra() {
  const { data, error } = await supabase.from("entrevistas").select("sexo, faixa_etaria, escolaridade").eq("status", "completo").range(0, 4999);
  const container = document.getElementById("perfil-amostra");
  if (error || !data) {
    container.innerHTML = `<p class="texto-suave">Sem dados.</p>`;
    return;
  }
  const dimensoes = [
    { titulo: "Sexo", campo: "sexo" },
    { titulo: "Faixa etária", campo: "faixa_etaria" },
    { titulo: "Escolaridade", campo: "escolaridade" },
  ];
  container.innerHTML = dimensoes
    .map((d) => {
      const contagem = {};
      for (const linha of data) {
        const chave = linha[d.campo] || "Não informado";
        contagem[chave] = (contagem[chave] || 0) + 1;
      }
      return `<h3 class="titulo-secao">${d.titulo}</h3>${tabelaDistribuicao(contagem, data.length)}`;
    })
    .join("");
}

async function gerarCruzamento() {
  const questao = document.getElementById("cruz-questao").value;
  const dimensao = document.getElementById("cruz-dimensao").value;
  const alvo = document.getElementById("tabela-cruzamento");
  alvo.innerHTML = `<p class="texto-suave">Calculando...</p>`;

  const registros = await buscarRespostasPorQuestao(questao);
  const valoresResposta = Array.from(new Set(registros.map((r) => r.valor || "Não informado")));
  const valoresDimensao = Array.from(new Set(registros.map((r) => r[dimensao] || "Não informado")));

  const matriz = {};
  for (const dv of valoresDimensao) {
    matriz[dv] = {};
    for (const rv of valoresResposta) matriz[dv][rv] = 0;
  }
  for (const r of registros) {
    const dv = r[dimensao] || "Não informado";
    const rv = r.valor || "Não informado";
    matriz[dv][rv]++;
  }

  const cabecalho = `<tr><th>${escapeHtml(dimensao)}</th>${valoresResposta.map((v) => `<th>${escapeHtml(v)}</th>`).join("")}<th>N</th></tr>`;
  const linhas = valoresDimensao
    .map((dv) => {
      const totalLinha = Object.values(matriz[dv]).reduce((a, b) => a + b, 0);
      const celulas = valoresResposta
        .map((rv) => {
          const qtd = matriz[dv][rv];
          const pct = totalLinha > 0 ? ((qtd / totalLinha) * 100).toFixed(1) : "0.0";
          return `<td>${qtd} <span class="texto-suave">(${pct}%)</span></td>`;
        })
        .join("");
      return `<tr><td><strong>${escapeHtml(dv)}</strong></td>${celulas}<td class="mono">${totalLinha}</td></tr>`;
    })
    .join("");

  alvo.innerHTML = `
    <table class="tabela-simples">
      <thead>${cabecalho}</thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="texto-suave">Amostra total do cruzamento: N = ${registros.length}. Percentuais calculados em linha (por categoria de ${escapeHtml(dimensao)}).</p>
  `;
}

async function inicializar() {
  const usuario = await exigirLoginAdmin();
  if (!usuario) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();

  await renderizarResumoExecutivo();
  await renderizarPerfilAmostra();
  await renderizarBlocos();

  document.getElementById("btn-gerar-cruzamento").addEventListener("click", gerarCruzamento);
  document.getElementById("btn-sair-admin").addEventListener("click", async () => {
    await logoutAdmin();
    window.location.href = "login.html?admin=1";
  });
}

inicializar();
