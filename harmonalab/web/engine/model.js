// Modelo interno: projeto → acordes → voicings — espelho de harmonalab/model.py.
// As notas explícitas mandam; o símbolo do acorde é só um rótulo.

import { fmtG, roundHalfEven, toNumber } from "./numbers.js";
import { TICKS_PER_BEAT, compText, drumsText, parseComp, parseDrums, parsePhrase, parseScale, phraseText, renamePhraseText } from "./phrase.js";
import {
  DEFAULT_MIDDLE_C, NoteParseError, isMiddleC, noteName, parseNote, parseNoteList, renameNoteText, splitNoteList,
} from "./pitch.js";

export const SCHEMA_VERSION = 1;
export const PARTS = ["bass", "left_hand", "right_hand", "notes"];
export const PART_LABELS = {
  bass: "Baixo / pedal",
  left_hand: "Mão esquerda",
  right_hand: "Mão direita",
  notes: "Notas (sem mão definida)",
};
const VALID_DENOMINATORS = [1, 2, 4, 8, 16, 32];
const TEMPO_MIN = 10;
const TEMPO_MAX = 999;
const MAX_DURATION_BEATS = 1024;

// Strum: atraso entre as notas de um acorde. "up" = do grave ao agudo; "down" = do agudo ao grave.
export const STRUM_DIRECTIONS = ["off", "up", "down"];
const STRUM_DELAY_MIN = 1;
const STRUM_DELAY_MAX = 250; // milissegundos
export const DEFAULT_STRUM_DELAY_MS = 20;
const STRUM_HINT = 'Use "off", "up" (grave → agudo) ou "down" (agudo → grave).';

export const issue = (level, message, chord = null, field = null) => ({ level, message, chord, field });

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const has = (obj, key) => obj[key] !== undefined && obj[key] !== null;

// ------------------------------------------------------------------ acordes

export function newChord(beatsPerBar) {
  return {
    symbol: "", duration_beats: beatsPerBar, bass: [], left_hand: [], right_hand: [], notes: [],
    top_note: null, velocity: null, strum: null, function: "", scale: "", omitted: [], comment: "",
    phrase: "", phrase_scale: "", phrase_color: "", comp: "", bass_line: "",
    phrase_events: [], phrase_pcs: [], comp_layers: [], bass_events: [], // derivados da frase, da escala e da levada, preenchidos na leitura
  };
}

/** Notas que soam, do grave ao agudo, sem alturas repetidas: [{note, part}]. */
export function sounding(chord) {
  const seen = new Map();
  for (const part of PARTS) {
    for (const note of chord[part]) if (!seen.has(note.midi)) seen.set(note.midi, { note, part });
  }
  return [...seen.keys()].sort((a, b) => a - b).map((m) => seen.get(m));
}

export const pitches = (chord) => sounding(chord).map((s) => s.note.midi);
export const isRest = (chord) => PARTS.every((p) => chord[p].length === 0);
export const highest = (chord) => sounding(chord).at(-1)?.note ?? null;
export const lowest = (chord) => sounding(chord)[0]?.note ?? null;

export function chordToDict(chord, middleC = DEFAULT_MIDDLE_C) {
  const d = { symbol: chord.symbol, duration_beats: chord.duration_beats };
  for (const part of PARTS) {
    if (chord[part].length || part === "left_hand" || part === "right_hand") {
      d[part] = chord[part].map((n) => noteName(n, middleC));
    }
  }
  d.top_note = chord.top_note ? noteName(chord.top_note, middleC) : null;
  d.velocity = chord.velocity;
  if (chord.strum !== null) d.strum = chord.strum;
  if (chord.function) d.function = chord.function;
  if (chord.scale) d.scale = chord.scale;
  if (chord.omitted.length) d.omitted = [...chord.omitted];
  if (chord.comment) d.comment = chord.comment;
  if (chord.phrase) d.phrase = chord.phrase;
  if (chord.phrase_scale) d.phrase_scale = chord.phrase_scale;
  if (chord.phrase_color) d.phrase_color = chord.phrase_color;
  if (chord.comp) d.comp = chord.comp;
  if (chord.bass_line) d.bass_line = chord.bass_line;
  return d;
}

// ------------------------------------------------------------------ projeto

export function newProject() {
  return {
    title: "Progressão", tempo: 80, time_signature: [4, 4], middle_c: DEFAULT_MIDDLE_C,
    default_velocity: 80, key: "", references: [], style: "", drums: "", drum_bars: [], strum_direction: "off", strum_delay_ms: DEFAULT_STRUM_DELAY_MS, chords: [], comment: "",
  };
}

