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

const QUINTUPLETS = [[384, "4q"], [192, "8q"], [96, "16q"], [48, "32q"], [24, "64q"]];
const FIGURES = [...BINARY, ...TRIPLETS, ...QUINTUPLETS];
const sumCache = new Map();

/**
 * Uma duração qualquer escrita como soma de figuras ("2+4", "4+4t", "8q+16q"), com o menor número de figuras, as binárias
 * primeiro. "" se não houver soma exata.
 */
export function ticksText(ticks) {
  if (ticks <= 0) return "";
  if (sumCache.has(ticks)) return sumCache.get(ticks);
  const best = new Array(ticks + 1).fill(null);
  best[0] = [];
  for (let t = 1; t <= ticks; t++) {
    for (const figure of FIGURES) {
      const before = best[t - figure[0]];
      if (t >= figure[0] && before && (!best[t] || before.length + 1 < best[t].length)) best[t] = [...before, figure];
    }
  }
  const order = (f) => FIGURES.indexOf(f);
  const text = best[ticks] ? [...best[ticks]].sort((x, y) => order(x) - order(y)).map((f) => f[1]).join("+") : "";
  sumCache.set(ticks, text);
  return text;
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

// ---------------------------------------------------------------- percussão

/** As percussões que a tela oferece para um estilo (congas, bongô, güiro, ganzá...). */
export const percussionOptions = (style) => (style?.percussion ?? []).map(({ id, label }) => ({ id, label }));

/** A percussão da progressão (texto "percussion"): os compassos da opção, que o motor repete até o fim. */
export const percussionFor = (style, percussionId) => style?.percussion?.find((p) => p.id === percussionId)?.bars.join(" | ") ?? "";

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

// ---------------------------------------------------------------- plano do solo: motivos e arco de intensidade
//
// O solo é planejado de trecho em trecho (1 a 4 compassos), atravessando os acordes:
//   motivo (uma célula do estilo) -> o mesmo ritmo de novo, com outras notas (seguindo o desenho do original) ->
//   uma variação (o motivo em diminuição ou só o começo dele) -> resposta -> uma nota longa de chegada -> respiração.
// Cada trecho tem uma intensidade (0 calmo a 3 virtuoso), que segue um arco: começa espaçado, cresce até o clímax
// (por volta de 70% do solo) e resolve. A intensidade vira notas por segundo, então o andamento entra na conta: a 80 BPM
// o app usa mais semicolcheias e fusas; a 160 BPM, menos. Trechos calmos podem sair em oitavas, sextas ou tríades;
// trechos rápidos, sempre numa voz só (tem de ser tocável).

/** Os níveis do controle "Intensidade do solo". */
export const INTENSITIES = [
  { id: "contido", label: "Contido" },
  { id: "equilibrado", label: "Equilibrado" },
  { id: "virtuoso", label: "Virtuoso" },
];
const INTENSITY_NPS = [2.4, 3.8, 5.5, 7]; // notas por segundo de cada intensidade (0 calmo ... 3 virtuoso)
const LEVEL_CURVE = { contido: [-0.6, 1.7], equilibrado: [0.1, 2.3], virtuoso: [1.0, 2.2] }; // [base, altura do arco]
const DUET_MIN_SECONDS = 0.25; // nota mais curta que dá para tocar em oitavas ou sextas
const TRIAD_MIN_SECONDS = 0.36; // e em tríades

/** Uma figura aumentada (factor 2) ou diminuída (0.5, 0.25): "8" -> "4" ou "16". null se não existir. */
function scaleToken(token, factor) {
  const rest = token.startsWith("r");
  const parts = (rest ? token.slice(1) : token).split("+").map((part) => {
    const m = /^(\d+)(.*)$/.exec(part);
    if (!m) return null;
    const n = Number(m[1]) / factor;
    return Number.isInteger(n) && n >= 1 && n <= 32 ? `${n}${m[2]}` : null;
  });
  if (parts.includes(null)) return null;
  try { durationTicks(parts.join("+")); } catch { return null; }
  return `${rest ? "r" : ""}${parts.join("+")}`;
}

function makeCell(text) {
  const tokens = text.split(" ").map((tok) => {
    const rest = tok.startsWith("r");
    const dur = rest ? tok.slice(1) : tok;
    return { dur, ticks: durationTicks(dur), rest };
  });
  return { text, tokens, ticks: tokens.reduce((n, t) => n + t.ticks, 0), sounds: tokens.filter((t) => !t.rest).length };
}

/** O planejador: devolve, acorde por acorde, o ritmo da frase ({dur, ticks, start, rest} e as marcas do plano). */
function makePlanner({ style, cellTexts, rng, level, tempo, totalTicks, barTicks }) {
  const [base, height] = LEVEL_CURVE[level] ?? LEVEL_CURVE.equilibrado;
  const secondsPerTick = 60 / (tempo || 100) / TICKS_PER_BEAT;
  const nps = (cell) => cell.sounds / (cell.ticks * secondsPerTick);
  const cells = [...new Set(cellTexts)].map(makeCell).filter((c) => c.ticks > 0);
  const variants = [];
  for (const cell of cells) {
    for (const factor of [2, 1, 0.5, 0.25]) {
      const tokens = cell.text.split(" ").map((t) => scaleToken(t, factor));
      if (!tokens.includes(null) && cell.sounds) variants.push({ ...makeCell(tokens.join(" ")), cost: Math.abs(Math.log2(factor)) * 0.2 });
    }
  }
  const triplets = cells.flatMap((c) => c.tokens).filter((t) => /t/.test(t.dur)).length > 0.4 * cells.flatMap((c) => c.tokens).length;
  const runFigures = triplets ? ["16t", "32t"] : ["16", "32"];
  const vocabulary = (intensity) => {
    const target = INTENSITY_NPS[intensity];
    const scored = variants.map((v) => ({ v, score: Math.abs(Math.log(nps(v) / target)) + v.cost })).sort((a, b) => a.score - b.score);
    return scored.filter((x) => x.score <= scored[0].score + 0.35).slice(0, 6).map((x) => x.v);
  };
  const runCell = (intensity) => {
    const target = INTENSITY_NPS[intensity] * 1.5; // rajada: bem mais rápida que o resto do trecho
    const figure = runFigures.map(makeCell).sort((a, b) => Math.abs(Math.log(nps(a) / target)) - Math.abs(Math.log(nps(b) / target)))[0];
    const count = Math.round(TICKS_PER_BEAT / figure.ticks);
    return makeCell(Array(count).fill(figure.text).join(" "));
  };
  const duet = style.phrase.duet ?? {};

  let at = 0;
  let queue = [];
  const newSegment = () => {
    const p = totalTicks ? Math.min(1, at / totalTicks) : 0;
    const curve = p < 0.7 ? p / 0.7 : 1 - ((p - 0.7) / 0.3) * 0.55;
    let intensity = Math.max(0, Math.min(3, Math.round(base + height * curve + (rng.next() - 0.5) * 0.9)));
    let texture = null;
    if (intensity <= 1) {
      const r = rng.next();
      const o = duet.octave ?? 0;
      const x = o + (duet.sixth ?? 0);
      const t = x + (duet.triad ?? 0);
      texture = r < o ? "octave" : r < x ? "sixth" : r < t ? "triad" : null;
      if (texture === "triad") intensity = 0; // em tríades, mais devagar ainda
    }
    const vocab = vocabulary(intensity);
    const motifs = vocab.filter((c) => c.sounds >= 2 && !c.tokens[0].rest);
    const motif = rng.pick(motifs.length ? motifs : vocab);
    const segment = { statement: null, texture, intensity, vocab };
    const length = rng.pick([1, 2, 2, 2, 4]) * barTicks;
    const items = [{ cell: motif, kind: "motivo" }];
    const repeats = rng.chance(style.phrase.motif ?? 0.5) ? 2 : 1;
    for (let i = 0; i < repeats; i++) items.push({ cell: motif, kind: "eco" });
    const smaller = motif.text.split(" ").map((t) => scaleToken(t, 0.5));
    if (!smaller.includes(null) && rng.chance(intensity >= 1 ? 0.6 : 0.3)) {
      const dim = makeCell(smaller.join(" "));
      items.push({ cell: dim, kind: "eco" }, { cell: dim, kind: "eco" }); // diminuição: o motivo duas vezes mais rápido
    } else if (motif.tokens.length >= 3) {
      // fragmento: só o começo do motivo, completado com pausa até a grade de colcheias
      const head = makeCell(motif.text.split(" ").slice(0, Math.ceil(motif.tokens.length / 2)).join(" "));
      const pad = (SHORT - (head.ticks % SHORT)) % SHORT;
      const padText = pad ? ticksText(pad) : "";
      if (!pad || padText) items.push({ cell: makeCell(pad ? `${head.text} r${padText}` : head.text), kind: "eco" });
    }
    let used = items.reduce((n, it) => n + it.cell.ticks, 0);
    const burst = [0, 0.05, 0.15, 0.3][intensity];
    while (used < length - TICKS_PER_BEAT) {
      // rajada (corrida rápida de um tempo): nunca duas seguidas, para a velocidade vir em momentos
      const run = !texture && items.at(-1).kind !== "corrida" && rng.chance(burst);
      const cell = run ? runCell(intensity) : rng.pick(vocab);
      items.push({ cell, kind: run ? "corrida" : "resposta" });
      used += cell.ticks;
    }
    // chegada: uma nota longa (que vira alvo), às vezes uma respiração
    items.push({ cell: makeCell(intensity >= 2 ? "4" : rng.pick(["4", "2"])), kind: "chegada" });
    if (rng.chance(Math.min(0.8, (style.phrase.rest ?? 0.2) * 2.5))) items.push({ cell: makeCell(intensity >= 2 ? "r8" : "r4"), kind: "pausa" });
    queue = items.map((it) => ({ ...it, segment, tokens: [...it.cell.tokens] }));
  };

  /** Tira do plano `length` ticks de ritmo (um acorde). */
  const take = (length) => {
    const slots = [];
    let tick = 0;
    while (tick < length) {
      if (!queue.length) newSegment();
      const room = length - tick;
      let item = queue[0];
      if (item.cell.ticks > room) {
        // a célula não cabe no que sobra do acorde: ela fica para o próximo (sem cortar figura no meio, para as quiálteras
        // não saírem da grade) e o resto do acorde leva uma célula menor do trecho, ou uma pausa
        if (tick === 0) { queue.shift(); continue; } // nem num acorde inteiro ela cabe: sai do plano
        const fits = item.segment.vocab.filter((c) => c.ticks <= room);
        if (fits.length) item = { cell: rng.pick(fits), kind: "resposta", segment: item.segment, tokens: null };
        else item = { cell: makeCell(`r${ticksText(room)}`), kind: "pausa", segment: item.segment, tokens: null };
        item.tokens = [...item.cell.tokens];
      } else queue.shift();
      for (const token of item.tokens) {
        const slot = { dur: token.dur, ticks: token.ticks, start: tick, rest: token.rest, texture: item.segment.texture, intensity: item.segment.intensity };
        if (item.kind === "corrida") slot.run = true;
        if (item.kind === "chegada") slot.end = true;
        if (!token.rest && item.kind === "motivo") (item.segment.statement ??= []).push(slot);
        if (!token.rest && item.kind === "eco" && item.segment.statement) {
          item.echo = (item.echo ?? -1) + 1;
          slot.echo = { statement: item.segment.statement, index: item.echo };
        }
        slots.push(slot);
        tick += token.ticks;
        at += token.ticks;
      }
    }
    return slots;
  };
  return { take, skip: (ticks) => { at += ticks; } };
}

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
  const planned = !motif && ctx.slots;
  const { slots, cells, motifSlots } = planned ? { slots: ctx.slots, cells: null, motifSlots: 0 }
    : buildRhythm(style, length, rng, motif ? null : ctx.previousCells, { cellTexts: ctx.cellTexts ?? style.cells, motif });
  const notes = planned ? slots.map((s) => Object.assign(s, { midi: null, role: "" })) : slots.map((s) => ({ ...s, midi: null, role: "" }));
  const sounding = notes.filter((n) => !n.rest);
  if (!sounding.length || !linePool.length || !targetPool.length) return { notes: [], cursor: ctx.cursor, cells };

  // 1) notas: alvos (notas do acorde) nos tempos, o resto andando pela escala
  let cursor = nearest(targetPool, ctx.cursor ?? 72);
  let direction = rng.chance(0.5) ? 1 : -1;
  const indexIn = (pitch) => linePool.indexOf(nearest(linePool, pitch));
  let runDirection = null;
  sounding.forEach((note, i) => {
    const onBeat = note.start % TICKS_PER_BEAT === 0;
    const echo = note.echo && note.echo.index > 0 ? note.echo : null;
    const from = echo?.statement[echo.index - 1]?.midi;
    const to = echo?.statement[echo.index]?.midi;
    if (!note.run) runDirection = null;
    if (echo && i > 0 && from != null && to != null) {
      // eco do motivo: o mesmo desenho (em graus da escala) a partir de outra nota
      const index = indexIn(cursor) + (indexIn(to) - indexIn(from));
      note.midi = linePool[Math.max(0, Math.min(linePool.length - 1, index))];
      if (onBeat && targetSet.has(mod12(note.midi))) note.role = "alvo";
      cursor = note.midi;
      return;
    }
    if (note.run) {
      // corrida: grau a grau, sempre na mesma direção, até a nota de chegada
      runDirection ??= cursor >= HIGH - 7 ? -1 : cursor <= LOW + 7 ? 1 : direction;
      let index = indexIn(cursor) + runDirection;
      if (index < 0 || index >= linePool.length) { runDirection = -runDirection; index = indexIn(cursor) + runDirection; }
      note.midi = linePool[Math.max(0, Math.min(linePool.length - 1, index))];
      cursor = note.midi;
      return;
    }
    if (note.end && !onBeat) {
      // chegada fora do tempo (antecipação): uma nota do acorde, sem o papel de alvo
      note.midi = nearest(targetPool, cursor + direction * 2, i > 0 ? sounding[i - 1].midi : null);
      cursor = note.midi;
      return;
    }
    const isTarget = (note.end && onBeat) || (onBeat && (note.ticks >= SHORT || i === 0 || i === sounding.length - 1));
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
    const original = note.echo?.index === 0 ? note.echo.statement[0]?.midi : null;
    if (original != null && note.midi === original) {
      // o eco repete o ritmo, não as notas: começa em outra nota (do acorde, se for alvo)
      const pool = note.role === "alvo" ? targetPool : linePool;
      note.midi = nearest(pool.filter((p) => p !== original && p !== (i > 0 ? sounding[i - 1].midi : null)), original + direction * 3) ?? note.midi;
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
  const cursorOut = sounding.at(-1).midi;
  return { notes: sustainRests(notes, length), cursor: cursorOut, cells };
}

/**
 * Notas de repouso (alvos e a última nota da frase) duram até a próxima nota: as pausas logo depois delas viram ligadura.
 * As notas do motivo outside não mudam (a cópia tem de sair igual ao original).
 */
function sustainRests(notes, length) {
  const out = [];
  const sounding = notes.filter((n) => !n.rest);
  const last = sounding.at(-1);
  for (const note of notes) {
    const holder = out.at(-1);
    if (note.rest && holder && !holder.rest && !holder.locked && (holder.role === "alvo" || holder === last)) {
      holder.ticks += note.ticks;
      holder.dur = ticksText(holder.ticks) || `${holder.dur}+${note.dur}`; // uma figura só quando dá; senão, ligadura
      continue;
    }
    out.push(note);
  }
  // se o ritmo não encheu o acorde, a última nota segura até o fim dele
  const end = out.reduce((sum, n) => sum + n.ticks, 0);
  const tail = out.at(-1);
  if (end < length && tail && !tail.rest && !tail.locked) {
    tail.dur = ticksText(tail.ticks + length - end) || `${tail.dur}+${ticksText(length - end)}`;
    tail.ticks += length - end;
  }
  return out;
}

/**
 * As vozes de baixo de cada nota da frase, conforme a textura do trecho: oitava, sexta da escala ou tríade (a melodia em
 * cima e duas notas do acorde logo abaixo; numa nota da escala que não é do acorde, a tríade da escala). Notas fora da
 * escala (aproximações, outside, blue notes) andam paralelas, com os mesmos intervalos da nota anterior. Só ganha vozes a
 * nota que dá para tocar assim: tríades a partir de TRIAD_MIN_SECONDS, oitavas e sextas a partir de DUET_MIN_SECONDS.
 * Devolve um mapa nota -> [alturas abaixo dela].
 */
function extraVoices(notes, { scalePcs, chordPcs, tempo }) {
  const out = new Map();
  const seconds = (note) => (note.ticks * 60) / (tempo || 100) / TICKS_PER_BEAT;
  const stepsDown = (pitch, steps) => {
    for (let s = 0; s < steps; s++) { pitch -= 1; while (!scalePcs.has(mod12(pitch))) pitch -= 1; }
    return pitch;
  };
  let previous = null; // intervalos da última nota com vozes
  for (const note of notes) {
    const allowed = note.rest || !note.texture ? 0 : seconds(note) >= TRIAD_MIN_SECONDS - 1e-9 ? 2 : seconds(note) >= DUET_MIN_SECONDS - 1e-9 ? 1 : 0;
    if (!allowed) { previous = null; continue; }
    const texture = note.texture === "triad" && allowed < 2 ? "sixth" : note.texture;
    const pc = mod12(note.midi);
    let below = null;
    if (texture === "octave") below = [note.midi - 12];
    else if (texture === "sixth" && scalePcs.has(pc)) below = [stepsDown(note.midi, 5)];
    else if (texture === "triad" && (chordPcs.has(pc) || scalePcs.has(pc))) {
      // em terças e quartas (nada de cluster): cada voz de 3 a 5 semitons abaixo da de cima; notas do acorde, ou da escala
      const stack = (pcs) => {
        const third = (top) => { for (let p = top - 3; p >= top - 5; p--) if (pcs.has(mod12(p)) && mod12(p) !== pc) return p; return null; };
        const first = third(note.midi);
        const second = first !== null ? third(first) : null;
        return second !== null ? [first, second] : null;
      };
      below = stack(chordPcs.has(pc) ? chordPcs : scalePcs) ?? (scalePcs.has(pc) ? [stepsDown(note.midi, 5)] : null);
    } else if (previous) below = previous.map((gap) => note.midi - gap);
    if (below && below.length > allowed) below = allowed === 1 && scalePcs.has(pc) ? [stepsDown(note.midi, 5)] : below.slice(0, allowed);
    if (!below) { previous = null; continue; }
    out.set(note, below);
    previous = below.map((b) => note.midi - b);
  }
  return out;
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
  phraseStyles = null, scales = null, color: globalColor = "", bass = null, percussion = null, intensity = "equilibrado",
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
    const cellTexts = phraseStyles?.length ? phraseStyles.flatMap((x) => x.cells) : style.cells;
    const planner = makePlanner({
      style, cellTexts, rng: makeRng(`${style.id}|${variation}|plano|${intensity}`), level: intensity, tempo: project.tempo,
      totalTicks: Math.round(totalBeats(project) * TICKS_PER_BEAT), barTicks: Math.round(beatsPerBar(project) * TICKS_PER_BEAT),
    });
    project.chords.forEach((chord, i) => {
      const voices = sounding(chord);
      const chordTicks = Math.round(chord.duration_beats * TICKS_PER_BEAT);
      if (!voices.length) { out[i].phrase = ""; previousCells = null; planner.skip(chordTicks); return; }
      const chordPcs = new Set(voices.map((v) => pitchClass(v.note)));
      const hasScale = chord.phrase_pcs.length > 0;
      if (!hasScale) withoutScale += 1;
      const scalePcs = hasScale ? new Set(chord.phrase_pcs.map((s) => s.pc)) : chordPcs;
      const following = project.chords[i + 1];
      const nextPcs = following ? new Set(sounding(following).map((v) => pitchClass(v.note))) : null;
      const own = chord.phrase_color.toLowerCase();
      const color = ["dentro", "cromatico", "outside"].includes(own) ? own : ["dentro", "cromatico", "outside"].includes(globalColor) ? globalColor : "";
      const rng = makeRng(`${style.id}|${variation}|${i}|${chord.symbol}|${voices.map((v) => v.note.midi).join(",")}`);
      const length = chordTicks;
      const outsideMotif = color === "outside" && length >= 2 * TICKS_PER_BEAT;
      const slots = outsideMotif ? null : planner.take(length);
      if (outsideMotif) planner.skip(length);
      const result = composePhrase({ style, color, chordPcs, scalePcs, root: rootPc(chord), length, nextPcs, rng, cursor, previousCells, cellTexts, scales, slots });
      cursor = result.cursor;
      previousCells = result.cells;
      const spell = speller(chord, project.middle_c);
      const below = extraVoices(result.notes, { scalePcs, chordPcs, tempo: project.tempo });
      out[i].phrase = result.notes.map((n) => {
        if (n.rest) return `r/${n.dur}`;
        const name = [n.midi, ...(below.get(n) ?? [])].map(spell).join("&");
        return `${name}/${n.dur}${n.role ? `*${n.role}` : ""}`;
      }).join(" ");
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
  const result = { chords: out, notes: warnings };
  if (drums) result.drums = drumsFor(style, drums, project, drumVariation);
  if (percussion) result.percussion = percussionFor(style, percussion);
  return result;
}
