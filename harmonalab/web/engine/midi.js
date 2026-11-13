// Projeto → bytes de um arquivo MIDI (.mid) — espelho de harmonalab/midi_io.py.
// Gera exatamente os mesmos bytes que o mido gera no Python (há teste comparando).
//
// 480 ticks por semínima, sem program change. Só acordes: tipo 0 (uma faixa). Com frase ou bateria: tipo 1, com uma
// faixa para os acordes (canal 1), uma para a frase (canal 2) e uma para a bateria (canal 10, General MIDI).
// Nota comum entre acordes: o note_off vem antes do note_on no mesmo tick.

import { roundHalfEven } from "./numbers.js";
import { beatsPerBar, sounding, strumFor, velocityFor } from "./model.js";
import { TICKS_PER_BEAT } from "./phrase.js";

export { TICKS_PER_BEAT };
const CHANNEL = 0;
const PHRASE_CHANNEL = 1;
export const BASS_CHANNEL = 2;
export const VOICE_CHANNEL = 3; // a Voz (melodia cantada)
export const PAD_CHANNEL = 4; // o pad: o acorde aberto e parado
const PAD_SOFTER = 20; // o pad toca mais leve que os acordes (velocity a menos)
export const VOICE2_CHANNEL = 5; // a segunda voz (dueto ou contracanto da Voz)
const VOICE2_SOFTER = 12; // a segunda voz fica um pouco atrás da Voz
export const RIFF_CHANNEL = 6; // o riff ou ostinato (guitarra, dedilhado, synth)
export const DRUM_CHANNEL = 9;
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
  return mergeSameKeys(notes);
}

