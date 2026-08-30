// ============================================================================
// js/dashboard.js — resultados da pesquisa (intenção de voto/avaliação),
// sempre em percentual — nunca exibe contagens absolutas nem o N da amostra.
//
// Página pública (sem login): este é o link que vai para o cliente. O
// Supabase libera SELECT no role `anon` só para a view vw_respostas_dashboard
// (ver supabase-views.sql) — nada de autenticação aqui. A área administrativa
// (pesquisadores em campo, exportação CSV) continua exigindo login, em
// admin.html/js/admin.js.
// ============================================================================

import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { getPassos } from "./questionario.js";
import { agregarTextoLivre, distribuirPercentuais, escapeHtml, LIMITE_MENCOES_ESPONTANEAS } from "./utils.js";

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
 *  do config. Os percentuais são distribuídos juntos (não item a item) para
 *  que a soma do gráfico feche exatamente em 100% — ver distribuirPercentuais.
 *  Se `ordenarPorValor`, reordena por percentual desc. mantendo NSNO sempre
 *  por último (candidatos); avaliações mantêm a ordem fixa Ótimo→Péssimo,
 *  onde a posição já carrega o sentido do dado. */
function montarSerie(perguntaId, agregado, { ordenarPorValor = false } = {}) {
  const c = config();
  const opcoes = opcoesDaPergunta(perguntaId);
  const { contagem, total } = agregado;

  const rotulosConhecidos = new Set(opcoes.map((o) => o.texto));
  const base = opcoes.map((op) => ({ id: op.id, label: op.texto, contagem: contagem[op.texto] || 0 }));
  for (const chave of Object.keys(contagem)) {
    if (!rotulosConhecidos.has(chave)) {
      base.push({ id: chave, label: chave, contagem: contagem[chave] });
    }
  }

  const percentuais = distribuirPercentuais(base.map((b) => b.contagem), total);
  let itens = base.map((b, i) => ({ id: b.id, label: b.label, pct: percentuais[i] }));

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
  if (tipo === "espontanea") return itens.map(() => COR_PRINCIPAL);
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
      ctx.fillText(`${valor.toFixed(2)}%`, bar.x + 10, bar.y);
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
        tooltip: { callbacks: { label: (ctx) => `${ctx.raw.toFixed(2)}%` } },
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
// Respostas espontâneas (open_text: Q4/Q8/Q10) — mesma agregação por
// menção usada no relatório (js/relatorio.js), inclusive o mesmo corte
// (LIMITE_MENCOES_ESPONTANEAS, definido em utils.js) para que o rótulo
// "Demais menções (dispersas)" signifique a mesma coisa nas duas telas;
// aqui só muda a apresentação (gráfico de barras).
// -----------------------------------------------------------------------

// Pergunta espontânea (open_text) → lista de candidatos da pergunta
// estimulada equivalente, usada para agrupar grafias diferentes do mesmo
// candidato (ver casarComCandidato em utils.js).
const CANDIDATOS_POR_PERGUNTA_ABERTA = {
  q4: "governador",
  q8: "deputadoFederal",
  q10: "deputadoEstadual",
};

async function buscarValoresAbertos(dbQuestao, filtros) {
  let query = supabase.from("vw_respostas_dashboard").select("valor").eq("questao", dbQuestao);
  query = aplicarFiltrosNaQuery(query, filtros);
  const { data, error } = await query.range(0, 4999);
  if (error || !data) return [];
  return data.map((linha) => linha.valor);
}

async function carregarGraficoAberto(canvasId, dbQuestao, filtros) {
  const valores = await buscarValoresAbertos(dbQuestao, filtros);
  const refCandidatos = CANDIDATOS_POR_PERGUNTA_ABERTA[dbQuestao];
  const candidatos = (refCandidatos && config().candidatos[refCandidatos]) || [];
  const { itens } = agregarTextoLivre(valores, { limite: LIMITE_MENCOES_ESPONTANEAS, candidatos });
  renderizarGrafico(canvasId, itens, "espontanea");
  return itens;
}

// =======================================================================
// Análises avançadas — cruzamentos por entrevista (efeito de arrastamento,
// transferência 1º→2º turno, espontânea × estimulada, indecisão comparada).
//
// Tudo continua em percentual: as matrizes são normalizadas por LINHA
// (cada linha soma 100% — é a distribuição do voto daquele grupo), e
// linhas com base amostral abaixo de LIMIAR_BASE_CRUZAMENTO são omitidas
// em vez de exibir um N pequeno e instável. Nenhum número absoluto aparece.
// =======================================================================
const LIMIAR_BASE_CRUZAMENTO = 30;
const CORES_EMPILHADA = ["#0d366b", "#2a78d6", "#7a1f9c", "#b8790a"];

/** Map<entrevista_id, valor> para uma questão, respeitando os filtros. */
async function buscarMapaRespostas(dbQuestao, filtros) {
  let query = supabase
    .from("vw_respostas_dashboard")
    .select("entrevista_id,valor")
    .eq("questao", dbQuestao);
  query = aplicarFiltrosNaQuery(query, filtros);
  const { data, error } = await query.range(0, 4999);
  const mapa = new Map();
  if (error || !data) return mapa;
  for (const linha of data) {
    if (linha.entrevista_id) mapa.set(linha.entrevista_id, linha.valor || "Não informado");
  }
  return mapa;
}

/** Rótulos canônicos (ordem do config, NSNO por último) de uma pergunta. */
function rotulosCanonicos(perguntaId) {
  return opcoesDaPergunta(perguntaId).map((o) => o.texto);
}

/**
 * Cruza duas perguntas por entrevista. Linhas = respostas de A; colunas =
 * respostas de B. Cada linha é a distribuição percentual (soma 100) do
 * eleitorado daquela resposta de A entre as opções de B. Só entram no
 * denominador entrevistas com resposta válida (rótulo canônico) nas duas
 * perguntas. Linhas com base < limiarBase são devolvidas em `omitidas`.
 */
function construirCruzamento(mapaA, mapaB, rotulosA, rotulosB, { limiarBase = LIMIAR_BASE_CRUZAMENTO } = {}) {
  const setA = new Set(rotulosA);
  const setB = new Set(rotulosB);
  const idsPorRotuloA = new Map(rotulosA.map((r) => [r, []]));

  for (const [id, valorA] of mapaA) {
    if (!setA.has(valorA) || !mapaB.has(id)) continue;
    if (!setB.has(mapaB.get(id))) continue;
    idsPorRotuloA.get(valorA).push(id);
  }

  const linhas = [];
  const omitidas = [];
  for (const rotulo of rotulosA) {
    const ids = idsPorRotuloA.get(rotulo);
    if (ids.length < limiarBase) {
      if (ids.length > 0) omitidas.push(rotulo);
      continue;
    }
    const contagem = rotulosB.map((rb) => ids.filter((id) => mapaB.get(id) === rb).length);
    const pcts = distribuirPercentuais(contagem, ids.length);
    linhas.push({ rotulo, celulas: rotulosB.map((rb, i) => ({ coluna: rb, pct: pcts[i] })) });
  }
  return { linhas, colunas: rotulosB, omitidas };
}

/** Heatmap tabular: cor da célula proporcional ao percentual da linha. */
function renderizarHeatmap(containerId, cruzamento, { corRGB = "26,58,110" } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { linhas, colunas, omitidas } = cruzamento;

  if (!linhas.length) {
    el.innerHTML = `<div class="grafico-vazio">Sem base amostral suficiente para este cruzamento nos filtros atuais.</div>`;
    return;
  }

  const thead = `<tr><th class="canto"></th>${colunas.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const corpo = linhas
    .map((ln) => {
      const tds = ln.celulas
        .map((cel) => {
          const alpha = cel.pct === 0 ? 0 : Math.min(0.9, 0.08 + (cel.pct / 100) * 0.82);
          const claro = alpha < 0.5;
          return `<td style="background:rgba(${corRGB},${alpha.toFixed(3)});color:${claro ? "#1a1a1a" : "#fff"}">${cel.pct.toFixed(1)}%</td>`;
        })
        .join("");
      return `<tr><th>${escapeHtml(ln.rotulo)}</th>${tds}</tr>`;
    })
    .join("");

  const nota = omitidas.length
    ? `<p class="nota-cruzamento">Linhas omitidas por base amostral reduzida: ${omitidas.map(escapeHtml).join(", ")}.</p>`
    : "";
  el.innerHTML = `<div class="tabela-scroll"><table class="matriz-cruzamento"><thead>${thead}</thead><tbody>${corpo}</tbody></table></div>${nota}`;
}

