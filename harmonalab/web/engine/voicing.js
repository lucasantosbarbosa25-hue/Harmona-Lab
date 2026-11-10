// Mudar o voicing da mão direita à mão: fechado, aberto, drop 2, quartal, cluster e ponta pedal.
// Fechado, aberto e drop 2 só mexem nas oitavas: as notas e a grafia (Eb, F#...) continuam as mesmas.
// Quartal e cluster montam a mão direita a partir da ponta com as notas da escala do acorde (phrase_scale): quartas
// empilhadas ou segundas vizinhas. Sem a escala, o quartal reorganiza as notas que já estão lá, e o cluster não se aplica.
// A mão esquerda e o baixo não mudam. A ponta (nota mais aguda) é preservada, a menos que se peça uma ponta pedal.

import { parseScale } from "./phrase.js";
import { makeNote, noteName, parseNote, parseNoteList, pitchClass } from "./pitch.js";

export const VOICINGS = [
  { id: "closed", label: "Fechado" },
  { id: "open", label: "Aberto" },
  { id: "drop2", label: "Drop 2" },
  { id: "quartal", label: "Quartal" },
  { id: "cluster", label: "Cluster" },
];

const sortByPitch = (notes) => [...notes].sort((a, b) => a.midi - b.midi);
const shift = (note, semitones) => makeNote(note.midi + semitones, note.letter, note.accidental);

/** A mesma nota, na oitava mais próxima abaixo da ponta (nunca igual a ela). */
function belowTop(top, note) {
  let midi = top.midi - ((((top.midi - note.midi) % 12) + 12) % 12);
  if (midi === top.midi) midi -= 12;
  return midi < 0 ? null : makeNote(midi, note.letter, note.accidental);
}

/** Posição fechada sob a ponta: uma de cada nota, todas dentro de uma oitava abaixo dela. Do grave ao agudo. */
export function closedUnder(top, notes) {
  const seen = new Set([pitchClass(top)]);
  const lower = [];
  for (const note of sortByPitch(notes)) {
    if (seen.has(pitchClass(note))) continue; // dobras viram uma nota só
    seen.add(pitchClass(note));
    const placed = belowTop(top, note);
    if (!placed) return null;
    lower.push(placed);
  }
  return [...sortByPitch(lower), top];
}

const mod12 = (n) => ((n % 12) + 12) % 12;

/** Nota de uma classe de altura, `down` semitons abaixo de `from`, com a grafia dada ({pc, name} da escala ou uma nota). */
function below(from, down, spelled) {
  const midi = from.midi - down;
  if (midi < 0) return null;
  if (spelled.name) {
    const accidental = [...spelled.name.slice(1)].reduce((n, ch) => n + (ch === "#" ? 1 : -1), 0);
    return makeNote(midi, spelled.name[0], accidental);
  }
  return makeNote(midi, spelled.letter, spelled.accidental);
}

/**
 * Quartal: a partir da ponta, cada nota fica uma quarta abaixo da anterior (justa de preferência; senão aumentada,
 * terça maior ou quinta). Com a escala, usa as notas dela; sem a escala, reorganiza as notas que já estão no acorde.
 */
function quartal(notes, top, scale) {
  const count = new Set(notes.map(pitchClass)).size;
  const own = sortByPitch(notes).filter((n, i, all) => all.findIndex((m) => pitchClass(m) === pitchClass(n)) === i);
  const pool = scale.length ? scale.map((s) => ({ pc: s.pc, spelled: s })) : own.map((n) => ({ pc: pitchClass(n), spelled: n }));
  const out = [top];
  const used = new Set([pitchClass(top)]);
  while (out.length < count) {
    const current = out[0];
    let best = null;
    for (const candidate of pool) {
      if (used.has(candidate.pc)) continue;
      const down = mod12(current.midi - candidate.pc) || 12;
      const cost = [5, 6, 4, 7].includes(down) ? [5, 6, 4, 7].indexOf(down) : 4 + Math.abs(down - 5);
      if (!best || cost < best.cost) best = { ...candidate, down, cost };
    }
    if (!best) break;
    const note = below(current, best.down, best.spelled);
    if (!note) return null;
    used.add(best.pc);
    out.unshift(note);
  }
  return out.length >= 2 ? out : null;
}

