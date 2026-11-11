// Ritmo e melodia escritos pelo próprio app, a partir da base de conhecimento (kb/estilos.js): a levada dos acordes
// e uma frase para cada acorde. Nada aqui toca nem exporta: o resultado são os textos "comp" e "phrase" de cada acorde,
// na mesma notação que qualquer pessoa (ou IA) pode escrever à mão, e o motor confere e toca como sempre.
//
// A frase usa só o que a harmonia traz: as notas do acorde (alvos), a escala declarada (phrase_scale) e a cor pedida
// (phrase_color: "dentro", "cromatico" ou "outside"; sem ela, vale o costume do estilo). O sorteio tem semente:
// a mesma variação dá sempre a mesma frase.

import { beatsPerBar, loadProject, sounding, totalBeats } from "./model.js";
import { TICKS_PER_BEAT, durationTicks } from "./phrase.js";
import { LETTER_PC, makeNote, noteName, pitchClass, pitchClassName } from "./pitch.js";

const LOW = 60; // tessitura da frase: C4 a E6 (com C4 = 60)
const HIGH = 88;
const SHORT = TICKS_PER_BEAT / 2; // até uma colcheia: nota "de passagem", que pode virar aproximação

// ---------------------------------------------------------------- sorteio com semente

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Gerador mulberry32: rápido e igual em qualquer navegador. */
export function makeRng(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hashSeed(String(seed));
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, chance: (p) => next() < p, pick: (list) => list[Math.floor(next() * list.length)] };
}

// ---------------------------------------------------------------- levada dos acordes

/** As levadas que a tela oferece para um estilo, na ordem da base: levadas e depois ostinatos e riffs. */
export const compOptions = (style) => (style?.comps ?? []).map(({ id, label, kind }) => ({ id, label, kind: kind ?? "levada" }));

/** A levada (texto "comp") de um estilo. Os padrões usam partes e graus da escala, então servem para qualquer acorde. */
export const compFor = (style, compId) => style?.comps.find((c) => c.id === compId)?.pattern ?? "";

// ---------------------------------------------------------------- bateria

/** Os beats que a tela oferece para um estilo, do básico às variações. */
export const beatOptions = (style) => (style?.beats ?? []).map(({ id, label }) => ({ id, label }));

const BINARY = [[1920, "1"], [960, "2"], [480, "4"], [240, "8"], [120, "16"], [60, "32"], [30, "64"]];
const TRIPLETS = [[320, "4t"], [160, "8t"], [80, "16t"], [40, "32t"], [20, "64t"]];

/** Uma duração qualquer escrita como soma de figuras ("2+4", "4+4t"), para pausas e cortes. */
export function ticksText(ticks) {
  const triplets = [];
  while (ticks % 30 !== 0) {
    const figure = TRIPLETS.find(([value]) => value <= ticks);
    if (!figure) break;
    triplets.push(figure[1]);
    ticks -= figure[0];
  }
  const binary = [];
  for (const [value, name] of BINARY) while (ticks >= value) { binary.push(name); ticks -= value; }
  return [...binary, ...triplets].join("+");
}

/** Corta uma camada do beat em `cut` ticks (repetindo-a se for mais curta) e completa o compasso com pausa. */
function cutLayer(layer, cut, barTicks) {
  const tokens = layer.trim().split(/\s+/);
  const out = [];
  let at = 0;
  for (let i = 0; at < cut; i++) {
    const token = tokens[i % tokens.length];
    const [head, dur] = token.split("/");
    const ticks = durationTicks(dur);
    out.push(at + ticks <= cut ? token : `${head}/${ticksText(cut - at)}`);
    at += ticks;
  }
  if (barTicks > cut) out.push(`r/${ticksText(barTicks - cut)}`);
  return out.join(" ");
}

/**
 * A bateria da progressão inteira (texto "drums"): o beat do estilo, com uma virada no último compasso (e a cada quatro,
 * nas progressões longas). A virada substitui o fim do compasso e o beat volta no tempo 1, com um ataque de prato.
 */
