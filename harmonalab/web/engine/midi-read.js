// Leitura de um arquivo MIDI (.mid) para usar a melodia dele no lugar do canto. Lê o andamento (BPM), o compasso e as
// notas de cada faixa. Não é um espelho do Python: só o app usa.

import { estimateKey, quantize, voiceText } from "./canto.js";

const DRUM_CHANNEL = 9;
// Limites de sanidade: um arquivo quebrado (ou feito para travar) não pode pedir memória sem fim.
const MAX_BEATS = 4000; // 1000 compassos de 4/4
const MAX_NOTES = 50000;

/** Bytes de um .mid → { division (ticks por semínima), bpm (null se o arquivo não diz), timeSignature, tempoChanges, tracks }. */
export function parseMidi(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const text = (from, n) => String.fromCharCode(...data.subarray(from, from + n));
  const u32 = (at) => ((data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]) >>> 0;
  const u16 = (at) => (data[at] << 8) | data[at + 1];
  if (data.length < 14 || text(0, 4) !== "MThd") throw new Error("Este arquivo não é um MIDI (.mid).");
  const headerLength = u32(4);
  const division = u16(12);
  if (division === 0) throw new Error("Este MIDI está com o cabeçalho quebrado (sem ticks por semínima).");
  if (division & 0x8000) throw new Error("Este MIDI usa tempo em quadros (SMPTE), que o app não lê. Exporte de novo em ticks por semínima.");
  let at = 8 + headerLength;
  const tracks = [];
  let bpm = null;
  let timeSignature = null;
  let tempoChanges = 0;
  while (at + 8 <= data.length) {
    const id = text(at, 4);
    const length = u32(at + 4);
    const end = Math.min(data.length, at + 8 + length);
    at += 8;
    if (id !== "MTrk") { at = end; continue; }
    const track = { name: "", notes: [], channels: new Set() };
    const open = new Map();
    let tick = 0;
    let status = 0;
    const varInt = () => { let v = 0; for (let i = 0; i < 4 && at < end; i++) { const b = data[at++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return v; };
    while (at < end) {
      tick += varInt();
      let byte = data[at];
      if (byte & 0x80) { status = byte; at += 1; } // senão é "running status": repete o último
      if (status === 0xff) {
        const type = data[at++];
        const size = varInt();
        if (type === 0x03 && !track.name) track.name = new TextDecoder("latin1").decode(data.subarray(at, at + size)).trim();
        if (type === 0x51 && size === 3) {
          tempoChanges += 1;
          if (bpm === null) bpm = 60000000 / ((data[at] << 16) | (data[at + 1] << 8) | data[at + 2]);
        }
        if (type === 0x58 && size >= 2 && !timeSignature) timeSignature = `${data[at]}/${2 ** data[at + 1]}`;
        at += size;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { at += varInt(); continue; }
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const a = data[at++];
      const b = kind === 0xc0 || kind === 0xd0 ? 0 : data[at++];
      byte = kind;
      if (byte === 0x90 && b > 0) {
        const key = (channel << 8) | a;
        if (!open.has(key)) open.set(key, []);
        open.get(key).push({ start: tick, velocity: b });
      } else if (byte === 0x80 || (byte === 0x90 && b === 0)) {
        const stack = open.get((channel << 8) | a);
        const on = stack?.shift();
        if (on && tick > on.start && track.notes.length < MAX_NOTES) { track.notes.push({ start: on.start, end: tick, pitch: a, velocity: on.velocity, channel }); track.channels.add(channel); }
      }
    }
    at = end;
    track.notes.sort((x, y) => x.start - y.start || y.pitch - x.pitch);
    tracks.push(track);
  }
  return { division, bpm, timeSignature, tempoChanges, tracks };
}

/** As faixas que podem ser a melodia (com notas, fora a bateria): [{ index, label, notes }], a mais provável primeiro. */
export function melodyTracks(midi) {
  const list = midi.tracks.map((t, index) => ({ index, track: t, notes: t.notes.filter((n) => n.channel !== DRUM_CHANNEL) }))
    .filter((t) => t.notes.length);
  const overlap = (notes) => { // quanto as notas se sobrepõem (acordes): a melodia é a faixa de uma nota por vez
    let chords = 0;
    for (let i = 1; i < notes.length; i++) if (notes[i].start < notes[i - 1].end - 1 && notes[i].start - notes[i - 1].start < 10) chords += 1;
    return chords / Math.max(1, notes.length);
  };
  const named = (t) => /voz|vocal|melod|lead|canto|voice/i.test(t.track.name);
  return list.map((t) => ({
    index: t.index, notes: t.notes.length, poly: overlap(t.notes),
    label: `${t.track.name || `Faixa ${t.index + 1}`} · ${t.notes.length} notas`, named: named(t),
  })).sort((a, b) => Number(b.named) - Number(a.named) || a.poly - b.poly || b.notes - a.notes);
}

/**
 * A melodia de uma faixa: uma nota por vez (em acordes, fica a mais aguda), encaixada em semicolcheias (ou tercinas).
 * Devolve o mesmo formato do canto: { events: [{ beat, beats, midi }], text, key, bpm, timeSignature, warnings, source: "midi" }.
 */
export function melodyFromMidi(midi, trackIndex, { middleC = "C4" } = {}) {
  const track = midi.tracks[trackIndex];
  const warnings = [];
  const raw = (track?.notes ?? []).filter((n) => n.channel !== DRUM_CHANNEL);
  if (!raw.length) return { events: [], text: "", key: null, bpm: midi.bpm, timeSignature: midi.timeSignature, warnings: ["Esta faixa não tem notas."], source: "midi" };
  const beat = (tick) => tick / midi.division;
  if (beat(Math.max(...raw.map((n) => n.end))) > MAX_BEATS) throw new Error("Este MIDI é longo demais (ou está com os tempos quebrados) para virar melodia.");
  // uma nota por vez: nas que começam juntas (acorde) fica a mais aguda; cada nota acaba quando a próxima entra
  const near = midi.division / 16;
  const top = [];
  let chords = 0;
  for (const n of raw) {
    const last = top.at(-1);
    if (last && n.start - last.start <= near) { chords += 1; if (n.pitch > last.pitch) top[top.length - 1] = { ...n, start: last.start }; continue; }
    top.push({ ...n });
  }
  top.forEach((n, i) => { if (top[i + 1] && n.end > top[i + 1].start) n.end = top[i + 1].start; });
  // 1 tempo = 1 segundo (bpm 60): a mesma grade do canto, em semicolcheias, com tercinas
  const notes = top.map((n) => ({ note: n.pitch, midi: n.pitch, start: beat(n.start), end: beat(n.end) }));
  const { events } = quantize(notes, { bpm: 60, beatZero: 0, step: 0.25 });
  const key = estimateKey(notes);
  if (chords) warnings.push(`A faixa tem notas tocadas juntas (${chords}): fiquei com a mais aguda de cada vez, como melodia.`);
  if (midi.bpm === null) warnings.push("O arquivo não diz o BPM: usei o do projeto. Confira.");
  if (midi.tempoChanges > 1) warnings.push("O arquivo muda de andamento no meio: usei o primeiro BPM.");
  return { events, text: voiceText(events, { key, middleC }), key, bpm: midi.bpm, timeSignature: midi.timeSignature, warnings, source: "midi" };
}
