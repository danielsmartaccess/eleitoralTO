#!/usr/bin/env node
// ============================================================================
// scripts/gerar-urna-2026.js
//
// Gera data/urna-2026.json — o resultado OFICIAL do 1º turno de 2026 (TSE)
// para cada município pesquisado, já casado com os rótulos de candidato do
// nosso questionário (config/pesquisa.js). É a base do painel
// desempenho.html ("Pesquisa × Urna").
//
// Só dado público entra no arquivo gerado: votos e percentuais do TSE e os
// nomes que já estão em config/pesquisa.js. Nenhum resultado de pesquisa é
// gravado aqui — o lado "pesquisa" do painel é lido ao vivo da view pública
// vw_respostas_dashboard, como no dashboard.
//
// Uso (Node 18+, precisa de internet):
//   node scripts/gerar-urna-2026.js            → grava data/urna-2026.json
//   node scripts/gerar-urna-2026.js --revisar  → também lista os casamentos
//                                                de nome não exatos, p/ revisão
//
// Fonte: https://resultados.tse.jus.br/oficial/ele2026/ (eleição 6257 =
// Presidente; 6259 = Governador, Senado, Deputados — 1º turno 04/10/2026).
// ============================================================================

"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const { PESQUISAS_CONFIG } = require(path.join(RAIZ, "config", "pesquisa.js"));

const BASE_TSE = "https://resultados.tse.jus.br/oficial/ele2026";
const UFS = ["to", "ma"];
const CARGOS = {
  presidente: { eleicao: "6257", cargo: "0001", ref: "presidente" },
  governador: { eleicao: "6259", cargo: "0003", ref: "governador" },
  senado: { eleicao: "6259", cargo: "0005", ref: "senado" },
  depfed: { eleicao: "6259", cargo: "0006", ref: "deputadoFederal" },
  depest: { eleicao: "6259", cargo: "0007", ref: "deputadoEstadual" },
};
const MAJORITARIOS = ["presidente", "governador", "senado"];
const PROPORCIONAIS = ["depfed", "depest"];

// Casamentos de nome decididos manualmente (chave "municipio|cargo|rótulo").
// `null` = o nome testado não está na urna daquele município (não concorreu
// ou concorreu com outro nome); fica fora da comparação, listado como "não
// localizado". Preencher só depois de revisar a saída de --revisar.
const CASAMENTOS_MANUAIS = {
  // "Zé Carlos da Caixa" é o apelido do candidato de urna ZÉ CARLOS (PT-MA),
  // o mesmo testado como "Zé Carlos do PT" em Itinga do Maranhão.
  "São Bernardo|depfed|Zé Carlos da Caixa": "ZÉ CARLOS",
};

// --------------------------------------------------------------------------
// Régua de mercado: pesquisas de véspera dos grandes institutos (votos
// válidos), registradas aqui com a fonte para o painel calcular o erro deles
// com a MESMA métrica usada nas nossas pesquisas. Só entram números
// conferidos na fonte citada; candidato não divulgado fica de fora.
// --------------------------------------------------------------------------
const REFERENCIAS_MERCADO = [
  {
    instituto: "Quaest", escopo: "Brasil", disputa: "presidente", campo: "2 e 3/10/2026",
    valores: { Lula: 46, "Flávio Bolsonaro": 45 },
    fonte: "https://revistaforum.com.br/politica/ultimas-pesquisas-primeiro-turno-presidente/",
  },
  {
    instituto: "Datafolha", escopo: "Brasil", disputa: "presidente", campo: "3/10/2026",
    valores: { Lula: 45, "Flávio Bolsonaro": 42 },
    fonte: "https://revistaforum.com.br/politica/ultimas-pesquisas-primeiro-turno-presidente/",
  },
  {
    instituto: "AtlasIntel", escopo: "Brasil", disputa: "presidente", campo: "3/10/2026",
    valores: { Lula: 46.7, "Flávio Bolsonaro": 43.8 },
    fonte: "https://revistaforum.com.br/politica/ultimas-pesquisas-primeiro-turno-presidente/",
  },
  {
    instituto: "Quaest", escopo: "TO", disputa: "governador", campo: "2 e 3/10/2026",
    valores: { "Professora Dorinha": 46, "Vicentinho Júnior": 41, "Laurez Moreira": 11, "Ataídes Oliveira": 1 },
    fonte: "https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/quaest-governador-senador-tocantins-outubro-2026/",
  },
  {
    instituto: "Quaest", escopo: "MA", disputa: "governador", campo: "2 e 3/10/2026",
    valores: { "Eduardo Braide": 52, "Orleans Brandão": 35, "Felipe Camarão": 10, "Roberto Rocha": 2 },
    fonte: "https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/quaest-governador-senador-maranhao-outubro-2026/",
  },
  {
    instituto: "Quaest", escopo: "TO", disputa: "senado", campo: "2 e 3/10/2026",
    valores: {
      "Eduardo Gomes": 25, "Carlos Gaguim": 21, "Alexandre Guimarães": 17, "Eli Borges": 11,
      "Paulo Mourão": 10, "Ronaldo Dimas": 7, "Vanderlei Luxemburgo": 5,
    },
    fonte: "https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/quaest-governador-senador-tocantins-outubro-2026/",
  },
  {
    instituto: "Quaest", escopo: "MA", disputa: "senado", campo: "2 e 3/10/2026",
    valores: {
      "Roseana Sarney": 25, "André Fufuca": 23, "Lahésio Bonfim": 18, "Eliziane Gama": 16,
      "Weverton Rocha": 12, "Cidônio Gonçalves": 4,
    },
    fonte: "https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/quaest-governador-senador-maranhao-outubro-2026/",
  },
];