export function drumsFor(style, beatId, project, variation = 0) {
  const beat = style?.beats.find((b) => b.id === beatId);
  if (!beat) return "";
  const barTicks = Math.round(beatsPerBar(project) * TICKS_PER_BEAT);
  const bars = Math.ceil((totalBeats(project) * TICKS_PER_BEAT) / barTicks - 1e-9);
  if (bars < 2 || barTicks < 2 * TICKS_PER_BEAT) return beat.bars.join(" | ");
  const rng = makeRng(`${style.id}|${beatId}|bateria|${variation}`);
  const fills = style.fills.map((text) => ({ text, ticks: text.split(/\s+/).reduce((n, t) => n + durationTicks(t.split("/")[1]), 0) }))
    .filter((f) => f.ticks <= barTicks / 2);
  const out = [];
  let crash = false;
  for (let i = 0; i < bars; i++) {
    let layers = beat.bars[i % beat.bars.length].split(";").map((l) => l.trim());
    const isFill = fills.length && (i === bars - 1 || (bars >= 8 && i % 4 === 3));
    if (isFill) {
      const fill = rng.pick(fills);
      const cut = barTicks - fill.ticks;
      layers = [...layers.map((l) => cutLayer(l, cut, barTicks)), `r/${ticksText(cut)} ${fill.text}`];
    }
    if (crash) layers.push(`C!/4 r/${ticksText(barTicks - TICKS_PER_BEAT)}`);
    crash = isFill;
    out.push(layers.join(" ; "));
  }
  return out.join(" | ");
}

// ---------------------------------------------------------------- baixo

/** As linhas de baixo que a tela oferece para um estilo. */
export const bassOptions = (style) => (style?.bass ?? []).map(({ id, label }) => ({ id, label }));
/** A linha de baixo que combina com uma levada (a que a levada indicar, ou a primeira do estilo). */
export const bassForComp = (style, compId) => style?.comps.find((c) => c.id === compId)?.bass ?? style?.bass?.[0]?.id ?? "";

const BASS_LOW = 28; // E1
const BASS_TOP = 40; // E2: a nota de baixo do acorde fica entre E1 e D#2; a linha sobe até perto de C3

/** A nota de baixo do acorde (a mais grave do voicing, para respeitar inversões e pedais), perto da anterior. */
function bassRootMidi(pc, previous) {
  const options = [];
  for (let m = BASS_LOW; m < BASS_TOP; m++) if (mod12(m) === pc) options.push(m);
  return previous == null ? options[0] : nearest(options, previous);
}

/** Anda `steps - 1` graus na escala a partir de `from` (para cima com dir = 1, para baixo com dir = -1). */
function scaleStep(from, steps, dir, scale) {
  let pitch = from;
  for (let i = 1; i < steps; i++) {
    pitch += dir;
    while (!scale.has(mod12(pitch))) pitch += dir;
  }
  return pitch;
}

