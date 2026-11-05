// Notas, alturas MIDI e convenções de oitava — espelho de harmonylab/pitch.py.
// Representação canônica: número MIDI. A grafia original fica guardada à parte.

import { fmtG } from "./numbers.js";

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;
export const MIDDLE_C_OFFSETS = { C4: -1, C3: -2 };
export const DEFAULT_MIDDLE_C = "C4";
export const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const DEFAULT_SPELLING = [
  ["C", 0], ["C", 1], ["D", 0], ["E", -1], ["E", 0], ["F", 0],
  ["F", 1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0],
];
const ACCIDENTAL_SYMBOLS = { "#": 1, "♯": 1, b: -1, B: -1, "♭": -1, x: 2, "𝄪": 2, "𝄫": -2, "♮": 0 };
const ACCIDENTAL_TEXT = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" };

const NOTE_RE = /^([A-Ga-g])([#♯bB♭x𝄪𝄫♮]*)(-?\d+)$/u;
const MIDI_RE = /^\d{1,3}$/;
const PITCH_CLASS_RE = /^([A-Ga-g])([#♯bB♭x𝄪𝄫♮]*)$/u;
const LIST_SPLIT_RE = /[\s,;|–—]+/u;
const INVALID_NOTE = "Nota inválida: use nomes como C4, F#2, Eb3 ou números MIDI (0–127).";

export class NoteParseError extends Error {}

export const isMiddleC = (value) => typeof value === "string" && Object.hasOwn(MIDDLE_C_OFFSETS, value);

export function checkMiddleC(middleC) {
  if (!isMiddleC(middleC)) throw new Error(`Convenção de oitava desconhecida: "${middleC}". Use "C4" ou "C3".`);
  return middleC;
}

/** Nota concreta: { midi, letter (ou null), accidental }. */
export function makeNote(midi, letter = null, accidental = 0) {
  if (!(midi >= MIDI_MIN && midi <= MIDI_MAX)) throw new NoteParseError(`Altura MIDI fora do intervalo 0–127: ${midi}`);
  return { midi, letter, accidental };
}

export const pitchClass = (note) => note.midi % 12;
const spelling = (note) => (note.letter === null ? DEFAULT_SPELLING[pitchClass(note)] : [note.letter, note.accidental]);

export function pitchClassName(note) {
  const [letter, acc] = spelling(note);
  return letter + ACCIDENTAL_TEXT[acc];
}

/** Nome com oitava na convenção pedida, preservando a grafia (B#3 = MIDI 60). */
export function noteName(note, middleC = DEFAULT_MIDDLE_C) {
  const offset = MIDDLE_C_OFFSETS[checkMiddleC(middleC)];
  const [letter, acc] = spelling(note);
  const octave = Math.floor((note.midi - LETTER_PC[letter] - acc) / 12) + offset;
  return `${letter}${ACCIDENTAL_TEXT[acc]}${octave}`;
}

function parseAccidentals(text, original) {
  let total = 0;
  for (const ch of text) total += ACCIDENTAL_SYMBOLS[ch];
  if (total < -2 || total > 2) throw new NoteParseError(`Acidentes demais em "${original}" (máximo: dobrado).`);
  return total;
}

/** Lê "C4", "Eb3", "F#2", "Bb-1", "B♭3" ou um número MIDI ("60" ou 60). */
export function parseNote(token, middleC = DEFAULT_MIDDLE_C) {
  checkMiddleC(middleC);
  if (typeof token !== "string" && typeof token !== "number") throw new NoteParseError(INVALID_NOTE);
  if (typeof token === "number") {
    if (!Number.isInteger(token)) throw new NoteParseError(`Número MIDI precisa ser inteiro (recebido ${fmtG(token)}).`);
    return makeNote(token);
  }
  const original = token;
  const text = original.trim();
  if (!text) throw new NoteParseError("Nota vazia.");
  if (MIDI_RE.test(text)) {
    const value = parseInt(text, 10);
    if (value > MIDI_MAX) throw new NoteParseError(`"${original}" está fora do intervalo MIDI 0–127.`);
    return makeNote(value);
  }
  const m = text.match(NOTE_RE);
  if (!m) {
    if (PITCH_CLASS_RE.test(text)) {
      throw new NoteParseError(`Falta a oitava em "${original}" — escreva, por exemplo, ${text.toUpperCase()[0]}${text.slice(1)}3.`);
    }
    throw new NoteParseError(`Não entendi "${original}". Use nomes como C4, F#2, Eb3 ou números MIDI (0–127).`);
  }
  const letter = m[1].toUpperCase();
  const accidental = parseAccidentals(m[2], original);
  const octave = parseInt(m[3], 10);
  const midi = (octave - MIDDLE_C_OFFSETS[middleC]) * 12 + LETTER_PC[letter] + accidental;
  if (midi < MIDI_MIN || midi > MIDI_MAX) {
    throw new NoteParseError(`"${original}" fica fora do intervalo MIDI 0–127 (seria ${midi}) na convenção ${middleC} = MIDI 60.`);
  }
  return makeNote(midi, letter, accidental);
}

/** Divide um texto de notas em fichas ("F#2 – C3", "E3, A3"); listas passam direto. */
export function splitNoteList(value) {
  if (value == null) return [];
  if (typeof value === "string") return value.trim().split(LIST_SPLIT_RE).filter((t) => t && t !== "-");
  if (Array.isArray(value)) {
    const tokens = [];
    for (const item of value) {
      if (typeof item === "string") tokens.push(...splitNoteList(item));
      else tokens.push(item);
    }
    return tokens;
  }
  return [value];
}

/** Lê várias notas sem parar no primeiro erro: { notes, errors }. */
export function parseNoteList(value, middleC = DEFAULT_MIDDLE_C) {
  const notes = [];
  const errors = [];
  for (const token of splitNoteList(value)) {
    try {
      notes.push(parseNote(token, middleC));
    } catch (err) {
      if (!(err instanceof NoteParseError)) throw err;
      errors.push(err.message);
    }
  }
  return { notes, errors };
}

/** Reescreve nomes para outra convenção sem mudar as alturas; fichas inválidas ficam como estão. */
export function renameNoteText(value, fromMiddleC, toMiddleC) {
  checkMiddleC(fromMiddleC);
  checkMiddleC(toMiddleC);
  const convert = (token) => {
    if (typeof token === "number" || (typeof token === "string" && MIDI_RE.test(token.trim()))) return token;
    try {
      return noteName(parseNote(token, fromMiddleC), toMiddleC);
    } catch (err) {
      if (err instanceof NoteParseError) return token;
      throw err;
    }
  };
  if (value == null) return null;
  if (typeof value === "string") return splitNoteList(value).map((t) => String(convert(t))).join(" ");
  if (typeof value === "number") return value;
  return splitNoteList(value).map(convert);
}
