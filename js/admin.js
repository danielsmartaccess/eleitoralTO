// ============================================================================
// js/admin.js — área administrativa: pesquisadores em campo (contagens
// operacionais, não é "resultado da pesquisa"), entrevistas paginadas e
// exportação CSV.
//
// A paginação da tabela de entrevistas é obrigatória: nunca assumimos que a
// API devolve tudo de uma vez, sempre usamos `.range()`.
// ============================================================================

import { exigirLoginAdmin, logoutAdmin } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { escapeHtml, formatarDataHora, formatarDuracao, codigoCurto } from "./utils.js";

const TAMANHO_PAGINA = 25;
let paginaAtual = 0;

// ---------------------------------------------------------------------------
// Resumo totalizado por município
// ---------------------------------------------------------------------------

async function carregarResumoMunicipio() {
  const { data, error } = await supabase
    .from("vw_resumo_municipio")
    .select("municipio, completas, em_andamento, hoje, total")
    .order("municipio", { ascending: true });

  const grade = document.getElementById("grade-resumo-municipio");
  if (error || !data) {
    grade.innerHTML = `<div class="kpi vazio">Erro ao carregar: ${escapeHtml(error?.message || "sem dados")}</div>`;
    return;
  }

  const totalGeral = data.reduce(
    (acc, m) => ({
      completas: acc.completas + m.completas,
      em_andamento: acc.em_andamento + m.em_andamento,
      hoje: acc.hoje + m.hoje,
      total: acc.total + m.total,
    }),
    { completas: 0, em_andamento: 0, hoje: 0, total: 0 }
  );

  const cartaoMunicipio = (nome, m) => `
    <div class="kpi">
      <div class="kpi-rotulo"><span class="ponto"></span>${escapeHtml(nome)}</div>
      <div class="kpi-valor">${m.completas}</div>
      <div class="kpi-legenda">completas · ${m.em_andamento} em andamento · ${m.hoje} hoje · ${m.total} no total</div>
    </div>`;

  grade.innerHTML =
    data.map((m) => cartaoMunicipio(m.municipio, m)).join("") +
    `<div class="kpi positivo">
      <div class="kpi-rotulo"><span class="ponto"></span>Total geral</div>
      <div class="kpi-valor">${totalGeral.completas}</div>
      <div class="kpi-legenda">completas · ${totalGeral.em_andamento} em andamento · ${totalGeral.hoje} hoje · ${totalGeral.total} no total</div>
    </div>`;

  document.getElementById("atualizado-resumo").textContent = formatarDataHora(new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Pesquisadores em campo (visão operacional) — agrupados por município.
// ---------------------------------------------------------------------------

async function carregarPesquisadores() {
  const { data, error } = await supabase
    .from("vw_coleta_resumo")
    .select("pesquisador, municipio, realizadas, hoje, ultima_coleta")
    .order("municipio", { ascending: true })
    .order("realizadas", { ascending: false });

  const tbody = document.getElementById("tabela-pesquisadores");
  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="4">Erro ao carregar: ${escapeHtml(error?.message || "sem dados")}</td></tr>`;
    return;
  }

  document.getElementById("contagem-pesquisadores").textContent = `${data.length} pesquisador(es)`;

  const grupos = new Map();
  for (const p of data) {
    const chave = p.municipio || "(sem município)";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }

  let html = "";
  for (const [municipio, pesquisadores] of grupos) {
    const subtotalRealizadas = pesquisadores.reduce((acc, p) => acc + p.realizadas, 0);
    const subtotalHoje = pesquisadores.reduce((acc, p) => acc + p.hoje, 0);

    html += `<tr class="linha-grupo"><td colspan="4">${escapeHtml(municipio)}</td></tr>`;
    html += pesquisadores
      .map(
        (p) => `
      <tr>
        <td>${escapeHtml(p.pesquisador)}</td>
        <td class="mono">${p.realizadas}</td>
        <td class="mono">${p.hoje}</td>
        <td>${p.ultima_coleta ? formatarDataHora(p.ultima_coleta) : "-"}</td>
      </tr>`
      )
      .join("");
    html += `<tr class="linha-subtotal">
      <td>Subtotal ${escapeHtml(municipio)}</td>
      <td class="mono">${subtotalRealizadas}</td>
      <td class="mono">${subtotalHoje}</td>
      <td></td>
    </tr>`;
  }

  tbody.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Entrevistas (paginado)
// ---------------------------------------------------------------------------

async function carregarEntrevistas() {
  const de = paginaAtual * TAMANHO_PAGINA;
  const ate = de + TAMANHO_PAGINA - 1;

  const { data, error, count } = await supabase
    .from("entrevistas")
    .select("session_id, pesquisador, municipio, status, duracao_seg, coletado_em", { count: "exact" })
    .order("coletado_em", { ascending: false })
    .range(de, ate);

  const tbody = document.getElementById("tabela-entrevistas");
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(
      (e) => `
      <tr>
        <td class="mono">#${codigoCurto(e.session_id)}</td>
        <td>${escapeHtml(e.pesquisador || "-")}</td>
        <td>${escapeHtml(e.municipio || "-")}</td>
        <td>${e.status === "completo" ? '<span class="badge badge-ok">completo</span>' : '<span class="badge badge-neutro">em andamento</span>'}</td>
        <td>${formatarDuracao(e.duracao_seg)}</td>
        <td>${formatarDataHora(e.coletado_em)}</td>
      </tr>`
    )
    .join("");

  const totalPaginas = Math.max(1, Math.ceil((count || 0) / TAMANHO_PAGINA));
  document.getElementById("info-pagina").textContent = `Página ${paginaAtual + 1} de ${totalPaginas} (${count} entrevistas)`;
  document.getElementById("btn-pagina-anterior").disabled = paginaAtual === 0;
  document.getElementById("btn-pagina-proxima").disabled = paginaAtual + 1 >= totalPaginas;
}

// ---------------------------------------------------------------------------
// Exportação CSV — dataset achatado, paginado internamente para nunca
// depender de uma única resposta gigante do PostgREST.
// ---------------------------------------------------------------------------

async function buscarTodasEntrevistasCompletas() {
  const registros = [];
  let de = 0;
  const passo = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("entrevistas")
      .select("id, session_id, pesquisador, municipio, coletado_em, duracao_seg")
      .eq("status", "completo")
      .range(de, de + passo - 1);
    if (error || !data || data.length === 0) break;
    registros.push(...data);
    if (data.length < passo) break;
    de += passo;
  }
  return registros;
}

async function buscarTodasRespostas() {
  const registros = [];
  let de = 0;
  const passo = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("vw_respostas_dashboard")
      .select("entrevista_id, questao, valor")
      .range(de, de + passo - 1);
    if (error || !data || data.length === 0) break;
    registros.push(...data);
    if (data.length < passo) break;
    de += passo;
  }
  return registros;
}

function paraCsvSeguro(valor) {
  const texto = valor == null ? "" : String(valor);
  if (/[",\n;]/.test(texto)) return '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

async function exportarCsv() {
  const btn = document.getElementById("btn-exportar-csv");
  btn.disabled = true;
  btn.textContent = "Gerando...";

  try {
    const [entrevistas, respostas] = await Promise.all([buscarTodasEntrevistasCompletas(), buscarTodasRespostas()]);

    const respostasPorEntrevista = {};
    const colunasQuestoes = new Set();
    for (const r of respostas) {
      if (r.questao.includes("__ordem")) continue; // metadado de randomização, não entra no dataset de análise
      respostasPorEntrevista[r.entrevista_id] = respostasPorEntrevista[r.entrevista_id] || {};
      respostasPorEntrevista[r.entrevista_id][r.questao] = r.valor;
      colunasQuestoes.add(r.questao);
    }

    const colunasBase = ["session_id", "pesquisador", "municipio", "coletado_em", "duracao_seg"];
    const colunasOrdenadasQuestoes = Array.from(colunasQuestoes).sort();
    const colunas = [...colunasBase, ...colunasOrdenadasQuestoes];

    const linhas = [colunas.join(",")];
    for (const e of entrevistas) {
      const respE = respostasPorEntrevista[e.id] || {};
      const linha = [
        e.session_id, e.pesquisador, e.municipio, e.coletado_em, e.duracao_seg,
        ...colunasOrdenadasQuestoes.map((q) => respE[q] ?? ""),
      ].map(paraCsvSeguro);
      linhas.push(linha.join(","));
    }

    const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pesquisa-eleitoral-tocantins-2026-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    btn.disabled = false;
    btn.textContent = "⬇ Exportar CSV";
  }
}

// ---------------------------------------------------------------------------

async function inicializar() {
  const usuario = await exigirLoginAdmin();
  if (!usuario) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();

  await Promise.all([carregarResumoMunicipio(), carregarPesquisadores(), carregarEntrevistas()]);

  document.getElementById("btn-pagina-anterior").addEventListener("click", () => {
    paginaAtual = Math.max(0, paginaAtual - 1);
    carregarEntrevistas();
  });
  document.getElementById("btn-pagina-proxima").addEventListener("click", () => {
    paginaAtual++;
    carregarEntrevistas();
  });
  document.getElementById("btn-exportar-csv").addEventListener("click", exportarCsv);
  document.getElementById("btn-sair-admin").addEventListener("click", async () => {
    await logoutAdmin();
    window.location.href = "login.html";
  });
}

inicializar();