// --------------------------------------------------------------------------
// Casamento de nomes (rótulo do questionário → nome de urna)
// --------------------------------------------------------------------------
const STOP = new Set(["DA", "DE", "DO", "DOS", "DAS", "E"]);
// Tokens que identificam pouco (sufixos, títulos, prenomes muito comuns):
// pesam menos no casamento e não penalizam quando sobram no nome de urna.
const GENERICOS = new Set([
  "JUNIOR", "JR", "NETO", "FILHO", "SOBRINHO", "PT", "DEPUTADA", "DEPUTADO", "DELEGADA", "DELEGADO",
  "PASTOR", "CORONEL", "CAPITAO", "SARGENTO", "SGT", "IRMAO", "IRMA", "DOUTOR", "DOUTORA", "PROFESSOR",
  "PROFESSORA", "PROF", "DR", "DRA", "VEREADOR", "CARLOS", "JOSE", "JOAO", "MARIA", "ZE",
]);

function tokens(texto) {
  return String(texto)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

/** Similaridade Ratcliff/Obershelp (mesma ideia do difflib.SequenceMatcher). */
function similaridade(a, b) {
  const blocos = (x, y) => {
    if (!x.length || !y.length) return 0;
    let melhor = 0, ix = 0, iy = 0;
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < y.length; j++) {
        let k = 0;
        while (i + k < x.length && j + k < y.length && x[i + k] === y[j + k]) k++;
        if (k > melhor) { melhor = k; ix = i; iy = j; }
      }
    }
    if (!melhor) return 0;
    return melhor + blocos(x.slice(0, ix), y.slice(0, iy)) + blocos(x.slice(ix + melhor), y.slice(iy + melhor));
  };
  const total = a.length + b.length;
  return total ? (2 * blocos(a, b)) / total : 1;
}

function pontuacao(rotulo, nomeUrna) {
  const a = tokens(rotulo), b = tokens(nomeUrna);
  if (!a.length || !b.length) return 0;
  let pesoTotal = 0, pesoOk = 0;
  for (const t of a) {
    const peso = GENERICOS.has(t) ? 0.35 : 1;
    pesoTotal += peso;
    if (Math.max(...b.map((u) => similaridade(t, u))) >= 0.8) pesoOk += peso;
  }
  const sobras = b.filter((u) => !GENERICOS.has(u) && Math.max(...a.map((t) => similaridade(u, t))) < 0.8);
  return pesoOk / pesoTotal - 0.15 * sobras.length;
}

function casarRotulo(rotulo, candidatos) {
  let melhor = null;
  for (const c of candidatos) {
    const p = pontuacao(rotulo, c.nome);
    if (!melhor || p > melhor.p || (p === melhor.p && c.votos > melhor.c.votos)) melhor = { c, p };
  }
  return melhor && melhor.p >= 0.5 ? melhor : { c: null, p: melhor ? melhor.p : 0 };
}

// --------------------------------------------------------------------------
// TSE
// --------------------------------------------------------------------------
async function baixarJson(url) {
  let ultimoErro;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (erro) {
      ultimoErro = erro;
      await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
    }
  }
  throw new Error(`Falha ao baixar ${url}: ${ultimoErro.message}`);
}

