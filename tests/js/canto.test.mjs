// Canto -> notas (engine/canto.js), testado com voz sintética (tests/js/canto_fixture.mjs): sem microfone.
import assert from "node:assert/strict";
import { test } from "node:test";

import { CLICK_MIDI, estimateKey, estimateTuning, measureClicks, midiFromHz, quantize, snapPitch, transcribe, voiceText, woodblockSamples, yin } from "../../harmonalab/web/engine/canto.js";
import { loadProject } from "../../harmonalab/web/engine/model.js";
import { MELODY, RATE, score, singMelody } from "./canto_fixture.mjs";

const run = (opts = {}, transcribeOpts = {}, melody = MELODY) => {
  const take = singMelody(melody, { latency: 0.08, ...opts });
  const result = transcribe(take.samples, RATE, { bpm: opts.bpm ?? 80, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08, ...transcribeOpts });
  return { result, s: score(result.events, take.truth) };
};

test("YIN acha a altura de uma voz (com harmônicos) em toda a extensão do canto", () => {
  for (const midi of [43, 52, 57, 64, 69, 76, 81]) {
    const hz = 440 * 2 ** ((midi - 69) / 12);
    const buf = new Float32Array(1024);
    for (let i = 0; i < buf.length; i++) for (let h = 1; h <= 6; h++) buf[i] += Math.sin((2 * Math.PI * hz * h * i) / 16000) / h;
    const found = yin(buf, 16000);
    assert.ok(found && Math.abs(midiFromHz(found.hz) - midi) < 0.1, `${midi}: ${found && midiFromHz(found.hz)}`);
  }
});

test("a melodia cantada vira as notas certas: limpa, com vibrato, desafinada, com respiração, grave e aguda, com tempo humano", () => {
  for (const [label, opts] of [
    ["limpa", {}], ["vibrato", { vibrato: 40 }], ["35 centésimos abaixo", { detune: -35 }], ["respiração", { noise: -20 }],
    ["grave", { transpose: -12 }], ["aguda", { transpose: 7 }], ["tempo humano", { jitter: 0.035 }], ["deslize", { glide: 0.06, legato: true }],
    ["120 BPM", { bpm: 120 }], ["tudo junto", { vibrato: 30, detune: -20, noise: -24, jitter: 0.03, glide: 0.04 }],
  ]) {
    const { result, s } = run(opts);
    assert.equal(s.hits, s.total, `${label}: ${s.hits}/${s.total} (${result.text})`);
    assert.equal(s.extra, 0, `${label}: notas a mais`);
  }
});

test("afinação geral e tonalidade: quem canta todo um pouco baixo não erra as notas; o tom sai certo", () => {
  const { result } = run({ detune: -35 });
  assert.ok(Math.abs(result.tuning.offset + 0.35) < 0.08, `afinação estimada: ${result.tuning.offset}`);
  assert.equal(result.key.name, "Am");
  assert.ok(result.warnings.some((w) => w.includes("35 centésimos abaixo")));
  // nota no meio do caminho: a escala decide
  const scale = estimateKey([{ midi: 60, start: 0, end: 1 }, { midi: 64, start: 1, end: 2 }, { midi: 67, start: 2, end: 3 }]).scale;
  assert.equal(snapPitch(65.45, 0, scale), 65); // F, e não F#, em dó maior
  assert.equal(estimateTuning([{ midi: 60.2, start: 0, end: 1 }, { midi: 62.2, start: 1, end: 2 }]).offset.toFixed(1), "0.2");
});

test("metrônomo: o clique soa entre dois semitons; o vazamento e o atraso são medidos na contagem", () => {
  for (const accent of [false, true]) {
    const wav = woodblockSamples(16000, accent);
    const found = yin(wav.subarray(0, 512), 16000);
    const expected = accent ? CLICK_MIDI.accent : CLICK_MIDI.normal;
    // a detecção às vezes lê o clique uma oitava abaixo: a rejeição do app cobre as duas
    const heard = found && midiFromHz(found.hz);
    assert.ok(found && [expected, expected - 12].some((m) => Math.abs(heard - m) < 0.3), `clique em ${heard}`);
    assert.ok(Math.abs(expected - Math.round(expected)) > 0.45, "entre dois semitons");
  }
  const take = singMelody(MELODY, { click: -10, latency: 0.11 });
  const leak = measureClicks(take.samples, RATE, take.clickTimes.slice(0, 4));
  assert.equal(leak.leak, true);
  assert.ok(Math.abs(leak.latency - 0.11) < 0.006, `atraso medido: ${leak.latency}`);
  const quiet = singMelody(MELODY, {});
  assert.equal(measureClicks(quiet.samples, RATE, quiet.clickTimes.slice(0, 4)).leak, false, "com fone, nada vaza");
});

test("sem fone: o clique vazando (até mais alto que a voz) e o eco da sala não atrapalham as notas", () => {
  for (const db of [-20, -10, 0, 6]) {
    const { s } = run({ click: db, vibrato: 30, jitter: 0.025 });
    assert.equal(s.hits, s.total, `clique ${db} dB`);
  }
  const gapped = MELODY.slice(0, 6).concat(MELODY.slice(6).map((e) => ({ ...e, beat: e.beat + 4 })));
  for (const echo of [0.15, 0.3]) {
    const { s } = run({ click: 0, echo, vibrato: 25, jitter: 0.02 }, {}, gapped);
    assert.equal(s.hits, s.total, `eco ${echo}s`);
    assert.equal(s.extra, 0, `eco ${echo}s: nenhuma nota falsa do clique`);
  }
  const { result } = run({ click: 6, echo: 0.3 }, {}, gapped);
  assert.ok(result.warnings.some((w) => w.includes("mais alto que a voz")), "avisa quando o clique está alto demais");
});

test("ritmo: semicolcheias e notas repetidas encaixam no pulso; anacruse ganha um compasso", () => {
  const fast = [69, 71, 72, 74, 76, 76, 74, 72, 71, 69, 69, 67, 69, 72, 76, 74].map((midi, i) => ({ beat: i * 0.25, beats: 0.25, midi }));
  fast.push({ beat: 4, beats: 1, midi: 69 }, { beat: 5, beats: 1, midi: 69 }, { beat: 6, beats: 0.5, midi: 72 }, { beat: 6.5, beats: 0.5, midi: 72 }, { beat: 7, beats: 1, midi: 71 });
  const { s } = run({ bpm: 80, vibrato: 25, jitter: 0.02 }, {}, fast);
  assert.equal(s.hits, s.total);
  const q = quantize([{ note: 64, start: -0.38, end: 0 }, { note: 67, start: 0.01, end: 0.7 }], { bpm: 80, beatsPerBar: 4 });
  assert.equal(q.shift, 4, "anacruse: um compasso a mais no começo");
  assert.deepEqual(q.events.map((e) => [e.beat, e.midi]), [[3.5, 64], [4, 67]]);
});

test("o resultado vira texto na notação de frase do app, que o motor lê sem erro", () => {
  const { result } = run({ vibrato: 20 });
  assert.match(result.text, /^A4\/4 C5\/8 D5\/8 E5\/4 D5\/8 C5\/8 A4\/2 G4\/4 E4\/4$/);
  const flats = voiceText([{ beat: 0, beats: 1, midi: 70 }, { beat: 2, beats: 1, midi: 65 }], { key: { flats: true } });
  assert.equal(flats, "Bb4/4 r/4 F4/4");
  const { project } = loadProject({ chords: [{ notes: "A3 C4 E4", duration_beats: 8, phrase: result.text }] });
  assert.equal(project.chords[0].phrase_events.length, 9);
});