/** Plugin Chart.js: percentual centrado em cada segmento largo o bastante. */
const rotulosSegmento = {
  id: "rotulosSegmento",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "700 12px " + (getComputedStyle(document.body).fontFamily || "sans-serif");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((bar, i) => {
        const val = ds.data[i];
        if (val == null || val < 8) return;
        if (Math.abs(bar.x - bar.base) < 26) return;
        ctx.fillText(`${val.toFixed(0)}%`, (bar.x + bar.base) / 2, bar.y);
      });
    });
    ctx.restore();
  },
};

/** Barras 100% empilhadas horizontais — usado para transferência de voto. */
function renderizarBarrasEmpilhadas(canvasId, cruzamento) {
  const canvas = document.getElementById(canvasId);
  const wrap = document.getElementById(`wrap-${canvasId}`);
  if (!canvas || !wrap) return;
  if (graficosAtivos[canvasId]) {
    graficosAtivos[canvasId].destroy();
    delete graficosAtivos[canvasId];
  }

  const { linhas, colunas } = cruzamento;
  const vazio = wrap.querySelector(".grafico-vazio");
  if (!linhas.length) {
    canvas.classList.add("oculto");
    wrap.style.height = "";
    if (!vazio) {
      const d = document.createElement("div");
      d.className = "grafico-vazio";
      d.textContent = "Sem base amostral suficiente para os filtros selecionados.";
      wrap.appendChild(d);
    }
    return;
  }
  if (vazio) vazio.remove();
  canvas.classList.remove("oculto");
  wrap.style.height = `${alturaGrafico(linhas.length + 1)}px`;

  const c = config();
  const corDe = (i) => (colunas[i] === c.NSNO_TEXTO ? COR_NSNO : CORES_EMPILHADA[i % CORES_EMPILHADA.length]);
  const datasets = colunas.map((col, i) => ({
    label: col,
    data: linhas.map((l) => l.celulas[i].pct),
    backgroundColor: corDe(i),
    borderWidth: 0,
    maxBarThickness: 34,
  }));

  graficosAtivos[canvasId] = new Chart(canvas, {
    type: "bar",
    data: { labels: linhas.map((l) => l.rotulo), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%` } },
      },
      scales: {
        x: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => `${v}%` }, grid: { color: "#eceef1" } },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 13, weight: "500" }, color: "#1a1a1a" } },
      },
    },
    plugins: [rotulosSegmento],
  });
}

/** Barras agrupadas: lembrança espontânea × voto estimulado, por candidato. */
function renderizarComparativoEspontanea(canvasId, itensEspontaneos, serieEstimulada, candidatos) {
  const canvas = document.getElementById(canvasId);
  const wrap = document.getElementById(`wrap-${canvasId}`);
  if (!canvas || !wrap) return;
  if (graficosAtivos[canvasId]) {
    graficosAtivos[canvasId].destroy();
    delete graficosAtivos[canvasId];
  }

  const espPorLabel = new Map((itensEspontaneos || []).map((i) => [i.label, i.pct]));
  const linhas = (candidatos || [])
    .map((cand) => ({
      label: cand.texto,
      espontanea: espPorLabel.get(cand.texto) || 0,
      estimulada: serieEstimulada?.find((s) => s.id === cand.id)?.pct || 0,
    }))
    .filter((l) => l.espontanea > 0 || l.estimulada > 0)
    .sort((a, b) => b.estimulada - a.estimulada)
    .slice(0, 8);

  const vazio = wrap.querySelector(".grafico-vazio");
  if (!linhas.length) {
    canvas.classList.add("oculto");
    wrap.style.height = "";
    if (!vazio) {
      const d = document.createElement("div");
      d.className = "grafico-vazio";
      d.textContent = "Sem dados para os filtros selecionados.";
      wrap.appendChild(d);
    }
    return;
  }
  if (vazio) vazio.remove();
  canvas.classList.remove("oculto");
  wrap.style.height = `${alturaGrafico(Math.ceil(linhas.length * 1.7) + 1)}px`;

  graficosAtivos[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: linhas.map((l) => l.label),
      datasets: [
        { label: "Espontânea (lembrança)", data: linhas.map((l) => l.espontanea), backgroundColor: "#8fb4e6", maxBarThickness: 15 },
        { label: "Estimulada (voto)", data: linhas.map((l) => l.estimulada), backgroundColor: COR_PRINCIPAL, maxBarThickness: 15 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)}%` } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: (v) => `${v}%` }, grid: { color: "#eceef1" } },
        y: { grid: { display: false }, ticks: { font: { size: 13 }, color: "#1a1a1a" } },
      },
    },
  });
}

