// Riffs e ostinatos: um motivo curto, escrito pelo app, que se repete em todos os acordes e acompanha cada um.
//
// O riff nasce de três sorteios, cada um dentro do vocabulário de uma FAMÍLIA (dedilhado, power chords, galope...):
//   ritmo     uma célula de um compasso (RIFF_FAMILIES[família].rhythms);
//   desenho   a ordem em que as notas aparecem (sobe, desce, vai e volta, quebrado, pedal, motivo melódico...);
//   material  de onde as notas vêm: o arpejo do acorde, a escala dele, power chords, oitavas, ataques do acorde.
// O motivo é sorteado UMA vez por música e reaplicado em cada acorde (as notas mudam, o gesto fica): é isso que faz soar
// como riff, e não como solo. A cada 4 compassos o fim do motivo varia um pouco. Tudo é diatônico: só notas do acorde e
// da escala dele. Outra `variation` sorteia outro riff.
//
// Só o app usa (não há espelho no Python): o resultado é o texto do campo "riff" de cada acorde, que os dois motores leem.

import { makeRng, speller, ticksText } from "./groove.js";
import { beatsPerBar, sounding } from "./model.js";
import { TICKS_PER_BEAT, durationTicks } from "./phrase.js";
import { pitchClass } from "./pitch.js";

const mod12 = (n) => ((n % 12) + 12) % 12;

/**
 * As famílias de riff. material: "arpejo" (notas do acorde), "cor" (fundamental, quinta, nona e terça: o som de add9),
 * "escala" (a escala do acorde), "power" (fundamental + quinta + oitava, juntas), "pedal" (a fundamental grave abafada,
 * com acentos em power chord), "oitava" (fundamental e oitava), "acorde" (ataques com três notas do acorde juntas) ou
 * "guia" (terça e sétima juntas). low: a nota mais grave da região. shapes: os desenhos possíveis. sound: o som sugerido
 * (id em kb/sons.js). Ritmo: durações separadas por espaço; "r" na frente = pausa; "!" no fim = acento (nas famílias de
 * pedal, o acento vira power chord).
 */
