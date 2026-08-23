// ============================================================================
// js/dashboard.js — resultados da pesquisa (intenção de voto/avaliação),
// sempre em percentual — nunca exibe contagens absolutas nem o N da amostra.
// ============================================================================

import { exigirLoginAdmin, logoutAdmin } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";

let graficosAtivos = {};

function lerFiltros() {
  return {
    pesquisador: document.getElementById("filtro-pesquisador").value || null,
    dataInicio: document.getElementById("filtro-data-inicio").value || null,
    dataFim: document.getElementById("filtro-data-fim").value || null,
  };
}

function aplicarFiltrosNaQuery(query, filtros) {
  if (filtros.pesquisador) query = query.ilike("pesquisador", `%${filtros.pesquisador}%`);
  if (filtros.dataInicio) query = query.gte("coletado_em", filtros.dataInicio);
  if (filtros.dataFim) query = query.lte("coletado_em", filtros.dataFim + "T23:59:59");
  return query;
}

const PALETA = ["#1a3a6e", "#c8102e", "#1e8a4c", "#b8790a", "#5b6ee1", "#8a4b9e", "#2c9fa8", "#a0a0a0"];

async function carregarGrafico(canvasId, questao, filtros) {
  let query = supabase.from("vw_respostas_dashboard").select("valor").eq("questao", questao);
  query = aplicarFiltrosNaQuery(query, filtros);
  const { data, error } = await query.range(0, 4999);

  const canvas = document.getElementById(canvasId);
  if (error || !data) return;

  const contagem = {};
  for (const linha of data) {
    const chave = linha.valor || "Não informado";
    contagem[chave] = (contagem[chave] || 0) + 1;
  }

  const total = data.length;
  const labels = Object.keys(contagem);
  const percentuais = labels.map((l) => (total > 0 ? Number(((contagem[l] / total) * 100).toFixed(1)) : 0));

  if (graficosAtivos[canvasId]) graficosAtivos[canvasId].destroy();
  graficosAtivos[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: percentuais, backgroundColor: labels.map((_, i) => PALETA[i % PALETA.length]) }],
    },
    options: {
      responsive: true,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.raw}%` } },
      },
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
      },
    },
  });
}

async function carregarTodosGraficos(filtros) {
  await Promise.all([
    carregarGrafico("grafico-q1", "q1", filtros),
    carregarGrafico("grafico-q2", "q2", filtros),
    carregarGrafico("grafico-q3", "q3", filtros),
    carregarGrafico("grafico-q5", "q5", filtros),
    carregarGrafico("grafico-q6", "q6", filtros),
    carregarGrafico("grafico-q7-1", "q7_1voto", filtros),
    carregarGrafico("grafico-q7-2", "q7_2voto", filtros),
    carregarGrafico("grafico-q9", "q9", filtros),
    carregarGrafico("grafico-q11", "q11", filtros),
    carregarGrafico("grafico-q12", "q12", filtros),
  ]);
}

async function carregarTudo() {
  await carregarTodosGraficos(lerFiltros());
}

async function inicializar() {
  const usuario = await exigirLoginAdmin();
  if (!usuario) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();

  document.getElementById("btn-aplicar-filtros").addEventListener("click", carregarTudo);
  document.getElementById("btn-sair-admin").addEventListener("click", async () => {
    await logoutAdmin();
    window.location.href = "login.html";
  });

  await carregarTudo();
}

inicializar();