function pctNSNO(serie) {
  const item = (serie || []).find((i) => i.id === config().NSNO_ID);
  return item ? item.pct : 0;
}

/** Indecisão (NS/NO) comparada entre todas as disputas — qual está mais aberta. */
function renderizarIndecisao(series) {
  const itens = [
    { id: "pres1", label: "Presidente — 1º turno", pct: pctNSNO(series.q2) },
    { id: "pres2", label: "Presidente — 2º turno", pct: pctNSNO(series.q3) },
    { id: "gov1", label: "Governador — 1º turno", pct: pctNSNO(series.q5) },
    { id: "gov2", label: "Governador — 2º turno", pct: pctNSNO(series.q6) },
    { id: "depfed", label: "Deputado Federal", pct: pctNSNO(series.q9) },
    { id: "depest", label: "Deputado Estadual", pct: pctNSNO(series.q11) },
  ];
  renderizarGrafico("grafico-indecisao", itens, "candidatos");
}

async function carregarAnalisesAvancadas(filtros, series) {
  const [mGov, mGov2, mPres, mPres2, mAval, mDepF, mDepE, mSen1, mSen2] = await Promise.all([
    buscarMapaRespostas("q5", filtros),
    buscarMapaRespostas("q6", filtros),
    buscarMapaRespostas("q2", filtros),
    buscarMapaRespostas("q3", filtros),
    buscarMapaRespostas("q1", filtros),
    buscarMapaRespostas("q9", filtros),
    buscarMapaRespostas("q11", filtros),
    buscarMapaRespostas("q7_1voto", filtros),
    buscarMapaRespostas("q7_2voto", filtros),
  ]);

  const colsGov = rotulosCanonicos("q5");
  renderizarHeatmap("cruz-q9-q5", construirCruzamento(mDepF, mGov, rotulosCanonicos("q9"), colsGov));
  renderizarHeatmap("cruz-q11-q5", construirCruzamento(mDepE, mGov, rotulosCanonicos("q11"), colsGov));
  renderizarHeatmap("cruz-q2-q5", construirCruzamento(mPres, mGov, rotulosCanonicos("q2"), colsGov));
  renderizarHeatmap("cruz-q1-q5", construirCruzamento(mAval, mGov, rotulosCanonicos("q1"), colsGov));
  renderizarHeatmap(
    "cruz-senado",
    construirCruzamento(mSen1, mSen2, rotulosCanonicos("q7"), rotulosCanonicos("q7"), { limiarBase: 20 })
  );

  renderizarBarrasEmpilhadas(
    "grafico-transf-gov",
    construirCruzamento(mGov, mGov2, rotulosCanonicos("q5"), rotulosCanonicos("q6"), { limiarBase: 20 })
  );
  renderizarBarrasEmpilhadas(
    "grafico-transf-pres",
    construirCruzamento(mPres, mPres2, rotulosCanonicos("q2"), rotulosCanonicos("q3"), { limiarBase: 20 })
  );

  renderizarIndecisao(series);

  const cand = config().candidatos;
  renderizarComparativoEspontanea("grafico-esp-gov", series.q4esp, series.q5, cand.governador);
  renderizarComparativoEspontanea("grafico-esp-fed", series.q8esp, series.q9, cand.deputadoFederal);
  renderizarComparativoEspontanea("grafico-esp-est", series.q10esp, series.q11, cand.deputadoEstadual);
}

