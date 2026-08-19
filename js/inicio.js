// ============================================================================
// js/inicio.js — tela inicial do pesquisador (index.html).
// Mostra quem está logado, entrevistas em andamento para retomar (Seção 26),
// a cota da área (Seção 19) e o atalho para iniciar uma nova entrevista.
// ============================================================================

import { exigirLoginPesquisador, logoutPesquisador } from "./auth.js";
import { listarEmAndamento, excluirEntrevista } from "./db.js";
import { iniciarSincronizacaoAutomatica } from "./sync.js";
import { iniciarIndicadorConexao, iniciarControleFonte, registrarServiceWorker } from "./app.js";
import { buscarCotasDoMunicipio, calcularStatusCota } from "./cotas.js";
import { registrarEvento, EVENTOS } from "./auditoria.js";
import { formatarDataHora, escapeHtml } from "./utils.js";

const config = window.PESQUISA_CONFIG;

async function renderizarCartaoPesquisador(sessao) {
  document.getElementById("cartao-pesquisador").innerHTML = `
    <h2 class="titulo-secao">Olá, ${escapeHtml(sessao.nome)}</h2>
    <p class="texto-suave">Município: <strong>${escapeHtml(sessao.municipio)}</strong> ·
      Perfil: ${escapeHtml(sessao.perfil)} · Rodada: ${escapeHtml(sessao.rodada_codigo || "-")}</p>
  `;
}

async function renderizarPendentes() {
  const pendentes = await listarEmAndamento();
  const cartao = document.getElementById("cartao-pendentes");
  const lista = document.getElementById("lista-pendentes");

  if (pendentes.length === 0) {
    cartao.classList.add("oculto");
    return;
  }
  cartao.classList.remove("oculto");

  lista.innerHTML = pendentes
    .map((e) => {
      const totalPerguntas = (config.perguntas?.length || 0) + 7; // socio + eleitoral, contagem aproximada para exibição
      const respondidas = Object.keys(e.respostas || {}).length;
      return `
        <div class="cartao" style="margin-bottom:0.6rem;">
          <p><strong>Iniciada às ${formatarDataHora(e.coletado_em)}</strong></p>
          <p class="texto-suave">${respondidas} de ${totalPerguntas} perguntas respondidas (aprox.)</p>
          <div class="grupo-botoes mt-1">
            <button class="btn btn-primario" data-continuar="${e.session_id}">CONTINUAR</button>
            <button class="btn btn-perigo" data-descartar="${e.session_id}">DESCARTAR</button>
          </div>
        </div>`;
    })
    .join("");

  lista.querySelectorAll("[data-continuar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `coleta.html?session=${encodeURIComponent(btn.dataset.continuar)}`;
    });
  });

  lista.querySelectorAll("[data-descartar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Descartar esta entrevista em andamento? Esta ação não pode ser desfeita.")) return;
      const sessionId = btn.dataset.descartar;
      await registrarEvento(EVENTOS.DESCARTE_ENTREVISTA, { entrevistaSessionId: sessionId });
      await excluirEntrevista(sessionId);
      renderizarPendentes();
    });
  });
}

async function renderizarCotas(sessao) {
  const container = document.getElementById("lista-cotas");
  if (!config.cotas?.exibirParaPesquisador) {
    document.getElementById("cartao-cotas").classList.add("oculto");
    return;
  }

  const cotas = await buscarCotasDoMunicipio(sessao.municipio);
  if (cotas.length === 0) {
    container.innerHTML = `<p class="texto-suave">Nenhuma cota configurada para ${escapeHtml(sessao.municipio)} ainda.</p>`;
    return;
  }

  container.innerHTML = cotas
    .map((c) => {
      const status = calcularStatusCota(c.alvo, c.realizado, config);
      const classe = status === "OK" ? "badge-ok" : status === "ALERTA" ? "badge-alerta" : "badge-erro";
      const partes = [c.sexo, c.faixa_etaria, c.escolaridade, c.regiao].filter(Boolean).join(" · ") || "Geral";
      return `
        <div class="flex-entre" style="padding:0.5rem 0; border-bottom:1px solid var(--cor-borda);">
          <span>${escapeHtml(partes)}</span>
          <span class="mono">${c.realizado} / ${c.alvo} <span class="badge ${classe}">${status}</span></span>
        </div>`;
    })
    .join("");
}

async function main() {
  const sessao = await exigirLoginPesquisador();
  if (!sessao) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();
  iniciarControleFonte();
  iniciarSincronizacaoAutomatica();

  await renderizarCartaoPesquisador(sessao);
  await renderizarPendentes();
  await renderizarCotas(sessao);

  document.getElementById("btn-nova-entrevista").addEventListener("click", () => {
    window.location.href = "coleta.html";
  });

  document.getElementById("btn-atualizar-cotas").addEventListener("click", () => renderizarCotas(sessao));

  document.getElementById("btn-sair").addEventListener("click", async () => {
    if (!confirm("Sair da sessão deste pesquisador neste aparelho?")) return;
    await logoutPesquisador();
    window.location.href = "login.html";
  });
}

main();
