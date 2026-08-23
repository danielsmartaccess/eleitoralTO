// ============================================================================
// js/inicio.js — tela inicial do pesquisador (index.html).
// Sem autenticação: pede o nome do pesquisador uma vez (fica salvo no
// aparelho), mostra entrevistas em andamento para retomar e o atalho para
// iniciar uma nova entrevista.
// ============================================================================

import { obterNomePesquisador, salvarNomePesquisador, limparNomePesquisador, listarEmAndamento, excluirEntrevista } from "./db.js";
import { iniciarSincronizacaoAutomatica } from "./sync.js";
import { iniciarIndicadorConexao, iniciarControleFonte, registrarServiceWorker } from "./app.js";
import { formatarDataHora, escapeHtml } from "./utils.js";

const config = window.PESQUISA_CONFIG;

function renderizarCartaoPesquisador(nome) {
  document.getElementById("cartao-pesquisador").innerHTML = `
    <h2 class="titulo-secao">Olá, ${escapeHtml(nome)}</h2>
    <p class="texto-suave">Município: <strong>${escapeHtml(config.pesquisa.municipio)}</strong></p>
    <button class="btn-texto" id="btn-trocar-pesquisador">Trocar pesquisador</button>
  `;
  document.getElementById("btn-trocar-pesquisador").addEventListener("click", async () => {
    if (!confirm("Trocar o pesquisador identificado neste aparelho?")) return;
    await limparNomePesquisador();
    window.location.reload();
  });
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
      const totalPerguntas = config.perguntas?.length || 0;
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

async function main() {
  registrarServiceWorker();
  iniciarIndicadorConexao();
  iniciarControleFonte();
  iniciarSincronizacaoAutomatica();

  const nome = await obterNomePesquisador();
  if (nome) {
    await mostrarTelaPrincipal(nome);
  } else {
    mostrarFormularioIdentificacao();
  }
}

main();
