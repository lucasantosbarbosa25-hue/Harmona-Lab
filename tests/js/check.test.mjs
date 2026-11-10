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

const withChords = (chords, extra = {}) => delivery({ projeto: { ...GOOD_PROJECT, chords }, ...extra });

test("respostas de IA precisam da frase de função e das notas da escala em cada acorde; links, não", () => {
  const bare = withChords(GOOD_PROJECT.chords.map(({ comment, phrase_scale, ...c }) => c));
  assert.equal(checkDelivery(bare).ok, true);
  const strict = checkDelivery(bare, { requireFunctionNotes: true });
  assert.equal(strict.ok, false);
  assert.match(strict.problems.join("\n"), /Falta a frase de função \(campo "comment".*acorde\(s\) 1, 2, 3\./);
  assert.match(strict.problems.join("\n"), /Faltam as notas da escala \(campo "phrase_scale".*acorde\(s\) 1, 2, 3\./);
  const rest = withChords([...GOOD_PROJECT.chords, { symbol: "Pausa" }], { pedido_extraido: null });
  assert.equal(checkDelivery(rest, { requireFunctionNotes: true }).ok, true); // pausa não precisa de nada
  assert.equal(checkDelivery(delivery(), { requireFunctionNotes: true }).ok, true);
});

test("a escala precisa conter o acorde, e avisos de frase escrita à mão também bloqueiam", () => {
  const wrongScale = withChords(GOOD_PROJECT.chords.map((c, i) => (i === 1 ? { ...c, phrase_scale: "C D E F G A B" } : c)));
  assert.match(checkDelivery(wrongScale).problems.join("\n"), /Acorde 2 \(B7alt\), campo phrase_scale: A escala \(C D E F G A B\) não tem Eb, que é nota do acorde/);
  const offChord = withChords(GOOD_PROJECT.chords.map((c) => ({ ...c, phrase: "C5/8 D5/8*alvo" })));
  assert.match(checkDelivery(offChord).problems.join("\n"), /Acorde 1 \(Fmaj7\(#11\)\), campo phrase: O alvo D5 não é nota do acorde/);
  const noScale = withChords(GOOD_PROJECT.chords.map(({ phrase_scale, ...c }) => ({ ...c, phrase: "C5/4" })));
  assert.match(checkDelivery(noScale).problems.join("\n"), /Acorde\(s\) 1, 2, 3: a frase precisa vir com "phrase_scale"/);
});
