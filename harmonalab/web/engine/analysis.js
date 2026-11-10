// Leitura do voicing: ponta, baixo, espaçamento e avisos — espelho de harmonalab/analysis.py.
// Nada aqui altera notas; só "error" bloqueia a exportação.

import { fmtG, roundHalfEven } from "./numbers.js";
import {
  PARTS, PART_LABELS, beatsPerBar, highest, isRest, issue, loadProject, lowest, pitches, projectToDict, sounding,
  strumFor, totalBeats, velocityFor,
} from "./model.js";
import { makeNote, noteName, pitchClass, pitchClassName } from "./pitch.js";
import { TICKS_PER_BEAT, beatsToTicks, strumPlan } from "./midi.js";
import { SCALE_EXEMPT_ROLES } from "./phrase.js";

const PIANO_LOW = 21; // A0
const PIANO_HIGH = 108; // C8
const HAND_SPAN_LIMIT = 16; // semitons (uma 10ª maior)
const PHRASE_LOW = 48; // tessitura confortável de uma frase: C3 a C7 (com C4 = 60)
const PHRASE_HIGH = 96;

// max()/min() do Python com key: em empate fica o primeiro.
const maxBy = (notes) => notes.reduce((best, n) => (n.midi > best.midi ? n : best));
const minBy = (notes) => notes.reduce((best, n) => (n.midi < best.midi ? n : best));

export function chordIssues(project, chord, index, nextChord = null) {
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

  // Ponta travada.
  const top = chord.top_note;
  const high = highest(chord);
  if (top !== null && high !== null) {
    if (!where.has(top.midi)) {
      add("warning", `A ponta travada ${noteName(top, mc)} não está entre as notas do voicing.`, "top_note");
    } else if (high.midi !== top.midi) {
      const above = voices.filter((v) => v.note.midi > top.midi).map((v) => noteName(v.note, mc));
      add("warning", `A ponta travada é ${noteName(top, mc)}, mas ${above.join(" ")} `
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
  issues.push(...phraseIssues(project, chord, index, nextChord));
  return issues;
}

/** Classe de altura → nome (a grafia da primeira nota do acorde que a tem). */
function chordPcNames(chord) {
  const names = new Map();
  for (const { note } of sounding(chord)) if (!names.has(pitchClass(note))) names.set(pitchClass(note), pitchClassName(note));
  return names;
}

const unique = (items) => [...new Set(items)];

/**
 * Confere a frase com o acorde: tessitura, alvos no tempo e no acorde, aproximações e escala.
 * Só avisa (warning/info): erros de escrita já foram apontados na leitura do projeto. Os papéis "alvo" e "aprox"
 * são conferidos; qualquer outro papel é livre. Novas conferências entram aqui.
 */
export function phraseIssues(project, chord, index, nextChord) {
  const events = chord.phrase_events;
  const mc = project.middle_c;
  const issues = [];
  const add = (level, message, field = "phrase") => issues.push(issue(level, message, index, field));

  const chordNames = chordPcNames(chord);
  const scale = new Set(chord.phrase_pcs.map((s) => s.pc));
  const shown = chord.phrase_pcs.map((s) => s.name).join(" ");
  if (chord.phrase_pcs.length) {
    const missing = [...chordNames].filter(([pc]) => !scale.has(pc)).map(([, name]) => name);
    if (missing.length) {
      add("warning", `A escala (${shown}) não tem ${missing.join(", ")}, `
        + `${missing.length === 1 ? "que é nota do acorde" : "que são notas do acorde"}.`, "phrase_scale");
    }
  }
  if (!events.length) return issues;

  const out = events.filter((e) => e.note.midi < PHRASE_LOW || e.note.midi > PHRASE_HIGH).map((e) => noteName(e.note, mc));
  if (out.length) {
    add("warning", `Notas fora da tessitura confortável da frase (${noteName(makeNote(PHRASE_LOW), mc)} a `
      + `${noteName(makeNote(PHRASE_HIGH), mc)}): ${unique(out).join(" ")}.`);
  }

  events.forEach((event, i) => {
    const name = noteName(event.note, mc);
    if (event.role === "alvo") {
      if (event.start % TICKS_PER_BEAT) add("warning", `O alvo ${name} não cai num tempo: começa em ${fmtG(event.start / TICKS_PER_BEAT + 1)}.`);
      if (chordNames.size && !chordNames.has(pitchClass(event.note))) add("warning", `O alvo ${name} não é nota do acorde.`);
    } else if (event.role === "aprox") {
      const following = i + 1 < events.length ? events[i + 1] : null;
      if (following && following.role === "aprox") return; // só a última aproximação da sequência precisa resolver (ex.: envolvente)
      if (following) {
        const distance = Math.abs(following.note.midi - event.note.midi);
        if (distance !== 1) {
          add("warning", `A aproximação ${name} não resolve por semitom: a nota seguinte é `
            + `${noteName(following.note, mc)} (${distance} semitons).`);
        }
      } else if (nextChord && !isRest(nextChord)) {
        const pcs = sounding(nextChord).map((v) => pitchClass(v.note));
        if (!pcs.some((pc) => [1, 11].includes((((pitchClass(event.note) - pc) % 12) + 12) % 12))) {
          add("warning", `A aproximação ${name} termina a frase, mas nenhuma nota do próximo acorde fica a um semitom dela.`);
        }
      }
    }
  });

  if (!chord.phrase_pcs.length) {
    add("info", "A frase não declara a escala (phrase_scale): não dá para conferir se as notas são dela.");
    return issues;
  }
  const outsideScale = unique(events
    .filter((e) => !scale.has(pitchClass(e.note)) && !SCALE_EXEMPT_ROLES.has(e.role))
    .map((e) => pitchClassName(e.note)));
  if (outsideScale.length) {
    add("warning", `Notas fora da escala da frase (${shown}): ${outsideScale.join(", ")}. `
      + "Se são cromáticas de propósito, marque como *aprox, *passagem, *blue ou *outside.");
  }
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
    phrase: chord.phrase_events.length ? {
      events: chord.phrase_events.map((e) => ({
        midi: e.note.midi, name: noteName(e.note, mc), start: e.start, length: e.length, role: e.role,
      })),
    } : null,
    comp: chord.comp || null,
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
    all.push(...chordIssues(project, chord, i, project.chords[i + 1] ?? null));
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
    drums: project.drums || null,
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
