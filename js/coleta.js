// ============================================================================
// js/coleta.js — wizard de entrevista (coleta.html). Uma pergunta por tela,
// salvamento progressivo a cada resposta, suporte a retomada e finalização
// com fila de sincronização.
// ============================================================================

import { obterNomePesquisador, salvarEntrevista, obterEntrevista } from "./db.js";
import { getPassos, obterOpcoesOrdenadas, validarResposta, validarVotoDuplicado } from "./questionario.js";
import { sincronizarTudo } from "./sync.js";
import { iniciarIndicadorConexao, iniciarControleFonte, registrarServiceWorker } from "./app.js";
import { gerarSessionId, escapeHtml, codigoCurto, estaOnline, debounce } from "./utils.js";

const config = window.PESQUISA_CONFIG;

let entrevista = null;
let passos = [];
let indiceAtual = 0;
let finalizando = false;

const areaPasso = document.getElementById("area-passo");
const btnVoltar = document.getElementById("btn-voltar");
const btnProxima = document.getElementById("btn-proxima");

// ---------------------------------------------------------------------------
// Inicialização / retomada
// ---------------------------------------------------------------------------

function novaEntrevista(nomePesquisador) {
  const agora = new Date().toISOString();
  return {
    session_id: gerarSessionId(),
    pesquisador: nomePesquisador,
    status: "em_andamento",
    municipio: config.pesquisa.municipio,
    coletado_em: agora,
    duracao_seg: null,
    respostas: {},
    ordem_opcoes: {},
    passo_atual: 0,
    sync_status: "local",
  };
}

async function inicializar() {
  const nomePesquisador = await obterNomePesquisador();
  if (!nomePesquisador) {
    window.location.href = "index.html";
    return;
  }

  registrarServiceWorker();
  iniciarIndicadorConexao();
  iniciarControleFonte();

  passos = getPassos(config);

  const params = new URLSearchParams(window.location.search);
  const sessionIdRetomada = params.get("session");

  if (sessionIdRetomada) {
    const existente = await obterEntrevista(sessionIdRetomada);
    if (existente && existente.status === "em_andamento") {
      entrevista = existente;
      indiceAtual = Math.min(entrevista.passo_atual || 0, passos.length - 1);
    }
  }

  if (!entrevista) {
    entrevista = novaEntrevista(nomePesquisador);
    indiceAtual = 0;
    await salvarEntrevista(entrevista);
  }

  renderizarPasso();
}

// ---------------------------------------------------------------------------
// Leitura/escrita do valor de cada passo no objeto `entrevista`
// ---------------------------------------------------------------------------

function lerValorAtual(passo) {
  // two_votes guarda o estado de seleção (ids, não texto) num namespace à
  // parte de `respostas` — `respostas` só pode conter o formato serializável
  // para o EAV, senão montarRespostasParaSync() geraria uma linha espúria
  // "q7" sem valor.
  if (passo.tipo === "two_votes") return (entrevista.estado_ui || {})[passo.id];
  const resp = entrevista.respostas[passo.id];
  if (!resp) return undefined;
  return resp.valorId ?? resp.valor;
}

function gravarValor(passo, valor, extra = {}) {
  entrevista.respostas[passo.id] = { valor, ...extra };
}

const salvarComDebounce = debounce(() => salvarEntrevista(entrevista), 400);

// ---------------------------------------------------------------------------
// Renderização por tipo de passo
// ---------------------------------------------------------------------------

function renderizarPasso() {
  const passo = passos[indiceAtual];
  document.getElementById("titulo-passo").textContent = "Entrevista";
  document.getElementById("contador-passo").textContent = `${indiceAtual + 1} / ${passos.length}`;
  document.getElementById("barra-progresso").style.width = `${((indiceAtual + 1) / passos.length) * 100}%`;

  btnVoltar.disabled = indiceAtual === 0;
  btnProxima.textContent = indiceAtual === passos.length - 1 ? "FINALIZAR" : "PRÓXIMA";

  const valorAtual = lerValorAtual(passo);
  areaPasso.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "cartao";

  switch (passo.tipo) {
    case "single_choice":
      renderizarSingleChoice(wrap, passo, valorAtual);
      areaPasso.appendChild(wrap);
      break;

    case "open_text":
      renderizarOpenText(wrap, passo, valorAtual);
      areaPasso.appendChild(wrap);
      break;

    case "two_votes":
      renderizarTwoVotes(wrap, passo, valorAtual);
      areaPasso.appendChild(wrap);
      break;

    default:
      wrap.innerHTML = `<p class="pergunta-texto">${escapeHtml(passo.texto)}</p><p class="texto-suave">Tipo de pergunta não implementado.</p>`;
      areaPasso.appendChild(wrap);
  }
}

