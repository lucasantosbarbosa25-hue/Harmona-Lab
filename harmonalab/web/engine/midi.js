// Projeto → bytes de um arquivo MIDI (.mid) — espelho de harmonalab/midi_io.py.
// Gera exatamente os mesmos bytes que o mido gera no Python (há teste comparando).
//
// Tipo 0 (uma faixa), 480 ticks por semínima, sem program change: acordes no canal 1 e frases no canal 2.
// Nota comum entre acordes: o note_off vem antes do note_on no mesmo tick.

import { roundHalfEven } from "./numbers.js";
import { sounding, strumFor, velocityFor } from "./model.js";
import { TICKS_PER_BEAT } from "./phrase.js";

export { TICKS_PER_BEAT };
const CHANNEL = 0;
const PHRASE_CHANNEL = 1;
/** O que entra no arquivo: acorde + frase, só os acordes, ou mão esquerda/baixo + frase (a mão direita canta a frase). */
export const PHRASE_MODES = ["both", "chords", "line"];

const TEXT_REPLACEMENTS = [
  ["→", "->"], ["♭", "b"], ["♯", "#"], ["𝄪", "##"], ["𝄫", "bb"], ["♮", ""],
  ["△", "maj"], ["Δ", "maj"], ["–", "-"], ["—", "-"], ["“", '"'], ["”", '"'], ["’", "'"],
];

export const beatsToTicks = (beats, ticksPerBeat = TICKS_PER_BEAT) => roundHalfEven(beats * ticksPerBeat);

/**
 * Quando cada nota de um strum entra, em ticks depois do início do acorde.
 * A 1ª nota entra no tempo e cada seguinte `delayMs` depois da anterior. O fim do acorde não muda.
 * O strum ocupa no máximo metade do acorde: se não couber, o espaço entre as notas encolhe.
 * Devolve { offsets (na ordem em que as notas entram), compressed (se precisou encolher) }.
 */
export function strumPlan(count, delayMs, tempo, length, ticksPerBeat = TICKS_PER_BEAT) {
  if (count < 2 || delayMs <= 0) return { offsets: new Array(count).fill(0), compressed: false };
  let step = delayMs * tempo * ticksPerBeat / 60000;
  const limit = length / 2;
  const compressed = (count - 1) * step > limit;
  if (compressed) step = limit / (count - 1);
  return { offsets: Array.from({ length: count }, (_, i) => roundHalfEven(i * step)), compressed };
}

/** Texto seguro para metadados MIDI: latin-1, o resto vira "?". Devolve os bytes. */
function metaTextBytes(text) {
  for (const [src, dst] of TEXT_REPLACEMENTS) text = text.replaceAll(src, dst);
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    bytes.push(code <= 0xff ? code : 0x3f);
  }
  return bytes;
}

function varInt(value) {
  const bytes = [];
  while (value > 0) {
    bytes.push(value & 0x7f);
    value = Math.floor(value / 128);
  }
  if (!bytes.length) return [0];
  bytes.reverse();
  for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
  return bytes;
}

const meta = (type, data) => ({ meta: true, bytes: [0xff, type, ...varInt(data.length), ...data] });

/** Alturas de um toque da levada, do grave ao agudo. `voices` = [{note, part}] já do grave ao agudo. */
function hitNotes(voices, part, scale) {
  if (!voices.length) return [];
  if (part[0] === "S" || part[0] === "M") {
    // grau da escala: sobe a escala (ou, sem ela, as notas do acorde) a partir do baixo (S) ou da mão direita (M)
    let base = voices[0].note.midi;
    if (part[0] === "M") {
      const right = voices.filter((v) => v.part === "right_hand" || v.part === "notes");
      base = right.length ? right[0].note.midi : base + 12;
    }
    const pcs = new Set(scale.size ? scale : voices.map((v) => v.note.midi % 12));
    pcs.add(base % 12);
    let pitch = base;
    for (let i = 1; i < parseInt(part[1], 10); i++) {
      pitch += 1;
      while (!pcs.has(pitch % 12)) pitch += 1;
    }
    return pitch <= 127 ? [pitch] : [];
  }
  if (part === "T") return voices.map((v) => v.note.midi);
  if (part === "E") return voices.filter((v) => v.part === "bass" || v.part === "left_hand").map((v) => v.note.midi);
  if (part === "D") return voices.filter((v) => v.part === "right_hand" || v.part === "notes").map((v) => v.note.midi);
  if (part === "B") return [voices[0].note.midi];
  if (part === "P") return [voices.at(-1).note.midi];
  return [voices[(parseInt(part, 10) - 1) % voices.length].note.midi];
}

/**
 * Notas do acorde no canal 1: [[início, fim, altura, velocity]], em ticks a partir do começo do acorde.
 * Sem levada: todas as notas juntas (com strum, se houver) até o fim. Com levada (comp): cada camada se repete até o
 * fim do acorde; a mesma tecla pedida duas vezes no mesmo instante soa uma vez só, e um toque novo corta o anterior.
 */