/** Linha de baixo de um acorde: o desenho do estilo repetido até o fim e, às vezes, uma virada que chega ao próximo acorde. */
function composeBass({ style, lineId, chord, next, length, rng, previous }) {
  const line = style.bass.find((b) => b.id === lineId) ?? style.bass[0];
  const voices = sounding(chord);
  const rootPc = pitchClass(voices[0].note);
  const scale = new Set(chord.phrase_pcs.length ? chord.phrase_pcs.map((x) => x.pc) : voices.map((v) => pitchClass(v.note)));
  scale.add(rootPc);
  const root = bassRootMidi(rootPc, previous);
  const nextVoices = next ? sounding(next) : [];
  const nextRoot = nextVoices.length ? bassRootMidi(pitchClass(nextVoices[0].note), root) : null;
  const fill = nextRoot != null && length >= 2 * TICKS_PER_BEAT && rng.chance(style.bassFill?.chance ?? 0);
  const body = fill ? length - TICKS_PER_BEAT : length;

  const pitchOf = (degree) => {
    if (degree === "x") return nextRoot != null ? nextRoot - 1 : root;
    const down = degree.startsWith("_");
    return scaleStep(root, Number(down ? degree.slice(1) : degree), down ? -1 : 1, scale);
  };
  const out = [];
  const tokens = line.pattern.split(" ");
  for (let at = 0, i = 0; at < body; i++) {
    const [degree, dur] = tokens[i % tokens.length].split("/");
    const ticks = Math.min(durationTicks(dur), body - at);
    const text = ticks === durationTicks(dur) ? dur : ticksText(ticks);
    out.push(degree === "r" ? { rest: true, dur: text } : { midi: pitchOf(degree), dur: text, role: degree === "x" ? "aprox" : "" });
    at += ticks;
  }
  if (fill) {
    // virada: corrida pela pentatônica do acorde, chegando ao baixo do próximo acorde por semitom
    const figure = style.bassFill.figure;
    const count = Math.round(TICKS_PER_BEAT / durationTicks(figure));
    const arrival = rng.chance(0.7) ? nextRoot - 1 : nextRoot + 1;
    const penta = pentatonicOf(scale, rootPc) ?? scale;
    const pool = [];
    for (let m = BASS_LOW - 4; m <= BASS_TOP + 12; m++) if (penta.has(mod12(m))) pool.push(m);
    const start = out.filter((n) => !n.rest).at(-1)?.midi ?? root;
    const dir = arrival >= start ? 1 : -1;
    let pitch = start;
    for (let i = 0; i < count - 1; i++) {
      const candidates = pool.filter((m) => (dir > 0 ? m > pitch && m < arrival : m < pitch && m > arrival));
      // sem nota da pentatônica no caminho: a vizinha mais perto (a corrida não fica parada numa nota só)
      pitch = candidates.length ? (dir > 0 ? candidates[0] : candidates.at(-1)) : nearest(pool.filter((m) => m !== pitch && m !== arrival), pitch);
      out.push({ midi: pitch, dur: figure, role: "" });
    }
    out.push({ midi: arrival, dur: figure, role: "aprox" });
  }
  return { notes: out, last: out.filter((n) => !n.rest).at(-1)?.midi ?? root, root };
}

// ---------------------------------------------------------------- frases

const cellTicks = (cell) => cell.split(" ").reduce((sum, tok) => sum + durationTicks(tok.replace(/^r/, "")), 0);

/** Uma tentativa de ritmo: células do estilo (ou as do acorde anterior), até encher o acorde. */
function drawRhythm(style, cells, length, rng, reuse) {
  const chosen = [];
  let at = 0;
  for (let i = 0; at < length; i++) {
    const fits = cells.filter((c) => c.ticks <= length - at);
    if (!fits.length) break;
    let cell = reuse?.[i] && reuse[i].ticks <= length - at ? reuse[i] : rng.pick(fits);
    if (!reuse && at > 0 && TICKS_PER_BEAT <= length - at && rng.chance(style.phrase.rest)) cell = { text: "r4", ticks: TICKS_PER_BEAT };
    chosen.push(cell);
    at += cell.ticks;
  }
  const slots = [];
  let tick = 0;
  for (const cell of chosen) {
    for (const tok of cell.text.split(" ")) {
      const rest = tok.startsWith("r");
      const dur = rest ? tok.slice(1) : tok;
      const ticks = durationTicks(dur);
      slots.push({ dur, ticks, start: tick, rest });
      tick += ticks;
    }
  }
  return { slots, cells: chosen };
}

/**
 * Ritmo de uma frase: [{ dur (texto), ticks, start, rest }]. Sorteia de novo se sair vazio demais para o estilo
 * (minNotes a cada 4 tempos) e fica com a tentativa mais cheia.
 */
