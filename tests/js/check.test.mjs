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