export function chordNotes(project, chord, length, phraseMode = "both", ticksPerBeat = TICKS_PER_BEAT) {
  let voices = sounding(chord);
  if (phraseMode === "line") voices = voices.filter((v) => v.part !== "right_hand");
  const velocity = velocityFor(project, chord);
  const direction = strumFor(project, chord);
  const scale = new Set(chord.phrase_pcs.map((s) => s.pc));
  const block = (pitches, start, end, vel) => {
    let offsets = pitches.map(() => 0);
    if (direction !== "off") {
      offsets = strumPlan(pitches.length, project.strum_delay_ms, project.tempo, end - start, ticksPerBeat).offsets;
      if (direction === "down") pitches = pitches.slice().reverse(); // a nota mais aguda entra primeiro
    }
    return pitches.map((pitch, i) => [start + offsets[i], end, pitch, vel]);
  };
  if (!chord.comp_layers.length) return block(voices.map((v) => v.note.midi), 0, length, velocity);

  const notes = [];
  for (const { hits, ticks } of chord.comp_layers) {
    for (let base = 0; base < length; base += ticks) {
      for (const hit of hits) {
        const start = base + hit.start;
        if (start >= length) break;
        const vel = Math.max(1, Math.min(127, velocity + hit.accent));
        notes.push(...block(hitNotes(voices, hit.part, scale), start, Math.min(start + hit.length, length), vel));
      }
    }
  }
  const byPitch = new Map();
  for (const note of notes.slice().sort((a, b) => a[0] - b[0])) {
    if (!byPitch.has(note[2])) byPitch.set(note[2], []);
    const same = byPitch.get(note[2]);
    const last = same.at(-1);
    if (last && last[0] === note[0]) {
      if (note[1] > last[1]) same[same.length - 1] = [note[0], note[1], note[2], Math.max(note[3], last[3])];
      continue;
    }
    if (last && last[1] > note[0]) last[1] = note[0];
    same.push(note.slice());
  }
  return [...byPitch.values()].flat().filter((n) => n[1] > n[0]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}

/**
 * Todas as notas do projeto, com tempo: { notes: [{start, end, pitch, velocity, channel, chord}], starts (tick de cada
 * acorde), end }. É a lista de onde sai o arquivo .mid, e a pré-escuta do app toca a mesma lista.
 */
export function noteEvents(project, { ticksPerBeat = TICKS_PER_BEAT, phraseMode = "both" } = {}) {
  if (!PHRASE_MODES.includes(phraseMode)) throw new Error(`phraseMode deve ser um de ${PHRASE_MODES.join(", ")} (recebido ${phraseMode}).`);
  const notes = [];
  const starts = [];
  let tick = 0;
  project.chords.forEach((chord, index) => {
    const length = beatsToTicks(chord.duration_beats, ticksPerBeat);
    starts.push(tick);
    for (const [start, end, pitch, velocity] of chordNotes(project, chord, length, phraseMode, ticksPerBeat)) {
      notes.push({ start: tick + start, end: tick + end, pitch, velocity, channel: CHANNEL, chord: index });
    }
    if (phraseMode !== "chords") {
      const velocity = velocityFor(project, chord);
      for (const e of chord.phrase_events) {
        notes.push({ start: tick + e.start, end: tick + e.start + e.length, pitch: e.note.midi, velocity, channel: PHRASE_CHANNEL, chord: index });
      }
    }
    tick += length;
  });
  return { notes, starts, end: tick };
}

/** Gera o .mid exatamente com as notas, oitavas e durações do projeto. */
export function midiBytes(project, { ticksPerBeat = TICKS_PER_BEAT, markers = true, phraseMode = "both" } = {}) {
  const [num, den] = project.time_signature;
  const { notes, starts, end: endTick } = noteEvents(project, { ticksPerBeat, phraseMode });
  // [tick, prioridade, altura, mensagem, canal]. Prioridade: note_off < marcador < note_on.
  const events = [];
  project.chords.forEach((chord, i) => {
    if (markers && chord.symbol) events.push([starts[i], 1, 0, meta(0x06, metaTextBytes(chord.symbol)), CHANNEL]);
  });
  for (const n of notes) {
    events.push([n.start, 2, n.pitch, { bytes: [0x90 | n.channel, n.pitch, n.velocity] }, n.channel]);
    events.push([n.end, 0, n.pitch, { bytes: [0x80 | n.channel, n.pitch, 0] }, n.channel]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[4] - b[4]);

  const tempo = roundHalfEven(((60 * 1e6) / project.tempo) * 4 / 4);
  const messages = [
    [0, meta(0x03, metaTextBytes(project.title || "Harmona Lab"))],
    [0, meta(0x58, [num, Math.log2(den), 24, 8])],
    [0, meta(0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff])],
  ];
  let last = 0;
  for (const [at, , , msg] of events) {
    messages.push([at - last, msg]);
    last = at;
  }
  messages.push([endTick - last, meta(0x2f, [])]);

  // Faixa com "running status" (igual ao mido).
  const track = [];
  let running = null;
  for (const [delta, msg] of messages) {
    track.push(...varInt(delta));
    if (msg.meta) {
      track.push(...msg.bytes);
      running = null;
    } else {
      const status = msg.bytes[0];
      track.push(...(status === running ? msg.bytes.slice(1) : msg.bytes));
      running = status;
    }
  }

  const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(0), ...u16(1), ...u16(ticksPerBeat), // MThd
    0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track, // MTrk
  ]);
}