// obterOpcoesOrdenadas() calcula (e, na primeira vez, embaralha) a ordem de
// exibição e a grava em `entrevista.ordem_opcoes` em memória. Persistimos
// imediatamente aqui — e não só quando o pesquisador responde — porque senão
// um fechamento inesperado do app entre "mostrar a pergunta" e "marcar a
// resposta" perderia a ordem sorteada, e a retomada mostraria uma ordem
// diferente da que o entrevistado já viu.
function obterOpcoesOrdenadasPersistindo(passo) {
  const chaveAntes = JSON.stringify(entrevista.ordem_opcoes?.[passo.id] || null);
  const opcoes = obterOpcoesOrdenadas(passo, entrevista, config);
  const chaveDepois = JSON.stringify(entrevista.ordem_opcoes?.[passo.id] || null);
  if (chaveAntes !== chaveDepois) salvarEntrevista(entrevista);
  return opcoes;
}

function renderizarSingleChoice(wrap, passo, valorAtual) {
  const opcoes = obterOpcoesOrdenadasPersistindo(passo);
  wrap.innerHTML = `
    <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
    <div class="lista-opcoes">
      ${opcoes
        .map(
          (op, idx) => `
        <label class="opcao-escolha ${op.id === valorAtual ? "selecionada" : ""} ${op.id === config.NSNO_ID ? "nsno" : ""}"
               data-idx="${idx}">
          <input type="radio" name="opcao" value="${escapeHtml(op.id)}" ${op.id === valorAtual ? "checked" : ""} />
          ${escapeHtml(op.texto)}
        </label>`
        )
        .join("")}
    </div>
  `;
  wrap.querySelectorAll(".opcao-escolha").forEach((label) => {
    label.addEventListener("click", async () => {
      const idx = Number(label.dataset.idx);
      const op = opcoes[idx];
      wrap.querySelectorAll(".opcao-escolha").forEach((l) => l.classList.remove("selecionada"));
      label.classList.add("selecionada");
      gravarValor(passo, op.texto, { valorId: op.id, valorNum: op.valorNum ?? null, ordemExibicao: idx + 1 });
      await salvarEntrevista(entrevista);
    });
  });
}

function renderizarOpenText(wrap, passo, valorAtual) {
  wrap.innerHTML = `
    <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
    <div class="campo">
      <textarea id="input-aberto" maxlength="${passo.maxLength || 120}"
                placeholder="Digite a resposta espontânea...">${escapeHtml(valorAtual || "")}</textarea>
    </div>
    <div class="chips">
      ${(passo.atalhos || [])
        .map((a) => `<button type="button" class="chip ${valorAtual === a ? "selecionado" : ""}" data-atalho="${escapeHtml(a)}">${escapeHtml(a)}</button>`)
        .join("")}
    </div>
  `;
  const textarea = wrap.querySelector("#input-aberto");
  const gravarTexto = async (valor) => {
    gravarValor(passo, valor);
    wrap.querySelectorAll(".chip").forEach((c) => c.classList.toggle("selecionado", c.dataset.atalho === valor));
    await salvarEntrevista(entrevista);
  };
  textarea.addEventListener("input", (e) => {
    wrap.querySelectorAll(".chip").forEach((c) => c.classList.remove("selecionado"));
    gravarValor(passo, e.target.value);
    salvarComDebounce();
  });
  wrap.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      textarea.value = chip.dataset.atalho;
      gravarTexto(chip.dataset.atalho);
    });
  });
}

function renderizarTwoVotes(wrap, passo, valorAtual) {
  const opcoes = obterOpcoesOrdenadasPersistindo(passo);
  const votoAtual = valorAtual || { voto1: null, voto2: null };

  const opcaoHtml = (votoSelecionado, votoOposto) =>
    opcoes
      .map((op) => {
        const bloqueado = op.id !== config.NSNO_ID && op.id === votoOposto;
        return `<option value="${escapeHtml(op.id)}" ${op.id === votoSelecionado ? "selected" : ""} ${bloqueado ? "disabled" : ""}>${escapeHtml(op.texto)}</option>`;
      })
      .join("");

  wrap.innerHTML = `
    <p class="pergunta-texto">${escapeHtml(passo.texto)}</p>
    <div class="voto-grupo">
      <h3>1º voto</h3>
      <select class="campo" id="select-voto1">
        <option value="">Selecione...</option>
        ${opcaoHtml(votoAtual.voto1, votoAtual.voto2)}
      </select>
    </div>
    <div class="voto-grupo">
      <h3>2º voto</h3>
      <select class="campo" id="select-voto2">
        <option value="">Selecione...</option>
        ${opcaoHtml(votoAtual.voto2, votoAtual.voto1)}
      </select>
    </div>
    <p class="erro-campo oculto" id="erro-voto-duplicado">O mesmo candidato não pode ser escolhido nos dois votos.</p>
  `;

  const s1 = wrap.querySelector("#select-voto1");
  const s2 = wrap.querySelector("#select-voto2");
  const erroEl = wrap.querySelector("#erro-voto-duplicado");

  const atualizar = async () => {
    const voto1 = s1.value || null;
    const voto2 = s2.value || null;
    const check = validarVotoDuplicado({ voto1, voto2 }, config.NSNO_ID);
    erroEl.classList.toggle("oculto", check.valido);
    if (!check.valido) return;

    const opcaoPorId = new Map(opcoes.map((o, idx) => [o.id, { ...o, ordem: idx + 1 }]));
    if (voto1) {
      const o = opcaoPorId.get(voto1);
      entrevista.respostas[`${passo.id}_1voto`] = { valor: o.texto, ordemExibicao: o.ordem };
    } else {
      delete entrevista.respostas[`${passo.id}_1voto`];
    }
    if (voto2) {
      const o = opcaoPorId.get(voto2);
      entrevista.respostas[`${passo.id}_2voto`] = { valor: o.texto, ordemExibicao: o.ordem };
    } else {
      delete entrevista.respostas[`${passo.id}_2voto`];
    }
    entrevista.estado_ui = entrevista.estado_ui || {};
    entrevista.estado_ui[passo.id] = { voto1, voto2 };
    await salvarEntrevista(entrevista);
    renderizarOpcoesDisponiveis();
  };

  function renderizarOpcoesDisponiveis() {
    Array.from(s1.options).forEach((op) => {
      op.disabled = op.value && op.value !== config.NSNO_ID && op.value === s2.value;
    });
    Array.from(s2.options).forEach((op) => {
      op.disabled = op.value && op.value !== config.NSNO_ID && op.value === s1.value;
    });
  }

  s1.addEventListener("change", atualizar);
  s2.addEventListener("change", atualizar);
  renderizarOpcoesDisponiveis();
}

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------