/** A mesma tecla pedida duas vezes: no mesmo instante, fica a mais longa; depois, o toque novo corta o anterior. */
function mergeSameKeys(notes) {
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
 * Notas da bateria (canal 10): [[início, fim, nota, velocity]] em ticks desde o começo da progressão.
 * Os compassos escritos se repetem até o fim; em cada compasso, cada camada se repete até o fim do compasso.
 */
export function drumNotes(project, total, ticksPerBeat = TICKS_PER_BEAT, bars = project.drum_bars) {
  if (!bars.length || total <= 0) return [];
  const barTicks = Math.max(1, beatsToTicks(beatsPerBar(project), ticksPerBeat));
  const notes = [];
  for (let index = 0, barStart = 0; barStart < total; index++, barStart += barTicks) {
    const barEnd = Math.min(barStart + barTicks, total);
    for (const { hits, ticks } of bars[index % bars.length]) {
      for (let base = barStart; base < barEnd; base += ticks) {
        for (const hit of hits) {
          const start = base + hit.start;
          if (start >= barEnd) break;
          const velocity = Math.max(1, Math.min(127, project.default_velocity + hit.accent));
          notes.push([start, Math.min(start + hit.length, barEnd), hit.part, velocity]);
        }
      }
    }
  }
  return mergeSameKeys(notes);
}

/**
 * As notas do pad para um acorde: sempre abertas. A nota mais grave do acorde vai para a região de Sol 2 a Fá# 3, a quinta
 * (se o acorde tiver) logo acima, e as outras notas na oitava seguinte.
 */
export function padPitches(chord) {
  const voices = sounding(chord);
  if (!voices.length) return [];
  const root = voices[0].note.midi;
  let base = 36 + (root % 12);
  if (base < 43) base += 12;
  const intervals = [...new Set(voices.map((v) => (((v.note.midi - root) % 12) + 12) % 12))].filter((i) => i !== 0).sort((a, b) => a - b);
  const fifth = [7, 6, 8].find((i) => intervals.includes(i)) ?? null;
  const out = [base, ...(fifth !== null ? [base + fifth] : []), ...intervals.filter((i) => i !== fifth).map((i) => base + 12 + i)];
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Notas do pad: [[início, fim, nota, velocity]]. Cada acorde soa inteiro; nota igual no acorde seguinte fica ligada. */
export function padNotes(project, ticksPerBeat = TICKS_PER_BEAT) {
  if (!project.pad) return [];
  const notes = [];
  let last = new Map();
  let tick = 0;
  for (const chord of project.chords) {
    const length = beatsToTicks(chord.duration_beats, ticksPerBeat);
    const velocity = Math.max(1, Math.min(127, velocityFor(project, chord) - PAD_SOFTER));
    const current = new Map();
    for (const pitch of padPitches(chord)) {
      const held = last.get(pitch);
      if (held && held[1] === tick) {
        held[1] = tick + length;
        current.set(pitch, held);
      } else {
        const note = [tick, tick + length, pitch, velocity];
        notes.push(note);
        current.set(pitch, note);
      }
    }
    last = current;
    tick += length;
  }
  return notes;
}

/**
 * Todas as notas do projeto, com tempo: { notes: [{start, end, pitch, velocity, channel, chord}], starts (tick de cada
 * acorde), end }. É a lista de onde sai o arquivo .mid, e a pré-escuta do app toca a mesma lista.
 */
export function noteEvents(project, { ticksPerBeat = TICKS_PER_BEAT, phraseMode = "both", drums = true } = {}) {
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
    for (const e of chord.bass_events) {
      notes.push({ start: tick + e.start, end: tick + e.start + e.length, pitch: e.note.midi, velocity: velocityFor(project, chord), channel: BASS_CHANNEL, chord: index });
    }
    for (const e of chord.riff_events) {
      notes.push({ start: tick + e.start, end: tick + e.start + e.length, pitch: e.note.midi, velocity: velocityFor(project, chord), channel: RIFF_CHANNEL, chord: index, riff: true });
    }
    if (phraseMode !== "chords") {
      const velocity = velocityFor(project, chord);
      for (const e of [...chord.phrase_events, ...chord.phrase_extra]) {
        notes.push({ start: tick + e.start, end: tick + e.start + e.length, pitch: e.note.midi, velocity, channel: PHRASE_CHANNEL, chord: index });
      }
    }
    tick += length;
  });
  for (const [start, end, pitch, velocity] of padNotes(project, ticksPerBeat)) {
    notes.push({ start, end, pitch, velocity, channel: PAD_CHANNEL, chord: -1, pad: true });
  }
  for (const e of project.voice_events ?? []) {
    if (e.start >= tick) continue;
    notes.push({ start: e.start, end: Math.min(e.start + e.length, tick), pitch: e.note.midi, velocity: project.default_velocity, channel: VOICE_CHANNEL, chord: -1, voice: true });
  }
  const secondVelocity = Math.max(1, Math.min(127, project.default_velocity - VOICE2_SOFTER));
  for (const e of project.voice2_events ?? []) {
    if (e.start >= tick) continue;
    notes.push({ start: e.start, end: Math.min(e.start + e.length, tick), pitch: e.note.midi, velocity: secondVelocity, channel: VOICE2_CHANNEL, chord: -1, voice2: true });
  }
  // canal 10: `percussion` diz o instrumento de percussão da nota (undefined = peça do kit, que vai para a faixa "Bateria")
  for (const [start, end, pitch, velocity] of drums ? [...drumNotes(project, tick, ticksPerBeat), ...drumNotes(project, tick, ticksPerBeat, project.percussion_bars)] : []) {
    notes.push({ start, end, pitch, velocity, channel: DRUM_CHANNEL, chord: -1, percussion: PERCUSSION_OF.get(pitch) });
  }
  return { notes, starts, end: tick };
}

/**
 * Os instrumentos de percussão: cada um sai numa faixa própria, com o nome dele, para ir ao som certo em qualquer VST (o
 * mapa de teclas muda de um para outro). As outras peças do canal 10 são do kit e ficam na faixa "Bateria", venham do
 * texto da bateria ou do da percussão.
 */