export const RIFF_FAMILIES = {
  dedilhado: {
    label: "Dedilhado", material: "arpejo", low: 55, sound: "ms-piano", shapes: ["sobe", "vaievolta", "quebrado", "pedal", "desce"],
    rhythms: ["8 8 8 8 8 8 8 8", "8 8 8 8 8 8 4", "16 16 16 16 16 16 16 16 16 16 16 16 16 16 16 16", "8 16 16 8 16 16 8 16 16 8 8", "4 8 8 8 8 4", "8 8 8 4 8 4"],
  },
  pontuado: {
    label: "Guitarra com delay (colcheia pontuada)", material: "cor", low: 62, sound: "ms-guitarra-limpa", shapes: ["vaievolta", "pedal", "sobe", "quebrado"],
    rhythms: ["8. 8. 8. 8. 8 8", "8. 8. 8 8. 8. 8", "8. 8. 8. 8. 4", "8 8. 8. 8. 8. 8"],
  },
  power: {
    label: "Power chords", material: "power", low: 40, sound: "ms-guitarra-distorcida", shapes: ["fixo"],
    rhythms: ["8 8 8 8 8 8 8 8", "4 8 8 r8 8 4", "8. 8. 8 8. 8. 8", "4. 8 r8 8 4", "8 8 r8 8 8 8 r8 8", "4 4 8 8 4", "2 r8 8 8 8"],
  },
  abafado: {
    label: "Pedal abafado com acentos", material: "pedal", low: 40, sound: "ms-guitarra-abafada", shapes: ["fixo"],
    rhythms: ["8! 8 8 8! 8 8 8! 8", "8! 8 8 8 8! 8 8 8", "8 8 8! 8 8 8! 8 8", "16! 16 16 16 16! 16 16 16 16! 16 16 16 16! 16 16 16", "8! 8 8! 8 8 8! 8 8"],
  },
  galope: {
    label: "Galope", material: "pedal", low: 40, sound: "ms-guitarra-distorcida", shapes: ["fixo"],
    rhythms: ["8! 16 16 8 16 16 8! 16 16 8 16 16", "16 16 8! 16 16 8 16 16 8! 16 16 8", "8! 16 16 8 16 16 4! 8 16 16", "8! 16 16 8! 16 16 8! 16 16 8! 16 16"],
  },
  oitavas: {
    label: "Oitavas", material: "oitava", low: 43, sound: "ms-synth-baixo", shapes: ["alterna", "vaievolta", "pedal"],
    rhythms: ["8 8 8 8 8 8 8 8", "16 16 16 16 16 16 16 16 16 16 16 16 16 16 16 16", "8 16 16 8 16 16 8 16 16 8 16 16", "r8 8 r8 8 r8 8 r8 8"],
  },
  arpejador: {
    label: "Arpejador de synth", material: "arpejo", low: 60, sound: "ms-synth-serra", shapes: ["sobe", "desce", "vaievolta", "quebrado"],
    rhythms: ["16 16 16 16 16 16 16 16 16 16 16 16 16 16 16 16", "16 16 16 16 16 16 8 16 16 16 16 16 16 8", "8 8 8 8 8 8 8 8", "16 16 8 16 16 8 16 16 8 16 16 8"],
  },
  ataques: {
    label: "Ataques sincopados", material: "acorde", low: 60, sound: "ms-metais", shapes: ["fixo"],
    rhythms: ["r8 8 r4 r8 8 r4", "r4 8 r8 r4 8 r8", "8 r8 r8 8 r4 8 r8", "r8 8 r8 8 r8 8 r8 8", "4 r8 8 r4 r8 8", "r4 4 r4 8 8", "r16 16 r8 r4 r8 16 16 r4"],
  },
  ostinato: {
    label: "Ostinato melódico", material: "escala", low: 62, sound: "ms-piano-eletrico", shapes: ["motivo"],
    rhythms: ["8 8 4 8 8 4", "4 8 8 4 4", "8 8 8 8 4 4", "r8 8 8 8 4 r4", "4. 8 4 4", "8 8 r8 8 4 4", "8. 16 4 8. 16 4", "4 4 8 8 4"],
  },
  guia: {
    label: "Notas-guia", material: "guia", low: 55, sound: "ms-piano-eletrico", shapes: ["fixo"],
    rhythms: ["4t 8t r4 r4t 8t r4", "r4 4 r4 4", "r4t 8t+4 r2", "4 r4 r4t 8t r4", "r8 8+4 r4 4", "4. 8 r2"],
  },
  montuno: {
    label: "Montuno", material: "arpejo", low: 60, sound: "ms-piano", shapes: ["quebrado", "vaievolta", "pedal"],
    rhythms: ["8 8 r8 8 r8 8 r8 8", "r8 8 8 8 r8 8 8 8", "8 r8 8 8 r8 8 r8 8", "8 8 8 r8 8 r8 8 8"],
  },
};

/** As famílias de um estilo: [{ id, label }] (o estilo lista os ids em `riffs`, podendo trocar ritmos e som). */
export function riffOptions(style) {
  return (style?.riffs ?? []).map((entry) => {
    const id = typeof entry === "string" ? entry : entry.id;
    return RIFF_FAMILIES[id] ? { id, label: (typeof entry === "object" && entry.label) || RIFF_FAMILIES[id].label } : null;
  }).filter(Boolean);
}

/** A família como o estilo a usa (com os ritmos e o som dele, se ele trocar). */
export function riffFamily(style, id) {
  const base = RIFF_FAMILIES[id];
  if (!base) return null;
  const entry = (style?.riffs ?? []).find((e) => (typeof e === "string" ? e : e.id) === id);
  return { id, ...base, ...(typeof entry === "object" ? entry : {}) };
}