function buildRhythm(style, length, rng, previousCells, { cellTexts = style.cells, motif = false } = {}) {
  const cells = [...new Set(cellTexts)].map((text) => ({ text, ticks: cellTicks(text) }));
  if (motif) {
    // outside em motivo: a mesma célula duas vezes seguidas (a segunda vai meio tom para fora), depois o resto
    const sounds = (c) => c.text.split(" ").filter((t) => !t.startsWith("r")).length;
    const options = cells.filter((c) => c.ticks * 2 <= length && sounds(c) >= 2 && !c.text.startsWith("r"));
    if (options.length) {
      const cell = rng.pick(options);
      const rest = length - cell.ticks * 2;
      const tail = rest ? drawRhythm(style, cells, rest, rng, null).cells : [];
      const chosen = [cell, cell, ...tail];
      const slots = [];
      let tick = 0;
      for (const c of chosen) {
        for (const tok of c.text.split(" ")) {
          const isRest = tok.startsWith("r");
          const dur = isRest ? tok.slice(1) : tok;
          slots.push({ dur, ticks: durationTicks(dur), start: tick, rest: isRest });
          tick += durationTicks(dur);
        }
      }
      return { slots, cells: chosen, motifSlots: cell.text.split(" ").length };
    }
  }
  const wanted = Math.max(1, Math.floor(((style.phrase.minNotes ?? 3) * length) / (4 * TICKS_PER_BEAT)));
  const count = (rhythm) => rhythm.slots.filter((s) => !s.rest).length;
  let best = drawRhythm(style, cells, length, rng, previousCells && rng.chance(style.phrase.motif) ? previousCells : null);
  for (let attempt = 0; attempt < 12 && count(best) < wanted; attempt++) {
    const next = drawRhythm(style, cells, length, rng, null);
    if (count(next) > count(best)) best = next;
  }
  return best;
}

const mod12 = (n) => ((n % 12) + 12) % 12;

