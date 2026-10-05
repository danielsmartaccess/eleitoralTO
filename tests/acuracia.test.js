// Testes das métricas Pesquisa × Urna (js/acuracia.js).
// Rodar: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compararMajoritaria, compararProporcional, compararReferencia, correlacao, diasAteEleicao,
  margemDeErro, viesPorCandidato,
} from "../js/acuracia.js";

const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

const URNA = [
  { nome: "CANDIDATO A", rotulo: "A", partido: "P1", pct: 48 },
  { nome: "CANDIDATO B", rotulo: "B", partido: "P2", pct: 42 },
  { nome: "CANDIDATO C", rotulo: "C", partido: "P3", pct: 8 },
  { nome: "NANICO", rotulo: null, partido: "P4", pct: 2 },
];

test("margem de erro máxima (p = 0,5, 95%)", () => {
  perto(margemDeErro(400), 4.9, 1e-9);
  assert.equal(margemDeErro(0), null);
});

test("majoritária: votos válidos, erro médio, vencedor e erro na margem", () => {
  const c = compararMajoritaria({ contagem: { A: 50, B: 40, C: 10 }, candidatosUrna: URNA, n: 400 });
  perto(c.linhas.find((l) => l.rotulo === "A").pesquisa, 50);
  perto(c.erroMedio, 2); // |+2|, |−2|, |+2| — o nanico fora do disco não entra
  assert.equal(c.acertouVencedor, true);
  assert.equal(c.acertouTop2, true);
  perto(c.erroMargem, 4); // (50 − 40) − (48 − 42)
  perto(c.pctForaDoDisco, 2);
  assert.deepEqual(c.dentroDaMargem, { dentro: 3, total: 3 });
});

test("majoritária: candidato não apresentado no disco sai da base de válidos", () => {
  const c = compararMajoritaria({ contagem: { A: 50, B: 40, C: 0 }, candidatosUrna: URNA, ofertados: new Set(["A", "B"]) });
  perto(c.linhas.find((l) => l.rotulo === "A").pesquisa, (100 * 50) / 90);
  assert.equal(c.linhas.some((l) => l.rotulo === "C"), false);
  perto(c.pctForaDoDisco, 10);
});

test("majoritária: empate na liderança da pesquisa não é acerto", () => {
  const c = compararMajoritaria({ contagem: { A: 40, B: 40, C: 20 }, candidatosUrna: URNA });
  assert.equal(c.empatePesquisa, true);
  assert.equal(c.acertouVencedor, false);
  assert.equal(c.liderPesquisa, null);
});

test("majoritária: sem menção válida devolve null", () => {
  assert.equal(compararMajoritaria({ contagem: {}, candidatosUrna: URNA }), null);
});

test("senado: conta quantos dos 2 mais votados a pesquisa pôs entre os 2 primeiros", () => {
  const c = compararMajoritaria({ contagem: { A: 30, C: 25, B: 20 }, candidatosUrna: URNA, doisVotos: true });
  assert.equal(c.doisMaisVotadosAcertados, 1);
});

test("senado: empate na 2ª posição da pesquisa não conta como acerto", () => {
  // B (2º na urna) empata com C na pesquisa: a ordem da urna não pode desempatar a favor.
  const c = compararMajoritaria({ contagem: { A: 30, B: 20, C: 20 }, candidatosUrna: URNA, doisVotos: true });
  assert.equal(c.doisMaisVotadosAcertados, 1);
  assert.equal(c.acertouTop2, false);
});

test("proporcional: empate na 3ª posição não põe o líder da urna no top-3", () => {
  const testados = ["W", "X", "Y", "Z"].map((r, i) => ({ rotulo: r, nome: r, partido: "", votos: 400 - 100 * i }));
  const c = compararProporcional({ contagem: { W: 2, X: 5, Y: 4, Z: 2 }, testados });
  assert.equal(c.liderUrna, "W");
  assert.equal(c.liderUrnaNoTop3, false); // X, Y e Z (empatado) têm ≥ menções que W
});

test("proporcional: comparação restrita aos nomes testados", () => {
  const testados = [
    { rotulo: "X", nome: "X", partido: "", votos: 600 },
    { rotulo: "Y", nome: "Y", partido: "", votos: 300 },
    { rotulo: "Z", nome: "Z", partido: "", votos: 100 },
  ];
  const c = compararProporcional({ contagem: { X: 5, Y: 10, Z: 5 }, testados });
  assert.equal(c.liderUrna, "X");
  assert.equal(c.liderPesquisa, "Y");
  assert.equal(c.acertouLider, false);
  assert.equal(c.liderUrnaNoTop3, true);
  perto(c.erroMedio, (35 + 20 + 15) / 3);
});

test("proporcional: nome testado mas não ofertado fica fora", () => {
  const testados = [
    { rotulo: "X", nome: "X", partido: "", votos: 600 },
    { rotulo: "Y", nome: "Y", partido: "", votos: 300 },
    { rotulo: "Z", nome: "Z", partido: "", votos: 100 },
  ];
  const c = compararProporcional({ contagem: { X: 5, Y: 5 }, testados, ofertados: new Set(["X", "Y"]) });
  assert.equal(c.nomesComparados, 2);
  perto(c.linhas[0].urna, (100 * 600) / 900);
});

test("régua de mercado: mesma métrica sobre números publicados", () => {
  const urna = [
    { nome: "F", rotulo: "Flávio", pct: 47.03 },
    { nome: "L", rotulo: "Lula", pct: 45.16 },
    { nome: "C", rotulo: "Cury", pct: 2.89 },
  ];
  const r = compararReferencia({ Lula: 46, "Flávio": 45 }, urna);
  assert.equal(r.acertouVencedor, false);
  perto(r.erroMargem, (45 - 46) - (47.03 - 45.16));
  perto(r.erroMedio, (2.03 + 0.84) / 2);
});

test("viés por candidato exige presença mínima e ordena pela média", () => {
  const comp = (erroA, erroB) => ({ linhas: [
    { rotulo: "A", erro: erroA, relevante: true },
    { rotulo: "B", erro: erroB, relevante: true },
  ] });
  const v = viesPorCandidato([
    { municipio: "m1", comparacao: comp(-10, 5) },
    { municipio: "m2", comparacao: comp(-20, 3) },
    { municipio: "m3", comparacao: comp(-15, 4) },
  ], 3);
  assert.deepEqual(v.map((x) => x.rotulo), ["B", "A"]);
  perto(v[1].media, -15);
  assert.equal(viesPorCandidato([{ municipio: "m1", comparacao: comp(1, 1) }], 3).length, 0);
});

test("datas e correlação", () => {
  assert.equal(diasAteEleicao("2026-09-30", "2026-10-04"), 4);
  assert.equal(diasAteEleicao("2026-08-27", "2026-10-04"), 38);
  perto(correlacao([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(correlacao([1, 1, 1], [2, 4, 6]), null);
});
