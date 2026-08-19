// ============================================================================
// js/dashboard.js — indicadores operacionais e gráficos de intenção de voto
// (Seções 33/34/57).
//
// Nota de arquitetura: "entrevistas pendentes de sincronização" é um estado
// que só existe no IndexedDB de cada aparelho de campo — o servidor, por
// definição, só enxerga o que já foi sincronizado. Por isso este dashboard
// não inventa um número de "pendentes" agregado (isso exigiria telemetria
// adicional que não foi pedida); ele mostra o que o banco realmente sabe.
// ============================================================================

import { exigirLoginAdmin, logoutAdmin } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { escapeHtml } from "./utils.js";

const config = window.PESQUISA_CONFIG;
let rodadas = [];
let graficosAtivos = {};

function popularSelect(id, opcoes, valorLabel = "texto", valorId = "id") {
  const select = document.getElementById(id);
  opcoes.forEach((op) => {
    const el = document.createElement("option");
    el.value = op[valorId];
    el.textContent = op[valorLabel];
    select.appendChild(el);
  });
}

function lerFiltros() {
  return {
    rodada_id: document.getElementById("filtro-rodada").value || null,
    municipio: document.getElementById("filtro-municipio").value || null,
    sexo: document.getElementById("filtro-sexo").value || null,
    faixa_etaria: document.getElementById("filtro-faixa-etaria").value || null,
    escolaridade: document.getElementById("filtro-escolaridade").value || null,
    pesquisador: document.getElementById("filtro-pesquisador").value || null,
    dataInicio: document.getElementById("filtro-data-inicio").value || null,
    dataFim: document.getElementById("filtro-data-fim").value || null,
  };
}

