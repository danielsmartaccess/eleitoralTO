// ============================================================================
// js/dashboard.js — resultados da pesquisa (intenção de voto/avaliação),
// sempre em percentual — nunca exibe contagens absolutas nem o N da amostra.
// ============================================================================

import { exigirLoginAdmin, logoutAdmin } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { getPassos } from "./questionario.js";

let graficosAtivos = {};
let passosCachePorMunicipio = {};
let municipioSelecionado = null;

// -----------------------------------------------------------------------
// Paleta — categórica (candidatos, uma única série: identidade já vem do
// rótulo no eixo, então usa-se um único tom de marca) e divergente
// (perguntas de avaliação Ótimo→Péssimo, onde a ordem carrega sentido).
// -----------------------------------------------------------------------
const COR_PRINCIPAL = "#1a3a6e";
const COR_NSNO = "#969aa3";
const CORES_AVALIACAO = {
  otimo: "#0d366b", otima: "#0d366b",
  bom: "#2a78d6", boa: "#2a78d6",
  regular: "#87847c",
  ruim: "#dd5f5b",
  pessimo: "#a3201f", pessima: "#a3201f",
};
const PERGUNTAS_AVALIACAO = new Set(["q1", "q12"]);

function config() {
  return window.encontrarPesquisaPorMunicipio(municipioSelecionado) || window.listarPesquisasDisponiveis()[0];
}

function passos() {
  if (!passosCachePorMunicipio[municipioSelecionado]) {
    passosCachePorMunicipio[municipioSelecionado] = getPassos(config());
  }
  return passosCachePorMunicipio[municipioSelecionado];
}

/** Preenche o seletor de município/pesquisa a partir das pesquisas
 *  cadastradas em config/pesquisa.js e define a seleção inicial. */
function preencherFiltroMunicipio() {
  const select = document.getElementById("filtro-municipio");
  const disponiveis = window.listarPesquisasDisponiveis();
  select.innerHTML = disponiveis
    .map((p) => `<option value="${p.pesquisa.municipio}">${p.pesquisa.municipio}</option>`)
    .join("");
  municipioSelecionado = disponiveis[0]?.pesquisa.municipio || null;
  select.value = municipioSelecionado;
  document.getElementById("subtitulo-marca").textContent = `Dashboard de Resultados — ${config().pesquisa.municipio}`;
}

/** Opções canônicas (ordem do config) de uma pergunta, com NSNO ao final. */
function opcoesDaPergunta(perguntaId) {
  const passo = passos().find((p) => p.id === perguntaId);
  if (!passo || !passo.opcoesReais) return [];
  const c = config();
  return [...passo.opcoesReais, { id: c.NSNO_ID, texto: c.NSNO_TEXTO }];
}

function lerFiltros() {
  return {
    municipio: municipioSelecionado,
    pesquisador: document.getElementById("filtro-pesquisador").value || null,
    dataInicio: document.getElementById("filtro-data-inicio").value || null,
    dataFim: document.getElementById("filtro-data-fim").value || null,
  };
}

function aplicarFiltrosNaQuery(query, filtros) {
  if (filtros.municipio) query = query.eq("municipio", filtros.municipio);
  if (filtros.pesquisador) query = query.ilike("pesquisador", `%${filtros.pesquisador}%`);
  if (filtros.dataInicio) query = query.gte("coletado_em", filtros.dataInicio);
  if (filtros.dataFim) query = query.lte("coletado_em", filtros.dataFim + "T23:59:59");
  return query;
}

async function buscarAgregado(dbQuestao, filtros) {
  let query = supabase.from("vw_respostas_dashboard").select("valor").eq("questao", dbQuestao);
  query = aplicarFiltrosNaQuery(query, filtros);
  const { data, error } = await query.range(0, 4999);
  if (error || !data) return { contagem: {}, total: 0 };

  const contagem = {};
  for (const linha of data) {
    const chave = linha.valor || "Não informado";
    contagem[chave] = (contagem[chave] || 0) + 1;
  }
  return { contagem, total: data.length };
}

/** Monta a série [{id, label, pct}] a partir do agregado, na ordem canônica
 *  do config. Se `ordenarPorValor`, reordena por percentual desc. mantendo
 *  NSNO sempre por último (candidatos); avaliações mantêm a ordem fixa
 *  Ótimo→Péssimo, onde a posição já carrega o sentido do dado. */
