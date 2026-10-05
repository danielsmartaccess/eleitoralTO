// ============================================================================
// js/desempenho.js — página "Pesquisa × Urna" (desempenho.html).
//
// Cruza, município a município, as pesquisas realizadas ANTES do 1º turno
// com o resultado oficial do TSE (data/urna-2026.json, gerado por
// scripts/gerar-urna-2026.js). As métricas vivem em js/acuracia.js.
//
// Regras herdadas do dashboard: página pública, lê só a view
// vw_respostas_dashboard e NUNCA exibe N nem contagem de entrevistas — só
// percentuais e pontos percentuais. A margem de erro de cada pesquisa é
// usada internamente (indicador "dentro da margem"), sem ser exibida.
//
// "Visão pública" × "Visão analítica": até o 2º turno (25/10), a visão
// pública não mostra percentuais por candidato das disputas que seguem em
// 2º turno (Presidente; Governador no TO) — divulgar intenção de voto de
// candidato em disputa aberta exige registro da pesquisa no PesqEle
// (Lei 9.504/97, art. 33; Res. TSE 23.600/2019). A visão analítica mostra
// tudo e é para uso interno/apresentação reservada.
// ============================================================================

import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { debounce, escapeHtml } from "./utils.js";
import {
  compararMajoritaria, compararProporcional, compararReferencia, correlacao, diasAteEleicao,
  media, taxa, viesPorCandidato,
} from "./acuracia.js";

const DATA_ELEICAO = "2026-10-04";
const DATA_SEGUNDO_TURNO = "2026-10-25";
// 00h de 04/10 em Brasília: só entra entrevista feita antes do dia da eleição.
const CORTE_COLETA = "2026-10-04T03:00:00Z";
const FUSO = "America/Sao_Paulo";
const BASE_MINIMA = 30;
const DIAS_RETA_FINAL = 7;
const MIN_NOMES_TOP3 = 6; // "no top-3" só tem sentido com lista de 6+ nomes
const LOTE_CONSULTAS = 4;

const DISPUTAS = [
  { chave: "presidente", titulo: "Presidente", papel: "presidente1Turno", ref: "presidente", tipo: "majoritaria" },
  { chave: "governador", titulo: "Governador", papel: "governadorEstimulada", ref: "governador", tipo: "majoritaria" },
  { chave: "senado", titulo: "Senado", papel: "senado", ref: "senado", tipo: "senado" },
  { chave: "depfed", titulo: "Dep. Federal", papel: "depFederalEstimulada", ref: "deputadoFederal", tipo: "proporcional" },
  { chave: "depest", titulo: "Dep. Estadual", papel: "depEstadualEstimulada", ref: "deputadoEstadual", tipo: "proporcional" },
];
const MAJORITARIAS = DISPUTAS.filter((d) => d.tipo !== "proporcional");
const NOME_UF = { TO: "Tocantins", MA: "Maranhão" };

const estado = {
  urna: null,
  auditorias: [],
  excluidas: [],
  uf: "",
  visao: new URLSearchParams(location.search).get("visao") === "analitica" ? "analitica" : "publica",
  municipio: null,
};

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------
const fmt = (n, casas = 1) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtSinal = (n) => (n == null ? "—" : `${n > 0.05 ? "+" : n < -0.05 ? "−" : ""}${fmt(Math.abs(n))}`);
const fmtPct = (a, t) => (t ? `${Math.round((100 * a) / t)}%` : "—");
const fmtDataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const dataLocal = (instante) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(instante));

function sinal(status, texto = "") {
  const mapa = { ok: ["✓", "sinal-ok", "acertou"], erro: ["✗", "sinal-erro", "errou"], empate: ["≈", "sinal-empate", "empate na pesquisa"] };
  const [glifo, classe, leitura] = mapa[status];
  return `<span class="sinal ${classe}" aria-hidden="true">${glifo}</span><span class="sr">${leitura}</span>${texto ? `<span class="sinal-texto">${escapeHtml(texto)}</span>` : ""}`;
}

function statusVencedor(c, campo = "acertouVencedor") {
  if (!c) return null;
  if (c.empatePesquisa) return "empate";
  return c[campo] ? "ok" : "erro";
}

// ---------------------------------------------------------------------------
// Regras de exibição
// ---------------------------------------------------------------------------
function hojeLocal() {
  return dataLocal(Date.now());
}

function disputaEmSegundoTurno(chave, uf) {
  const u = estado.urna;
  if (chave === "presidente") return u.brasil.presidente.candidatos[0].pct <= 50;
  if (chave === "governador") return (u.uf[uf]?.governador.candidatos[0].pct ?? 100) <= 50;
  return false;
}

/** Na visão pública, até o 2º turno, percentual de candidato em disputa aberta não aparece. */
function ocultarPercentuais(chave, uf) {
  return estado.visao === "publica" && hojeLocal() <= DATA_SEGUNDO_TURNO && disputaEmSegundoTurno(chave, uf);
}

