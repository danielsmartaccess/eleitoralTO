// ============================================================================
// js/inicio.js — tela inicial do pesquisador (index.html).
// Sem autenticação: primeiro escolhe a pesquisa/município (fica salvo no
// aparelho), depois pede o nome do pesquisador uma vez (idem), mostra
// entrevistas em andamento para retomar e o atalho para iniciar uma nova
// entrevista.
// ============================================================================

import { obterNomePesquisador, salvarNomePesquisador, limparNomePesquisador, listarEmAndamento, excluirEntrevista } from "./db.js";
import { iniciarSincronizacaoAutomatica } from "./sync.js";
import { iniciarIndicadorConexao, iniciarControleFonte, registrarServiceWorker } from "./app.js";
import { formatarDataHora, escapeHtml } from "./utils.js";

function config() {
  return window.PESQUISA_CONFIG;
}

function atualizarCabecalho() {
  const c = config();
  if (!c) return;
  const subtitulo = document.getElementById("subtitulo-marca");
  if (subtitulo) subtitulo.textContent = c.pesquisa.nome;
  document.title = c.pesquisa.nome;
}

function renderizarListaPesquisas() {
  const lista = document.getElementById("lista-pesquisas");
  const disponiveis = window.listarPesquisasDisponiveis();

  lista.innerHTML = disponiveis
    .map(
      (p) => `
      <button type="button" class="btn btn-secundario mb-1" data-pesquisa-id="${escapeHtml(p.id)}">
        ${escapeHtml(p.pesquisa.municipio)}
      </button>`
    )
    .join("");

  lista.querySelectorAll("[data-pesquisa-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      window.definirPesquisaSelecionada(btn.dataset.pesquisaId);
      document.getElementById("cartao-selecao-pesquisa").classList.add("oculto");
      atualizarCabecalho();
      await continuarAposEscolherPesquisa();
    });
  });
}

function mostrarSelecaoPesquisa() {
  document.getElementById("cartao-selecao-pesquisa").classList.remove("oculto");
  renderizarListaPesquisas();
}

function renderizarCartaoPesquisador(nome) {
  document.getElementById("cartao-pesquisador").innerHTML = `
    <h2 class="titulo-secao">Olá, ${escapeHtml(nome)}</h2>
    <p class="texto-suave">Pesquisa: <strong>${escapeHtml(config().pesquisa.nome)}</strong></p>
    <p class="texto-suave">Município: <strong>${escapeHtml(config().pesquisa.municipio)}</strong></p>
    <div class="grupo-botoes" style="gap:0.4rem;">
      <button class="btn-texto" id="btn-trocar-pesquisador">Trocar pesquisador</button>
      <button class="btn-texto" id="btn-trocar-pesquisa">Trocar pesquisa</button>
    </div>
  `;
  document.getElementById("btn-trocar-pesquisador").addEventListener("click", async () => {
    if (!confirm("Trocar o pesquisador identificado neste aparelho?")) return;
    await limparNomePesquisador();
    window.location.reload();
  });
  document.getElementById("btn-trocar-pesquisa").addEventListener("click", () => {
    if (!confirm("Trocar a pesquisa/município selecionado neste aparelho?")) return;
    window.limparPesquisaSelecionada();
    window.location.reload();
  });
}

async function renderizarPendentes() {
  const municipioAtual = config().pesquisa.municipio;
  const todas = await listarEmAndamento();
  const pendentes = todas.filter((e) => e.municipio === municipioAtual);

  const cartao = document.getElementById("cartao-pendentes");
  const lista = document.getElementById("lista-pendentes");

  if (pendentes.length === 0) {
    cartao.classList.add("oculto");
    return;
  }
  cartao.classList.remove("oculto");

  lista.innerHTML = pendentes
    .map((e) => {
      const totalPerguntas = config().perguntas?.length || 0;
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
      await excluirEntrevista(btn.dataset.descartar);
      renderizarPendentes();
    });
  });
}

async function mostrarTelaPrincipal(nome) {
  document.getElementById("cartao-identificacao").classList.add("oculto");
  document.getElementById("cartao-pesquisador").classList.remove("oculto");
  document.getElementById("cartao-coleta").classList.remove("oculto");
  document.getElementById("cartao-fonte").classList.remove("oculto");

  atualizarCabecalho();
  renderizarCartaoPesquisador(nome);
  await renderizarPendentes();

  document.getElementById("btn-nova-entrevista").addEventListener("click", () => {
    window.location.href = "coleta.html";
  });
}

function mostrarFormularioIdentificacao() {
  document.getElementById("cartao-identificacao").classList.remove("oculto");
  document.getElementById("form-nome-pesquisador").addEventListener("submit", async (evt) => {
    evt.preventDefault();
    const nome = document.getElementById("input-nome-pesquisador").value.trim();
    if (!nome) return;
    await salvarNomePesquisador(nome);
    await mostrarTelaPrincipal(nome);
  });
}

/** Continua o fluxo (identificação do pesquisador → tela principal) depois
 *  que uma pesquisa/município já está selecionado no aparelho. */
async function continuarAposEscolherPesquisa() {
  const nome = await obterNomePesquisador();
  if (nome) {
    await mostrarTelaPrincipal(nome);
  } else {
    mostrarFormularioIdentificacao();
  }
}

async function main() {
  registrarServiceWorker();
  iniciarIndicadorConexao();
  iniciarControleFonte();
  iniciarSincronizacaoAutomatica();

  const idPesquisaSelecionada = window.obterIdPesquisaSelecionada();
  if (!idPesquisaSelecionada) {
    mostrarSelecaoPesquisa();
    return;
  }

  await continuarAposEscolherPesquisa();
}

main();
