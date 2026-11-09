// Frases melódicas no motor do navegador (a paridade com o Python é conferida em tests/test_js_parity.py).
// Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeData } from "../../harmonalab/web/engine/analysis.js";
import { midiBytes } from "../../harmonalab/web/engine/midi.js";
import { loadProject, projectToDict, renameProjectNotes } from "../../harmonalab/web/engine/model.js";
import { durationTicks, normalizeRole, parsePhrase, parseScale, phraseText, renamePhraseText, splitPhrase } from "../../harmonalab/web/engine/phrase.js";

const B7ALT = {
  symbol: "B7alt", duration_beats: 4, left_hand: "B2 A3", right_hand: "D4 Eb4 G4 C5",
  phrase: "G5/8 F5/8 Eb5/4*alvo D5/8 C5/8 B4/4*alvo", phrase_scale: "B C D Eb F G A",
};
const one = (chord) => ({ chords: [{ notes: "C4 E4 G4", ...chord }] });
const messages = (data) => analyzeData(data).issues.filter((i) => i.field === "phrase").map((i) => [i.level, i.message]);

test("durações em ticks, com tercina, quiáltera e ponto", () => {
  const expected = { 1: 1920, 4: 480, 8: 240, 16: 120, 32: 60, 64: 30, "4.": 720, "8t": 160, "16q": 96, "8t.": 240 };
  for (const [text, ticks] of Object.entries(expected)) assert.equal(durationTicks(text), ticks, text);
  for (const bad of ["", "0", "3", "5", "128", "4x", "t", "4tt"]) assert.throws(() => durationTicks(bad), `${bad} deveria falhar`);
});

test("o início de cada nota é a soma das durações; pausa avança sem nota", () => {
  const { events, ticks, errors } = parsePhrase(B7ALT.phrase, "C4");
  assert.deepEqual(errors, []);
  assert.deepEqual(events.map((e) => e.start), [0, 240, 480, 960, 1200, 1440]);
  assert.equal(ticks, 1920);
  assert.deepEqual(events.map((e) => e.role), ["", "", "alvo", "", "", "alvo"]);
  assert.deepEqual(parsePhrase("r/4 C5/8 R/8 D5/4", "C4").events.map((e) => [e.start, e.length]), [[480, 240], [960, 480]]);
});

test("papéis livres, separadores, lista, escala e troca de oitava", () => {
  assert.equal(normalizeRole("Aproximação"), "aprox");
  assert.equal(normalizeRole("Tensão"), "tensao");
  assert.deepEqual(splitPhrase("C5/8, D5/8; E5/8 | F5/8"), ["C5/8", "D5/8", "E5/8", "F5/8"]);
  assert.equal(phraseText(["C5/8", "  D5/8 "]), "C5/8 D5/8");
  assert.deepEqual(parseScale("c C d# Fx").scale, [{ pc: 0, name: "C" }, { pc: 3, name: "D#" }, { pc: 7, name: "F##" }]);
  assert.equal(renamePhraseText("C5/8 r/8 Eb4/4*alvo 60/4", "C4", "C3"), "C4/8 r/8 Eb3/4*alvo 60/4");
  assert.equal(renameProjectNotes({ chords: [{ phrase: "C5/8" }] }, "C3").chords[0].phrase, "C4/8");
});

test("a frase de exemplo passa sem avisos e vai e volta no JSON", () => {
  assert.deepEqual(messages({ chords: [B7ALT] }), []);
  const { project } = loadProject({ style: " Neo-soul ", chords: [B7ALT] });
  const dict = projectToDict(project);
  assert.equal(dict.style, "Neo-soul");
  assert.equal(dict.chords[0].phrase, B7ALT.phrase);
  assert.deepEqual(projectToDict(loadProject(dict).project), dict);
  assert.equal("phrase" in projectToDict(loadProject({ chords: [{ notes: "C4" }] }).project).chords[0], false);
});

test("erros de escrita e frase maior que o acorde bloqueiam; o resto só avisa", () => {
  assert.equal(analyzeData(one({ duration_beats: 1, phrase: "C5/4 D5/4" })).ok, false);
  assert.match(messages(one({ duration_beats: 1, phrase: "C5/4 D5/4" }))[0][1], /A frase dura 2 tempos, mais que os 1 do acorde/);
  assert.equal(analyzeData(one({ phrase: "C5 D5/9" })).ok, false);
  assert.equal(analyzeData(one({ phrase: { x: 1 }, phrase_scale: 7 })).ok, false);
  assert.equal(analyzeData(one({ phrase: "A4/4*aprox C5/4*alvo", phrase_scale: "C D" })).ok, true);
});

test("conferências: alvo no tempo e no acorde, aproximação por semitom, escala e tessitura", () => {
  const chord = { left_hand: "C3", right_hand: "E3 G3 B3", phrase_scale: "C D E F G A B" };
  assert.deepEqual(messages({ chords: [{ ...chord, phrase: "D5/8 E5/8*alvo F5/8*alvo" }] }).map(([, m]) => m),
    ["O alvo E5 não cai num tempo: começa em 1.5.", "O alvo F5 não é nota do acorde."]);
  assert.match(messages(one({ phrase: "A4/4*aprox C5/4" }))[0][1], /não resolve por semitom: a nota seguinte é C5 \(3 semitons\)/);
  assert.deepEqual(messages(one({ phrase: "F5/8*aprox D#5/8*aprox E5/4*alvo" })).filter(([, m]) => m.includes("aproxima")), []); // envolvente
  const next = { chords: [{ notes: "C4 E4 G4", phrase: "C5/4 D5/2*aprox" }, { notes: "C4 E4 G4" }] };
  assert.match(messages(next).find(([, m]) => m.includes("aproxima"))[1], /nenhuma nota do próximo acorde/);
  assert.match(messages(one({ phrase: "C5/8 Db5/8 Eb5/8 F#5/8*passagem", phrase_scale: "C D E F G" }))[0][1], /fora da escala da frase \(C D E F G\): Db, Eb\./);
  assert.match(messages(one({ phrase: "C2/8 C8/4", phrase_scale: "C" }))[0][1], /tessitura confortável da frase \(C3 a C7\): C2 C8/);
  assert.deepEqual(messages(one({ phrase: "C5/8" })).map(([level]) => level), ["info"]); // sem escala declarada
});

test("o MIDI leva a frase no canal 2 e os três modos funcionam", () => {
  const { project } = loadProject({ chords: [B7ALT] });
  const channels = (bytes) => new Set([...bytes].map((b, i, all) => ((all[i - 1] === undefined ? 0 : 1) && (b & 0xf0) === 0x90 ? b & 0x0f : null)).filter((c) => c !== null));
  assert.ok(channels(midiBytes(project, { phraseMode: "both" })).has(1));
  assert.ok(!channels(midiBytes(project, { phraseMode: "chords" })).has(1));
  assert.throws(() => midiBytes(project, { phraseMode: "outro" }));
  assert.notDeepEqual(midiBytes(project, { phraseMode: "line" }), midiBytes(project, { phraseMode: "both" }));
});
