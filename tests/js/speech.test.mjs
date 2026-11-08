// Ditado por voz com um reconhecimento de fala simulado. Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";

import { createDictation, mergeDictation, speechSupported } from "../../harmonalab/web/ai/speech.js";

class FakeRecognition {
  constructor() { FakeRecognition.last = this; }
  start() { this.started = true; this.onstart?.(); }
  stop() { this.stopped = true; this.onend?.(); }
  say(...items) { this.onresult({ results: items.map(([text, isFinal]) => Object.assign([{ transcript: text }], { isFinal })) }); }
}
const win = { webkitSpeechRecognition: FakeRecognition };

test("detecta o suporte do navegador", () => {
  assert.equal(speechSupported({}), false);
  assert.equal(speechSupported(win), true);
  assert.equal(speechSupported({ SpeechRecognition: FakeRecognition }), true);
  assert.equal(createDictation({ win: {}, onUpdate() {} }), null);
});

test("ditado: estados, texto parcial e final, uma frase por toque", () => {
  const states = [];
  const updates = [];
  const d = createDictation({ win, onUpdate: (t) => updates.push(t), onState: (s) => states.push(s) });
  d.toggle();
  const rec = FakeRecognition.last;
  assert.equal(rec.lang, "pt-BR");
  assert.equal(rec.interimResults, true);
  assert.equal(rec.continuous, false);
  assert.equal(d.listening, true);
  d.start(); // já ouvindo: não cria outro reconhecimento
  assert.equal(FakeRecognition.last, rec);

  rec.say(["oito acordes", false]);
  rec.say(["oito acordes setenta e seis BPM", true], ["estilo Djavan", false]);
  assert.deepEqual(updates, [
    { finalText: "", interimText: "oito acordes" },
    { finalText: "oito acordes setenta e seis BPM", interimText: "estilo Djavan" },
  ]);
  d.toggle(); // segundo toque para
  assert.equal(d.listening, false);
  assert.deepEqual(states, ["listening", "idle"]);
});

test("erros do ditado viram mensagens, e 'aborted' é ignorado", () => {
  const errors = [];
  const d = createDictation({ win, onUpdate() {}, onError: (m, code) => errors.push([code, m]) });
  d.start();
  const rec = FakeRecognition.last;
  rec.onerror({ error: "not-allowed" });
  rec.onerror({ error: "aborted" });
  rec.onerror({ error: "no-speech" });
  rec.onerror({ error: "estranho" });
  assert.deepEqual(errors.map(([code]) => code), ["not-allowed", "no-speech", "estranho"]);
  assert.match(errors[0][1], /permissão/);
  assert.match(errors[1][1], /Não ouvi nada/);
  assert.match(errors[2][1], /Erro no ditado \(estranho\)/);
});

test("início que falha avisa e volta ao repouso", () => {
  class Broken extends FakeRecognition { start() { throw new Error("já iniciado"); } }
  const states = [];
  const errors = [];
  const d = createDictation({ win: { SpeechRecognition: Broken }, onUpdate() {}, onState: (s) => states.push(s), onError: (m) => errors.push(m) });
  d.start();
  assert.equal(d.listening, false);
  assert.deepEqual(states, ["idle"]);
  assert.match(errors[0], /Não consegui iniciar/);
});

test("mergeDictation junta o que já estava escrito com o que foi ditado", () => {
  assert.equal(mergeDictation("", { finalText: "", interimText: "" }), "");
  assert.equal(mergeDictation("já escrito", { finalText: "", interimText: "" }), "já escrito");
  assert.equal(mergeDictation("", { finalText: "oito acordes", interimText: "" }), "oito acordes");
  assert.equal(mergeDictation("já escrito", { finalText: "oito acordes", interimText: "e mais" }), "já escrito oito acordes e mais");
  assert.equal(mergeDictation("termina com espaço ", { finalText: "", interimText: "falando" }), "termina com espaço falando");
});