export const PERCUSSION_INSTRUMENTS = [
  { id: "cowbell", label: "Cowbell", pitches: [56] },
  { id: "clave", label: "Clave", pitches: [75] },
  { id: "pandeirola", label: "Pandeirola", pitches: [54] },
  { id: "ganza", label: "Ganzá", pitches: [70] },
  { id: "congas", label: "Congas", pitches: [62, 63, 64] },
  { id: "bongos", label: "Bongôs", pitches: [60, 61] },
  { id: "timbales", label: "Timbales", pitches: [65, 66] },
  { id: "guiro", label: "Güiro", pitches: [73, 74] },
  { id: "agogo", label: "Agogô", pitches: [67] },
];
/** No máximo este número de faixas de percussão: se a música usar mais instrumentos, os últimos dividem a última faixa. */
export const MAX_PERCUSSION_TRACKS = 6;
const PERCUSSION_OF = new Map(PERCUSSION_INSTRUMENTS.flatMap((i) => i.pitches.map((p) => [p, i.id])));

/** As faixas de percussão para os instrumentos presentes: [{ name, ids }]. `single`: tudo numa faixa só. */
export function percussionTracks(present, single = false) {
  const found = PERCUSSION_INSTRUMENTS.filter((i) => present.has(i.id));
  if (!found.length) return [];
  if (single) return [{ name: "Percussão", ids: found.map((i) => i.id) }];
  let tracks = found.map((i) => ({ name: `Perc ${i.label}`, ids: [i.id] }));
  if (tracks.length > MAX_PERCUSSION_TRACKS) {
    const rest = tracks.slice(MAX_PERCUSSION_TRACKS - 1);
    tracks = [...tracks.slice(0, MAX_PERCUSSION_TRACKS - 1), { name: "Perc outras", ids: rest.flatMap((t) => t.ids) }];
  }
  return tracks;
}

/** Os instrumentos de percussão que a música usa (ids, na ordem das faixas). */
export function percussionPresent(project, options = {}) {
  const found = new Set(noteEvents(project, options).notes.map((n) => n.percussion).filter(Boolean));
  return PERCUSSION_INSTRUMENTS.map((i) => i.id).filter((id) => found.has(id));
}

/** As partes que dá para escolher na exportação, na ordem das faixas. */
export const MIDI_PARTS = [
  { id: "acordes", label: "Acordes" },
  { id: "voz", label: "Voz cantada" },
  { id: "voz2", label: "Segunda voz" },
  { id: "solo", label: "Solo (frases)" },
  { id: "riff", label: "Riff" },
  { id: "baixo", label: "Baixo" },
  { id: "pad", label: "Pad" },
  { id: "bateria", label: "Bateria" },
  { id: "percussao", label: "Percussão" },
];

/** A que parte pertence uma nota de noteEvents. */
export function notePart(n) {
  if (n.voice) return "voz";
  if (n.voice2) return "voz2";
  if (n.pad) return "pad";
  if (n.riff) return "riff";
  if (n.percussion) return "percussao";
  if (n.channel === DRUM_CHANNEL) return "bateria";
  if (n.channel === BASS_CHANNEL) return "baixo";
  if (n.channel === PHRASE_CHANNEL) return "solo";
  return "acordes";
}

/** As partes que têm notas neste projeto (para a lista de exportação mostrar só o que existe). */
export function partsPresent(project, options = {}) {
  const found = new Set(noteEvents(project, options).notes.map(notePart));
  return MIDI_PARTS.map((p) => p.id).filter((id) => found.has(id));
}

/**
 * Gera o .mid exatamente com as notas, oitavas e durações do projeto. `parts` (opcional): só as partes escolhidas
 * (ids de MIDI_PARTS); a primeira faixa (nome, compasso, andamento e os nomes dos acordes) sai sempre, para a DAW
 * acertar o BPM, mesmo sem as notas dos acordes. `gains` (opcional): volume por parte, só para a escuta.
 * A percussão sai numa faixa por instrumento ("Perc Congas", "Perc Clave"..., no máximo 6); `percussionSingle` junta
 * tudo numa faixa "Percussão", e `percussionOnly` (ids) deixa só alguns instrumentos.
 */