/** Duração de um compasso em tempos de semínima. */
export const beatsPerBar = (project) => (project.time_signature[0] * 4) / project.time_signature[1];
export const totalBeats = (project) => project.chords.reduce((sum, c) => sum + c.duration_beats, 0);
export const velocityFor = (project, chord) => (chord.velocity !== null ? chord.velocity : project.default_velocity);
export const strumFor = (project, chord) => (chord.strum !== null ? chord.strum : project.strum_direction);

export function projectToDict(project) {
  const [num, den] = project.time_signature;
  const d = {
    schema_version: SCHEMA_VERSION,
    title: project.title,
    tempo: project.tempo,
    time_signature: `${num}/${den}`,
    middle_c: project.middle_c,
    default_velocity: project.default_velocity,
    strum: { direction: project.strum_direction, delay_ms: project.strum_delay_ms },
    chords: project.chords.map((c) => chordToDict(c, project.middle_c)),
  };
  if (project.key) d.key = project.key;
  if (project.references.length) d.references = [...project.references];
  if (project.style) d.style = project.style;
  if (project.drums) d.drums = project.drums;
  if (project.comment) d.comment = project.comment;
  return d;
}

export function parseTimeSignature(value) {
  let num;
  let den;
  if (Array.isArray(value) && value.length === 2) {
    [num, den] = value;
  } else if (typeof value === "string" && value.includes("/")) {
    const i = value.indexOf("/");
    num = value.slice(0, i);
    den = value.slice(i + 1);
  } else {
    throw new Error(`Fórmula de compasso inválida: "${value}". Use, por exemplo, "4/4" ou "6/8".`);
  }
  const toInt = (x) => {
    const text = String(x).trim();
    if (!/^[+-]?\d+$/.test(text)) throw new Error(`Fórmula de compasso inválida: "${value}".`);
    return parseInt(text, 10);
  };
  num = toInt(num);
  den = toInt(den);
  if (num < 1 || num > 32) throw new Error(`Numerador do compasso deve ficar entre 1 e 32 (recebido ${num}).`);
  if (!VALID_DENOMINATORS.includes(den)) throw new Error(`Denominador do compasso deve ser 1, 2, 4, 8, 16 ou 32 (recebido ${den}).`);
  return [num, den];
}

function readVelocity(value, issues, chord, field) {
  const number = toNumber(value);
  if (number === null || !Number.isInteger(number) || number < 1 || number > 127) {
    issues.push(issue("error", `Velocity deve ser um inteiro de 1 a 127 (recebido "${value}").`, chord, field));
    return null;
  }
  return number;
}

/**
 * Lê o JSON do projeto sem parar no primeiro erro.
 * Devolve { project, issues } com tudo o que foi possível ler.
 */
export function loadProject(data) {
  const issues = [];
  const project = newProject();
  if (!isObject(data)) {
    issues.push(issue("error", "O projeto deve ser um objeto JSON."));
    return { project, issues };
  }
  if (has(data, "title")) project.title = String(data.title);
  if (data.comment) project.comment = String(data.comment);
  if (typeof data.key === "string") project.key = data.key.trim();
  if (typeof data.style === "string") project.style = data.style.trim();
  const drums = data.drums;
  if (drums !== undefined && drums !== null && drums !== "") {
    if (typeof drums === "string" || Array.isArray(drums)) {
      project.drums = drumsText(drums);
      const parsed = parseDrums(project.drums);
      project.drum_bars = parsed.bars;
      for (const message of parsed.errors) issues.push(issue("error", message, null, "drums"));
    } else {
      issues.push(issue("error", 'A bateria ("drums") deve ser um texto, por exemplo "H/8 H/8 H/8 H/8 ; K/4 r/4 ; r/4 S/4".', null, "drums"));
    }
  }
  let refs = data.references;
  if (typeof refs === "string") refs = refs.split(/[,;]/);
  if (Array.isArray(refs)) project.references = refs.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());

  const middleC = data.middle_c || DEFAULT_MIDDLE_C;
  if (isMiddleC(middleC)) project.middle_c = middleC;
  else {
    const shown = typeof middleC === "string" ? `: "${middleC}"` : "";
    issues.push(issue("error", `Convenção de oitava desconhecida${shown}. Use "C4" ou "C3".`, null, "middle_c"));
  }

  if (has(data, "tempo")) {
    const tempo = toNumber(data.tempo);
    if (tempo === null || !(tempo >= TEMPO_MIN && tempo <= TEMPO_MAX)) {
      issues.push(issue("error", `BPM deve ser um número entre 10 e 999 (recebido "${data.tempo}").`, null, "tempo"));
    } else {
      project.tempo = tempo;
    }
  }

  if (has(data, "time_signature")) {
    try {
      project.time_signature = parseTimeSignature(data.time_signature);
    } catch (err) {
      issues.push(issue("error", err.message, null, "time_signature"));
    }
  }

  if (has(data, "default_velocity")) {
    const vel = readVelocity(data.default_velocity, issues, null, "default_velocity");
    if (vel !== null) project.default_velocity = vel;
  }

  if (has(data, "strum")) loadStrum(data.strum, project, issues);

  let rawChords = has(data, "chords") ? data.chords : [];
  if (!Array.isArray(rawChords)) {
    issues.push(issue("error", 'O campo "chords" deve ser uma lista de acordes.', null, "chords"));
    rawChords = [];
  }
  rawChords.forEach((raw, index) => project.chords.push(loadChord(raw, index, project, issues)));
  return { project, issues };
}

