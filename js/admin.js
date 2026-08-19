// ============================================================================
// js/admin.js — área administrativa (Seção 44): pesquisadores, cotas,
// entrevistas paginadas e exportação CSV.
//
// A paginação da tabela de entrevistas é obrigatória (Seção 47): nunca
// assumimos que a API devolve tudo de uma vez, sempre usamos `.range()`.
// ============================================================================

import { exigirLoginAdmin, logoutAdmin } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { escapeHtml, formatarDataHora, formatarDuracao, codigoCurto } from "./utils.js";

const TAMANHO_PAGINA = 25;
let paginaAtual = 0;

// ---------------------------------------------------------------------------
// Pesquisadores / equipes
// ---------------------------------------------------------------------------

async function carregarEquipes() {
  const { data, error } = await supabase
    .from("equipes")
    .select("id, nome, municipio, perfil, ativo, ultimo_acesso")
    .order("nome");

  const tbody = document.getElementById("tabela-equipes");
  if (error) {
    tbody.innerHTML = `<tr><td colspan="5">Erro ao carregar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  document.getElementById("contagem-equipes").textContent = `${data.length} cadastrados`;

  tbody.innerHTML = data
    .map(
      (eq) => `
      <tr>
        <td>${escapeHtml(eq.nome)}</td>
        <td>${escapeHtml(eq.municipio)}</td>
        <td><span class="tag-perfil">${escapeHtml(eq.perfil)}</span></td>
        <td>${eq.ultimo_acesso ? formatarDataHora(eq.ultimo_acesso) : "nunca"}</td>
        <td>
          <label class="linha-toggle">
            <input type="checkbox" data-toggle-ativo="${eq.id}" ${eq.ativo ? "checked" : ""} />
            ${eq.ativo ? "Ativo" : "Inativo"}
          </label>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-toggle-ativo]").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const id = e.target.dataset.toggleAtivo;
      const { error: erroUpdate } = await supabase.from("equipes").update({ ativo: e.target.checked }).eq("id", id);
      if (erroUpdate) {
        alert("Não foi possível atualizar: " + erroUpdate.message);
        e.target.checked = !e.target.checked;
      } else {
        carregarEquipes();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Cotas
// ---------------------------------------------------------------------------

function statusCotaTexto(alvo, realizado) {
  if (!alvo) return { texto: "OK", classe: "badge-ok" };
  if (realizado >= alvo) return { texto: "EXCEDIDA", classe: "badge-erro" };
  if (realizado >= alvo * 0.8) return { texto: "ALERTA", classe: "badge-alerta" };
  return { texto: "OK", classe: "badge-ok" };
}

async function carregarCotas() {
  const { data, error } = await supabase
    .from("vw_cotas_progresso")
    .select("municipio, sexo, faixa_etaria, alvo, realizado")
    .order("municipio");

  const tbody = document.getElementById("tabela-cotas");
  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="6">Sem dados de cota.</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map((c) => {
      const st = statusCotaTexto(c.alvo, c.realizado);
      return `
      <tr>
        <td>${escapeHtml(c.municipio)}</td>
        <td>${escapeHtml(c.sexo || "-")}</td>
        <td>${escapeHtml(c.faixa_etaria || "-")}</td>
        <td>${c.alvo}</td>
        <td>${c.realizado}</td>
        <td><span class="badge ${st.classe}">${st.texto}</span></td>
      </tr>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Entrevistas (paginado)
// ---------------------------------------------------------------------------

async function carregarEntrevistas() {
  const de = paginaAtual * TAMANHO_PAGINA;
  const ate = de + TAMANHO_PAGINA - 1;

  const { data, error, count } = await supabase
    .from("entrevistas")
    .select("session_id, pesquisador, municipio, status, duracao_seg, geo_status, coletado_em", { count: "exact" })
    .order("coletado_em", { ascending: false })
    .range(de, ate);

  const tbody = document.getElementById("tabela-entrevistas");
  if (error) {
    tbody.innerHTML = `<tr><td colspan="7">Erro: ${escapeHtml(error.message)}</td></tr>`;
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
        <td>${e.geo_status === "ok" ? '<span class="badge badge-ok">ok</span>' : `<span class="badge badge-neutro">${escapeHtml(e.geo_status || "-")}</span>`}</td>
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
// Exportação CSV (Seção 59) — dataset achatado, paginado internamente para
// nunca depender de uma única resposta gigante do PostgREST (Seção 47).
// ---------------------------------------------------------------------------

async function buscarTodasEntrevistasCompletas() {
  const registros = [];
  let de = 0;
  const passo = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("entrevistas")
      .select("id, session_id, pesquisador, municipio, regiao, sexo, faixa_etaria, escolaridade, local_coleta, coletado_em, duracao_seg")
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
      if (r.questao.includes("__ordem")) continue; // metadado de auditoria, não entra no dataset de análise
      respostasPorEntrevista[r.entrevista_id] = respostasPorEntrevista[r.entrevista_id] || {};
      respostasPorEntrevista[r.entrevista_id][r.questao] = r.valor;
      colunasQuestoes.add(r.questao);
    }

    const colunasBase = ["session_id", "pesquisador", "municipio", "regiao", "sexo", "faixa_etaria", "escolaridade", "local_coleta", "coletado_em", "duracao_seg"];
    const colunas = [...colunasBase, ...Array.from(colunasQuestoes).sort()];

    const linhas = [colunas.join(",")];
    for (const e of entrevistas) {
      const respE = respostasPorEntrevista[e.id] || {};
      const linha = [
        e.session_id, e.pesquisador, e.municipio, e.regiao, e.sexo, e.faixa_etaria, e.escolaridade, e.local_coleta, e.coletado_em, e.duracao_seg,
        ...Array.from(colunasQuestoes).sort().map((q) => respE[q] ?? ""),
      ].map(paraCsvSeguro);
      linhas.push(linha.join(","));
    }

    const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pesquisa-eleitoral-to-2026-${new Date().toISOString().slice(0, 10)}.csv`;
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

  await Promise.all([carregarEquipes(), carregarCotas(), carregarEntrevistas()]);

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
    window.location.href = "login.html?admin=1";
  });
}

inicializar();