export function midiBytes(project, { ticksPerBeat = TICKS_PER_BEAT, markers = true, phraseMode = "both", drums = true, parts = null, gains = null, percussionSingle = false, percussionOnly = null } = {}) {
  const [num, den] = project.time_signature;
  const all = noteEvents(project, { ticksPerBeat, phraseMode, drums });
  const keep = parts ? new Set(parts) : null;
  const { starts, end: endTick } = all;
  let notes = keep ? all.notes.filter((n) => keep.has(notePart(n))) : all.notes;
  // percussionOnly: só estes instrumentos de percussão (ids); percussionSingle: toda a percussão numa faixa só
  if (percussionOnly) { const only = new Set(percussionOnly); notes = notes.filter((n) => !n.percussion || only.has(n.percussion)); }
  // gains: volume de cada parte só para a escuta do app ({ voz: 0.6, ... }); multiplica a velocity
  if (gains) notes = notes.map((n) => ({ ...n, velocity: Math.max(1, Math.min(127, Math.round(n.velocity * (gains[notePart(n)] ?? 1)))) }));
  // [tick, prioridade, altura, mensagem, canal]. Prioridade: note_off < marcador < note_on.
  const events = { [CHANNEL]: [], [PHRASE_CHANNEL]: [], [BASS_CHANNEL]: [], [VOICE_CHANNEL]: [], [VOICE2_CHANNEL]: [], [RIFF_CHANNEL]: [], [PAD_CHANNEL]: [], [DRUM_CHANNEL]: [], percussion: new Map() };
  project.chords.forEach((chord, i) => {
    if (markers && chord.symbol) events[CHANNEL].push([starts[i], 1, 0, meta(0x06, metaTextBytes(chord.symbol)), CHANNEL]);
  });
  for (const n of notes) {
    if (n.percussion && !events.percussion.has(n.percussion)) events.percussion.set(n.percussion, []);
    const list = n.percussion ? events.percussion.get(n.percussion) : events[n.channel];
    list.push([n.start, 2, n.pitch, { bytes: [0x90 | n.channel, n.pitch, n.velocity] }, n.channel]);
    list.push([n.end, 0, n.pitch, { bytes: [0x80 | n.channel, n.pitch, 0] }, n.channel]);
  }
  const tempo = roundHalfEven(((60 * 1e6) / project.tempo) * 4 / 4);

  // Uma faixa: nome, (compasso e andamento, na primeira), eventos com "running status" (igual ao mido) e fim.
  const trackBytes = (name, items, header) => {
    const messages = [[0, meta(0x03, metaTextBytes(name))]];
    if (header) {
      messages.push([0, meta(0x58, [num, Math.log2(den), 24, 8])]);
      messages.push([0, meta(0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff])]);
    }
    let last = 0;
    for (const [at, , , msg] of items.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[4] - b[4])) {
      messages.push([at - last, msg]);
      last = at;
    }
    messages.push([endTick - last, meta(0x2f, [])]);
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
    return track;
  };

  const title = project.title || "Harmona Lab";
  const tracks = [trackBytes(title, events[CHANNEL], true)];
  if (events[VOICE_CHANNEL].length) tracks.push(trackBytes("Voz", events[VOICE_CHANNEL], false));
  if (events[VOICE2_CHANNEL].length) tracks.push(trackBytes("Voz 2", events[VOICE2_CHANNEL], false));
  if (events[PHRASE_CHANNEL].length) tracks.push(trackBytes("Frase", events[PHRASE_CHANNEL], false));
  if (events[RIFF_CHANNEL].length) tracks.push(trackBytes("Riff", events[RIFF_CHANNEL], false));
  if (events[BASS_CHANNEL].length) tracks.push(trackBytes("Baixo", events[BASS_CHANNEL], false));
  if (events[PAD_CHANNEL].length) tracks.push(trackBytes("Pad", events[PAD_CHANNEL], false));
  if (events[DRUM_CHANNEL].length) tracks.push(trackBytes("Bateria", events[DRUM_CHANNEL], false));
  for (const { name, ids } of percussionTracks(new Set(events.percussion.keys()), percussionSingle)) {
    tracks.push(trackBytes(name, ids.flatMap((id) => events.percussion.get(id)), false));
  }
  const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(tracks.length > 1 ? 1 : 0), ...u16(tracks.length), ...u16(ticksPerBeat), // MThd
    ...tracks.flatMap((track) => [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track]), // MTrk
  ]);
}