function loadStrum(raw, project, issues) {
  if (typeof raw === "string") raw = { direction: raw }; // atalho: "strum": "up"
  if (!isObject(raw)) {
    issues.push(issue("error", 'O campo "strum" deve ser um objeto, por exemplo {"direction": "up", "delay_ms": 20}, ou só a direção ("up").', null, "strum"));
    return;
  }
  if (has(raw, "direction")) {
    if (typeof raw.direction === "string" && STRUM_DIRECTIONS.includes(raw.direction)) {
      project.strum_direction = raw.direction;
    } else {
      const shown = typeof raw.direction === "string" ? `: "${raw.direction}"` : "";
      issues.push(issue("error", `Direção do strum desconhecida${shown}. ${STRUM_HINT}`, null, "strum"));
    }
  }
  if (has(raw, "delay_ms")) {
    const delay = toNumber(raw.delay_ms);
    if (delay === null || !(delay >= STRUM_DELAY_MIN && delay <= STRUM_DELAY_MAX)) {
      issues.push(issue("error", `Atraso do strum deve ser um número entre 1 e 250 ms (recebido "${raw.delay_ms}").`, null, "strum"));
    } else {
      project.strum_delay_ms = delay;
    }
  }
}

function loadChord(raw, index, project, issues) {
  const chord = newChord(beatsPerBar(project));
  if (!isObject(raw)) {
    issues.push(issue("error", "Cada acorde deve ser um objeto JSON.", index));
    return chord;
  }
  chord.symbol = String(raw.symbol || "").trim();
  chord.comment = String(raw.comment || "");
  for (const name of ["function", "scale", "phrase_color"]) if (typeof raw[name] === "string") chord[name] = raw[name].trim();

  if (has(raw, "duration_beats")) {
    const beats = toNumber(raw.duration_beats);
    if (beats === null || !(beats > 0 && beats <= MAX_DURATION_BEATS)) {
      issues.push(issue("error", `Duração deve ser um número de tempos maior que zero (recebido "${raw.duration_beats}").`, index, "duration_beats"));
    } else {
      chord.duration_beats = beats;
    }
  } else if (has(raw, "duration_bars")) {
    const bars = toNumber(raw.duration_bars);
    const beats = bars === null ? NaN : bars * beatsPerBar(project);
    if (bars === null || !(beats > 0 && beats <= MAX_DURATION_BEATS)) {
      issues.push(issue("error", `Duração em compassos inválida: "${raw.duration_bars}".`, index, "duration_beats"));
    } else {
      chord.duration_beats = beats;
    }
  }

  for (const part of PARTS) {
    const { notes, errors } = parseNoteList(raw[part], project.middle_c);
    chord[part] = notes;
    for (const message of errors) issues.push(issue("error", message, index, part));
  }

  const top = raw.top_note;
  if (top !== undefined && top !== null && top !== "") {
    try {
      chord.top_note = parseNote(typeof top === "string" ? top.trim() : top, project.middle_c);
    } catch (err) {
      if (!(err instanceof NoteParseError)) throw err;
      issues.push(issue("error", `Ponta: ${err.message}`, index, "top_note"));
    }
  }

  if (raw.velocity !== undefined && raw.velocity !== null && raw.velocity !== "") {
    chord.velocity = readVelocity(raw.velocity, issues, index, "velocity");
  }

  const strum = raw.strum;
  if (strum !== undefined && strum !== null && strum !== "") {
    if (typeof strum === "string" && STRUM_DIRECTIONS.includes(strum)) {
      chord.strum = strum;
    } else {
      const shown = typeof strum === "string" ? `: "${strum}"` : "";
      issues.push(issue("error", `Strum do acorde desconhecido${shown}. ${STRUM_HINT}`, index, "strum"));
    }
  }

  if (raw.omitted) chord.omitted = splitNoteList(raw.omitted).map(String);

  loadPhrase(raw, chord, index, project, issues);
  return chord;
}