function auditoriasVisiveis() {
  return estado.auditorias.filter((a) => !estado.uf || a.uf === estado.uf);
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------
async function carregarUrna() {
  const resp = await fetch("data/urna-2026.json", { cache: "no-cache" });
  if (!resp.ok) throw new Error(`Resultado oficial indisponível (HTTP ${resp.status})`);
  return resp.json();
}

async function buscarPaginado(montarConsulta) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montarConsulta().range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

/** Busca as respostas de uma pesquisa e monta as comparações com a urna. */
async function auditarPesquisa(cfg) {
  const municipio = cfg.pesquisa.municipio;
  const sem = cfg.perguntasSemanticas || {};
  const q = Object.fromEntries(DISPUTAS.map((d) => [d.chave, sem[d.papel] || null]));
  const questoes = DISPUTAS.flatMap((d) => {
    const id = q[d.chave];
    if (!id) return [];
    return d.tipo === "senado" ? [`${id}_1voto`, `${id}_2voto`] : [id];
  });
  const questoesOrdem = DISPUTAS.map((d) => q[d.chave]).filter(Boolean).map((id) => `${id}__ordem`);

  const [respostas, ordens] = await Promise.all([
    buscarPaginado(() => supabase.from("vw_respostas_dashboard").select("questao,valor,coletado_em")
      .eq("municipio", municipio).in("questao", questoes).lt("coletado_em", CORTE_COLETA).order("resposta_id")),
    // Log de randomização: diz quais candidatos o disco de fato apresentou
    // naquele município (ex.: Augusto Cury só entrou no disco a partir de
    // Porto Nacional). Amostra das entrevistas mais recentes basta — o disco
    // não muda dentro de uma mesma coleta.
    supabase.from("vw_respostas_dashboard").select("questao,valor")
      .eq("municipio", municipio).in("questao", questoesOrdem).lt("coletado_em", CORTE_COLETA)
      .order("coletado_em", { ascending: false }).limit(60 * questoesOrdem.length),
  ]);
  if (ordens.error) throw ordens.error;

  const contagens = {};
  const instantes = [];
  for (const r of respostas) {
    const c = (contagens[r.questao] ||= {});
    c[r.valor] = (c[r.valor] || 0) + 1;
    if (r.questao === q.presidente) instantes.push(r.coletado_em);
  }
  const n = instantes.length; // Presidente é obrigatória: uma linha por entrevista completa
  if (n < BASE_MINIMA) return { excluida: true, municipio, motivo: "base abaixo do mínimo de leitura" };

  const ofertados = {};
  for (const d of DISPUTAS) {
    const id = q[d.chave];
    if (!id) continue;
    const textoPorId = new Map((cfg.candidatos[d.ref] || []).map((c) => [c.id, c.texto]));
    const conjunto = new Set();
    for (const o of ordens.data) {
      if (o.questao !== `${id}__ordem`) continue;
      for (const opcao of String(o.valor).split(",")) if (textoPorId.has(opcao)) conjunto.add(textoPorId.get(opcao));
    }
    ofertados[d.chave] = conjunto.size ? conjunto : null;
  }

  const semNsno = (contagem) => {
    const copia = { ...(contagem || {}) };
    delete copia[cfg.NSNO_TEXTO];
    return copia;
  };
  const urnaMun = estado.urna.municipios[municipio];
  const comparacoes = {};
  for (const d of DISPUTAS) {
    const id = q[d.chave];
    if (!id || !urnaMun[d.chave]) { comparacoes[d.chave] = null; continue; }
    if (d.tipo === "proporcional") {
      comparacoes[d.chave] = compararProporcional({
        contagem: semNsno(contagens[id]), testados: urnaMun[d.chave].testados, ofertados: ofertados[d.chave],
      });
      continue;
    }
    let contagem = semNsno(contagens[id]);
    if (d.tipo === "senado") {
      contagem = semNsno(contagens[`${id}_1voto`]);
      for (const [k, v] of Object.entries(semNsno(contagens[`${id}_2voto`]))) contagem[k] = (contagem[k] || 0) + v;
    }
    comparacoes[d.chave] = compararMajoritaria({
      contagem, candidatosUrna: urnaMun[d.chave].candidatos, ofertados: ofertados[d.chave], n, doisVotos: d.tipo === "senado",
    });
  }

  instantes.sort();
  const campoFim = dataLocal(instantes[instantes.length - 1]);
  return {
    municipio,
    uf: urnaMun.uf,
    campoInicio: dataLocal(instantes[0]),
    campoFim,
    dias: diasAteEleicao(campoFim, DATA_ELEICAO),
    comparacoes,
  };
}

async function carregarAuditorias() {
  const pesquisas = window.listarPesquisasDisponiveis();
  const elegiveis = [];
  for (const p of pesquisas) {
    const m = p.pesquisa.municipio;
    if (estado.urna.recortes[m]) {
      estado.excluidas.push({ municipio: m, motivo: "recorte territorial (povoado): a urna só tem resultado do município inteiro" });
    } else if (estado.urna.municipios[m]) {
      elegiveis.push(p);
    }
  }
  for (let i = 0; i < elegiveis.length; i += LOTE_CONSULTAS) {
    const lote = await Promise.all(elegiveis.slice(i, i + LOTE_CONSULTAS).map(auditarPesquisa));
    for (const r of lote) (r.excluida ? estado.excluidas : estado.auditorias).push(r);
  }
  const ordemUf = { TO: 0, MA: 1 };
  estado.auditorias.sort((a, b) => ordemUf[a.uf] - ordemUf[b.uf] || a.campoFim.localeCompare(b.campoFim));
}

// ---------------------------------------------------------------------------
// Agregados
// ---------------------------------------------------------------------------
function agregados(lista) {
  const comps = (chave) => lista.map((a) => a.comparacoes[chave]);
  const erro = (chave, sub = lista) => media(sub.map((a) => a.comparacoes[chave]?.erroMedio).filter((x) => x != null));
  const retaFinal = lista.filter((a) => a.dias <= DIAS_RETA_FINAL);
  const demais = lista.filter((a) => a.dias > DIAS_RETA_FINAL);
  const dentro = { dentro: 0, total: 0 };
  for (const a of lista) {
    for (const d of MAJORITARIAS) {
      const dm = a.comparacoes[d.chave]?.dentroDaMargem;
      if (dm) { dentro.dentro += dm.dentro; dentro.total += dm.total; }
    }
  }
  const top3 = (chave) => taxa(comps(chave).filter((c) => c && c.nomesComparados >= MIN_NOMES_TOP3), (c) => c.liderUrnaNoTop3);
  return {
    total: lista.length,
    presidente: taxa(comps("presidente"), (c) => c.acertouVencedor),
    governador: taxa(comps("governador"), (c) => c.acertouVencedor),
    senadoUm: taxa(comps("senado"), (c) => c.doisMaisVotadosAcertados >= 1),
    senadoDois: taxa(comps("senado"), (c) => c.doisMaisVotadosAcertados === 2),
    depest: taxa(comps("depest"), (c) => c.acertouLider),
    depfed: taxa(comps("depfed"), (c) => c.acertouLider),
    depestTop3: top3("depest"),
    depfedTop3: top3("depfed"),
    erro: Object.fromEntries(DISPUTAS.map((d) => [d.chave, erro(d.chave)])),
    erroMargemPres: media(comps("presidente").filter((c) => c?.erroMargem != null).map((c) => Math.abs(c.erroMargem))),
    retaFinal: {
      municipios: retaFinal.length,
      presidente: erro("presidente", retaFinal), governador: erro("governador", retaFinal),
      presidenteDemais: erro("presidente", demais), governadorDemais: erro("governador", demais),
    },
    dentroDaMargem: dentro,
  };
}

function erroMajoritario(a) {
  return media(MAJORITARIAS.map((d) => a.comparacoes[d.chave]?.erroMedio).filter((x) => x != null));
}

function referenciasDoMercado() {
  const u = estado.urna;
  return u.referenciasMercado
    .filter((r) => !estado.uf || r.escopo === "Brasil" || r.escopo === estado.uf)
    .map((r) => {
      const urna = r.escopo === "Brasil" ? u.brasil.presidente : u.uf[r.escopo][r.disputa];
      return { ...r, comparacao: compararReferencia(r.valores, urna.candidatos) };
    });
}

/** Viés por candidato de uma disputa numa UF, com consistência de sentido. */
function viesDaDisputa(lista, chave) {
  return viesPorCandidato(lista.map((a) => ({ municipio: a.municipio, comparacao: a.comparacoes[chave] })), 3)
    .map((v) => ({
      ...v,
      mesmoSentido: v.erros.filter((e) => Math.sign(e.erro) === Math.sign(v.media)).length,
    }));
}

// ---------------------------------------------------------------------------
// Tooltip compartilhado (conteúdo sempre via textContent)
// ---------------------------------------------------------------------------
const conteudoDica = new WeakMap();

function ligarDica(el, montar) {
  conteudoDica.set(el, montar);
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
}

function iniciarDicas() {
  const dica = document.getElementById("dica");
  const mostrar = (alvo, x, y) => {
    const montar = conteudoDica.get(alvo);
    if (!montar) return;
    const { titulo, linhas } = montar();
    dica.replaceChildren();
    const t = document.createElement("div");
    t.className = "dica-titulo";
    t.textContent = titulo;
    dica.append(t);
    for (const l of linhas) {
      const linha = document.createElement("div");
      linha.className = "dica-linha";
      if (l.cor) {
        const chave = document.createElement("span");
        chave.className = "dica-chave";
        chave.style.background = l.cor;
        linha.append(chave);
      }
      const valor = document.createElement("strong");
      valor.textContent = l.valor;
      const rotulo = document.createElement("span");
      rotulo.textContent = l.rotulo;
      linha.append(valor, rotulo);
      dica.append(linha);
    }
    dica.hidden = false;
    const { width, height } = dica.getBoundingClientRect();
    const px = Math.min(x + 14, window.innerWidth - width - 8);
    const py = y + 14 + height > window.innerHeight ? y - height - 10 : y + 14;
    dica.style.left = `${Math.max(8, px)}px`;
    dica.style.top = `${Math.max(8, py)}px`;
  };
  const alvoDe = (ev) => {
    let el = ev.target;
    while (el && el !== document.body) {
      if (conteudoDica.has(el)) return el;
      el = el.parentElement;
    }
    return null;
  };
  document.addEventListener("pointermove", (ev) => {
    const alvo = alvoDe(ev);
    if (alvo) mostrar(alvo, ev.clientX, ev.clientY);
    else dica.hidden = true;
  });
  document.addEventListener("focusin", (ev) => {
    const alvo = alvoDe(ev);
    if (!alvo) { dica.hidden = true; return; }
    const r = alvo.getBoundingClientRect();
    mostrar(alvo, r.left + r.width / 2, r.bottom);
  });
  document.addEventListener("focusout", () => { dica.hidden = true; });
  window.addEventListener("scroll", () => { dica.hidden = true; }, { passive: true });
}

// ---------------------------------------------------------------------------
// Renderização — KPIs
// ---------------------------------------------------------------------------
function classeTaxa({ acertos, total }) {
  if (!total) return "vazio";
  const r = acertos / total;
  return r >= 0.75 ? "positivo" : r >= 0.5 ? "neutro" : "negativo";
}

function tileTaxa(rotulo, t, detalhe) {
  return `<article class="kpi ${classeTaxa(t)}">
    <div class="kpi-rotulo"><span class="ponto"></span>${escapeHtml(rotulo)}</div>
    <div class="kpi-valor">${t.acertos}/${t.total}<small>${fmtPct(t.acertos, t.total)}</small></div>
    <div class="kpi-detalhe">${detalhe}</div>
  </article>`;
}

function renderizarKpis(ag) {
  const rf = ag.retaFinal;
  const tiles = [
    tileTaxa("Presidente · vencedor no município", ag.presidente, `Erro médio por candidato: <strong>${fmt(ag.erro.presidente)} p.p.</strong>`),
    tileTaxa("Governador · vencedor no município", ag.governador, `Erro médio por candidato: <strong>${fmt(ag.erro.governador)} p.p.</strong>`),
    tileTaxa("Senado · 1 dos 2 mais votados", ag.senadoUm, `Os dois: ${ag.senadoDois.acertos}/${ag.senadoDois.total} · erro médio <strong>${fmt(ag.erro.senado)} p.p.</strong>`),
    tileTaxa("Dep. Estadual · mais votado", ag.depest, `No top-3 da pesquisa: ${ag.depestTop3.acertos}/${ag.depestTop3.total}* · erro médio <strong>${fmt(ag.erro.depest)} p.p.</strong>`),
    tileTaxa("Dep. Federal · mais votado", ag.depfed, `No top-3 da pesquisa: ${ag.depfedTop3.acertos}/${ag.depfedTop3.total}* · erro médio <strong>${fmt(ag.erro.depfed)} p.p.</strong>`),
  ];
  if (rf.municipios >= 2) {
    tiles.push(`<article class="kpi">
      <div class="kpi-rotulo"><span class="ponto"></span>Reta final · campo a ≤ ${DIAS_RETA_FINAL} dias</div>
      <div class="kpi-valor">${fmt(media([rf.presidente, rf.governador].filter((x) => x != null)))}<small>p.p.</small></div>
      <div class="kpi-detalhe">Erro médio Presidente + Governador em ${rf.municipios} municípios (demais: ${fmt(media([rf.presidenteDemais, rf.governadorDemais].filter((x) => x != null)))} p.p.)</div>
    </article>`);
  }
  document.getElementById("kpis").innerHTML = tiles.join("");
}

// ---------------------------------------------------------------------------
// Renderização — leitura executiva
// ---------------------------------------------------------------------------
function frasesDeVies(lista) {
  const frases = [];
  const ufs = estado.uf ? [estado.uf] : ["TO", "MA"];
  for (const uf of ufs) {
    const daUf = lista.filter((a) => a.uf === uf);
    for (const chave of ["presidente", "governador"]) {
      const forte = viesDaDisputa(daUf, chave)
        .filter((v) => Math.abs(v.media) >= 5 && v.mesmoSentido / v.erros.length >= 0.75)
        .sort((a, b) => Math.abs(b.media) - Math.abs(a.media))[0];
      if (!forte) continue;
      const titulo = DISPUTAS.find((d) => d.chave === chave).titulo;
      if (ocultarPercentuais(chave, uf)) {
        frases.push(`${titulo} (${uf}): erro na mesma direção em ${forte.mesmoSentido} de ${forte.erros.length} municípios — viés sistemático, não acaso (detalhe na visão analítica).`);
      } else {
        frases.push(`${titulo} (${uf}): <span class="destaque">${escapeHtml(forte.rotulo)} ficou ${fmt(Math.abs(forte.media))} p.p. ${forte.media < 0 ? "abaixo" : "acima"} da urna</span> em média, no mesmo sentido em ${forte.mesmoSentido} de ${forte.erros.length} municípios.`);
      }
    }
  }
  return frases;
}

function renderizarLeitura(lista, ag) {
  const mercado = referenciasDoMercado();
  const erroMercado = (disputa) => media(mercado.filter((r) => r.disputa === disputa && r.escopo !== "Brasil").map((r) => r.comparacao.erroMedio));
  const rf = ag.retaFinal;
  const dispersao = lista.filter((a) => erroMajoritario(a) != null);
  const r = correlacao(dispersao.map((a) => a.dias), dispersao.map(erroMajoritario));

  const senadoMercado = erroMercado("senado");
  const distSenado = ag.erro.senado - senadoMercado;
  const forcas = [
    `<span class="destaque">Deputado Estadual: o líder da nossa pesquisa foi o mais votado na urna em ${ag.depest.acertos} de ${ag.depest.total} municípios</span> (entre os nomes testados), com erro médio de ${fmt(ag.erro.depest)} p.p. — leitura de território que pesquisa estadual não entrega.`,
    `Presidente: apontamos o vencedor do município em ${ag.presidente.acertos} de ${ag.presidente.total}; Governador, em ${ag.governador.acertos} de ${ag.governador.total}.`,
    `Senado: erro médio de ${fmt(ag.erro.senado)} p.p. por candidato — ${distSenado <= 0
      ? "igual ou melhor que a régua de mercado"
      : `${fmt(distSenado)} p.p. acima da régua de mercado`} (Quaest, véspera, agregado estadual: ${fmt(senadoMercado)} p.p.), numa disputa difícil para todos os institutos.`,
  ];
  if (rf.municipios >= 2) {
    forcas.push(`Reta final: nas ${rf.municipios} pesquisas com campo a até ${DIAS_RETA_FINAL} dias da eleição, o erro médio caiu para ${fmt(rf.presidente)} p.p. em Presidente e ${fmt(rf.governador)} p.p. em Governador.`);
  }

  const atencao = [
    `Precisão numérica nas majoritárias abaixo do padrão de mercado: erro médio de <span class="destaque">${fmt(ag.erro.presidente)} p.p. em Presidente e ${fmt(ag.erro.governador)} p.p. em Governador</span> (Quaest, Governador, véspera: ${fmt(erroMercado("governador"))} p.p.).`,
    ...frasesDeVies(lista),
    `Causa provável: cobertura amostral — campo concentrado na sede, sem cotas de sexo, idade e escolaridade e sem ponderação pelo perfil do eleitorado. A antecedência explica pouco (correlação dias × erro: r = ${fmt(r, 2)}).`,
  ];

  const valor = [
    `<span class="destaque">Transparência:</span> publicamos o placar completo contra a urna — acertos e erros — com a mesma régua usada para avaliar Datafolha, Quaest e AtlasIntel.`,
    `<span class="destaque">Inteligência local:</span> saber quem lidera a disputa em cada cidade orienta alianças, agenda e investimento de campanha — e foi onde a pesquisa municipal mais entregou.`,
    `<span class="destaque">Método reforçado para o 2º turno:</span> cotas e ponderação pelo eleitorado oficial (TSE), amostra por local de votação (sede e zona rural) e calibração pelo voto do 1º turno, que agora é conhecido.`,
  ];

  const cartao = (classe, titulo, itens) =>
    `<article class="cartao cartao-leitura ${classe}"><h3>${titulo}</h3><ul>${itens.map((i) => `<li>${i}</li>`).join("")}</ul></article>`;
  document.getElementById("leitura-executiva").innerHTML =
    cartao("forca", "Onde a pesquisa entregou", forcas) +
    cartao("atencao", "Onde erramos — e por quê", atencao) +
    cartao("acao", "Por que isso importa para a sua campanha", valor);
}

// ---------------------------------------------------------------------------
// Renderização — placar por município
// ---------------------------------------------------------------------------
function celulaMajoritaria(c, chave) {
  if (!c) return `<td class="texto-suave">—</td>`;
  const st = chave === "senado" ? null : statusVencedor(c);
  const topo = chave === "senado"
    ? sinal(c.doisMaisVotadosAcertados >= 1 ? "ok" : "erro", `${c.doisMaisVotadosAcertados}/2`)
    : sinal(st);
  return `<td>${topo}<span class="sub">${fmt(c.erroMedio)} p.p.</span></td>`;
}

function celulaProporcional(c) {
  if (!c) return `<td class="texto-suave">—</td>`;
  return `<td>${sinal(statusVencedor(c, "acertouLider"))}<span class="sub">${fmt(c.erroMedio)} p.p.</span></td>`;
}

function renderizarPlacar(lista) {
  const cab = `<thead><tr><th>Município</th><th>Campo</th><th>Dias antes</th>
    ${DISPUTAS.map((d) => `<th>${d.titulo}</th>`).join("")}</tr></thead>`;
  const corpo = lista.map((a) => `<tr data-municipio="${escapeHtml(a.municipio)}" class="${a.municipio === estado.municipio ? "selecionada" : ""}">
      <th scope="row">${escapeHtml(a.municipio)}<span class="uf">${a.uf}</span></th>
      <td>${fmtDataCurta(a.campoInicio)}${a.campoInicio !== a.campoFim ? `–${fmtDataCurta(a.campoFim)}` : ""}</td>
      <td>${a.dias}</td>
      ${celulaMajoritaria(a.comparacoes.presidente, "presidente")}
      ${celulaMajoritaria(a.comparacoes.governador, "governador")}
      ${celulaMajoritaria(a.comparacoes.senado, "senado")}
      ${celulaProporcional(a.comparacoes.depfed)}
      ${celulaProporcional(a.comparacoes.depest)}
    </tr>`).join("");
  const tabela = document.getElementById("tabela-placar");
  tabela.innerHTML = cab + `<tbody>${corpo}</tbody>`;
  tabela.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      selecionarMunicipio(tr.dataset.municipio);
      document.getElementById("seletor-municipio").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

// ---------------------------------------------------------------------------
// Renderização — detalhe (gráfico haltere)
// ---------------------------------------------------------------------------
function escalaMaxima(valores) {
  return Math.max(10, Math.ceil(Math.max(...valores) / 10) * 10);
}

function halter(linhas, { titulo }) {
  const max = escalaMaxima(linhas.flatMap((l) => [l.pesquisa, l.urna]));
  const pos = (v) => `${(100 * v) / max}%`;
  const ticks = [0, max / 2, max];
  const wrap = document.createElement("div");
  wrap.className = "halter";
  for (const l of linhas) {
    const linha = document.createElement("div");
    linha.className = "halter-linha";
    const ini = Math.min(l.pesquisa, l.urna), fim = Math.max(l.pesquisa, l.urna);
    linha.innerHTML = `<div class="halter-nome"></div>
      <div class="halter-trilha">
        ${ticks.slice(1).map((t) => `<span class="halter-grade" style="left:${pos(t)}"></span>`).join("")}
        <span class="halter-elo" style="left:${pos(ini)};width:calc(${pos(fim)} - ${pos(ini)})"></span>
        <span class="marcador marcador-pesquisa" style="left:${pos(l.pesquisa)}"></span>
        <span class="marcador marcador-urna" style="left:${pos(l.urna)}"></span>
      </div>
      <div class="halter-valores">P ${fmt(l.pesquisa)} · <strong>U ${fmt(l.urna)}</strong><br>Δ ${fmtSinal(l.erro)}</div>`;
    linha.querySelector(".halter-nome").textContent = l.rotulo;
    ligarDica(linha, () => ({
      titulo: `${l.rotulo}${l.partido ? ` (${l.partido})` : ""} — ${titulo}`,
      linhas: [
        { cor: "#6da7ec", valor: `${fmt(l.pesquisa)}%`, rotulo: "pesquisa (votos válidos)" },
        { cor: "#0d366b", valor: `${fmt(l.urna)}%`, rotulo: "urna (TSE)" },
        { valor: `${fmtSinal(l.erro)} p.p.`, rotulo: "diferença" },
      ],
    }));
    wrap.append(linha);
  }
  const eixo = document.createElement("div");
  eixo.className = "halter-eixo";
  eixo.innerHTML = `<span></span><div class="ticks">${ticks.map((t) => `<span style="left:${pos(t)}">${fmt(t, 0)}%</span>`).join("")}</div><span></span>`;
  wrap.append(eixo);
  return wrap;
}

function chip(html) {
  return `<span class="chip">${html}</span>`;
}

function chipsMajoritaria(c, chave, restrito = false) {
  const lista = [];
  if (chave === "senado") {
    lista.push(chip(`2 mais votados na pesquisa: <strong>${c.doisMaisVotadosAcertados}/2</strong>`));
  } else {
    lista.push(chip(`${sinal(statusVencedor(c))} Vencedor no município`));
  }
  lista.push(chip(`Erro médio <strong>${fmt(c.erroMedio)} p.p.</strong>`));
  // Erro na margem + resultado oficial (público) reconstroem a vantagem medida
  // pela pesquisa — por isso some junto com os percentuais na visão pública.
  if (c.erroMargem != null && !restrito) lista.push(chip(`Erro na margem 1º–2º <strong>${fmtSinal(c.erroMargem)} p.p.</strong>`));
  if (c.pctForaDoDisco >= 0.5) lista.push(chip(`Fora do disco: <strong>${fmt(c.pctForaDoDisco)}%</strong> na urna`));
  return `<div class="chips">${lista.join("")}</div>`;
}

function renderizarDetalhe() {
  const alvo = document.getElementById("detalhe-municipio");
  alvo.replaceChildren();
  const a = estado.auditorias.find((x) => x.municipio === estado.municipio);
  if (!a) return;
  for (const d of DISPUTAS) {
    const c = a.comparacoes[d.chave];
    if (!c) continue;
    const painel = document.createElement("section");
    painel.className = "painel-disputa";
    const h = document.createElement("h4");
    h.textContent = d.titulo;
    painel.append(h);
    const nota = document.createElement("p");
    nota.className = "nota-painel";
    if (d.tipo === "proporcional") {
      const naoLoc = estado.urna.municipios[a.municipio][d.chave].naoLocalizados;
      nota.textContent = `Entre os ${c.nomesComparados} nomes testados no disco e localizados na urna (pesquisa e urna renormalizadas entre eles).`
        + (naoLoc.length ? ` Não localizado na urna: ${naoLoc.join(", ")}.` : "");
    } else if (d.tipo === "senado") {
      nota.textContent = "Menções do 1º + 2º voto × % dos votos válidos para o Senado.";
    } else {
      nota.textContent = "Votos válidos: a pesquisa exclui NS/NO e é renormalizada entre os candidatos do disco.";
    }
    painel.append(nota);

    if (d.tipo === "proporcional") {
      painel.append(halter(c.linhas, { titulo: d.titulo }));
      painel.insertAdjacentHTML("beforeend", `<div class="chips">${chip(`${sinal(statusVencedor(c, "acertouLider"))} Mais votado entre os testados`)}${chip(`Erro médio <strong>${fmt(c.erroMedio)} p.p.</strong>`)}</div>`);
    } else if (ocultarPercentuais(d.chave, a.uf)) {
      painel.insertAdjacentHTML("beforeend", `<div class="painel-restrito">Disputa com 2º turno em andamento: os percentuais por candidato ficam na visão analítica (uso interno) até ${fmtDataCurta(DATA_SEGUNDO_TURNO)}. Os indicadores de acerto abaixo são públicos.</div>`);
      painel.insertAdjacentHTML("beforeend", chipsMajoritaria(c, d.chave, true));
    } else {
      painel.append(halter(c.linhas, { titulo: d.titulo }));
      painel.insertAdjacentHTML("beforeend", chipsMajoritaria(c, d.chave));
    }
    alvo.append(painel);
  }
}

function preencherSeletor(lista) {
  const sel = document.getElementById("seletor-municipio");
  if (!lista.some((a) => a.municipio === estado.municipio)) estado.municipio = lista[0]?.municipio || null;
  sel.innerHTML = lista.map((a) => `<option value="${escapeHtml(a.municipio)}">${escapeHtml(a.municipio)} (${a.uf})</option>`).join("");
  sel.value = estado.municipio || "";
}

function selecionarMunicipio(municipio) {
  estado.municipio = municipio;
  document.getElementById("seletor-municipio").value = municipio;
  document.querySelectorAll("#tabela-placar tbody tr").forEach((tr) => tr.classList.toggle("selecionada", tr.dataset.municipio === municipio));
  renderizarDetalhe();
}

// ---------------------------------------------------------------------------
// Renderização — diagnóstico de viés (barras divergentes + pontos)
// ---------------------------------------------------------------------------
function renderizarVies(lista) {
  const alvo = document.getElementById("diagnostico-vies");
  alvo.replaceChildren();
  const ufs = estado.uf ? [estado.uf] : ["TO", "MA"];
  for (const uf of ufs) {
    const daUf = lista.filter((a) => a.uf === uf);
    const grupos = MAJORITARIAS
      .filter((d) => !ocultarPercentuais(d.chave, uf))
      .map((d) => ({ d, vies: viesDaDisputa(daUf, d.chave) }))
      .filter((g) => g.vies.length);
    const cartao = document.createElement("section");
    cartao.className = "cartao";
    cartao.innerHTML = `<div class="grafico-cabecalho"><h3 class="titulo-grafico">${NOME_UF[uf]}</h3></div>`;
    if (!grupos.length) {
      cartao.insertAdjacentHTML("beforeend", `<p class="texto-suave">Sem disputas exibíveis nesta visão.</p>`);
      alvo.append(cartao);
      continue;
    }
    const maxAbs = Math.max(5, ...grupos.flatMap((g) => g.vies.flatMap((v) => v.erros.map((e) => Math.abs(e.erro)))));
    const lim = Math.ceil(maxAbs / 10) * 10;
    const pos = (v) => `${50 + (50 * v) / lim}%`;
    for (const { d, vies } of grupos) {
      const grupo = document.createElement("div");
      grupo.className = "vies-grupo";
      grupo.innerHTML = `<h4>${d.titulo}</h4>`;
      for (const v of vies) {
        const linha = document.createElement("div");
        linha.className = "vies-linha";
        const largura = (50 * Math.abs(v.media)) / lim;
        linha.innerHTML = `<div class="vies-nome"></div>
          <div class="vies-trilha">
            <span class="vies-zero" style="left:50%"></span>
            <span class="vies-barra ${v.media >= 0 ? "acima" : "abaixo"}" style="left:${v.media >= 0 ? "50%" : `${50 - largura}%`};width:${largura}%"></span>
            ${v.erros.map((e) => `<span class="vies-ponto" style="left:${pos(e.erro)}"></span>`).join("")}
          </div>
          <div class="vies-valor">${fmtSinal(v.media)}</div>`;
        linha.querySelector(".vies-nome").textContent = v.rotulo;
        const extremo = [...v.erros].sort((x, y) => Math.abs(y.erro) - Math.abs(x.erro))[0];
        ligarDica(linha, () => ({
          titulo: `${v.rotulo} — ${d.titulo} (${uf})`,
          linhas: [
            { cor: v.media >= 0 ? "#2a78d6" : "#e34948", valor: `${fmtSinal(v.media)} p.p.`, rotulo: "erro médio (pesquisa − urna)" },
            { valor: `${v.mesmoSentido} de ${v.erros.length}`, rotulo: "municípios no mesmo sentido" },
            { valor: `${fmtSinal(extremo.erro)} p.p.`, rotulo: `maior erro: ${extremo.municipio}` },
          ],
        }));
        grupo.append(linha);
      }
      cartao.append(grupo);
    }
    cartao.insertAdjacentHTML("beforeend", `<div class="vies-eixo"><span></span><div class="ticks">
        <span style="left:0%">−${lim}</span><span style="left:50%">0</span><span style="left:100%">+${lim}</span>
      </div><span></span></div>
      <ul class="legenda legenda-vies">
        <li><span class="chave-barra chave-acima" aria-hidden="true"></span>Pesquisa acima da urna</li>
        <li><span class="chave-barra chave-abaixo" aria-hidden="true"></span>Pesquisa abaixo da urna</li>
        <li><span class="chave chave-ponto" aria-hidden="true"></span>Cada município</li>
      </ul>`);
    alvo.append(cartao);
  }
}

// ---------------------------------------------------------------------------
// Renderização — dispersão erro × dias até a eleição (SVG)
// ---------------------------------------------------------------------------
function renderizarDispersao(lista) {
  const pontos = lista.map((a) => ({ a, x: a.dias, y: erroMajoritario(a) })).filter((p) => p.y != null);
  const alvo = document.getElementById("grafico-dispersao");
  const r = correlacao(pontos.map((p) => p.x), pontos.map((p) => p.y));
  document.getElementById("nota-dispersao").textContent =
    `Cada ponto é uma pesquisa municipal: dias entre o fim do campo e a eleição × erro médio nas disputas majoritárias ` +
    `(Presidente, Governador e Senado). Correlação r = ${fmt(r, 2)} — a antecedência explica pouco do erro; o desenho amostral explica mais. ` +
    `A faixa azul marca a reta final (até ${DIAS_RETA_FINAL} dias).`;

  // viewBox na largura real do contêiner: o SVG não escala e o texto fica
  // sempre no tamanho de leitura (11px), em qualquer tela.
  const L = Math.max(300, alvo.clientWidth || 560);
  const A = Math.round(Math.min(340, Math.max(240, L * 0.42)));
  const m = { e: 44, d: 16, t: 14, b: 40 };
  const xMax = Math.max(10, Math.ceil(Math.max(...pontos.map((p) => p.x)) / 10) * 10);
  const yMax = Math.max(5, Math.ceil(Math.max(...pontos.map((p) => p.y)) / 5) * 5);
  const sx = (v) => m.e + ((L - m.e - m.d) * v) / xMax;
  const sy = (v) => A - m.b - ((A - m.t - m.b) * v) / yMax;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${L} ${A}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Dispersão: dias antes da eleição × erro médio por pesquisa municipal");
  const el = (tag, attrs, texto) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (texto != null) e.textContent = texto;
    svg.append(e);
    return e;
  };
  el("rect", { class: "faixa-reta-final", x: sx(0), y: m.t, width: sx(DIAS_RETA_FINAL) - sx(0), height: A - m.t - m.b });
  for (let y = 0; y <= yMax; y += yMax / 5) {
    el("line", { class: y === 0 ? "eixo-linha" : "grade-linha", x1: m.e, x2: L - m.d, y1: sy(y), y2: sy(y) });
    el("text", { x: m.e - 8, y: sy(y) + 4, "text-anchor": "end" }, fmt(y, 0));
  }
  for (let x = 0; x <= xMax; x += 10) {
    el("text", { x: sx(x), y: A - m.b + 16, "text-anchor": "middle" }, String(x));
  }
  el("text", { class: "rotulo-eixo", x: (m.e + L - m.d) / 2, y: A - 6, "text-anchor": "middle" }, "dias entre o fim do campo e a eleição");
  el("text", { class: "rotulo-eixo", x: 12, y: m.t + (A - m.t - m.b) / 2, "text-anchor": "middle", transform: `rotate(-90 12 ${m.t + (A - m.t - m.b) / 2})` }, "erro médio (p.p.)");
  for (const p of pontos) {
    const alvoHit = el("circle", { class: "alvo", cx: sx(p.x), cy: sy(p.y), r: 12, tabindex: 0 });
    el("circle", { class: `ponto ponto-${p.a.uf.toLowerCase()}`, cx: sx(p.x), cy: sy(p.y), r: 5 });
    ligarDica(alvoHit, () => ({
      titulo: `${p.a.municipio} (${p.a.uf})`,
      linhas: [
        { cor: p.a.uf === "TO" ? "#2a78d6" : "#eb6834", valor: `${fmt(p.y)} p.p.`, rotulo: "erro médio majoritário" },
        { valor: `${p.x} dias`, rotulo: "antes da eleição" },
      ],
    }));
  }
  alvo.replaceChildren(svg);
  const ufsPresentes = [...new Set(pontos.map((p) => p.a.uf))];
  alvo.insertAdjacentHTML("beforeend", `<ul class="legenda" style="margin-top:0.6rem">${ufsPresentes
    .map((uf) => `<li><span class="chave chave-${uf.toLowerCase()}" aria-hidden="true"></span>${NOME_UF[uf]}</li>`).join("")}</ul>`);
}

// ---------------------------------------------------------------------------
// Renderização — régua de mercado
// ---------------------------------------------------------------------------
function renderizarMercado(lista) {
  const linhas = referenciasDoMercado().map((r) => {
    const c = r.comparacao;
    return `<tr>
      <td><strong>${escapeHtml(r.instituto)}</strong><span class="sub"><a href="${escapeHtml(r.fonte)}" target="_blank" rel="noopener">fonte</a></span></td>
      <td>${escapeHtml(r.escopo)}</td>
      <td>${escapeHtml(DISPUTAS.find((d) => d.chave === r.disputa).titulo)}</td>
      <td>${escapeHtml(r.campo)}</td>
      <td>${sinal(c.acertouVencedor ? "ok" : "erro")}</td>
      <td>${fmt(c.erroMedio)} p.p.</td>
      <td>${c.erroMargem == null ? "—" : `${fmt(Math.abs(c.erroMargem))} p.p.`}</td>
    </tr>`;
  });
  const ufs = estado.uf ? [estado.uf] : ["TO", "MA"];
  for (const uf of ufs) {
    const daUf = lista.filter((a) => a.uf === uf);
    if (!daUf.length) continue;
    for (const d of MAJORITARIAS) {
      const comps = daUf.map((a) => a.comparacoes[d.chave]).filter(Boolean);
      if (!comps.length) continue;
      const t = d.chave === "senado"
        ? taxa(comps, (c) => c.doisMaisVotadosAcertados >= 1)
        : taxa(comps, (c) => c.acertouVencedor);
      const margens = comps.map((c) => c.erroMargem).filter((x) => x != null).map(Math.abs);
      const ini = daUf.map((a) => a.campoInicio).sort()[0];
      const fim = daUf.map((a) => a.campoFim).sort().at(-1);
      linhas.push(`<tr class="linha-foccus">
        <td>Foccus<span class="sub">média de ${comps.length} pesquisas municipais</span></td>
        <td>${uf} (municípios)</td>
        <td>${d.titulo}</td>
        <td>${fmtDataCurta(ini)} a ${fmtDataCurta(fim)}</td>
        <td>${t.acertos}/${t.total}<span class="sub">${d.chave === "senado" ? "1 dos 2 mais votados" : "vencedor no município"}</span></td>
        <td>${fmt(media(comps.map((c) => c.erroMedio)))} p.p.</td>
        <td>${margens.length ? `${fmt(media(margens))} p.p.` : "—"}</td>
      </tr>`);
    }
  }
  document.getElementById("tabela-mercado").innerHTML = `<thead><tr>
      <th>Instituto</th><th>Escopo</th><th>Disputa</th><th>Campo</th><th>Vencedor</th><th>Erro médio</th><th>Erro na margem</th>
    </tr></thead><tbody>${linhas.join("")}</tbody>`;
}

// ---------------------------------------------------------------------------
// Renderização — plano de 2º turno e metodologia (texto)
// ---------------------------------------------------------------------------
function renderizarPlano(ag) {
  const cartao = (classe, titulo, itens) =>
    `<article class="cartao cartao-leitura ${classe}"><h3>${titulo}</h3><ul>${itens.map((i) => `<li>${i}</li>`).join("")}</ul></article>`;
  document.getElementById("plano-segundo-turno").innerHTML =
    cartao("acao", "1. Desenho amostral", [
      "Cotas de sexo, faixa etária e escolaridade a partir do <strong>perfil oficial do eleitorado do TSE</strong> de cada município.",
      "Amostra distribuída por <strong>local de votação</strong> (sede, bairros e povoados) proporcional ao eleitorado — fim da concentração no centro.",
      "Ponderação (pós-estratificação) e, sobretudo, <strong>ponderação pelo voto declarado no 1º turno</strong>, calibrada pelo resultado oficial do município.",
    ]) +
    cartao("acao", "2. Instrumento", [
      "Perfil do entrevistado em todos os municípios (sexo, idade, escolaridade, renda, zona urbana/rural).",
      "Voto no 1º turno (lembrado), rejeição, certeza do voto e potencial de transferência dos eliminados.",
      "Disputas: Presidente (todos os municípios) e Governador no Tocantins — Dorinha × Vicentinho.",
    ]) +
    cartao("acao", "3. Cronograma e conformidade", [
      `Duas ondas de <em>tracking</em>, a segunda com campo na última semana antes de ${fmtDataCurta(DATA_SEGUNDO_TURNO)} — onde nosso erro foi menor.`,
      "Registro no PesqEle até 5 dias antes de cada divulgação pública (Res. TSE 23.600/2019).",
      "Auditoria pós-eleição publicada nesta página, como padrão da casa.",
    ]) +
    cartao("forca", "Metas do 2º turno", [
      `Erro médio ≤ <strong>3 p.p.</strong> por finalista (linha de base no 1º turno, Presidente: ${fmt(ag.erro.presidente)} p.p.).`,
      `Erro na margem ≤ <strong>5 p.p.</strong> (linha de base no 1º turno, Presidente: ${fmt(ag.erroMargemPres)} p.p.).`,
      "Vencedor apontado em ≥ <strong>90%</strong> dos municípios e todas as estimativas dentro da margem declarada.",
    ]);
}

function renderizarMetodologia(ag) {
  const u = estado.urna;
  // totalizadoEm vem como "dd/mm/aaaa hh:mm:ss"; a chave "aaaammdd hh:mm:ss" ordena cronologicamente.
  const chaveCronologica = (t) => `${t.slice(6, 10)}${t.slice(3, 5)}${t.slice(0, 2)} ${t.slice(11)}`;
  const ultima = Object.values(u.municipios)
    .flatMap((m) => MAJORITARIAS.map((d) => m[d.chave]?.totalizadoEm))
    .filter(Boolean)
    .sort((a, b) => chaveCronologica(a).localeCompare(chaveCronologica(b)))
    .at(-1);
  const naoLocalizados = Object.entries(u.municipios).flatMap(([m, info]) =>
    ["depfed", "depest"].flatMap((c) => (info[c]?.naoLocalizados || []).map((r) => `${r} (${m})`)));
  const dm = ag.dentroDaMargem;
  document.getElementById("metodologia").innerHTML = `
    <h4>O que foi comparado</h4>
    <p>${ag.total} pesquisas municipais da Foccus (sede de cada município) realizadas antes do 1º turno, contra o
    resultado oficial do TSE no mesmo município. Só entram entrevistas completas feitas até 03/10/2026.</p>
    <h4>Métricas</h4>
    <ul>
      <li><strong>Votos válidos:</strong> na pesquisa, exclui-se NS/NO e renormaliza-se entre os candidatos efetivamente apresentados no disco (registro de randomização de cada entrevista); na urna, percentual oficial do TSE.</li>
      <li><strong>Vencedor no município:</strong> o líder da pesquisa foi o mais votado na urna daquele município. Empate na liderança da pesquisa não conta como acerto.</li>
      <li><strong>Erro médio:</strong> média do erro absoluto, em pontos percentuais, dos candidatos com 2% ou mais na urna ou entre os 4 mais votados.</li>
      <li><strong>Erro na margem:</strong> vantagem do 1º sobre o 2º colocado na pesquisa menos a vantagem real.</li>
      <li><strong>Senado:</strong> menções somadas do 1º e do 2º voto × % dos votos válidos de Senado no município.</li>
      <li><strong>Deputados:</strong> comparação restrita aos nomes testados no disco e localizados na urna, renormalizando os dois lados entre esses nomes. *"Top-3" só é contado em listas com ${MIN_NOMES_TOP3} ou mais nomes.</li>
      <li><strong>Dentro da margem:</strong> ${fmtPct(dm.dentro, dm.total)} das estimativas por candidato nas majoritárias ficaram dentro da margem de erro da própria pesquisa (95% de confiança, amostragem aleatória simples).</li>
    </ul>
    <h4>Fora da comparação</h4>
    <ul>
      ${estado.excluidas.map((e) => `<li>${escapeHtml(e.municipio)}: ${escapeHtml(e.motivo)}.</li>`).join("")}
      ${naoLocalizados.length ? `<li>Nomes testados não localizados na urna do município: ${escapeHtml(naoLocalizados.join("; "))}.</li>` : ""}
    </ul>
    <h4>Limitações</h4>
    <p>Pesquisa é retrato do momento do campo, não previsão: houve de 1 a 6 semanas entre o campo e a eleição.
    As amostras municipais não tiveram cotas nem ponderação por perfil, o que explica parte relevante do erro
    nas majoritárias. A régua de mercado tem escopo diferente (estadual/nacional, campo na véspera) e serve como
    referência de qualidade, não como ranking.</p>
    <h4>Fontes</h4>
    <p>Urna: ${escapeHtml(u.fonte)}; totalização usada: ${escapeHtml(ultima || "-")}. Régua de mercado: pesquisas
    divulgadas pelos institutos (links na tabela). Pesquisas Foccus: base de coleta, view pública de resultados.</p>
    <h4>Divulgação</h4>
    <p>Até o 2º turno (${fmtDataCurta(DATA_SEGUNDO_TURNO)}), a visão pública não exibe percentuais por candidato das
    disputas em aberto (Presidente; Governador no TO). Divulgar intenção de voto de candidato em disputa exige
    registro prévio da pesquisa no PesqEle (Lei 9.504/97, art. 33; Res. TSE 23.600/2019).</p>`;
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------
function renderizarTudo() {
  const lista = auditoriasVisiveis();
  const ag = agregados(lista);
  const aviso = document.getElementById("aviso-visao");
  aviso.classList.toggle("oculto", estado.visao !== "analitica");
  aviso.innerHTML = `<strong>Visão analítica:</strong> inclui percentuais por candidato de disputas que seguem em 2º turno.
    Use em apresentação reservada; para material público, volte à visão pública.`;
  renderizarKpis(ag);
  renderizarLeitura(lista, ag);
  renderizarPlacar(lista);
  preencherSeletor(lista);
  renderizarDetalhe();
  renderizarVies(lista);
  renderizarDispersao(lista);
  renderizarMercado(lista);
  renderizarPlano(ag);
  renderizarMetodologia(ag);
}

function ligarControles() {
  document.querySelectorAll("[data-uf]").forEach((b) => b.addEventListener("click", () => {
    estado.uf = b.dataset.uf;
    document.querySelectorAll("[data-uf]").forEach((x) => x.classList.toggle("ativo", x === b));
    renderizarTudo();
  }));
  document.querySelectorAll("[data-visao]").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.visao === estado.visao);
    b.addEventListener("click", () => {
      estado.visao = b.dataset.visao;
      document.querySelectorAll("[data-visao]").forEach((x) => x.classList.toggle("ativo", x === b));
      const url = new URL(location.href);
      if (estado.visao === "analitica") url.searchParams.set("visao", "analitica");
      else url.searchParams.delete("visao");
      history.replaceState(null, "", url);
      renderizarTudo();
    });
  });
  document.getElementById("seletor-municipio").addEventListener("change", (ev) => selecionarMunicipio(ev.target.value));
  let larguraAnterior = window.innerWidth;
  window.addEventListener("resize", debounce(() => {
    if (!estado.auditorias.length || window.innerWidth === larguraAnterior) return;
    larguraAnterior = window.innerWidth;
    renderizarDispersao(auditoriasVisiveis());
  }, 200));
}

async function iniciar() {
  registrarServiceWorker();
  iniciarIndicadorConexao();
  iniciarDicas();
  ligarControles();
  try {
    estado.urna = await carregarUrna();
    await carregarAuditorias();
    if (!estado.auditorias.length) throw new Error("Nenhuma pesquisa com base suficiente para comparar.");
    document.getElementById("carimbo-dados").textContent =
      `Urna: TSE, 1º turno ${fmtDataCurta(DATA_ELEICAO)} · pesquisas com campo até 03/10`;
    document.getElementById("estado-carregando").classList.add("oculto");
    document.getElementById("conteudo").classList.remove("oculto");
    renderizarTudo();
  } catch (erro) {
    console.error("Falha ao montar Pesquisa × Urna", erro);
    document.getElementById("estado-carregando").classList.add("oculto");
    const caixa = document.getElementById("estado-erro");
    caixa.textContent = `Não foi possível carregar a comparação agora (${erro.message || erro}). Tente novamente em instantes.`;
    caixa.classList.remove("oculto");
  }
}

iniciar();