function montarSerie(perguntaId, agregado, { ordenarPorValor = false } = {}) {
  const c = config();
  const opcoes = opcoesDaPergunta(perguntaId);
  const { contagem, total } = agregado;

  const rotulosConhecidos = new Set(opcoes.map((o) => o.texto));
  let itens = opcoes.map((op) => ({
    id: op.id,
    label: op.texto,
    pct: total > 0 ? Number((((contagem[op.texto] || 0) / total) * 100).toFixed(1)) : 0,
  }));

  for (const chave of Object.keys(contagem)) {
    if (!rotulosConhecidos.has(chave)) {
      itens.push({ id: chave, label: chave, pct: total > 0 ? Number(((contagem[chave] / total) * 100).toFixed(1)) : 0 });
    }
  }

  if (ordenarPorValor) {
    const nsno = itens.filter((i) => i.id === c.NSNO_ID);
    const resto = itens.filter((i) => i.id !== c.NSNO_ID).sort((a, b) => b.pct - a.pct);
    itens = [...resto, ...nsno];
  }

  return itens;
}

function coresPara(itens, tipo) {
  const c = config();
  if (tipo === "avaliacao") {
    return itens.map((i) => (i.id === c.NSNO_ID ? COR_NSNO : CORES_AVALIACAO[i.id] || COR_PRINCIPAL));
  }
  return itens.map((i) => (i.id === c.NSNO_ID ? COR_NSNO : COR_PRINCIPAL));
}

/** Plugin Chart.js: desenha o rótulo percentual diretamente ao final de
 *  cada barra — necessário como reforço visual (várias cores da paleta
 *  ficam abaixo de 3:1 de contraste contra o fundo branco por design). */
const rotulosDiretos = {
  id: "rotulosDiretos",
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = "700 14px " + (getComputedStyle(document.body).fontFamily || "sans-serif");
    ctx.fillStyle = "#1a1a1a";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    data.datasets[0].data.forEach((valor, i) => {
      const bar = meta.data[i];
      if (!bar) return;
      ctx.fillText(`${valor}%`, bar.x + 10, bar.y);
    });
    ctx.restore();
  },
};

function alturaGrafico(quantidadeItens) {
  return Math.max(190, Math.min(820, quantidadeItens * 44 + 36));
}

