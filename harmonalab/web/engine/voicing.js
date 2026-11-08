// Mudar o voicing da mão direita à mão: fechado, aberto, drop 2, drop 3 e ponta pedal.
// Só mexe nas oitavas: as notas e a grafia (Eb, F#...) continuam as mesmas. A mão esquerda e o baixo não mudam.
// A ponta (nota mais aguda) é preservada, a menos que se peça uma ponta pedal.

import { makeNote, noteName, parseNote, parseNoteList, pitchClass } from "./pitch.js";

export const VOICINGS = [
  { id: "closed", label: "Fechado" },
  { id: "open", label: "Aberto" },
  { id: "drop2", label: "Drop 2" },
  { id: "drop3", label: "Drop 3" },
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

/** Aplica um voicing às notas da mão direita. Devolve notas do grave ao agudo, ou null se não der. */
export function applyVoicing(notes, kind) {
  if (notes.length < 2) return null;
  const top = sortByPitch(notes).at(-1);
  const closed = closedUnder(top, notes);
  if (!closed) return null;
  const last = closed.length - 1;
  const drops = { closed: [], drop2: [last - 1], drop3: [last - 2], open: last >= 3 ? [last - 1, last - 3] : [last - 1] }[kind];
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
    result = applyVoicing(result, kind);
    if (!result) return { skipped: kind === "closed" ? "não coube" : "poucas notas para esse voicing" };
  } else if (!pedal) {
    return { skipped: "nada a fazer" };
  }
  return { field, text: result.map((n) => noteName(n, middleC)).join(" "), added, top: noteName(result.at(-1), middleC) };
}

