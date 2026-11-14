// Canto -> notas (engine/canto.js), testado com voz sintética (tests/js/canto_fixture.mjs): sem microfone.
import assert from "node:assert/strict";
import { test } from "node:test";

import { CLICK_MIDI, hatTickSamples, hzFromMidi, simplifyNotes, estimateKey, estimateTuning, measureClicks, midiFromHz, quantize, snapPitch, transcribe, voiceText, woodblockSamples, yin } from "../../harmonalab/web/engine/canto.js";
import { loadProject } from "../../harmonalab/web/engine/model.js";
import { MELODY, RATE, score, singMelody } from "./canto_fixture.mjs";

const run = (opts = {}, transcribeOpts = {}, melody = MELODY) => {
  const take = singMelody(melody, { latency: 0.08, ...opts });
  const result = transcribe(take.samples, RATE, { bpm: opts.bpm ?? 80, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08, fastest: "16", ...transcribeOpts });
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
  assert.ok(result.warnings.some((w) => /3[3-7] centésimos abaixo/.test(w)), result.warnings.join(" | "));
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

// Melodia lenta, sem notas rápidas, como a do primeiro teste no celular (Mi menor, 80 BPM), com o Mi repetido de propósito.
const SLOW = [{ beat: 0, beats: 2, midi: 60 }, { beat: 2, beats: 1, midi: 59 }, { beat: 3, beats: 1, midi: 57 }, { beat: 4, beats: 2, midi: 54 }, { beat: 6, beats: 2, midi: 52 }, { beat: 8, beats: 3, midi: 52 }, { beat: 11, beats: 1, midi: 55 }];

test("melodia simples (padrão: colcheia): uma nota cantada vira UMA nota, mesmo com scoop, volume oscilando, clique alto e fim de respiração", () => {
  for (const [label, opts] of [
    ["limpa", {}], ["chegando de baixo (scoop)", { scoop: 0.11 }], ["volume oscilando", { tremolo: 0.6 }],
    ["clique 12 dB acima da voz", { click: 12, latency: 0.19 }], ["fim da respiração", { tail: true }],
    ["tudo junto, como no celular", { scoop: 0.11, tremolo: 0.5, click: 12, latency: 0.19, tail: true, vibrato: 20, jitter: 0.03 }],
  ]) {
    const { result, s } = run({ bpm: 80, ...opts }, { fastest: "8" }, SLOW);
    assert.equal(s.hits, s.total, `${label}: ${result.text}`);
    assert.equal(s.extra, 0, `${label}: notas a mais (${result.text})`);
    assert.equal(result.text, "C4/2 B3/4 A3/4 F#3/2 E3/2 E3/2+4 G3/4", label);
  }
});

test("simplificar: o pedaço curto junta-se à nota que permanece (com o começo do primeiro); iguais repetidas de propósito ficam", () => {
  const n = (start, end, note) => ({ start, end, note, midi: note });
  // scoop: um Ré# curto antes do Mi longo vira o Mi, começando no Ré#
  assert.deepEqual(simplifyNotes([n(0, 0.1, 51), n(0.1, 1, 52)], { minSeconds: 0.2 }).map((x) => [x.start, x.note]), [[0, 52]]);
  // o mesmo Mi picado em pedaços curtos colados vira um só
  assert.equal(simplifyNotes([n(0, 0.15, 52), n(0.16, 0.3, 52), n(0.31, 0.6, 52)], { minSeconds: 0.2 }).length, 1);
  // repetido de propósito (duas notas longas com respiro) fica repetido
  assert.equal(simplifyNotes([n(0, 0.7, 52), n(0.76, 1.5, 52)], { minSeconds: 0.2 }).length, 2);
  // pedaço curto solto (longe das outras notas) sai
  assert.deepEqual(simplifyNotes([n(0, 1, 52), n(1.4, 1.5, 47)], { minSeconds: 0.2 }).map((x) => x.note), [52]);
  // salto grande não é scoop: o pedaço curto colado a uma nota longe sai, não muda a altura dela
  assert.deepEqual(simplifyNotes([n(0, 0.1, 45), n(0.1, 1, 52)], { minSeconds: 0.2 }).map((x) => x.note), [52]);
});

test("quem vai desafinando aos poucos (comum em quem não é cantor profissional): a afinação acompanha e as notas saem certas", () => {
  const long = [[0, 2, 64], [2, 1, 67], [3, 1, 69], [4, 2, 71], [6, 2, 69], [8, 1, 67], [9, 1, 64], [10, 2, 62], [12, 2, 64], [14, 1, 67], [15, 1, 66], [16, 4, 64]]
    .map(([beat, beats, midi]) => ({ beat, beats, midi }));
  for (const drift of [-90, -70, -50, 40, 70]) {
    const { result, s } = run({ bpm: 80, drift, vibrato: 20, jitter: 0.02 }, { fastest: "8" }, long);
    assert.equal(s.hits, s.total, `deriva de ${drift} centésimos: ${result.text}`);
    assert.equal(s.extra, 0);
    if (Math.abs(drift) >= 50) assert.ok(result.warnings.some((w) => w.includes("mudando aos poucos")), `avisa a deriva de ${drift}`);
  }
});

test("tique de chimbal nas colcheias: sem altura definida, e vazando junto com o clique não troca nem pica notas", () => {
  const tick = hatTickSamples(16000);
  const buf = new Float32Array(1024);
  buf.set(tick.subarray(0, Math.min(tick.length, 1024)));
  assert.equal(yin(buf, 16000), null, "o tique não tem nota");
  for (const [melody, label] of [[SLOW, "lenta"], [MELODY, "com colcheias"]]) {
    for (const bpm of [60, 80, 100]) {
      for (const db of [-10, 0, 12]) {
        const take = singMelody(melody, { bpm, click: db, eighths: true, latency: 0.15, vibrato: 20, jitter: 0.02, scoop: 0.08, tremolo: 0.3 });
        const r = transcribe(take.samples, RATE, { bpm, clickTimes: take.clickTimes, tickTimes: take.tickTimes, countInBeats: 4 });
        const s = score(r.events, take.truth);
        assert.equal(s.hits, s.total, `${label}, ${bpm} BPM, ${db} dB: ${r.text}`);
        assert.equal(s.extra, 0, `${label}, ${bpm} BPM, ${db} dB: notas a mais (${r.text})`);
      }
    }
  }
});

test("escala diatônica (padrão): a nota que escapou da escala vai para a nota da escala mais perto; desligado, fica como cantou", () => {
  // em Lá menor, o Mi da 4ª nota cantado como Ré# (um pouco alto, 75,1): na escala, a mais perto é o Mi
  const sung = MELODY.map((e, i) => (i === 3 ? { ...e, midi: 75.1 } : e));
  const take = singMelody(sung, { latency: 0.08, vibrato: 15 });
  const truth = MELODY;
  const on = transcribe(take.samples, RATE, { bpm: 80, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08 });
  assert.equal(score(on.events, truth).hits, truth.length, on.text);
  assert.equal(on.adjusted, 1);
  assert.ok(on.warnings.some((w) => w.includes("ajustada")), on.warnings.join(" | "));
  const off = transcribe(take.samples, RATE, { bpm: 80, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08, diatonic: false });
  assert.ok(off.text.includes("D#5") || off.text.includes("Eb5"), `sem o ajuste, fica o Ré#: ${off.text}`);
  // a sensível do tom menor (Sol# em Lá menor) é da escala
  const minor = estimateKey([{ midi: 57, start: 0, end: 1 }, { midi: 60, start: 1, end: 2 }, { midi: 64, start: 2, end: 3 }]);
  assert.equal(snapPitch(68, 0, minor.scale, { diatonic: true }), 68);
  assert.equal(snapPitch(65.9, 0, minor.scale, { diatonic: true }), 65); // um Fá# baixo: o Fá, mais perto
  assert.equal(snapPitch(66.1, 0, minor.scale, { diatonic: true }), 67); // um Fá# alto: o Sol, mais perto
});

test("ritmo automático: semicolcheias até 75 BPM (cada uma com 200 ms ou mais), colcheias acima", () => {
  const sixteenths = [69, 71, 72, 74, 76, 74, 72, 71].map((midi, i) => ({ beat: i * 0.25, beats: 0.25, midi })).concat([{ beat: 2, beats: 2, midi: 69 }]);
  for (const bpm of [60, 70, 75]) {
    const take = singMelody(sixteenths, { bpm, latency: 0.08, vibrato: 15, jitter: 0.015 });
    const r = transcribe(take.samples, RATE, { bpm, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08 });
    assert.equal(r.fastest, "16", `${bpm} BPM`);
    assert.equal(score(r.events, take.truth).hits, take.truth.length, `${bpm} BPM: ${r.text}`);
  }
  for (const bpm of [76, 90, 100]) {
    const take = singMelody(MELODY, { bpm, latency: 0.08, vibrato: 15, jitter: 0.015 });
    const r = transcribe(take.samples, RATE, { bpm, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08 });
    assert.equal(r.fastest, "8", `${bpm} BPM`);
    assert.equal(score(r.events, take.truth).hits, take.truth.length, `${bpm} BPM: ${r.text}`);
  }
});

test("anacruse: com 2 compassos de contagem, o canto pode entrar no segundo; o atraso é medido só no primeiro", () => {
  const melody = [{ beat: -1.5, beats: 0.5, midi: 64 }, { beat: -1, beats: 1, midi: 67 }, { beat: 0, beats: 2, midi: 72 }, { beat: 2, beats: 2, midi: 69 }];
  const take = singMelody(melody, { bpm: 80, click: -10, countIn: 8, latency: 0.12 });
  const out = transcribe(take.samples, RATE, { bpm: 80, clickTimes: take.clickTimes, countInBeats: 8, measureBeats: 4, pickupBeats: 4, fastest: "8", diatonic: false });
  assert.equal(out.leak.leak, true);
  assert.ok(Math.abs(out.latency - 0.12) < 0.02, `atraso ${out.latency}`);
  assert.equal(out.shift, 4);
  assert.deepEqual(out.events.map((e) => [e.beat, e.midi]), [[2.5, 64], [3, 67], [4, 72], [6, 69]]);
});

test("parte nova: o trecho anterior da música, tocando na contagem e vazando para o microfone, não vira nota", () => {
  const take = singMelody(MELODY, { bpm: 80, click: -12, countIn: 8, latency: 0.1 });
  // a harmonia do fim da parte anterior soa nos 2 compassos da contagem (um acorde de Dó maior, suave)
  const beat = 60 / 80;
  for (let i = Math.round(0.4 * RATE); i < Math.round((0.4 + 8 * beat) * RATE); i++) {
    const t = i / RATE;
    for (const midi of [48, 55, 64]) take.samples[i] += 0.05 * Math.sin(2 * Math.PI * hzFromMidi(midi) * t);
  }
  const out = transcribe(take.samples, RATE, { bpm: 80, clickTimes: take.clickTimes, countInBeats: 8, pickupBeats: 0, music: true, fastest: "8", diatonic: false });
  assert.equal(out.leak.leak, true, "o clique continua sendo achado, mesmo com a harmonia por baixo");
  assert.equal(out.shift, 0);
  assert.equal(score(out.events, take.truth).accuracy, 1);
  assert.equal(out.events.length, take.truth.length);
});

test("canto travado numa escala escolhida: blues, menor melódica, harmônica, bebop e outras", async () => {
  const { SING_SCALES, singScale, snapPitch: snap, estimateKey: guess } = await import("../../harmonalab/web/engine/canto.js");
  assert.deepEqual(SING_SCALES.map((s) => s.id), ["tom", "pentatonica", "blues", "melodica", "harmonica", "bebop", "dorico", "mixolidio", "frigiodominante"]);
  const am = { tonic: 9, mode: "menor", flats: false, name: "Am", scale: new Set([9, 11, 0, 2, 4, 5, 7, 8]) };
  const pcs = (id, key = am) => [...singScale(key, id).scale].sort((a, b) => a - b);
  assert.deepEqual(pcs("tom"), [0, 2, 4, 5, 7, 8, 9, 11]);
  assert.equal(singScale(am, "tom").name, "Am");
  assert.deepEqual(pcs("blues"), [0, 2, 3, 4, 7, 9]); // A C D Eb E G
  assert.equal(singScale(am, "blues").name, "A blues");
  assert.deepEqual(pcs("melodica"), [0, 2, 4, 6, 8, 9, 11]); // A B C D E F# G#
  assert.deepEqual(pcs("harmonica"), [0, 2, 4, 5, 8, 9, 11]); // A B C D E F G#
  assert.deepEqual(pcs("pentatonica"), [0, 2, 4, 7, 9]); // menor: A C D E G
  const c = { tonic: 0, mode: "maior", flats: false, name: "C", scale: new Set([0, 2, 4, 5, 7, 9, 11]) };
  assert.deepEqual(pcs("pentatonica", c), [0, 2, 4, 7, 9]); // maior: C D E G A
  assert.deepEqual(pcs("bebop", c), [0, 2, 4, 5, 7, 9, 10, 11]);
  assert.deepEqual(pcs("mixolidio", c), [0, 2, 4, 5, 7, 9, 10]);
  assert.deepEqual(pcs("dorico", c), [0, 2, 3, 5, 7, 9, 10]);
  // um Si (71) cantado em Lá menor: na diatônica fica; no blues vai para o Dó, a nota da escala mais perto
  assert.equal(snap(71, 0, singScale(am, "tom").scale, { diatonic: true }), 71);
  assert.equal(snap(71, 0, singScale(am, "blues").scale, { diatonic: true }), 72);
  assert.equal(snap(65, 0, singScale(am, "blues").scale, { diatonic: true }), 64); // o Fá vai para o Mi
  assert.equal(snap(65, 0, singScale(am, "melodica").scale, { diatonic: true }), 64); // na melódica não há Fá: vai para o Mi (o Fá# empata; vale a de baixo)
  // a gravação inteira: com a escala blues, nenhuma nota sai dela
  const take = singMelody(MELODY, { latency: 0.08 });
  const blues = transcribe(take.samples, RATE, { bpm: 80, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08, diatonic: true, scale: "blues" });
  const allowed = singScale(blues.key, "blues").scale;
  assert.ok(blues.events.length >= 5 && blues.events.every((e) => allowed.has(((e.midi % 12) + 12) % 12)), blues.text);
  assert.match(blues.scaleName, / blues$/);
  const plain = transcribe(take.samples, RATE, { bpm: 80, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08, diatonic: true });
  assert.equal(plain.scaleName, plain.key.name);
});

test("travado na escala, o canto mantém o contorno: subiu, sobe; desceu, desce; repetiu, repete", async () => {
  const { followContour, singScale } = await import("../../harmonalab/web/engine/canto.js");
  const am = { tonic: 9, mode: "menor", flats: false, name: "Am", scale: new Set([9, 11, 0, 2, 4, 5, 7, 8]) };
  const blues = singScale(am, "blues").scale; // A C D Eb E G
  // de um Lá (69), a voz sobe um tom (Si, 71): sozinha a escala daria o Dó (72), que já é subida
  assert.equal(followContour(71, 72, { raw: 69, note: 69 }, blues), 72);
  // de um Dó (72), a voz sobe meio tom (72 → 73): a escala daria o Dó de novo; pelo contorno, sobe para o Ré (74)
  assert.equal(followContour(73, 72, { raw: 72, note: 72 }, blues), 74);
  // de um Dó (72), a voz desce um tom (Si bemol, 70): a escala daria o Lá (69) ou voltaria ao Dó; fica abaixo: o Lá
  assert.equal(followContour(70, 72, { raw: 72, note: 72 }, blues), 69);
  // desceu pouco, mas desceu: do Mi (76) para 75 (Mi bemol está na escala): o Mi bemol
  assert.equal(followContour(75, 75, { raw: 76, note: 76 }, blues), 75);
  // quase a mesma altura (menos de um quarto de tom de diferença... até meio semitom): repete a nota
  assert.equal(followContour(72.3, 74, { raw: 72, note: 72 }, blues), 72);
  // a nota anterior tinha sido empurrada para cima; a voz desce: a nova fica abaixo da anterior, mesmo que a escala desse a mesma
  assert.equal(followContour(70.6, 72, { raw: 71.4, note: 72 }, blues), 69);
  // subida grande: vale a nota da escala mais perto do que foi cantado (não a primeira de cima)
  assert.equal(followContour(79.2, 79, { raw: 69, note: 69 }, blues), 79);
  // a gravação inteira: o sentido de cada passo da melodia travada é o do canto
  const take = singMelody(MELODY, { latency: 0.08 });
  const out = transcribe(take.samples, RATE, { bpm: 80, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08, diatonic: true, scale: "blues" });
  for (let i = 1; i < out.notes.length; i++) {
    const a = out.notes[i - 1], b = out.notes[i];
    if (Math.abs(b.midi - a.midi) >= 1) assert.equal(Math.sign(b.note - a.note), Math.sign(b.midi - a.midi), `nota ${i}: cantou ${a.midi.toFixed(1)} → ${b.midi.toFixed(1)}, ficou ${a.note} → ${b.note}`);
  }
});

test("notas curtas: acima de 75 BPM, a grade automática passa a semicolcheias quando a pessoa canta notas rápidas", async () => {
  const { sangQuickNotes } = await import("../../harmonalab/web/engine/canto.js");
  const scale = [69, 71, 72, 74, 76, 74, 72, 71].map((midi, i) => ({ beat: i * 0.25, beats: 0.25, midi }))
    .concat([{ beat: 2, beats: 1, midi: 69 }, { beat: 3, beats: 0.25, midi: 72 }, { beat: 3.25, beats: 0.25, midi: 74 }, { beat: 3.5, beats: 0.5, midi: 76 }]);
  const mixed = [{ beat: 0, beats: 0.5, midi: 69 }, { beat: 0.5, beats: 0.25, midi: 72 }, { beat: 0.75, beats: 0.25, midi: 71 }, { beat: 1, beats: 1, midi: 69 },
    { beat: 2, beats: 0.25, midi: 67 }, { beat: 2.25, beats: 0.25, midi: 69 }, { beat: 2.5, beats: 0.25, midi: 71 }, { beat: 2.75, beats: 0.25, midi: 72 }, { beat: 3, beats: 1, midi: 74 }];
  const repeated = [69, 69, 69, 69, 72, 72, 72, 72].map((midi, i) => ({ beat: i * 0.25, beats: 0.25, midi })).concat([{ beat: 2, beats: 2, midi: 69 }]);
  for (const bpm of [90, 100]) {
    for (const [name, melody, need] of [["escala", scale, scale.length], ["mistas", mixed, mixed.length], ["repetidas", repeated, repeated.length - 1]]) {
      for (const voice of [{}, { vibrato: 20, jitter: 0.015, glide: 0.02 }]) {
        const take = singMelody(melody, { bpm, latency: 0.08, ...voice });
        const out = transcribe(take.samples, RATE, { bpm, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08, diatonic: false });
        assert.equal(out.fastest, "16", `${name} a ${bpm} BPM: a grade vira semicolcheias`);
        assert.ok(score(out.events, melody).hits >= need, `${name} a ${bpm} BPM: ${score(out.events, melody).hits} de ${melody.length} notas (${out.text})`);
      }
    }
    // melodia sem notas rápidas, com a voz chegando de baixo e deslizando: continua em colcheias, sem notas a mais
    const slow = [{ beat: 0, beats: 1, midi: 69 }, { beat: 1, beats: 1, midi: 72 }, { beat: 2, beats: 2, midi: 76 }, { beat: 4, beats: 0.5, midi: 74 }, { beat: 4.5, beats: 0.5, midi: 72 }, { beat: 5, beats: 1, midi: 72 }, { beat: 6, beats: 2, midi: 69 }];
    const take = singMelody(slow, { bpm, latency: 0.08, scoop: 0.09, glide: 0.06, vibrato: 30 });
    const out = transcribe(take.samples, RATE, { bpm, clickTimes: take.clickTimes, countInBeats: 4, latencyFallback: 0.08, diatonic: false });
    assert.equal(out.fastest, "8", `melodia lenta a ${bpm} BPM: continua em colcheias`);
    assert.equal(out.events.length, slow.length, out.text);
  }
  // um escorregão isolado não muda a grade; dois ataques rápidos, sim
  const at = (starts) => starts.map((start) => ({ start, end: start + 0.1 }));
  assert.equal(sangQuickNotes(at([0, 0.6, 0.75, 1.2, 1.8]), 100), false);
  assert.equal(sangQuickNotes(at([0, 0.15, 0.3, 0.9, 1.5]), 100), true);
});