// -----------------------------------------------------------------------
// KPIs — números-chave de aprovação/rejeição e liderança, sempre em %.
// -----------------------------------------------------------------------
function pct(itens, ids) {
  return itens
    .filter((i) => ids.includes(i.id))
    .reduce((s, i) => s + i.pct, 0)
    .toFixed(2);
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
      valor: `${liderPresidente.pct.toFixed(2)}%`,
      legenda: liderPresidente.label,
    }));
  }

  const liderGovernador = liderDentre(q5);
  if (liderGovernador) {
    blocos.push(kpiHtml({
      rotulo: "Líder — Governador",
      valor: `${liderGovernador.pct.toFixed(2)}%`,
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
      carregarGraficoAberto("grafico-q4", "q4", filtros),
      carregarGrafico("grafico-q5", "q5", "q5", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q6", "q6", "q6", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q7-1", "q7", "q7_1voto", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q7-2", "q7", "q7_2voto", filtros, { ordenarPorValor: true }),
      carregarGraficoAberto("grafico-q8", "q8", filtros),
      carregarGrafico("grafico-q9", "q9", "q9", filtros, { ordenarPorValor: true }),
      carregarGraficoAberto("grafico-q10", "q10", filtros),
      carregarGrafico("grafico-q11", "q11", "q11", filtros, { ordenarPorValor: true }),
      carregarGrafico("grafico-q12", "q12", "q12", filtros),
    ]);

    const [q1, q2, q3, q4esp, q5, q6, , , q8esp, q9, q10esp, q11, q12] = resultados;
    renderizarKPIs({ q1, q12, q2, q5 });

    try {
      await carregarAnalisesAvancadas(filtros, { q2, q3, q5, q6, q9, q11, q4esp, q8esp, q10esp });
    } catch (erro) {
      console.error("Falha ao carregar análises avançadas:", erro);
    }

    const agora = new Date();
    document.getElementById("ultima-atualizacao").textContent =
      `Atualizado às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } finally {
    btn.disabled = false;
    spinner.classList.add("oculto");
  }
}

async function inicializar() {
  registrarServiceWorker();
  iniciarIndicadorConexao();

  preencherFiltroMunicipio();
  document.getElementById("filtro-municipio").addEventListener("change", (evt) => {
    municipioSelecionado = evt.target.value;
    document.getElementById("subtitulo-marca").textContent = `Dashboard de Resultados — ${config().pesquisa.municipio}`;
    carregarTudo();
  });
  document.getElementById("btn-aplicar-filtros").addEventListener("click", carregarTudo);

  await carregarTudo();
}

inicializar();
