// Voz sintética para testar a detecção do canto (engine/canto.js) sem microfone: uma melodia "cantada" com harmônicos,
// vibrato, desafinação geral, respiração (ruído), imprecisão de tempo, deslize entre notas e o clique do metrônomo
// vazando para o microfone com atraso.
import { hzFromMidi, woodblockSamples } from "../../harmonalab/web/engine/canto.js";

export const RATE = 48000;

// Uma frase em Lá menor, 2 compassos de 4/4 (tempos a partir do tempo 1 depois da contagem).
export const MELODY = [
  { beat: 0, beats: 1, midi: 69 }, { beat: 1, beats: 0.5, midi: 72 }, { beat: 1.5, beats: 0.5, midi: 74 }, { beat: 2, beats: 1, midi: 76 },
  { beat: 3, beats: 0.5, midi: 74 }, { beat: 3.5, beats: 0.5, midi: 72 }, { beat: 4, beats: 2, midi: 69 }, { beat: 6, beats: 1, midi: 67 },
  { beat: 7, beats: 1, midi: 64 },
];

function noiseGen(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; };
}

/**
 * Grava a melodia "cantada". options: { bpm, transpose (semitons), vibrato (centésimos), detune (centésimos), noise (dB em
 * relação à voz; null = sem), jitter (s), glide (s), legato, click (dB do clique em relação à voz; null = sem vazamento),
 * latency (s), countIn (tempos), seed, echo (s: eco da sala no clique), scoop (s: a voz chega de baixo em cada nota),
 * tremolo (0 a 1: o volume oscila), tail (o fim da respiração depois da última nota) }.
 * Devolve { samples, clickTimes (agendados), truth (eventos esperados) }.
 */
export function singMelody(melody = MELODY, {
  bpm = 80, transpose = 0, vibrato = 0, detune = 0, noise = null, jitter = 0, glide = 0, legato = false,
  click = null, latency = 0.08, countIn = 4, seed = 7, lead = 0.4, echo = 0, scoop = 0, tremolo = 0, tail = false,
} = {}) {
  const rnd = noiseGen(seed);
  const beat = 60 / bpm;
  const totalBeats = countIn + Math.max(...melody.map((e) => e.beat + e.beats)) + 1;
  const length = Math.ceil((lead + totalBeats * beat + 0.5) * RATE);
  const out = new Float32Array(length);
  const clickTimes = Array.from({ length: Math.round(totalBeats) }, (_, i) => lead + i * beat);
  const zero = lead + countIn * beat + latency; // a pessoa canta junto do clique que ouve (com o atraso)
  const notes = melody.map((e) => ({ ...e, midi: e.midi + transpose, on: zero + e.beat * beat + jitter * rnd(), off: zero + (e.beat + e.beats) * beat - (legato ? 0 : 0.05) + jitter * rnd() * 0.5 }));
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const k = notes.findIndex((n) => t >= n.on && t < n.off);
    if (k < 0) { phase = 0; continue; }
    const n = notes[k];
    let midi = n.midi + detune / 100;
    const prev = notes[k - 1];
    if (glide && prev && t - n.on < glide) midi = prev.midi + detune / 100 + (midi - prev.midi - detune / 100) * ((t - n.on) / glide);
    if (scoop && t - n.on < scoop) midi -= 1.5 * (1 - (t - n.on) / scoop); // a voz chega de baixo na nota
    if (vibrato && t - n.on > 0.15) midi += (vibrato / 100) * Math.sin(2 * Math.PI * 5.5 * (t - n.on));
    const hz = hzFromMidi(midi);
    phase += (2 * Math.PI * hz) / RATE;
    const env = Math.min(1, (t - n.on) / 0.03) * Math.min(1, (n.off - t) / 0.04);
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(h * phase) / h ** 1.1;
    const shake = tremolo ? 1 - tremolo * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4.5 * (t - n.on))) : 1; // o volume oscila
    out[i] = 0.25 * env * shake * v;
  }
  if (tail) {
    // o fim da respiração: depois da última nota, a voz cai e some (curto e mais grave)
    const last = notes.at(-1);
    const from = last.off + 0.12;
    for (let i = Math.round(from * RATE); i < Math.min(length, Math.round((from + 0.14) * RATE)); i++) {
      const t = i / RATE - from;
      const hz = hzFromMidi(last.midi - 5 - 8 * t);
      out[i] += 0.12 * Math.sin(2 * Math.PI * hz * t) * Math.min(1, t / 0.01) * Math.min(1, (0.14 - t) / 0.02);
    }
  }
  if (noise != null) {
    const amp = 0.25 * 10 ** (noise / 20);
    for (let i = 0; i < length; i++) out[i] += amp * rnd();
  }
  if (click != null) {
    const gain = 0.25 * 10 ** (click / 20) / 0.7;
    clickTimes.forEach((t, i) => {
      const wav = woodblockSamples(RATE, i % 4 === 0);
      const at = Math.round((t + latency) * RATE);
      for (let j = 0; j < wav.length && at + j < length; j++) out[at + j] += gain * wav[j];
      // eco da sala: cópias do clique que somem em `echo` segundos
      for (let r = 1; echo && r * 0.023 < echo; r++) {
        const delay = Math.round(r * 0.023 * RATE);
        const g = gain * 0.6 * Math.exp((-r * 0.023) / (echo / 3));
        for (let j = 0; j < wav.length && at + delay + j < length; j++) out[at + delay + j] += g * wav[j];
      }
    });
  }
  const truth = melody.map((e) => ({ ...e, midi: e.midi + transpose }));
  return { samples: out, clickTimes, truth };
}

/** Acerto: notas certas (mesmo tempo e mesma altura), notas faltando e notas a mais. */
export function score(events, truth) {
  const key = (e) => `${Math.round(e.beat * 12)}:${e.midi}`;
  const found = new Set(events.map(key));
  const hits = truth.filter((e) => found.has(key(e))).length;
  const pitchAt = new Map(events.map((e) => [Math.round(e.beat * 12), e.midi]));
  const onsetHits = truth.filter((e) => pitchAt.has(Math.round(e.beat * 12))).length;
  const octaveErrors = truth.filter((e) => Math.abs((pitchAt.get(Math.round(e.beat * 12)) ?? e.midi) - e.midi) === 12).length;
  return { hits, total: truth.length, extra: events.length - hits, onsets: onsetHits, octaveErrors, accuracy: hits / truth.length };
}
