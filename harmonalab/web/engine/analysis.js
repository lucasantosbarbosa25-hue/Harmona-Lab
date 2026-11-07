// Leitura do voicing: soprano, baixo, espaçamento e avisos — espelho de harmonalab/analysis.py.
// Nada aqui altera notas; só "error" bloqueia a exportação.

import { fmtG, roundHalfEven } from "./numbers.js";
import {
  PARTS, PART_LABELS, beatsPerBar, highest, isRest, issue, loadProject, lowest, pitches, projectToDict, sounding,
  strumFor, totalBeats, velocityFor,
} from "./model.js";
import { noteName, pitchClass, pitchClassName } from "./pitch.js";
import { TICKS_PER_BEAT, beatsToTicks, strumPlan } from "./midi.js";

const PIANO_LOW = 21; // A0
const PIANO_HIGH = 108; // C8
const HAND_SPAN_LIMIT = 16; // semitons (uma 10ª maior)

// max()/min() do Python com key: em empate fica o primeiro.
const maxBy = (notes) => notes.reduce((best, n) => (n.midi > best.midi ? n : best));
const minBy = (notes) => notes.reduce((best, n) => (n.midi < best.midi ? n : best));

export function chordIssues(project, chord, index) {
  const mc = project.middle_c;
  const issues = [];
  const add = (level, message, field = null) => issues.push(issue(level, message, index, field));

  if (isRest(chord)) add("info", "Sem notas: este trecho será uma pausa (silêncio).");

  const exact = chord.duration_beats * TICKS_PER_BEAT;
  if (roundHalfEven(exact) < 1) {
    add("error", "Duração curta demais: o MIDI não marca menos de 1/960 de tempo.", "duration_beats");
  } else if (Math.abs(exact - roundHalfEven(exact)) > 1e-6) {
    add("warning", `Duração arredondada para ${fmtG(roundHalfEven(exact) / TICKS_PER_BEAT)} tempos `
      + `(resolução de 1/${TICKS_PER_BEAT} de semínima).`, "duration_beats");
  }

  // Strum que não cabe no acorde: o espaço entre as notas encolhe.
  const count = pitches(chord).length;
  if (strumFor(project, chord) !== "off" && count >= 2 && roundHalfEven(exact) >= 1) {
    const { compressed } = strumPlan(count, project.strum_delay_ms, project.tempo, beatsToTicks(chord.duration_beats));
    if (compressed) {
      add("warning", "Acorde curto demais para este strum: o espaço entre as notas foi reduzido "
        + "(o strum ocupa no máximo metade do acorde).", "strum");
    }
  }

  // Alturas repetidas (mesma tecla em duas partes ou duas vezes na mesma parte).
  const where = new Map();
  for (const part of PARTS) {
    for (const note of chord[part]) {
      if (!where.has(note.midi)) where.set(note.midi, []);
      where.get(note.midi).push(part);
    }
  }
  const voices = sounding(chord);
  for (const [midi, parts] of where) {
    if (parts.length > 1) {
      const name = noteName(voices.find((v) => v.note.midi === midi).note, mc);
      const labels = [...new Set(parts.map((p) => PART_LABELS[p].toLowerCase()))].join(", ");
      add("warning", `${name} aparece ${parts.length} vezes (${labels}). No MIDI ela soa uma vez só.`);
    }
  }

  // Soprano travado.
  const top = chord.top_note;
  const high = highest(chord);
  if (top !== null && high !== null) {
    if (!where.has(top.midi)) {
      add("warning", `O soprano travado ${noteName(top, mc)} não está entre as notas do voicing.`, "top_note");
    } else if (high.midi !== top.midi) {
      const above = voices.filter((v) => v.note.midi > top.midi).map((v) => noteName(v.note, mc));
      add("warning", `O soprano travado é ${noteName(top, mc)}, mas ${above.join(" ")} `
        + `${above.length === 1 ? "fica" : "ficam"} acima.`, "top_note");
    }
  }

  // Cruzamentos (só informativo: pode ser intencional).
  const { left_hand: lh, right_hand: rh, bass } = chord;
  if (lh.length && rh.length && maxBy(lh).midi > minBy(rh).midi) {
    add("info", `Mãos cruzadas: a esquerda chega a ${noteName(maxBy(lh), mc)}, `
      + `acima de ${noteName(minBy(rh), mc)} da direita.`);
  }
  const others = ["left_hand", "right_hand", "notes"].flatMap((p) => chord[p]);
  if (bass.length && others.length && maxBy(bass).midi > minBy(others).midi) {
    add("info", "O baixo/pedal não é a nota mais grave do acorde.", "bass");
  }

  for (const part of ["left_hand", "right_hand"]) {
    const notes = chord[part];
    if (notes.length > 1) {
      const span = maxBy(notes).midi - minBy(notes).midi;
      if (span > HAND_SPAN_LIMIT) add("info", `${PART_LABELS[part]} abre ${span} semitons (mais que uma 10ª).`, part);
    }
  }

  const outside = voices.filter((v) => v.note.midi < PIANO_LOW || v.note.midi > PIANO_HIGH).map((v) => noteName(v.note, mc));
  if (outside.length) add("info", `Fora da extensão do piano de 88 teclas: ${outside.join(" ")}.`);
  return issues;
}