/** Frase e escala da frase: erros de escrita e frase mais longa que o acorde bloqueiam; o resto é conferido na análise. */
function loadPhrase(raw, chord, index, project, issues) {
  const isText = (v) => typeof v === "string" || Array.isArray(v);
  const phrase = raw.phrase;
  if (phrase !== undefined && phrase !== null && phrase !== "") {
    if (isText(phrase)) {
      chord.phrase = phraseText(phrase);
      const { events, ticks, errors } = parsePhrase(chord.phrase, project.middle_c);
      for (const message of errors) issues.push(issue("error", message, index, "phrase"));
      if (ticks > roundHalfEven(chord.duration_beats * TICKS_PER_BEAT)) {
        issues.push(issue("error", `A frase dura ${fmtG(ticks / TICKS_PER_BEAT)} tempos, mais que os `
          + `${fmtG(chord.duration_beats)} do acorde.`, index, "phrase"));
      }
      chord.phrase_events = events;
    } else {
      issues.push(issue("error", 'A frase ("phrase") deve ser um texto, por exemplo "G5/8 F5/8 Eb5/4*alvo".', index, "phrase"));
    }
  }
  const scale = raw.phrase_scale;
  if (scale !== undefined && scale !== null && scale !== "") {
    if (isText(scale)) {
      const parsed = parseScale(scale);
      chord.phrase_pcs = parsed.scale;
      chord.phrase_scale = parsed.scale.map((s) => s.name).join(" ");
      for (const message of parsed.errors) issues.push(issue("error", message, index, "phrase_scale"));
    } else {
      issues.push(issue("error", 'A escala da frase ("phrase_scale") deve ser um texto, por exemplo "B C D Eb F G A".', index, "phrase_scale"));
    }
  }
  const line = raw.bass_line;
  if (line !== undefined && line !== null && line !== "") {
    if (isText(line)) {
      chord.bass_line = phraseText(line);
      const { events, ticks, errors } = parsePhrase(chord.bass_line, project.middle_c);
      for (const message of errors) issues.push(issue("error", message.replace("Frase:", "Baixo:").replace("na frase", "na linha de baixo"), index, "bass_line"));
      if (ticks > roundHalfEven(chord.duration_beats * TICKS_PER_BEAT)) {
        issues.push(issue("error", `A linha de baixo dura ${fmtG(ticks / TICKS_PER_BEAT)} tempos, mais que os `
          + `${fmtG(chord.duration_beats)} do acorde.`, index, "bass_line"));
      }
      chord.bass_events = events;
    } else {
      issues.push(issue("error", 'A linha de baixo ("bass_line") deve ser um texto, por exemplo "E2/4. B1/8+4 E2/4".', index, "bass_line"));
    }
  }
  const comp = raw.comp;
  if (comp !== undefined && comp !== null && comp !== "") {
    if (isText(comp)) {
      chord.comp = compText(comp);
      const parsed = parseComp(chord.comp);
      chord.comp_layers = parsed.layers;
      for (const message of parsed.errors) issues.push(issue("error", message, index, "comp"));
    } else {
      issues.push(issue("error", 'A levada ("comp") deve ser um texto, por exemplo "E/4 D/8 D/8 E/4 D/4".', index, "comp"));
    }
  }
}

/** Troca a convenção de oitava mantendo as alturas MIDI (funciona com campos incompletos). */
export function renameProjectNotes(data, toMiddleC) {
  const fromMiddleC = data.middle_c || DEFAULT_MIDDLE_C;
  const out = { ...data, middle_c: toMiddleC };
  // Sem convenção de origem válida não há o que converter: só adota a nova.
  if (!Array.isArray(data.chords) || !isMiddleC(fromMiddleC)) return out;
  out.chords = data.chords.map((raw) => {
    if (!isObject(raw)) return raw;
    const c = { ...raw };
    for (const key of [...PARTS, "top_note"]) {
      if (c[key] !== undefined && c[key] !== null && c[key] !== "") c[key] = renameNoteText(c[key], fromMiddleC, toMiddleC);
    }
    for (const key of ["phrase", "bass_line"]) {
      if (c[key] !== undefined && c[key] !== null && c[key] !== "") c[key] = renamePhraseText(c[key], fromMiddleC, toMiddleC);
    }
    return c;
  });
  return out;
}