const num = (s) => Number(String(s).replace(",", "."));

/** Lê um arquivo de totalização ("-u.json") e devolve só o necessário. */
function lerTotalizacao(json) {
  const candidatos = [];
  for (const cargo of json.carg) {
    for (const agr of cargo.agr) {
      for (const par of agr.par) {
        for (const c of par.cand) {
          candidatos.push({
            nome: c.nmu,
            partido: par.sg,
            votos: Number(c.vap),
            pct: Math.round(num(c.pvapn) * 1000) / 1000,
            situacao: c.st || "",
          });
        }
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos);
  return {
    totalizadoEm: `${json.dg} ${json.hg}`,
    apuracaoFinal: json.and === "f",
    urnasApuradas: num(json.s.pst),
    candidatos,
  };
}

function urlTotalizacao(uf, codMunicipio, cargo) {
  const { eleicao, cargo: cd } = CARGOS[cargo];
  const abrangencia = codMunicipio ? `${uf}${codMunicipio}` : uf;
  return `${BASE_TSE}/${eleicao}/dados/${uf}/${abrangencia}-c${cd}-e00${eleicao}-u.json`;
}

async function emLotes(tarefas, tamanho = 6) {
  const saida = [];
  for (let i = 0; i < tarefas.length; i += tamanho) {
    saida.push(...(await Promise.all(tarefas.slice(i, i + tamanho).map((t) => t()))));
  }
  return saida;
}

// --------------------------------------------------------------------------
// Principal
// --------------------------------------------------------------------------
function chaveNome(t) {
  return tokens(t).join(" ");
}

async function main() {
  const revisar = process.argv.includes("--revisar");

  // 1. Códigos TSE dos municípios (TO e MA)
  const cfgMun = await baixarJson(`${BASE_TSE}/6259/config/mun-e006259-cm.json`);
  const municipiosTse = [];
  for (const abr of cfgMun.abr) {
    if (!UFS.includes(abr.cd.toLowerCase())) continue;
    for (const m of abr.mu) municipiosTse.push({ uf: abr.cd.toUpperCase(), cod: m.cd, ibge: m.cdi, nome: m.nm });
  }

  // 2. Pesquisas → município TSE. "X - Povoado Y" é recorte da sede X: não
  //    tem resultado próprio na urna, então não entra na comparação.
  const porMunicipio = new Map();
  const recortes = {};
  for (const p of Object.values(PESQUISAS_CONFIG)) {
    const nome = p.pesquisa.municipio;
    const base = nome.split(" - ")[0];
    if (base !== nome) recortes[nome] = base;
    const achados = municipiosTse.filter((m) => chaveNome(m.nome) === chaveNome(base));
    if (achados.length !== 1) throw new Error(`Município "${base}" casou com ${achados.length} códigos TSE`);
    if (!porMunicipio.has(base)) porMunicipio.set(base, { tse: achados[0], pesquisas: [] });
    porMunicipio.get(base).pesquisas.push(p);
  }

  // 3. Totalizações: Brasil, UFs e municípios
  const brasil = lerTotalizacao(await baixarJson(`${BASE_TSE}/6257/dados/br/br-c0001-e006257-u.json`));
  const uf = {};
  for (const sigla of UFS) {
    uf[sigla.toUpperCase()] = {};
    for (const cargo of MAJORITARIOS) {
      uf[sigla.toUpperCase()][cargo] = lerTotalizacao(await baixarJson(urlTotalizacao(sigla, null, cargo)));
    }
  }

  const tarefas = [];
  for (const [nome, info] of porMunicipio) {
    for (const cargo of Object.keys(CARGOS)) {
      tarefas.push(async () => [nome, cargo, lerTotalizacao(
        await baixarJson(urlTotalizacao(info.tse.uf.toLowerCase(), info.tse.cod, cargo)))]);
    }
  }
  const totalizacoes = await emLotes(tarefas);

  // 4. Casamento de nomes por município/cargo
  const municipios = {};
  const revisao = [];
  for (const [nome, info] of porMunicipio) {
    municipios[nome] = { uf: info.tse.uf, codTse: info.tse.cod, codIbge: info.tse.ibge };
  }
  for (const [nome, cargo, tot] of totalizacoes) {
    const { pesquisas } = porMunicipio.get(nome);
    const rotulos = [...new Set(pesquisas.flatMap((p) => (p.candidatos[CARGOS[cargo].ref] || []).map((c) => c.texto)))];
    const usados = new Map();
    const casamentos = new Map();
    for (const rotulo of rotulos) {
      const chaveManual = `${nome}|${cargo}|${rotulo}`;
      let cand, p;
      if (chaveManual in CASAMENTOS_MANUAIS) {
        const alvo = CASAMENTOS_MANUAIS[chaveManual];
        cand = alvo ? tot.candidatos.find((c) => c.nome === alvo) : null;
        if (alvo && !cand) throw new Error(`Casamento manual inválido: ${chaveManual} → ${alvo}`);
        p = 1;
      } else {
        ({ c: cand, p } = casarRotulo(rotulo, tot.candidatos));
      }
      if (cand && usados.has(cand.nome)) {
        throw new Error(`"${rotulo}" e "${usados.get(cand.nome)}" casaram com o mesmo candidato ${cand.nome} (${nome}, ${cargo})`);
      }
      if (cand) usados.set(cand.nome, rotulo);
      casamentos.set(rotulo, cand);
      if (p < 0.99) revisao.push(`${nome} | ${cargo} | ${rotulo} → ${cand ? `${cand.nome} (${cand.partido}, ${cand.votos} votos)` : "NÃO LOCALIZADO"} | ${p.toFixed(2)}`);
    }

    const base = { totalizadoEm: tot.totalizadoEm, apuracaoFinal: tot.apuracaoFinal };
    if (MAJORITARIOS.includes(cargo)) {
      const rotuloPorNome = new Map([...casamentos].filter(([, c]) => c).map(([r, c]) => [c.nome, r]));
      municipios[nome][cargo] = {
        ...base,
        candidatos: tot.candidatos.map((c) => ({
          nome: c.nome, rotulo: rotuloPorNome.get(c.nome) || null, partido: c.partido, pct: c.pct, situacao: c.situacao,
        })),
      };
    } else {
      municipios[nome][cargo] = {
        ...base,
        testados: [...casamentos]
          .filter(([, c]) => c)
          .map(([rotulo, c]) => ({ rotulo, nome: c.nome, partido: c.partido, votos: c.votos, pct: c.pct })),
        naoLocalizados: [...casamentos].filter(([, c]) => !c).map(([r]) => r),
      };
    }
  }

  // Rótulos dos majoritários nos totais de UF/Brasil (para a régua de mercado)
  const rotularMajoritario = (tot, cargo, ufSigla) => {
    const pesquisasUf = [...porMunicipio.values()].filter((i) => !ufSigla || i.tse.uf === ufSigla).flatMap((i) => i.pesquisas);
    const rotulos = [...new Set(pesquisasUf.flatMap((p) => (p.candidatos[CARGOS[cargo].ref] || []).map((c) => c.texto)))];
    const rotuloPorNome = new Map();
    for (const r of rotulos) {
      const { c } = casarRotulo(r, tot.candidatos);
      if (c) rotuloPorNome.set(c.nome, r);
    }
    return {
      totalizadoEm: tot.totalizadoEm,
      apuracaoFinal: tot.apuracaoFinal,
      candidatos: tot.candidatos.map((c) => ({ nome: c.nome, rotulo: rotuloPorNome.get(c.nome) || null, partido: c.partido, pct: c.pct, situacao: c.situacao })),
    };
  };
  const ufRotulado = {};
  for (const [sigla, cargos] of Object.entries(uf)) {
    ufRotulado[sigla] = {};
    for (const [cargo, tot] of Object.entries(cargos)) ufRotulado[sigla][cargo] = rotularMajoritario(tot, cargo, sigla);
  }

  const saida = {
    fonte: "Tribunal Superior Eleitoral — resultados.tse.jus.br (eleições 6257 e 6259, 1º turno)",
    eleicao: { data: "2026-10-04", turno: 1 },
    geradoEm: new Date().toISOString(),
    brasil: { presidente: rotularMajoritario(brasil, "presidente", null) },
    uf: ufRotulado,
    municipios,
    recortes,
    referenciasMercado: REFERENCIAS_MERCADO,
  };

  const destino = path.join(RAIZ, "data", "urna-2026.json");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(saida) + "\n", "utf8");
  console.log(`OK: ${Object.keys(municipios).length} municípios → ${path.relative(RAIZ, destino)}`);
  if (revisar) {
    console.log(`\nCasamentos não exatos (${revisao.length}) — conferir e, se preciso, fixar em CASAMENTOS_MANUAIS:`);
    for (const linha of revisao) console.log("  " + linha);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