async function avancar() {
  const passo = passos[indiceAtual];
  const valor = lerValorAtual(passo);
  const check = validarResposta(passo, valor);
  if (!check.valido) {
    alert(check.mensagem);
    return;
  }

  if (indiceAtual === passos.length - 1) {
    await finalizarEntrevista();
    return;
  }

  indiceAtual++;
  entrevista.passo_atual = indiceAtual;
  await salvarEntrevista(entrevista);
  renderizarPasso();
  window.scrollTo(0, 0);
}

function voltar() {
  if (indiceAtual === 0) return;
  indiceAtual--;
  entrevista.passo_atual = indiceAtual;
  salvarEntrevista(entrevista);
  renderizarPasso();
  window.scrollTo(0, 0);
}

function calcularDuracaoSegundos(inicioIso, fimIso) {
  const inicio = new Date(inicioIso).getTime();
  const fim = new Date(fimIso).getTime();
  return Math.max(0, Math.round((fim - inicio) / 1000));
}

async function finalizarEntrevista() {
  if (finalizando) return; // evita duplo clique / duplo envio
  finalizando = true;
  btnProxima.disabled = true;
  btnProxima.innerHTML = `<span class="spinner"></span> Finalizando...`;

  const agora = new Date().toISOString();
  entrevista.duracao_seg = calcularDuracaoSegundos(entrevista.coletado_em, agora);
  entrevista.status = "completo";
  entrevista.sync_status = "pendente";
  await salvarEntrevista(entrevista);

  mostrarTelaSucesso();

  // Sincronização é best-effort e não bloqueia a tela de sucesso — a
  // entrevista já está segura no IndexedDB independentemente do resultado.
  if (estaOnline()) sincronizarTudo();
}

function mostrarTelaSucesso() {
  document.getElementById("sucesso-codigo").textContent = "#" + codigoCurto(entrevista.session_id);
  const statusEl = document.getElementById("sucesso-status");

  if (estaOnline()) {
    document.getElementById("sucesso-titulo").textContent = "ENTREVISTA REGISTRADA";
    statusEl.innerHTML = `
      <p>✓ Salva neste dispositivo</p>
      <p id="linha-sync-status">↻ Enviando ao servidor...</p>
    `;
    window.addEventListener(
      "sync:fim",
      async () => {
        const linha = document.getElementById("linha-sync-status");
        if (!linha) return;
        // Reler do IndexedDB em vez de confiar na variável `entrevista` em
        // memória: js/sync.js opera sobre a sua própria cópia lida do banco
        // local, então o objeto aqui nunca é mutado por ele — só o registro
        // salvo é que reflete o resultado real.
        const atual = await obterEntrevista(entrevista.session_id);
        linha.textContent =
          atual?.sync_status === "sincronizado" ? "✓ Sincronizada com o servidor" : "⚠ Ainda na fila — será reenviada automaticamente";
      },
      { once: true }
    );
  } else {
    document.getElementById("sucesso-titulo").textContent = "ENTREVISTA SALVA";
    statusEl.innerHTML = `
      <p>✓ Salva neste dispositivo</p>
      <p class="texto-suave">A entrevista está segura neste aparelho e será enviada automaticamente quando houver conexão.</p>
    `;
  }

  document.getElementById("rodape-navegacao").classList.add("oculto");
  document.getElementById("tela-sucesso").classList.remove("oculto");
}

btnVoltar.addEventListener("click", voltar);
btnProxima.addEventListener("click", avancar);
document.getElementById("btn-nova-apos-sucesso").addEventListener("click", () => {
  window.location.href = "coleta.html";
});
document.getElementById("btn-inicio-apos-sucesso").addEventListener("click", () => {
  window.location.href = "index.html";
});

inicializar();
