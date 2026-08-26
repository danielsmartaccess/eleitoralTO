// ============================================================================
// js/app.js — comportamento compartilhado do cabeçalho: indicador de conexão
// (Seção 29), controle de tamanho de fonte (Seção 41) e atalho de logout.
// Cada página inclui este módulo depois de ter um elemento
// <div id="status-conexao"> no cabeçalho.
// ============================================================================

import { estaOnline } from "./utils.js";
import { contarPendentes } from "./sync.js";

/**
 * Registra o Service Worker (Seção 53) — chamado uma vez por página.
 *
 * O cache do app shell é "cache-first com atualização em segundo plano"
 * (ver sw.js): a MESMA aba que carrega logo depois de um novo deploy ainda
 * recebe a versão antiga em cache — só a próxima navegação pega a versão
 * nova. Isso é ótimo para coleta.html (nunca interrompe uma entrevista em
 * andamento por causa de um deploy em segundo plano), mas é ruim nas telas
 * de leitura (index/dashboard/relatório/admin/login): usuário reabre o
 * link, o Service Worker novo assume o controle da página (skipWaiting +
 * clients.claim em sw.js), mas o HTML/JS já carregados continuam sendo os
 * antigos até um F5 manual — e "não aparece a novidade" vira dúvida de
 * suporte. `recarregarAoAtualizar` faz essas páginas recarregarem sozinhas
 * assim que o novo Service Worker assume; coleta.js passa `false`.
 */
export function registrarServiceWorker({ recarregarAoAtualizar = true } = {}) {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((erro) => {
      console.warn("Falha ao registrar o Service Worker:", erro);
    });
  });

  if (recarregarAoAtualizar) {
    let jaRecarregou = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (jaRecarregou) return;
      jaRecarregou = true;
      window.location.reload();
    });
  }
}

function elementoStatus() {
  return document.getElementById("status-conexao");
}

async function atualizarIndicador() {
  const el = elementoStatus();
  if (!el) return;

  if (!estaOnline()) {
    el.className = "status-conexao offline";
    el.innerHTML = `<span class="ponto"></span> OFFLINE`;
    return;
  }

  const pendentes = await contarPendentes();
  if (pendentes > 0) {
    el.className = "status-conexao pendente";
    el.innerHTML = `<span class="ponto"></span> ⚠ ${pendentes} aguardando envio`;
  } else {
    el.className = "status-conexao online";
    el.innerHTML = `<span class="ponto"></span> ✓ Tudo sincronizado`;
  }
}

export function iniciarIndicadorConexao() {
  atualizarIndicador();
  window.addEventListener("online", atualizarIndicador);
  window.addEventListener("offline", atualizarIndicador);

  window.addEventListener("sync:inicio", (evt) => {
    const el = elementoStatus();
    if (!el) return;
    el.className = "status-conexao sincronizando";
    el.innerHTML = `<span class="spinner"></span> Sincronizando ${evt.detail.total} entrevista(s)...`;
  });

  window.addEventListener("sync:fim", () => atualizarIndicador());

  setInterval(atualizarIndicador, 20000);
}

// ---------------------------------------------------------------------------
// Acessibilidade: A / A+ / A++ (Seção 41)
// ---------------------------------------------------------------------------
const CHAVE_FONTE = "eleitoral-to-escala-fonte";
const ESCALAS = ["normal", "grande", "enorme"];

export function iniciarControleFonte() {
  const salvo = localStorage.getItem(CHAVE_FONTE) || "normal";
  aplicarEscala(salvo);

  document.querySelectorAll("[data-acao='fonte']").forEach((btn) => {
    btn.addEventListener("click", () => aplicarEscala(btn.dataset.escala));
  });
}

function aplicarEscala(escala) {
  if (!ESCALAS.includes(escala)) escala = "normal";
  document.documentElement.dataset.fonte = escala === "normal" ? "" : escala;
  localStorage.setItem(CHAVE_FONTE, escala);
}