/** O som sugerido para o riff de uma família, neste estilo (id em kb/sons.js). */
export const riffSound = (style, id) => riffFamily(style, id)?.sound ?? null;

function parseRhythm(text) {
  return text.split(/\s+/).filter(Boolean).map((token) => {
    const rest = token.startsWith("r");
    const accent = token.endsWith("!");
    const dur = token.slice(rest ? 1 : 0, accent ? -1 : undefined);
    return { dur, ticks: durationTicks(dur), rest, accent };
  });
}

/** O ritmo de um compasso de `barTicks` ticks: a célula repetida ou cortada até caber exatamente. */
function fitBar(tokens, barTicks) {
  const out = [];
  let at = 0;
  for (let i = 0; at < barTicks && i < 256; i++) {
    const token = tokens[i % tokens.length];
    const ticks = Math.min(token.ticks, barTicks - at);
    out.push(ticks === token.ticks ? token : { ...token, ticks, dur: ticksText(ticks) });
    at += ticks;
  }
  return out.filter((t) => t.dur);
}

/** A ordem das notas: para cada nota que soa no compasso, um índice na "escada" do material. */
function drawShape(shape, count, rng) {
  const width = rng.pick([3, 4, 4, 5]);
  const out = [];
  if (shape === "motivo") {
    // um gesto melódico curto, por graus e terças, que começa e termina perto da fundamental ou da quinta
    let at = rng.pick([0, 2, 4]);
    for (let i = 0; i < count; i++) {
      out.push(at);
      at = Math.max(0, Math.min(7, at + rng.pick([-2, -1, -1, 1, 1, 2])));
    }
    if (count > 2) out[count - 1] = rng.pick([0, 2, 4]);
    return out;
  }
  const k = rng.pick([1, 2, 3]);
  for (let i = 0; i < count; i++) {
    if (shape === "sobe") out.push(i % width);
    else if (shape === "desce") out.push(width - 1 - (i % width));
    else if (shape === "vaievolta") { const period = 2 * width - 2; const p = i % period; out.push(p < width ? p : period - p); }
    else if (shape === "quebrado") out.push([0, 2, 1, 3, 2, 4, 3, 1][i % 8] % (width + 1));
    else if (shape === "pedal") out.push(i % 2 ? k + (Math.floor(i / 2) % (width - 1)) : 0);
    else if (shape === "alterna") out.push(i % 2);
    else out.push(0); // fixo
  }
  return out;
}

/** A "escada" de um acorde para um material: cada degrau é uma lista de notas MIDI que soam juntas (quase sempre uma). */
function ladderOf(material, chord, low) {
  const voices = sounding(chord);
  if (!voices.length) return null;
  const root = pitchClass(voices[0].note);
  const chordPcs = [...new Set(voices.map((v) => pitchClass(v.note)))];
  const scalePcs = [...new Set([...chord.phrase_pcs.map((x) => x.pc), ...chordPcs])];
  // a região: nas guitarras graves, a fundamental mais grave que couber; nos outros, a mais perto de `low` (assim o riff
  // não pula de região de um acorde para o outro)
  let base = low - mod12(low) + root;
  if (base < low) base += 12;
  if (low >= 50 && base - low > 6) base -= 12;
  const above = (pcs) => pcs.map((pc) => mod12(pc - root)).sort((a, b) => a - b);
  const fifth = [7, 6, 8].find((i) => chordPcs.includes(mod12(root + i))) ?? 7;
  const third = [4, 3].find((i) => chordPcs.includes(mod12(root + i))) ?? ([4, 3].find((i) => scalePcs.includes(mod12(root + i))) ?? null);
  const seventh = [10, 11].find((i) => chordPcs.includes(mod12(root + i))) ?? null;
  const two = (list) => [...list.map((i) => [base + i]), ...list.map((i) => [base + 12 + i])];
  if (material === "arpejo") return two(above(chordPcs));
  if (material === "escala") return two(above(scalePcs));
  if (material === "cor") {
    const ninth = scalePcs.includes(mod12(root + 2)) ? 14 : 12;
    return [[base], [base + fifth], [base + ninth], ...(third !== null ? [[base + 12 + third]] : []), [base + 12 + fifth], [base + 24]];
  }
  const power = [base, base + fifth, base + 12];
  if (material === "power") return [power];
  if (material === "pedal") return [[base], power]; // o acento é o degrau 1
  if (material === "oitava") return [[base], [base + 12], [base + fifth], [base + 12 + fifth]];
  if (material === "guia") {
    const pair = third !== null && seventh !== null ? [base + third, base + seventh] : third !== null ? [base + third, base + fifth] : [base, base + fifth];
    return [pair.sort((a, b) => a - b)];
  }
  // "acorde": três notas do acorde, em posição fechada; os outros degraus são as inversões seguintes
  const tones = above(chordPcs).map((i) => base + i);
  const stack = [...tones, ...tones.map((m) => m + 12), ...tones.map((m) => m + 24)];
  const size = Math.min(3, tones.length);
  return Array.from({ length: Math.max(1, tones.length) }, (_, i) => stack.slice(i, i + size));
}