export function analyzeChord(project, chord, index, startBeats) {
  const mc = project.middle_c;
  const voices = sounding(chord);
  const notes = voices.map(({ note, part }) => ({ midi: note.midi, name: noteName(note, mc), part }));
  const pcs = new Map();
  for (const { note } of voices) pcs.set(pitchClass(note), (pcs.get(pitchClass(note)) || 0) + 1);
  const doublings = [];
  for (const { note } of voices) {
    if (pcs.get(pitchClass(note)) > 1 && !doublings.includes(pitchClassName(note))) doublings.push(pitchClassName(note));
  }
  const high = highest(chord);
  const low = lowest(chord);
  return {
    index,
    symbol: chord.symbol,
    is_rest: isRest(chord),
    notes,
    top: high ? { midi: high.midi, name: noteName(high, mc) } : null,
    bottom: low ? { midi: low.midi, name: noteName(low, mc) } : null,
    top_locked: chord.top_note ? noteName(chord.top_note, mc) : null,
    spacing: notes.slice(1).map((n, i) => n.midi - notes[i].midi),
    doublings,
    start_beats: startBeats,
    duration_beats: chord.duration_beats,
    velocity: velocityFor(project, chord),
    strum: notes.length >= 2 ? strumFor(project, chord) : "off",
  };
}

/** Relatório completo (o mesmo formato do Python). */
export function analyze(project, issues = []) {
  const all = [...issues];
  if (!project.chords.length) all.push(issue("error", "A progressão está vazia: adicione pelo menos um acorde."));
  else if (project.chords.every(isRest)) all.push(issue("warning", "Nenhum acorde tem notas: o MIDI sairá vazio."));

  const chords = [];
  let start = 0;
  project.chords.forEach((chord, i) => {
    all.push(...chordIssues(project, chord, i));
    chords.push(analyzeChord(project, chord, i, start));
    start += chord.duration_beats;
  });

  const ok = !all.some((i) => i.level === "error");
  const total = totalBeats(project);
  return {
    ok,
    issues: all,
    chords,
    middle_c: project.middle_c,
    beats_per_bar: beatsPerBar(project),
    strum_delay_ms: project.strum_delay_ms,
    totals: {
      chords: project.chords.length,
      beats: total,
      bars: total / beatsPerBar(project),
      seconds: (total * 60) / project.tempo,
    },
    project: ok ? projectToDict(project) : null,
  };
}

export function analyzeData(data) {
  const { project, issues } = loadProject(data);
  return analyze(project, issues);
}
