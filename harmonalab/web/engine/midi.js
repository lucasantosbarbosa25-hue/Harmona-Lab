// Projeto → bytes de um arquivo MIDI (.mid) — espelho de harmonalab/midi_io.py.
// Gera exatamente os mesmos bytes que o mido gera no Python (há teste comparando).
//
// Tipo 0 (uma faixa), 480 ticks por semínima, sem program change: acordes no canal 1 e frases no canal 2.
// Nota comum entre acordes: o note_off vem antes do note_on no mesmo tick.

import { roundHalfEven } from "./numbers.js";
import { pitches, sounding, strumFor, velocityFor } from "./model.js";
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

/** Gera o .mid exatamente com as notas, oitavas e durações do projeto. */
export function midiBytes(project, { ticksPerBeat = TICKS_PER_BEAT, markers = true, phraseMode = "both" } = {}) {
  if (!PHRASE_MODES.includes(phraseMode)) throw new Error(`phraseMode deve ser um de ${PHRASE_MODES.join(", ")} (recebido ${phraseMode}).`);
  const [num, den] = project.time_signature;
  // [tick, prioridade, altura, mensagem, canal]. Prioridade: note_off < marcador < note_on.
  const events = [];
  let tick = 0;
  for (const chord of project.chords) {
    const length = beatsToTicks(chord.duration_beats, ticksPerBeat);
    const velocity = velocityFor(project, chord);
    if (markers && chord.symbol) events.push([tick, 1, 0, meta(0x06, metaTextBytes(chord.symbol)), CHANNEL]);
    let notes = pitches(chord); // do grave ao agudo
    if (phraseMode === "line") notes = sounding(chord).filter((v) => v.part !== "right_hand").map((v) => v.note.midi);
    let offsets = notes.map(() => 0);
    const direction = strumFor(project, chord);
    if (direction !== "off") {
      offsets = strumPlan(notes.length, project.strum_delay_ms, project.tempo, length, ticksPerBeat).offsets;
      if (direction === "down") notes = notes.slice().reverse(); // a nota mais aguda entra primeiro
    }
    for (const [i, pitch] of notes.entries()) {
      events.push([tick + offsets[i], 2, pitch, { bytes: [0x90 | CHANNEL, pitch, velocity] }, CHANNEL]);
      events.push([tick + length, 0, pitch, { bytes: [0x80 | CHANNEL, pitch, 0] }, CHANNEL]);
    }
    if (phraseMode !== "chords") {
      for (const e of chord.phrase_events) {
        const pitch = e.note.midi;
        events.push([tick + e.start, 2, pitch, { bytes: [0x90 | PHRASE_CHANNEL, pitch, velocity] }, PHRASE_CHANNEL]);
        events.push([tick + e.start + e.length, 0, pitch, { bytes: [0x80 | PHRASE_CHANNEL, pitch, 0] }, PHRASE_CHANNEL]);
      }
    }
    tick += length;
  }
  const endTick = tick;
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
