import assert from "node:assert/strict";
import { test } from "node:test";
import { midiBytes } from "../../harmonalab/web/engine/midi.js";
import { melodyFromMidi, melodyTracks, parseMidi } from "../../harmonalab/web/engine/midi-read.js";
import { loadProject } from "../../harmonalab/web/engine/model.js";

const project = () => loadProject({
  title: "t", tempo: 92, time_signature: "3/4", voice: "r/4 A4/4 C5/8 D5/8 E5/2 B4/4", drums: "K/4 S/4 S/4",
  chords: [{ symbol: "Am", duration_beats: 3, left_hand: ["A2"], right_hand: ["C4", "E4"] }, { symbol: "F", duration_beats: 3, left_hand: ["F2"], right_hand: ["A3", "C4"] }],
}).project;

test("lê o próprio MIDI do app: BPM, compasso, faixas, e a Voz volta igual", () => {
  const midi = parseMidi(midiBytes(project()));
  assert.equal(Math.round(midi.bpm), 92);
  assert.equal(midi.timeSignature, "3/4");
  assert.equal(midi.division, 480);
  const tracks = melodyTracks(midi);
  assert.equal(tracks[0].label.startsWith("Voz"), true, "a faixa chamada Voz vem primeiro");
  assert.ok(!tracks.some((t) => t.label.startsWith("Bateria")), "a bateria não é melodia");
  const melody = melodyFromMidi(midi, tracks[0].index);
  assert.equal(melody.text, "r/4 A4/4 C5/8 D5/8 E5/2 B4/4");
  assert.equal(melody.source, "midi");
});

test("faixa com acordes: fica a nota mais aguda de cada vez, e avisa", () => {
  const midi = parseMidi(midiBytes(project()));
  const chords = melodyTracks(midi).find((t) => t.label.startsWith("t ·"));
  const melody = melodyFromMidi(midi, chords.index);
  assert.deepEqual(melody.events.map((e) => e.midi), [64, 60]);
  assert.match(melody.warnings.join(" "), /mais aguda/);
});

test("arquivo que não é MIDI: erro claro", () => {
  assert.throws(() => parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])), /não é um MIDI/);
});

test("arquivos MIDI quebrados ou maliciosos: nunca travam; no máximo, um erro em português", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const good = midiBytes(project());
  for (let round = 0; round < 400; round++) {
    const bytes = Uint8Array.from(good);
    const cuts = 1 + Math.floor(rnd() * 8);
    for (let k = 0; k < cuts; k++) bytes[Math.floor(rnd() * bytes.length)] = Math.floor(rnd() * 256); // bytes trocados ao acaso
    const sliced = rnd() < 0.3 ? bytes.subarray(0, Math.floor(rnd() * bytes.length)) : bytes; // ou o arquivo cortado
    try {
      const midi = parseMidi(sliced);
      for (const t of melodyTracks(midi)) melodyFromMidi(midi, t.index);
    } catch (err) {
      assert.ok(err instanceof Error, "só erros comuns");
    }
  }
});