/**
 * Escreve o riff de cada acorde. project: o projeto já lido (loadProject). options: { style, family (id), variation }.
 * Devolve uma lista com o texto do riff de cada acorde ("" nos acordes sem notas).
 */
export function generateRiff(project, { style, family: familyId, variation = 0 } = {}) {
  const family = riffFamily(style, familyId);
  if (!family) return project.chords.map(() => "");
  const rng = makeRng(`${style?.id ?? ""}|riff|${familyId}|${variation}`);
  const barTicks = Math.max(TICKS_PER_BEAT, Math.round(beatsPerBar(project) * TICKS_PER_BEAT));
  // o motivo da música: um ritmo e um desenho; a variação muda o fim (a cada 4 compassos)
  const rhythm = fitBar(parseRhythm(rng.pick(family.rhythms)), barTicks);
  const sounding_ = rhythm.filter((t) => !t.rest);
  const shape = rng.pick(family.shapes);
  const main = drawShape(shape, sounding_.length, rng);
  const ending = main.slice();
  if (ending.length >= 2 && shape !== "fixo") {
    const lift = rng.pick([1, 1, 2, -1]);
    ending[ending.length - 1] = Math.max(0, ending[ending.length - 1] + lift);
    ending[ending.length - 2] = Math.max(0, ending[ending.length - 2] + (rng.chance(0.5) ? lift : 0));
  }
  const pedal = family.material === "pedal";
  let tick = 0;
  return project.chords.map((chord) => {
    const length = Math.round(chord.duration_beats * TICKS_PER_BEAT);
    const start = tick;
    tick += length;
    const ladder = ladderOf(family.material, chord, family.low);
    if (!ladder) return "";
    const spell = speller(chord, project.middle_c);
    const tokens = [];
    for (let at = 0; at < length;) {
      const bar = Math.floor((start + at) / barTicks);
      const order = bar % 4 === 3 ? ending : main;
      let note = 0;
      for (const token of rhythm) {
        if (at >= length) break;
        const ticks = Math.min(token.ticks, length - at);
        const dur = ticks === token.ticks ? token.dur : ticksText(ticks);
        at += ticks;
        if (!dur) continue;
        if (token.rest) { tokens.push(`r/${dur}`); continue; }
        // no pedal, o acento toca o power chord e o resto, a fundamental; nos outros, o desenho escolhe o degrau
        const step = pedal ? (token.accent ? 1 : 0) : order[note % order.length];
        note += 1;
        const pitches = ladder[Math.min(step, ladder.length - 1)].filter((m) => m >= 28 && m <= 96);
        tokens.push(pitches.length ? `${pitches.map(spell).join("&")}/${dur}` : `r/${dur}`);
      }
    }
    return tokens.join(" ");
  });
}