function renderizarGrafico(canvasId, itens, tipo) {
  const canvas = document.getElementById(canvasId);
  const wrap = document.getElementById(`wrap-${canvasId}`);
  if (!canvas || !wrap) return;

  const total = itens.reduce((soma, i) => soma + i.pct, 0);
  if (graficosAtivos[canvasId]) {
    graficosAtivos[canvasId].destroy();
    delete graficosAtivos[canvasId];
  }

  if (total === 0) {
    canvas.classList.add("oculto");
    wrap.style.height = "";
    let vazio = wrap.querySelector(".grafico-vazio");
    if (!vazio) {
      vazio = document.createElement("div");
      vazio.className = "grafico-vazio";
      vazio.textContent = "Sem dados para os filtros selecionados.";
      wrap.appendChild(vazio);
    }
    return;
  }

  const vazio = wrap.querySelector(".grafico-vazio");
  if (vazio) vazio.remove();
  canvas.classList.remove("oculto");
  wrap.style.height = `${alturaGrafico(itens.length)}px`;

  const labels = itens.map((i) => i.label);
  const valores = itens.map((i) => i.pct);
  const cores = coresPara(itens, tipo);

  graficosAtivos[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: valores, backgroundColor: cores, borderRadius: 4, maxBarThickness: 26 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      layout: { padding: { right: 54 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.raw}%` } },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: (v) => `${v}%`, font: { size: 12.5 } },
          grid: { color: "#eceef1" },
        },
        y: {
          grid: { display: false },
          ticks: { autoSkip: false, font: { size: 14, weight: "500" }, color: "#1a1a1a" },
        },
      },
    },
    plugins: [rotulosDiretos],
  });
}

async function carregarGrafico(canvasId, perguntaId, dbQuestao, filtros, opcoes) {
  const agregado = await buscarAgregado(dbQuestao, filtros);
  const itens = montarSerie(perguntaId, agregado, opcoes);
  const tipo = PERGUNTAS_AVALIACAO.has(perguntaId) ? "avaliacao" : "candidatos";
  renderizarGrafico(canvasId, itens, tipo);
  return itens;
}

// -----------------------------------------------------------------------
// KPIs — números-chave de aprovação/rejeição e liderança, sempre em %.
// -----------------------------------------------------------------------
function pct(itens, ids) {
  return Number(itens.filter((i) => ids.includes(i.id)).reduce((s, i) => s + i.pct, 0).toFixed(1));
}

function liderDentre(itens) {
  const c = config();
  const candidatos = itens.filter((i) => i.id !== c.NSNO_ID);
  if (!candidatos.length) return null;
  return candidatos.reduce((melhor, atual) => (atual.pct > melhor.pct ? atual : melhor), candidatos[0]);
}

function kpiHtml({ rotulo, valor, legenda, classe }) {
  return `
    <div class="kpi ${classe || ""}">
      <div class="kpi-rotulo"><span class="ponto"></span>${rotulo}</div>
      <div class="kpi-valor">${valor}</div>
      <div class="kpi-legenda">${legenda}</div>
    </div>`;
}

function renderizarKPIs({ q1, q12, q2, q5 }) {
  const container = document.getElementById("grade-kpis");
  const semDados = (itens) => itens.reduce((s, i) => s + i.pct, 0) === 0;

  const blocos = [];

  if (!semDados(q1)) {
    blocos.push(kpiHtml({
      rotulo: "Aprovação do Governo",
      valor: `${pct(q1, ["otimo", "bom"])}%`,
      legenda: "Somatório de Ótimo + Bom",
      classe: "positivo",
    }));
    blocos.push(kpiHtml({
      rotulo: "Reprovação do Governo",
      valor: `${pct(q1, ["ruim", "pessimo"])}%`,
      legenda: "Somatório de Ruim + Péssimo",
      classe: "negativo",
    }));
  }

  if (!semDados(q12)) {
    blocos.push(kpiHtml({
      rotulo: "Aprovação do Prefeito",
      valor: `${pct(q12, ["otima", "boa"])}%`,
      legenda: "Somatório de Ótima + Boa",
      classe: "positivo",
    }));
    blocos.push(kpiHtml({
      rotulo: "Reprovação do Prefeito",
      valor: `${pct(q12, ["ruim", "pessima"])}%`,
      legenda: "Somatório de Ruim + Péssima",
      classe: "negativo",
    }));
  }

  const liderPresidente = liderDentre(q2);
  if (liderPresidente) {
    blocos.push(kpiHtml({
      rotulo: "Líder — Presidente",
      valor: `${liderPresidente.pct}%`,
      legenda: liderPresidente.label,
    }));
  }

  const liderGovernador = liderDentre(q5);
  if (liderGovernador) {
    blocos.push(kpiHtml({
      rotulo: "Líder — Governador",
      valor: `${liderGovernador.pct}%`,
      legenda: liderGovernador.label,
    }));
  }

  container.innerHTML = blocos.join("") || `<div class="kpi vazio">Sem dados para os filtros selecionados.</div>`;
}

async function carregarTudo() {
  const filtros = lerFiltros();
  const btn = document.getElementById("btn-aplicar-filtros");
  const spinner = document.getElementById("spinner-filtros");
  btn.disabled = true;
  spinner.classList.remove("oculto");

  try {
    const resultados = await Promise.all([
      carregarGrafico("grafico-q1", "q1", "q1", filtros),
      carregarGrafico("grafico-q2", "q2", "q2", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q3", "q3", "q3", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q5", "q5", "q5", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q6", "q6", "q6", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q7-1", "q7", "q7_1voto", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q7-2", "q7", "q7_2voto", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q9", "q9", "q9", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q11", "q11", "q11", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q12", "q12", "q12", filtros),
    ]);

    const [q1, q2, , q5, , , , , , q12] = resultados;
    renderizarKPIs({ q1, q12, q2, q5 });

    const agora = new Date();
    document.getElementById("ultima-atualizacao").textContent =
      `Atualizado às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } finally {
    btn.disabled = false;
    spinner.classList.add("oculto");
  }
}

async function inicializar() {
  const usuario = await exigirLoginAdmin();
  if (!usuario) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();

  preencherFiltroMunicipio();
  document.getElementById("filtro-municipio").addEventListener("change", (evt) => {
    municipioSelecionado = evt.target.value;
    document.getElementById("subtitulo-marca").textContent = `Dashboard de Resultados — ${config().pesquisa.municipio}`;
    carregarTudo();
  });
  document.getElementById("btn-aplicar-filtros").addEventListener("click", carregarTudo);
  document.getElementById("btn-sair-admin").addEventListener("click", async () => {
    await logoutAdmin();
    window.location.href = "login.html";
  });

  await carregarTudo();
}

inicializar();