/** Fundamental para blue notes e pentatônica: a letra da cifra, ou a nota mais grave se a cifra não ajudar. */
function rootPc(chord) {
  const m = /^([A-G])([#b♯♭]?)/.exec(chord.symbol || "");
  if (m) return mod12(LETTER_PC[m[1]] + (m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0));
  const voices = sounding(chord);
  return voices.length ? pitchClass(voices[0].note) : 0;
}

/** Pentatônica (menor ou maior) da fundamental que couber melhor na escala; null se a escala não tiver uma. */
function pentatonicOf(scale, root) {
  const options = [[0, 3, 5, 7, 10], [0, 2, 4, 7, 9]].map((shape) => shape.map((i) => mod12(root + i)).filter((pc) => scale.has(pc)));
  const best = options.sort((a, b) => b.length - a.length)[0];
  return best.length >= 4 ? new Set(best) : null;
}

const nearest = (pool, pitch, avoid = null) => {
  let best = null;
  for (const p of pool) {
    if (p === avoid) continue;
    if (best === null || Math.abs(p - pitch) < Math.abs(best - pitch)) best = p;
  }
  return best ?? pool[0];
};

/**
 * Regra do fraseado: dentro da frase, nunca a mesma nota duas vezes seguidas. Uma pausa de até um tempo no meio não conta
 * como fim de frase; entre frases (de um acorde para o outro) a repetição continua permitida. A nota trocada vai para a
 * vizinha mais perto (um alvo continua alvo, uma aproximação passa para o outro lado do alvo); numa cópia outside, quem muda
 * é a nota de antes, para o motivo continuar igual.
 */
function noRepeatedNotes(notes, { linePool, targetPool, blue }) {
  const sounding = notes.filter((n) => !n.rest);
  const near = (pool, pitch, avoid) => {
    let best = null;
    for (const p of pool) if (!avoid.includes(p) && (best === null || Math.abs(p - pitch) < Math.abs(best - pitch))) best = p;
    return best;
  };
  for (let i = 1; i < sounding.length; i++) {
    const before = sounding[i - 1];
    const note = sounding[i];
    if (note.midi !== before.midi || note.start - (before.start + before.ticks) > TICKS_PER_BEAT) continue;
    const after = sounding[i + 1];
    if (note.locked && before.locked) continue; // dentro do motivo outside não se mexe (a emenda já foi evitada)
    const fixPrevious = note.locked || (note.role === "outside" && before.role !== "outside" && before.role !== "alvo" && before.role !== "aprox");
    const target = fixPrevious ? before : note;
    const neighbours = [fixPrevious ? sounding[i - 2] : before, fixPrevious ? note : after].filter(Boolean).map((n) => n.midi);
    if (target.role === "aprox" && after) {
      target.midi = 2 * after.midi - target.midi === target.midi ? target.midi : 2 * after.midi - target.midi; // do outro lado do alvo
      if (!neighbours.includes(target.midi)) continue;
    }
    const pool = target.role === "alvo" ? targetPool : linePool;
    const replacement = near(pool, target.midi, neighbours) ?? near(linePool, target.midi, neighbours);
    if (replacement !== null) {
      target.midi = replacement;
      if (target.role !== "alvo") target.role = blue.has(mod12(replacement)) ? "blue" : "";
    }
  }
}

/**
 * Uma frase para um acorde. ctx: { style, color, chordPcs (Set), scalePcs (Set), root, length, nextPcs (Set|null), rng, cursor, previousCells }.
 * Devolve { notes: [{dur, rest, midi, role}], cursor, cells }.
 */
/** As escalas de origem que a frase pode usar (tags do painel). "acorde" = a escala que veio com a harmonia. */
export const SOURCE_SCALES = [
  { id: "acorde", label: "Escala do acorde" },
  { id: "penta", label: "Pentatônica" },
  { id: "blues", label: "Blues" },
  { id: "arpejo", label: "Arpejo" },
];

/** As notas (classes de altura) da paleta escolhida; `blue` = as que ficam fora da escala do acorde (viram *blue). */
function paletteOf(scales, { scalePcs, chordPcs, root, stylePenta }) {
  const out = new Set();
  const blue = new Set();
  const chosen = scales?.length ? scales : ["acorde"];
  for (const id of chosen) {
    if (id === "acorde") {
      const penta = stylePenta ? pentatonicOf(scalePcs, root) : null;
      for (const pc of penta ? [...penta, ...[...chordPcs].filter((x) => scalePcs.has(x))] : scalePcs) out.add(pc);
    } else if (id === "penta") {
      for (const pc of pentatonicOf(scalePcs, root) ?? chordPcs) out.add(pc);
    } else if (id === "arpejo") {
      for (const pc of chordPcs) out.add(pc);
    } else if (id === "blues") {
      // pentatônica menor da fundamental + a quinta diminuta; o que não estiver na escala vira blue note
      for (const step of [0, 3, 5, 6, 7, 10]) {
        const pc = mod12(root + step);
        out.add(pc);
        if (!scalePcs.has(pc)) blue.add(pc);
      }
    }
  }
  return { set: out.size ? out : scalePcs, blue };
}

export function composePhrase(ctx) {
  const { style, color, chordPcs, scalePcs, root, length, nextPcs, rng } = ctx;
  const params = style.phrase;
  const inside = color === "dentro";
  const chromatic = inside ? 0 : color === "cromatico" || color === "outside" ? Math.max(params.chromatic, 0.6) : params.chromatic;
  const enclosure = inside ? 0 : color === "cromatico" || color === "outside" ? Math.max(params.enclosure, 0.3) : params.enclosure;
  const blue = inside ? 0 : params.blue;

  const palette = paletteOf(ctx.scales, { scalePcs, chordPcs, root, stylePenta: params.pentatonic });
  const lineSet = palette.set;
  const range = (set) => { const out = []; for (let p = LOW; p <= HIGH; p++) if (set.has(mod12(p))) out.push(p); return out; };
  const linePool = range(lineSet);
  const targetSet = new Set([...chordPcs].filter((pc) => scalePcs.has(pc)));
  const targetPool = range(targetSet.size ? targetSet : chordPcs);

  const motif = color === "outside" && length >= 2 * TICKS_PER_BEAT;
  const { slots, cells, motifSlots } = buildRhythm(style, length, rng, motif ? null : ctx.previousCells, { cellTexts: ctx.cellTexts ?? style.cells, motif });
  const notes = slots.map((s) => ({ ...s, midi: null, role: "" }));
  const sounding = notes.filter((n) => !n.rest);
  if (!sounding.length || !linePool.length || !targetPool.length) return { notes: [], cursor: ctx.cursor, cells };

  // 1) notas: alvos (notas do acorde) nos tempos, o resto andando pela escala
  let cursor = nearest(targetPool, ctx.cursor ?? 72);
  let direction = rng.chance(0.5) ? 1 : -1;
  sounding.forEach((note, i) => {
    const onBeat = note.start % TICKS_PER_BEAT === 0;
    const isTarget = onBeat && (note.ticks >= SHORT || i === 0 || i === sounding.length - 1);
    if (isTarget) {
      const aim = cursor + direction * (rng.chance(params.leap) ? 5 : 2);
      const previous = i > 0 ? sounding[i - 1].midi : null;
      note.midi = nearest(targetPool, aim, previous);
      note.role = "alvo";
    } else {
      const at = linePool.indexOf(nearest(linePool, cursor));
      const step = rng.chance(params.leap) ? 2 : 1;
      let index = at + direction * step;
      if (index < 0 || index >= linePool.length) { direction = -direction; index = at + direction * step; }
      note.midi = linePool[Math.max(0, Math.min(linePool.length - 1, index))];
    }
    cursor = note.midi;
    if (cursor >= HIGH - 4) direction = -1;
    else if (cursor <= LOW + 4) direction = 1;
    else if (rng.chance(0.3)) direction = -direction;
  });

  const free = (note) => note && !note.role && note.ticks <= SHORT;
  const inRange = (p) => p >= LOW - 2 && p <= HIGH + 2;

  // 2) aproximação cromática (ou envolvente) antes de um alvo
  sounding.forEach((note, i) => {
    if (note.role !== "alvo" || i === 0 || !free(sounding[i - 1]) || !rng.chance(chromatic)) return;
    const below = note.midi - 1;
    const before = sounding[i - 1];
    if (i >= 2 && free(sounding[i - 2]) && rng.chance(enclosure) && inRange(note.midi + 1)) {
      sounding[i - 2].midi = note.midi + 1;
      sounding[i - 2].role = "aprox";
      before.midi = below;
    } else {
      before.midi = rng.chance(0.75) ? below : note.midi + 1;
    }
    before.role = "aprox";
  });

  // 3) blue notes: a terça menor antes da maior e a quinta diminuta antes da justa
  if (blue > 0) {
    sounding.forEach((note, i) => {
      const next = sounding[i + 1];
      if (!next || !free(note) || !rng.chance(blue)) return;
      for (const [blueStep, goal] of [[3, 4], [6, 7]]) {
        if (mod12(next.midi - root) === goal && !scalePcs.has(mod12(root + blueStep)) && inRange(next.midi - 1)) {
          note.midi = next.midi - 1;
          note.role = "blue";
        }
      }
    });
  }

  // 4) aproximação para o acorde seguinte, na última nota
  const last = sounding.at(-1);
  if (nextPcs?.size && free(last) && sounding.length > 1 && rng.chance(chromatic)) {
    const goals = [];
    for (let p = last.midi - 6; p <= last.midi + 6; p++) if (nextPcs.has(mod12(p))) goals.push(p);
    if (goals.length) {
      last.midi = nearest(goals, last.midi) - 1;
      last.role = "aprox";
    }
  }

  // 5) blue notes da paleta (escala blues fora da escala do acorde) ficam marcadas
  for (const note of sounding) if (!note.role && palette.blue.has(mod12(note.midi))) note.role = "blue";

  // a regra de não repetir vale antes de copiar o motivo, para a cópia sair igual ao original
  noRepeatedNotes(notes, { linePool, targetPool, blue: palette.blue });

  // 6) outside em motivo: a mesma figura (ritmo e desenho) logo em seguida, meio tom acima ou abaixo, e resolve no alvo
  if (color === "outside") {
    if (motifSlots) {
      let shift = rng.chance(0.5) ? 1 : -1;
      // o motivo original fica dentro da escala: aproximações dele resolveriam numa nota que agora está fora
      for (let i = 0; i < motifSlots; i++) {
        if (notes[i].rest || notes[i].role !== "aprox") continue;
        notes[i].midi = nearest(linePool, notes[i].midi);
        notes[i].role = palette.blue.has(mod12(notes[i].midi)) ? "blue" : "";
      }
      noRepeatedNotes(notes, { linePool, targetPool, blue: palette.blue }); // o motivo já sai sem notas repetidas
      // a emenda: a primeira nota da cópia não pode ser igual à última do original (aí a cópia vai para o outro lado)
      const lastOriginal = notes.slice(0, motifSlots).filter((n) => !n.rest).at(-1);
      const firstSounding = notes.slice(0, motifSlots).find((n) => !n.rest);
      if (lastOriginal && firstSounding && firstSounding.midi + shift === lastOriginal.midi) shift = -shift;
      for (let i = 0; i < motifSlots; i++) {
        const source = notes[i];
        const copy = notes[motifSlots + i];
        if (source.rest) continue;
        copy.midi = source.midi + shift;
        copy.role = "outside";
        source.locked = true;
        copy.locked = true;
      }
      // a nota seguinte resolve dentro: um alvo do acorde perto da última nota de fora
      const after = notes.slice(2 * motifSlots).find((n) => !n.rest);
      if (after) {
        after.midi = nearest(targetPool, notes.slice(0, 2 * motifSlots).filter((n) => !n.rest).at(-1).midi);
        after.role = after.start % TICKS_PER_BEAT === 0 ? "alvo" : "";
      }
    } else {
      // acorde curto (menos de dois tempos): um trecho desloca meio tom e resolve no alvo seguinte
      const resolveAt = [];
      sounding.forEach((note, i) => { if (note.role === "alvo" && i >= 2) resolveAt.push(i); });
      if (resolveAt.length) {
        const end = rng.pick(resolveAt);
        let start = Math.max(0, end - 2);
        while (start > 0 && sounding[start - 1].role === "aprox") start -= 1;
        const shift = rng.chance(0.5) ? 1 : -1;
        for (let i = start; i < end; i++) {
          sounding[i].midi = Math.max(LOW - 2, Math.min(HIGH + 2, sounding[i].midi + shift));
          sounding[i].role = "outside";
        }
      }
    }
  }
  noRepeatedNotes(notes, { linePool, targetPool, blue: palette.blue });
  return { notes, cursor: sounding.at(-1).midi, cells };
}

/** Nome da nota com a grafia da escala ou do acorde (Eb, não D#, quando a escala diz Eb). */
function speller(chord, middleC) {
  const names = new Map();
  for (const { pc, name } of chord.phrase_pcs) names.set(pc, name);
  for (const { note } of sounding(chord)) if (!names.has(pitchClass(note))) names.set(pitchClass(note), pitchClassName(note));
  return (midi) => {
    const name = names.get(mod12(midi));
    if (!name) return noteName(makeNote(midi), middleC);
    const accidental = [...name.slice(1)].reduce((n, ch) => n + (ch === "#" ? 1 : -1), 0);
    return noteName(makeNote(midi, name[0], accidental), middleC);
  };
}

/**
 * Escreve a levada e/ou as frases de uma progressão.
 * data: o JSON do projeto. options: { style (da base), comp (id da levada ou null), phrases (bool), variation (número),
 * drums (id do beat ou null), drumVariation (número: sorteia as viradas) }.
 * Devolve { chords: [{ comp, phrase, phrase_scale }] (só os campos pedidos), drums (texto, se pedido), notes: [avisos em português] }.
 */
export function generateGroove(data, {
  style, comp = null, phrases = false, variation = 0, drums = null, drumVariation = 0,
  phraseStyles = null, scales = null, color: globalColor = "", bass = null,
} = {}) {
  const { project } = loadProject(data);
  const out = project.chords.map(() => ({}));
  const warnings = [];
  if (!style) return { chords: out, notes: ["Escolha um estilo."] };

  if (comp) {
    project.chords.forEach((chord, i) => { out[i].comp = sounding(chord).length ? compFor(style, comp) : ""; });
  }

  if (phrases) {
    let cursor = null;
    let previousCells = null;
    let withoutScale = 0;
    project.chords.forEach((chord, i) => {
      const voices = sounding(chord);
      if (!voices.length) { out[i].phrase = ""; previousCells = null; return; }
      const chordPcs = new Set(voices.map((v) => pitchClass(v.note)));
      const hasScale = chord.phrase_pcs.length > 0;
      if (!hasScale) withoutScale += 1;
      const scalePcs = hasScale ? new Set(chord.phrase_pcs.map((s) => s.pc)) : chordPcs;
      const following = project.chords[i + 1];
      const nextPcs = following ? new Set(sounding(following).map((v) => pitchClass(v.note))) : null;
      const own = chord.phrase_color.toLowerCase();
      const color = ["dentro", "cromatico", "outside"].includes(own) ? own : ["dentro", "cromatico", "outside"].includes(globalColor) ? globalColor : "";
      const rng = makeRng(`${style.id}|${variation}|${i}|${chord.symbol}|${voices.map((v) => v.note.midi).join(",")}`);
      const length = Math.round(chord.duration_beats * TICKS_PER_BEAT);
      const cellTexts = phraseStyles?.length ? phraseStyles.flatMap((x) => x.cells) : style.cells;
      const result = composePhrase({ style, color, chordPcs, scalePcs, root: rootPc(chord), length, nextPcs, rng, cursor, previousCells, cellTexts, scales });
      cursor = result.cursor;
      previousCells = result.cells;
      const spell = speller(chord, project.middle_c);
      out[i].phrase = result.notes.map((n) => (n.rest ? `r/${n.dur}` : `${spell(n.midi)}/${n.dur}${n.role ? `*${n.role}` : ""}`)).join(" ");
      if (!hasScale) out[i].phrase_scale = [...new Map(voices.map((v) => [pitchClass(v.note), pitchClassName(v.note)])).values()].join(" ");
    });
    if (withoutScale) {
      warnings.push(`${withoutScale} acorde(s) sem escala declarada: as frases deles usam só as notas do acorde. Peça à sua IA as notas da escala (ou escreva em “Mais”).`);
    }
  }
  if (bass) {
    let previous = null;
    project.chords.forEach((chord, i) => {
      if (!sounding(chord).length) { out[i].bass_line = ""; return; }
      const following = project.chords.slice(i + 1).find((c) => sounding(c).length) ?? null;
      const rng = makeRng(`${style.id}|baixo|${bass}|${drumVariation}|${i}`);
      const length = Math.round(chord.duration_beats * TICKS_PER_BEAT);
      const result = composeBass({ style, lineId: bass, chord, next: following, length, rng, previous });
      previous = result.root;
      const spell = speller(chord, project.middle_c);
      out[i].bass_line = result.notes.map((n) => (n.rest ? `r/${n.dur}` : `${spell(n.midi)}/${n.dur}${n.role ? `*${n.role}` : ""}`)).join(" ");
    });
  }
  return drums ? { chords: out, drums: drumsFor(style, drums, project, drumVariation), notes: warnings } : { chords: out, notes: warnings };
}