/** Cluster: a ponta e as notas da escala logo abaixo dela, em segundas, no mesmo número de notas. Precisa da escala. */
function cluster(notes, top, scale) {
  if (!scale.length) return null;
  const count = Math.max(3, Math.min(5, new Set(notes.map(pitchClass)).size));
  const out = [top];
  for (let midi = top.midi - 1; out.length < count && midi > top.midi - 12 && midi >= 0; midi--) {
    const step = scale.find((s) => s.pc === mod12(midi));
    if (step) out.unshift(below(top, top.midi - midi, step));
  }
  return out.length >= 3 ? out : null;
}

/** Aplica um voicing às notas da mão direita. `scale`: [{pc, name}] da escala do acorde (para quartal e cluster). Devolve notas do grave ao agudo, ou null se não der. */
export function applyVoicing(notes, kind, scale = []) {
  if (notes.length < 2) return null;
  const top = sortByPitch(notes).at(-1);
  if (kind === "quartal") return quartal(notes, top, scale);
  if (kind === "cluster") return cluster(notes, top, scale);
  const closed = closedUnder(top, notes);
  if (!closed) return null;
  const last = closed.length - 1;
  const drops = { closed: [], drop2: [last - 1], open: last >= 3 ? [last - 1, last - 3] : [last - 1] }[kind];
  if (!drops) throw new Error(`Voicing desconhecido: ${kind}`);
  if (drops.some((i) => i < 0)) return null; // acorde com poucas notas para esse drop
  const out = closed.map((note, i) => (drops.includes(i) ? shift(note, -12) : note));
  return out.some((n) => n.midi < 0) ? null : sortByPitch(out);
}

/** Ponta pedal: a nota fica no topo e as demais se arrumam fechadas sob ela. */
export function withPedalTop(notes, pedal) {
  if (!notes.length) return null;
  return closedUnder(pedal, notes);
}

// ---------------------------------------------------------------- sobre os campos de texto do app

/** Campo que recebe o voicing: mão direita, ou as notas sem mão se não houver mão direita. */
const upperField = (chord) => (String(chord.right_hand || "").trim() ? "right_hand" : String(chord.notes || "").trim() ? "notes" : null);

/**
 * Muda o voicing de um acorde do app (campos em texto). Devolve { field, text, added, top } ou { skipped: "motivo" }.
 * `pedal`: texto como "F#4" para a ponta pedal (opcional); `kind`: um dos VOICINGS (opcional).
 */
export function revoiceChord(chord, { kind = null, pedal = null, middleC = "C4" }) {
  const field = upperField(chord);
  if (!field) return { skipped: "sem notas na mão direita" };
  const { notes, errors } = parseNoteList(chord[field], middleC);
  if (errors.length) return { skipped: "notas com erro" };
  let result = notes;
  let added = false;
  if (pedal) {
    const pedalNote = parseNote(pedal, middleC);
    added = !notes.some((n) => pitchClass(n) === pitchClass(pedalNote));
    result = withPedalTop(result, pedalNote);
    if (!result) return { skipped: "não coube" };
  }
  if (kind) {
    const scale = parseScale(chord.phrase_scale || "").scale;
    result = applyVoicing(result, kind, scale);
    if (!result) return { skipped: kind === "closed" ? "não coube" : kind === "cluster" && !scale.length ? "cluster precisa das notas da escala" : "poucas notas para esse voicing" };
  } else if (!pedal) {
    return { skipped: "nada a fazer" };
  }
  return { field, text: result.map((n) => noteName(n, middleC)).join(" "), added, top: noteName(result.at(-1), middleC) };
}

