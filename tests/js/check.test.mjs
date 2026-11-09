// Conferência da progressão devolvida pela IA. Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeData } from "../../harmonalab/web/engine/analysis.js";
import { checkDelivery } from "../../harmonalab/web/ai/check.js";
import { EXAMPLE_PROJECT } from "../../harmonalab/web/ai/prompt.js";
import { GOOD_PROJECT, delivery } from "./fixtures.mjs";

test("checkDelivery aceita uma entrega boa e recusa as quebradas", () => {
  assert.equal(checkDelivery(delivery()).ok, true);
  assert.equal(checkDelivery(delivery({ pedido_extraido: null })).ok, true);
  assert.equal(checkDelivery(delivery({ pedido_extraido: { acordes: null, bpm: null } })).ok, true);
  for (const bad of [undefined, null, "texto", {}, { explicacao: "x" }, { projeto: GOOD_PROJECT }, { explicacao: "x", projeto: [] }]) {
    assert.equal(checkDelivery(bad).ok, false, JSON.stringify(bad));
  }
  assert.match(checkDelivery(delivery({ projeto: { tempo: 80, chords: [] } })).problems.join("\n"), /vazia/);
  assert.match(checkDelivery(delivery({ projeto: { ...GOOD_PROJECT, tempo: 5 } })).problems.join("\n"), /Projeto, campo tempo: BPM/);
});

test("ponta que não é a nota mais aguda, número de acordes e BPM são conferidos", () => {
  const wrong = delivery({ projeto: { ...GOOD_PROJECT, chords: [{ ...GOOD_PROJECT.chords[0], top_note: "A3" }, ...GOOD_PROJECT.chords.slice(1)] } });
  assert.match(checkDelivery(wrong).problems.join("\n"), /ponta travada é A3, mas .* acima/);
  const off = checkDelivery(delivery({ pedido_extraido: { acordes: 4, bpm: 90 } })).problems.join("\n");
  assert.match(off, /pedia 4 acordes, mas o projeto tem 3/);
  assert.match(off, /pedia 90 BPM, mas o projeto está com tempo 76/);
});

test("o exemplo do prompt é um projeto válido, sem avisos", () => {
  const report = analyzeData(EXAMPLE_PROJECT);
  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
});

const withPhrases = (chords, extra = {}) => delivery({ projeto: { ...GOOD_PROJECT, chords }, ...extra });
const SCALES = ["F F# G A B C D E", "B C D Eb F G A", "E F# G A B C D"]; // a escala de cada acorde do projeto de teste
const phraseChords = GOOD_PROJECT.chords.map((c, i) => ({ ...c, phrase: "C5/4 D5/4", phrase_scale: SCALES[i] }));

test("frase de função (comment) é cobrada nas respostas de IA, não nos links", () => {
  const silent = delivery({ projeto: { ...GOOD_PROJECT, chords: GOOD_PROJECT.chords.map(({ comment, ...c }) => c) } });
  assert.equal(checkDelivery(silent).ok, true);
  const strict = checkDelivery(silent, { requireFunctionNotes: true });
  assert.equal(strict.ok, false);
  assert.match(strict.problems.join("\n"), /Falta a frase de função \(campo "comment".*acorde\(s\) 1, 2, 3/);
  const rest = GOOD_PROJECT.chords.map(({ comment, ...c }) => c).concat([{ symbol: "Pausa" }]);
  assert.match(checkDelivery(delivery({ projeto: { ...GOOD_PROJECT, chords: rest }, pedido_extraido: null }), { requireFunctionNotes: true }).problems.join("\n"), /acorde\(s\) 1, 2, 3\./); // pausa não conta
});

test("avisos da frase bloqueiam, e a escala da frase e o pedido de frases são conferidos", () => {
  assert.equal(checkDelivery(withPhrases(phraseChords), { requireFunctionNotes: true }).ok, true);
  const offBeat = phraseChords.map((c) => ({ ...c, phrase: "C5/8 D5/8*alvo" }));
  assert.match(checkDelivery(withPhrases(offBeat)).problems.join("\n"), /Acorde 1 \(Fmaj7\(#11\)\), campo phrase: O alvo D5 não é nota do acorde/);
  const noScale = phraseChords.map(({ phrase_scale, ...c }) => c);
  assert.match(checkDelivery(withPhrases(noScale)).problems.join("\n"), /Acorde\(s\) 1, 2, 3: a frase precisa vir com "phrase_scale"/);
  const asked = checkDelivery(delivery({ pedido_extraido: { acordes: 3, bpm: 76, frases: "Neo-soul" } }));
  assert.match(asked.problems.join("\n"), /pedia frases \(Neo-soul\), mas nenhum acorde tem o campo "phrase"/);
  assert.equal(checkDelivery(withPhrases(phraseChords, { pedido_extraido: { acordes: 3, bpm: 76, frases: "Neo-soul" } })).ok, true);
  assert.equal(checkDelivery(delivery({ pedido_extraido: { acordes: 3, bpm: 76, frases: null } })).ok, true);
});