function aplicarFiltrosNaQuery(query, filtros, { paraEntrevistas = false } = {}) {
  if (filtros.rodada_id) query = query.eq("rodada_id", filtros.rodada_id);
  if (filtros.municipio) query = query.eq("municipio", filtros.municipio);
  if (filtros.sexo) query = query.eq("sexo", filtros.sexo);
  if (filtros.faixa_etaria) query = query.eq("faixa_etaria", filtros.faixa_etaria);
  if (filtros.escolaridade) query = query.eq("escolaridade", filtros.escolaridade);
  if (filtros.pesquisador) query = query.ilike("pesquisador", `%${filtros.pesquisador}%`);
  if (filtros.dataInicio) query = query.gte("coletado_em", filtros.dataInicio);
  if (filtros.dataFim) query = query.lte("coletado_em", filtros.dataFim + "T23:59:59");
  return query;
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

async function carregarIndicadores(filtros) {
  let query = supabase.from("entrevistas").select("id, status, coletado_em, equipe_id", { count: "exact" });
  query = aplicarFiltrosNaQuery(query, filtros);
  const { data, error } = await query.limit(5000);

  const grade = document.getElementById("grade-indicadores");
  if (error) {
    grade.innerHTML = `<p class="texto-suave">Não foi possível carregar os indicadores: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const realizadas = data.filter((e) => e.status === "completo");
  const hojeCount = realizadas.filter((e) => (e.coletado_em || "").slice(0, 10) === hoje).length;
  const pesquisadoresComColeta = new Set(realizadas.map((e) => e.equipe_id)).size;

  const { count: totalEquipesAtivas } = await supabase
    .from("equipes")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true);

  const meta = config.metodologia?.amostraPlanejada;
  const progresso = meta ? Math.min(100, ((realizadas.length / meta) * 100).toFixed(1)) : null;

  const cartoes = [
    { rotulo: "Meta (amostra planejada)", valor: meta ? meta.toLocaleString("pt-BR") : "não configurado" },
    { rotulo: "Realizadas", valor: realizadas.length.toLocaleString("pt-BR") },
    { rotulo: "Progresso da coleta", valor: progresso != null ? `${progresso}%` : "—" },
    { rotulo: "Hoje", valor: hojeCount.toLocaleString("pt-BR") },
    { rotulo: "Pesquisadores com coleta", valor: pesquisadoresComColeta },
    { rotulo: "Equipes ativas (total)", valor: totalEquipesAtivas ?? "-" },
  ];

  grade.innerHTML = cartoes
    .map(
      (c) => `
      <div class="indicador">
        <div class="valor">${c.valor}</div>
        <div class="rotulo">${escapeHtml(c.rotulo)}</div>
        ${
          c.rotulo === "Progresso da coleta" && progresso != null
            ? `<div class="barra-meta"><div style="width:${progresso}%"></div></div>`
            : ""
        }
      </div>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Cotas por município
// ---------------------------------------------------------------------------

async function carregarCotasPorMunicipio(filtros) {
  let query = supabase.from("vw_cotas_progresso").select("municipio, alvo, realizado");
  if (filtros.rodada_id) query = query.eq("rodada_id", filtros.rodada_id);
  const { data, error } = await query;
  const container = document.getElementById("cotas-municipio");

  if (error || !data || data.length === 0) {
    container.innerHTML = `<p class="texto-suave">Sem cotas configuradas para o filtro atual.</p>`;
    return;
  }

  const porMunicipio = {};
  for (const linha of data) {
    const chave = linha.municipio || "Sem município";
    porMunicipio[chave] = porMunicipio[chave] || { alvo: 0, realizado: 0 };
    porMunicipio[chave].alvo += linha.alvo || 0;
    porMunicipio[chave].realizado += linha.realizado || 0;
  }

  container.innerHTML = Object.entries(porMunicipio)
    .map(([municipio, v]) => {
      const pct = v.alvo > 0 ? Math.min(100, Math.round((v.realizado / v.alvo) * 100)) : 0;
      return `
        <div class="mb-1">
          <div class="flex-entre"><strong>${escapeHtml(municipio)}</strong><span class="mono">${pct}%</span></div>
          <div class="barra-meta"><div style="width:${pct}%"></div></div>
        </div>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Gráficos de intenção de voto / avaliação
// ---------------------------------------------------------------------------

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

  const labels = Object.keys(contagem);
  const valores = Object.values(contagem);
  const n = data.length;

  if (graficosAtivos[canvasId]) graficosAtivos[canvasId].destroy();
  graficosAtivos[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: `N = ${n}`, data: valores, backgroundColor: labels.map((_, i) => PALETA[i % PALETA.length]) }],
    },
    options: {
      responsive: true,
      indexAxis: "y",
      plugins: { legend: { display: false }, title: { display: true, text: `Amostra: N = ${n}` } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

async function carregarTodosGraficos(filtros) {
  await Promise.all([
    carregarGrafico("grafico-q1", "q1", filtros),
    carregarGrafico("grafico-q2", "q2", filtros),
    carregarGrafico("grafico-q5", "q5", filtros),
    carregarGrafico("grafico-q7-1", "q7_1voto", filtros),
    carregarGrafico("grafico-q7-2", "q7_2voto", filtros),
    carregarGrafico("grafico-q9", "q9", filtros),
    carregarGrafico("grafico-q11", "q11", filtros),
    carregarGrafico("grafico-q12", "q12", filtros),
  ]);
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------

async function carregarTudo() {
  const filtros = lerFiltros();
  await Promise.all([carregarIndicadores(filtros), carregarCotasPorMunicipio(filtros), carregarTodosGraficos(filtros)]);
}

async function inicializar() {
  const usuario = await exigirLoginAdmin();
  if (!usuario) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();

  const { data: rodadasData } = await supabase.from("rodadas").select("id, nome, codigo").order("created_at", { ascending: false });
  rodadas = rodadasData || [];
  popularSelect("filtro-rodada", rodadas.map((r) => ({ id: r.id, texto: `${r.nome} (${r.codigo})` })));

  popularSelect(
    "filtro-municipio",
    (config.metodologia?.municipiosPesquisados || []).map((m) => ({ id: m, texto: m }))
  );
  popularSelect("filtro-sexo", config.sociodemografico.sexo.opcoes);
  popularSelect("filtro-faixa-etaria", config.sociodemografico.faixaEtaria.opcoes);
  popularSelect("filtro-escolaridade", config.sociodemografico.escolaridade.opcoes);

  document.getElementById("btn-aplicar-filtros").addEventListener("click", carregarTudo);
  document.getElementById("btn-sair-admin").addEventListener("click", async () => {
    await logoutAdmin();
    window.location.href = "login.html?admin=1";
  });

  await carregarTudo();
}

inicializar();
