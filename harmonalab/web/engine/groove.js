// Ritmo e melodia escritos pelo próprio app, a partir da base de conhecimento (kb/estilos.js): a levada dos acordes
// e uma frase para cada acorde. Nada aqui toca nem exporta: o resultado são os textos "comp" e "phrase" de cada acorde,
// na mesma notação que qualquer pessoa (ou IA) pode escrever à mão, e o motor confere e toca como sempre.
//
// A frase usa só o que a harmonia traz: as notas do acorde (alvos), a escala declarada (phrase_scale) e a cor pedida
// (phrase_color: "dentro", "cromatico" ou "outside"; sem ela, vale o costume do estilo). O sorteio tem semente:
// a mesma variação dá sempre a mesma frase.

import { generateRiff } from "./riff.js";
import { beatsPerBar, loadProject, sounding, totalBeats } from "./model.js";
import { TICKS_PER_BEAT, durationTicks } from "./phrase.js";
import { LETTER_PC, makeNote, noteName, pitchClass, pitchClassName } from "./pitch.js";
import { perfilDoEstilo } from "../kb/fraseado.js";

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
  // duração muito longa (uma pausa de muitos compassos): as semibreves inteiras saem na frente e só o resto é calculado,
  // para a conta não crescer com o tamanho (o resultado é o mesmo: o menor número de figuras)
  if (ticks > 2 * 1920) {
    const wholes = Math.floor(ticks / 1920) - 1;
    const rest = ticksText(ticks - wholes * 1920);
    return rest ? `${"1+".repeat(wholes)}${rest}` : "";
  }
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
 * Dinâmica do chimbal e da condução (H, R e cúpula E): cada toque ganha um nível de velocity pela posição no compasso,
 * a não ser que a base já marque o seu. No swing e no blues, acento no 2 e no 4 e as notas "pulo" leves; nos outros
 * estilos, acento nos tempos, contratempo normal, semicolcheias leves e algumas fantasmas. Cada compasso varia um pouco.
 */
function hatDynamics(layer, { swing, rng }) {
  let pos = 0;
  return layer.trim().split(/\s+/).map((token) => {
    const [head, dur] = token.split("/");
    const ticks = durationTicks(dur);
    const at = pos;
    pos += ticks;
    const m = /^([A-Z])(!!|\?\?|[!?])?(>>|>)?$/.exec(head);
    if (!m || !["H", "R", "E"].includes(m[1]) || m[2]) return token;
    const beat = at % TICKS_PER_BEAT === 0;
    const index = Math.floor(at / TICKS_PER_BEAT);
    let mark;
    if (swing) mark = beat ? (index % 2 ? (rng.chance(0.2) ? "!!" : "!") : rng.chance(0.3) ? "?" : "") : rng.chance(0.25) ? "??" : "?";
    else if (beat) mark = index === 0 && rng.chance(0.3) ? "!!" : rng.chance(0.1) ? "" : "!";
    else if (at % (TICKS_PER_BEAT / 2) === 0) mark = rng.chance(0.15) ? "?" : "";
    else mark = rng.chance(0.3) ? "??" : "?";
    return `${m[1]}${mark}${m[3] ?? ""}/${dur}`;
  }).join(" ");
}

/** Uma camada completada com pausa até `ticks`. */
const padLayer = (layer, ticks) => {
  const used = layer.trim().split(/\s+/).reduce((n, t) => n + durationTicks(t.split("/")[1]), 0);
  return used < ticks ? `${layer.trim()} r/${ticksText(ticks - used)}` : layer.trim();
};

/**
 * A bateria da progressão inteira (texto "drums"): o beat do estilo, com dinâmica no chimbal e uma virada no último
 * compasso (e a cada quatro, nas progressões longas). A virada (que pode ter várias camadas, como bumbo por baixo)
 * substitui o fim do compasso; a do fim prefere as de dois tempos. Depois dela, o beat volta no tempo 1 com um ataque de prato.
 */
/** Os níveis dos controles das viradas (bateria e baixo): frequência e liberdade. */
export const FILL_FREQUENCIES = [{ id: "sem", label: "Sem" }, { id: "poucas", label: "Poucas" }, { id: "normal", label: "Normal" }, { id: "muitas", label: "Muitas" }];
export const FILL_FREEDOMS = [{ id: "contido", label: "Contidas" }, { id: "normal", label: "Normal" }, { id: "solto", label: "Soltas" }];
const fillLevel = (list, id) => (list.some((x) => x.id === id) ? id : "normal");

/**
 * fill: { frequency ("sem" | "poucas" | "normal" | "muitas"), freedom ("contido" | "normal" | "solto") }. Frequência: sem
 * viradas; só no fim (e a cada 8, nas longas); o costume (fim e a cada 4); a cada 2 compassos. Liberdade: só as viradas
 * curtas do estilo; o costume; as longas quase sempre, sem repetir a mesma duas vezes seguidas.
 */
export function drumsFor(style, beatId, project, variation = 0, fill = {}) {
  const frequency = fillLevel(FILL_FREQUENCIES, fill.frequency);
  const freedom = fillLevel(FILL_FREEDOMS, fill.freedom);
  const beat = style?.beats.find((b) => b.id === beatId);
  if (!beat) return "";
  const barTicks = Math.round(beatsPerBar(project) * TICKS_PER_BEAT);
  const bars = Math.ceil((totalBeats(project) * TICKS_PER_BEAT) / barTicks - 1e-9);
  const rng = makeRng(`${style.id}|${beatId}|bateria|${variation}`);
  const swing = ["swing", "blues"].includes(style.id);
  const dynamic = (bar) => bar.split(";").map((l) => hatDynamics(l, { swing, rng })).join(" ; ");
  if (bars < 2 || barTicks < 2 * TICKS_PER_BEAT) return beat.bars.map(dynamic).join(" | ");
  const fills = style.fills.map((text) => {
    const layers = text.split(";").map((l) => l.trim()).filter(Boolean);
    const ticks = Math.max(...layers.map((l) => l.split(/\s+/).reduce((n, t) => n + durationTicks(t.split("/")[1]), 0)));
    return { layers: layers.map((l) => padLayer(l, ticks)), ticks };
  }).filter((f) => f.ticks <= barTicks / 2);
  const out = [];
  let crash = false;
  let lastFill = null;
  for (let i = 0; i < bars; i++) {
    let layers = dynamic(beat.bars[i % beat.bars.length]).split(";").map((l) => l.trim());
    const last = i === bars - 1;
    const due = frequency === "sem" ? false
      : frequency === "poucas" ? last || (bars >= 16 && i % 8 === 7)
        : frequency === "muitas" ? last || (bars >= 4 && i % 2 === 1)
          : last || (bars >= 8 && i % 4 === 3);
    const isFill = Boolean(fills.length && due);
    if (isFill) {
      const longest = Math.max(...fills.map((x) => x.ticks));
      const shortest = Math.min(...fills.map((x) => x.ticks));
      const long = fills.filter((f) => f.ticks === longest);
      const short = fills.filter((f) => f.ticks === shortest);
      let pool = (last || i % 8 === 7) && long.length ? long : fills;
      if (freedom === "contido") pool = short;
      else if (freedom === "solto") pool = last || rng.chance(0.75) ? long : fills;
      if (freedom === "solto" && pool.length > 1 && lastFill) pool = pool.filter((f) => f !== lastFill); // sem repetir a mesma em seguida
      const fill = rng.pick(pool);
      lastFill = fill;
      const cut = barTicks - fill.ticks;
      layers = [...layers.map((l) => cutLayer(l, cut, barTicks)), ...fill.layers.map((l) => `r/${ticksText(cut)} ${l}`)];
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

// Baixo de 4 cordas (afinação padrão): nada abaixo do E1, a corda solta mais grave; no agudo, até o G4 (casa 24 da corda G).
const BASS_LOW = 28; // E1
const BASS_TOP = 40; // E2: a nota de baixo do acorde fica entre E1 e D#2
const BASS_HIGHEST = 67; // G4
/** Põe uma nota na extensão do baixo de 4 cordas, por oitavas. */
const inBassRange = (m) => { while (m < BASS_LOW) m += 12; while (m > BASS_HIGHEST) m -= 12; return m; };

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

/**
 * Linha de baixo de um acorde: o desenho do estilo repetido até o fim (com "pops" de oitava de vez em quando, nos estilos
 * que pedem) e, às vezes, uma virada pela pentatônica no fim do acorde, de 1 ou 2 tempos (bassFill), num destes desenhos:
 *   chegada: anda até o baixo do próximo acorde e chega por semitom;
 *   descida: salta para o agudo e desce correndo até a aproximação do próximo acorde;
 *   subida: sobe correndo até uma nota aguda do próximo acorde, e o acorde seguinte cai no grave (bem gospel);
 *   arco: sobe até o agudo e desce até a aproximação.
 */
function composeBass({ style, lineId, chord, next, length, rng, previous, fill = {} }) {
  const line = style.bass.find((b) => b.id === lineId) ?? style.bass[0];
  const voices = sounding(chord);
  const rootPc = pitchClass(voices[0].note);
  const scale = new Set(chord.phrase_pcs.length ? chord.phrase_pcs.map((x) => x.pc) : voices.map((v) => pitchClass(v.note)));
  scale.add(rootPc);
  const root = bassRootMidi(rootPc, previous);
  const nextVoices = next ? sounding(next) : [];
  const nextRoot = nextVoices.length ? bassRootMidi(pitchClass(nextVoices[0].note), root) : null;
  const params = { chance: 0, figure: "8", beats: 1, high: 12, shapes: ["chegada"], pop: 0, ...style.bassFill };
  // os controles das viradas do baixo: a frequência mexe na chance; a liberdade, no desenho, no alcance e no tamanho
  const frequency = fillLevel(FILL_FREQUENCIES, fill.frequency);
  const freedom = fillLevel(FILL_FREEDOMS, fill.freedom);
  if (frequency === "sem") params.chance = 0;
  else if (frequency === "poucas") params.chance *= 0.4;
  else if (frequency === "muitas") params.chance = Math.min(0.95, params.chance * 1.6 + 0.15);
  if (freedom === "contido") Object.assign(params, { shapes: ["chegada"], beats: 1, long: 0, high: Math.min(params.high, 7), pop: 0 });
  else if (freedom === "solto") {
    Object.assign(params, {
      shapes: ["subida", "descida", "arco", "chegada"], beats: 2, long: 0.9, high: params.high + 5, pop: Math.min(0.4, (params.pop || 0) + 0.1),
    });
  }
  const figureTicks = durationTicks(params.figure);
  const wantFill = nextRoot != null && length >= 2 * TICKS_PER_BEAT && rng.chance(params.chance);
  const fillBeats = wantFill ? Math.min(rng.chance(params.long ?? 0.5) ? params.beats : 1, length / TICKS_PER_BEAT - 1) : 0;
  const fillTicks = Math.max(0, Math.floor(fillBeats)) * TICKS_PER_BEAT;
  const body = length - fillTicks;

  const pitchOf = (degree) => {
    // aproximação: meio tom abaixo do próximo baixo; se cair abaixo do E1, vem por cima
    if (degree === "x") return nextRoot != null ? (nextRoot - 1 >= BASS_LOW ? nextRoot - 1 : nextRoot + 1) : root;
    const down = degree.startsWith("_");
    return scaleStep(root, Number(down ? degree.slice(1) : degree), down ? -1 : 1, scale);
  };
  const out = [];
  const tokens = line.pattern.split(" ");
  for (let at = 0, i = 0; at < body; i++) {
    const [degree, dur] = tokens[i % tokens.length].split("/");
    const ticks = Math.min(durationTicks(dur), body - at);
    const text = ticks === durationTicks(dur) ? dur : ticksText(ticks);
    if (degree === "r") { out.push({ rest: true, dur: text }); at += ticks; continue; }
    let midi = pitchOf(degree);
    // pop: a fundamental fora do tempo 1 salta uma oitava (slap de gospel e funk)
    if (degree === "1" && at > 0 && rng.chance(params.pop)) midi += 12;
    out.push({ midi, dur: text, role: degree === "x" && nextRoot != null ? "aprox" : "" });
    at += ticks;
  }
  if (fillTicks) {
    const count = Math.max(2, Math.round(fillTicks / figureTicks));
    const penta = pentatonicOf(scale, rootPc) ?? scale;
    const top = Math.min(BASS_HIGHEST, BASS_TOP + params.high);
    const pool = [];
    for (let m = BASS_LOW; m <= top; m++) if (penta.has(mod12(m))) pool.push(m);
    const start = out.filter((n) => !n.rest).at(-1)?.midi ?? root;
    const approach = rng.chance(0.7) && nextRoot - 1 >= BASS_LOW ? nextRoot - 1 : nextRoot + 1;
    const indexOf = (pitch) => pool.indexOf(nearest(pool, pitch));
    const shape = rng.pick(params.shapes);
    const notes = [];
    if (shape === "subida") {
      // sobe correndo e chega numa nota aguda do próximo acorde (a fundamental uma ou duas oitavas acima)
      let i = indexOf(start);
      for (let k = 0; k < count - 1; k++) { i = Math.min(pool.length - 1, i + 1); notes.push(pool[i]); }
      const peaks = [nextRoot + 12, nextRoot + 24].filter((m) => m <= top + 2 && m > (notes.at(-1) ?? start));
      notes.push(peaks[0] ?? Math.min(top, (notes.at(-1) ?? start) + 2));
    } else if (shape === "descida") {
      // salta para o agudo e desce correndo, grau a grau, até a aproximação do próximo acorde
      let i = Math.min(pool.length - 1, indexOf(approach) + count - 1);
      for (let k = 0; k < count - 1; k++) notes.push(pool[Math.max(0, i - k)]);
      notes.push(approach);
    } else if (shape === "arco") {
      // sobe metade da corrida e desce a outra metade, até a aproximação
      const up = Math.floor((count - 1) / 2);
      let i = indexOf(start);
      for (let k = 0; k < up; k++) { i = Math.min(pool.length - 1, i + 1); notes.push(pool[i]); }
      for (let k = up; k < count - 1; k++) { i = Math.max(0, i - 1); notes.push(pool[i]); }
      notes.push(approach);
    } else {
      // chegada: anda pela pentatônica até a aproximação
      const dir = approach >= start ? 1 : -1;
      let pitch = start;
      for (let k = 0; k < count - 1; k++) {
        const candidates = pool.filter((m) => (dir > 0 ? m > pitch && m < approach : m < pitch && m > approach));
        pitch = candidates.length ? (dir > 0 ? candidates[0] : candidates.at(-1)) : nearest(pool.filter((m) => m !== pitch && m !== approach), pitch);
        notes.push(pitch);
      }
      notes.push(approach);
    }
    // nunca a mesma nota duas vezes seguidas na corrida
    for (let k = 1; k < notes.length; k++) {
      if (notes[k] === notes[k - 1]) notes[k - 1] = nearest(pool.filter((m) => m !== notes[k] && m !== notes[k - 2]), notes[k - 1]);
    }
    notes.forEach((midi, k) => {
      const last = k === notes.length - 1;
      out.push({ midi, dur: params.figure, role: last && Math.abs(midi - nextRoot) === 1 ? "aprox" : "" });
    });
    const used = out.reduce((n, x) => n + durationTicks(x.dur), 0);
    if (used < length) out.push({ rest: true, dur: ticksText(length - used) });
  }
  // tudo dentro do baixo de 4 cordas (graus abaixo da fundamental, por exemplo, sobem uma oitava)
  for (const n of out) if (!n.rest) n.midi = inBassRange(n.midi);
  return { notes: out, last: out.filter((n) => !n.rest).at(-1)?.midi ?? root, root };
}

// ---------------------------------------------------------------- frases: o ritmo
//
// O ritmo da frase vem das células do próprio estilo, sem acelerar nem desacelerar figura nenhuma: é o que dá a cara do
// estilo. O solo é planejado em trechos de 1 a 4 compassos, que atravessam os acordes:
//   motivo (uma célula) -> o mesmo ritmo de novo, com outras notas -> às vezes só o começo dele -> resposta -> chegada
//   (nota longa) -> respiração.
// Cada trecho tem uma intensidade (0 calmo a 3 virtuoso), num arco: começa espaçado, cresce até o clímax (por volta de 70%
// do solo) e resolve. A intensidade escolhe, entre as células do estilo (e as figuras rápidas dele, "fast", nos trechos
// intensos), as de densidade mais perto do pedido em notas por segundo: o andamento entra na conta.

const mod12 = (n) => ((n % 12) + 12) % 12;

/** Os níveis do controle "Intensidade do solo". */
export const INTENSITIES = [
  { id: "contido", label: "Contido" },
  { id: "equilibrado", label: "Equilibrado" },
  { id: "virtuoso", label: "Virtuoso" },
];
// As velocidades do virtuoso vêm de medidas no Weimar Jazz Database (8.398 corridas em 456 solos): em qualquer andamento,
// uma corrida tem em torno de 8,5 notas por segundo (mediana de 7,2 a 9,2 conforme a faixa de BPM), 10 a 12,6 nas mais
// rápidas (os 10% do topo) e 16 só como exceção. Em figuras: fusas a 40-80 BPM, semicolcheias (às vezes quiálteras de 5 ou 6)
// a 80-140, semicolcheias e tercinas de colcheia a 140-180, colcheias e tercinas acima de 180.
const INTENSITY_NPS = [2.2, 3.4, 5, 6.5, 8.6]; // notas por segundo de cada intensidade (0 calmo ... 3 rápido, 4 corrida de virtuose)
const LEVEL_CURVE = { contido: [-0.6, 1.7], equilibrado: [0.1, 2.3], virtuoso: [1.75, 2.35] }; // [base, altura do arco]
// As corridas do virtuoso são escolhidas pelo ANDAMENTO: a figura que der a velocidade certa em notas por segundo. A 60 BPM
// são fusas e sextinas de fusa; a 100, sextinas de semicolcheia; a 160, semicolcheias; a 200, tercinas de colcheia.
// [figura, notas por tempo]
const RUN_FIGURES = [["8", 2], ["8t", 3], ["16", 4], ["16q", 5], ["16t", 6], ["32", 8], ["32t", 12]];
const RUN_SPEED = { 3: [5.6, 8.4], 4: [7, 12.6] }; // notas por segundo de cada nível (o teto: os 10% mais rápidos das corridas reais)
// Varredura: de vez em quando uma corrida longa do virtuoso corre o teclado numa direção só, até duas oitavas, e volta
// para a chegada. Nos solos reais, 13% das corridas cobrem uma oitava e meia ou mais, e 5%, duas oitavas.
const SWEEP_CHANCE = 0.3;
const SWEEP_MIN_NOTES = 11;
const MAX_INTENSITY = { contido: 3, equilibrado: 3, virtuoso: 4 };
const DUET_MIN_SECONDS = 0.35; // nota mais curta que ganha oitava ou sexta (vozes só em notas longas)
const TRIAD_MIN_SECONDS = 0.45; // e tríade

function makeCell(text) {
  const tokens = text.split(" ").map((tok) => {
    const rest = tok.startsWith("r");
    const dur = rest ? tok.slice(1) : tok;
    return { dur, ticks: durationTicks(dur), rest };
  });
  return { text, tokens, ticks: tokens.reduce((n, t) => n + t.ticks, 0), sounds: tokens.filter((t) => !t.rest).length };
}

/** O planejador: devolve, acorde por acorde, o ritmo da frase ({dur, ticks, start, rest} e as marcas do plano). */
function makePlanner({ style, cellTexts, fastTexts = [], rng, level, tempo, totalTicks, barTicks }) {
  const [base, height] = LEVEL_CURVE[level] ?? LEVEL_CURVE.equilibrado;
  const secondsPerTick = 60 / (tempo || 100) / TICKS_PER_BEAT;
  const nps = (cell) => cell.sounds / (cell.ticks * secondsPerTick);
  const cells = [...new Set(cellTexts)].map(makeCell).filter((c) => c.ticks > 0 && c.sounds);
  const fast = [...new Set(fastTexts)].map(makeCell).filter((c) => c.ticks > 0 && c.sounds);
  const allTokens = cells.flatMap((c) => c.tokens);
  const triplets = allTokens.filter((t) => /t/.test(t.dur)).length > 0.4 * allTokens.length;
  /** As corridas do virtuoso para um nível: notas seguidas de 1 ou 2 tempos na figura que dá a velocidade certa neste BPM. */
  const runs = (intensity) => {
    const perSecond = (perBeat) => (perBeat * (tempo || 100)) / 60;
    const [low, high] = RUN_SPEED[intensity];
    let figures = RUN_FIGURES.filter(([, perBeat]) => perSecond(perBeat) >= low && perSecond(perBeat) <= high);
    if (!figures.length) {
      // nenhuma figura cai na faixa: vale a mais próxima dela, sem passar do teto
      const playable = RUN_FIGURES.filter(([, perBeat]) => perSecond(perBeat) <= RUN_SPEED[4][1]);
      const mid = Math.sqrt(low * high);
      figures = playable.sort((a, b) => Math.abs(Math.log(perSecond(a[1]) / mid)) - Math.abs(Math.log(perSecond(b[1]) / mid))).slice(0, 1);
    }
    // estilo de tercinas (swing, blues): as figuras de tercina vêm primeiro, se houver
    const own = figures.filter(([f]) => /t/.test(f) === triplets);
    if (own.length) figures = own;
    return figures.flatMap(([f, perBeat]) => [1, 2].map((beats) => makeCell(Array(perBeat * beats).fill(f).join(" "))));
  };
  const vocabulary = (intensity) => {
    let pool = intensity >= 2 && fast.length ? [...cells, ...fast] : cells;
    if (level === "virtuoso") {
      if (intensity >= 3) pool = [...pool, ...runs(intensity)];
      // o teto vale também para as células do estilo: uma sextina que é ótima a 90 BPM não se toca a 170
      const shortest = 1 / RUN_SPEED[4][1];
      const playable = pool.filter((c) => c.tokens.every((t) => t.rest || t.ticks * secondsPerTick >= shortest - 1e-9));
      if (playable.length) pool = playable;
    }
    const target = INTENSITY_NPS[intensity];
    const scored = pool.map((c) => ({ c, score: Math.abs(Math.log(nps(c) / target)) })).sort((x, y) => x.score - y.score);
    return scored.filter((x) => x.score <= scored[0].score + 0.4).slice(0, 6).map((x) => x.c);
  };
  const duet = style.phrase.duet ?? {};

  let at = 0;
  let queue = [];
  let current = null;
  let arriveNext = false; // o acorde anterior terminou em tensão (outside): este começa com a chegada
  const newSegment = () => {
    const p = totalTicks ? Math.min(1, at / totalTicks) : 0;
    const curve = p < 0.7 ? p / 0.7 : 1 - ((p - 0.7) / 0.3) * 0.55;
    // style.phrase.shift: estilos mais calmos (lo-fi) ficam um ou mais níveis abaixo da intensidade pedida
    const top = MAX_INTENSITY[level] ?? 3;
    let intensity = Math.max(0, Math.min(top, Math.round(base + height * curve + (rng.next() - 0.5) * 0.9) + (style.phrase.shift ?? 0)));
    // vozes do trecho (oitava, sexta, tríade): só as notas longas ganham; com tríades, o trecho fica mais calmo
    const r = rng.next();
    const o = duet.octave ?? 0;
    const x = o + (duet.sixth ?? 0);
    const t = x + (duet.triad ?? 0);
    const texture = r < o ? "octave" : r < x ? "sixth" : r < t ? "triad" : null;
    if (texture === "triad") intensity = Math.max(0, intensity - 1); // com tríades, um pouco mais calmo
    const vocab = vocabulary(intensity);
    const motifs = vocab.filter((c) => c.sounds >= 2 && !c.tokens[0].rest);
    const motif = rng.pick(motifs.length ? motifs : vocab);
    current = { texture, intensity, vocab };
    const length = rng.pick([1, 2, 2, 2, 4]) * barTicks;
    const items = [{ cell: motif, kind: "motivo" }];
    const repeats = rng.chance(style.phrase.motif ?? 0.5) ? 2 : 1;
    for (let i = 0; i < repeats; i++) items.push({ cell: motif, kind: "eco" });
    if (motif.tokens.length >= 3 && rng.chance(0.4)) {
      // fragmento: só o começo do motivo, completado com pausa até a grade de colcheias
      const head = makeCell(motif.text.split(" ").slice(0, Math.ceil(motif.tokens.length / 2)).join(" "));
      const pad = (SHORT - (head.ticks % SHORT)) % SHORT;
      const padText = pad ? ticksText(pad) : "";
      if (!pad || padText) items.push({ cell: makeCell(pad ? `${head.text} r${padText}` : head.text), kind: "eco" });
    }
    let used = items.reduce((n, it) => n + it.cell.ticks, 0);
    while (used < length - TICKS_PER_BEAT) {
      const cell = rng.pick(vocab);
      items.push({ cell, kind: "resposta" });
      used += cell.ticks;
    }
    // chegada: uma nota longa; às vezes uma respiração
    items.push({ cell: makeCell(intensity >= 2 ? "4" : rng.pick(["4", "2"])), kind: "chegada" });
    if (rng.chance(Math.min(0.8, (style.phrase.rest ?? 0.2) * 2.5))) items.push({ cell: makeCell(intensity >= 2 ? "r8" : "r4"), kind: "pausa" });
    queue = items.map((it) => ({ ...it, segment: current, tokens: [...it.cell.tokens] }));
  };

  /** Tira do plano `length` ticks de ritmo (um acorde). */
  const take = (length) => {
    const slots = [];
    let tick = 0;
    if (arriveNext) {
      // a resolução do outside: uma nota longa no tempo 1
      const ticks = Math.min(length, 2 * TICKS_PER_BEAT);
      slots.push({ dur: ticksText(ticks), ticks, start: 0, rest: false, end: true, texture: current?.texture ?? null });
      tick = ticks;
      at += ticks;
      arriveNext = false;
    }
    while (tick < length) {
      if (!queue.length) newSegment();
      const room = length - tick;
      let item = queue[0];
      if (item.cell.ticks > room) {
        // a célula não cabe no que sobra do acorde: fica para o próximo (sem cortar figura no meio) e o resto do acorde
        // leva uma célula menor do trecho, ou uma pausa
        if (tick === 0) { queue.shift(); continue; } // nem num acorde inteiro ela cabe: sai do plano
        const fits = item.segment.vocab.filter((c) => c.ticks <= room);
        if (fits.length) item = { cell: rng.pick(fits), kind: "resposta", segment: item.segment, tokens: null };
        else item = { cell: makeCell(`r${ticksText(room)}`), kind: "pausa", segment: item.segment, tokens: null };
        item.tokens = [...item.cell.tokens];
      } else queue.shift();
      for (const token of item.tokens) {
        const slot = { dur: token.dur, ticks: token.ticks, start: tick, rest: token.rest, texture: item.segment.texture };
        if (item.kind === "chegada") slot.end = true;
        slots.push(slot);
        tick += token.ticks;
        at += token.ticks;
      }
    }
    return slots;
  };

  /**
   * Outside em motivo (acordes de 3 tempos ou mais): [o que o plano trouxer] [motivo de um tempo, dentro] [o mesmo motivo,
   * meio tom fora] [chegada num tempo forte]. A tensão vem logo antes da chegada e resolve nela. null se não couber.
   */
  const takeOutside = (length, { toNext = false } = {}) => {
    // toNext: a tensão fica nos dois últimos tempos e resolve no tempo 1 do acorde seguinte
    const arrivalAt = toNext ? length : length >= 4 * TICKS_PER_BEAT ? length - 2 * TICKS_PER_BEAT : length - TICKS_PER_BEAT;
    const lead = arrivalAt - 2 * TICKS_PER_BEAT;
    // motivos de um tempo: o primeiro tempo das células do estilo (só notas, pelo menos duas)
    const one = [];
    for (const c of [...(current?.vocab ?? []), ...cells]) {
      let sum = 0;
      const head = [];
      for (const tk of c.tokens) { if (sum >= TICKS_PER_BEAT) break; head.push(tk); sum += tk.ticks; }
      if (sum === TICKS_PER_BEAT && head.length >= 2 && head.every((tk) => !tk.rest)) one.push({ tokens: head });
    }
    if (!one.length) one.push(makeCell(triplets ? "8t 8t 8t" : "8 8"));
    if (lead < 0) return null;
    const slots = lead ? take(lead) : [];
    const cell = rng.pick(one);
    for (const [part, offset] of [["dentro", lead], ["fora", lead + TICKS_PER_BEAT]]) {
      let pos = offset;
      cell.tokens.forEach((tk, k) => {
        slots.push({ dur: tk.dur, ticks: tk.ticks, start: pos, rest: false, texture: null, outside: part, motifIndex: k });
        pos += tk.ticks;
      });
    }
    if (toNext) arriveNext = true;
    else slots.push({ dur: ticksText(length - arrivalAt), ticks: length - arrivalAt, start: arrivalAt, rest: false, end: true, texture: current?.texture ?? null });
    at += length - lead;
    return slots;
  };
  return { take, takeOutside, skip: (ticks) => { at += ticks; arriveNext = false; } };
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

/**
 * Notas evitadas do acorde: notas da escala que soam "erradas" no tempo forte ou sustentadas. A 4ª justa sobre a terça
 * maior (F em Cmaj7, A em E7) e, fora dos dominantes, qualquer nota meio tom acima de uma nota do acorde (C em Bm7b5,
 * B em Dm7). Nos dominantes, b9 e b13 são tensões e ficam liberadas. Como nota de passagem (curta, fora do tempo), podem.
 */
function avoidSetOf(chordPcs, scalePcs, root) {
  const dominant = chordPcs.has(mod12(root + 4)) && chordPcs.has(mod12(root + 10));
  const out = new Set();
  for (const pc of scalePcs) {
    if (chordPcs.has(pc)) continue;
    if (chordPcs.has(mod12(root + 4)) && pc === mod12(root + 5)) out.add(pc);
    else if (!dominant && [...chordPcs].some((t) => mod12(pc - t) === 1)) out.add(pc);
  }
  return out;
}

// ---------------------------------------------------------------- frases: as notas, a partir da chegada
//
// Como um improvisador pensa: primeiro os pontos de chegada (o tempo 1 de cada acorde, o meio do compasso, as notas longas,
// a primeira nota depois de respirar e a última antes), cada um numa nota boa para o acorde; depois o caminho até cada
// chegada, de trás para a frente: grau a grau pela escala, com curvas, e às vezes uma aproximação cromática ou uma
// envolvente logo antes da chegada, que sempre resolve no tempo. O cromatismo é dosado pelo acorde: acordes tensos
// (dominantes, meio-diminutos) aceitam mais; acordes diatônicos sem tensão, pouco. O outside é tensão antes de uma chegada:
// um motivo dentro, o mesmo motivo meio tom fora, e a resolução no tempo forte.

// Graus das tensões de dominante: as alteradas (b9, #9, #11, b13) e as naturais (9ª e 13ª).
const ALTERED_DEGREES = [1, 3, 6, 8];
const NATURAL_DEGREES = [2, 9];

/**
 * Pesos das chegadas, por grau (semitons acima da fundamental), do perfil de fraseado em uso (kb/fraseado.js).
 * "strong" = o tempo 1 do acorde. Nos dominantes, as tensões que a escala do acorde traz ganham o multiplicador do perfil
 * (mais forte nas alteradas): com a escala alterada, a b13 e a 9ª aumentada viram chegadas comuns.
 */
function degreeWeights(quality, strong, profile, { scalePcs, root }) {
  const table = profile.pesos[quality]?.[strong ? "forte" : "fraco"];
  if (!table) return null;
  if (quality !== "dominante") return table;
  const out = { ...table };
  for (const [degrees, factor] of [[ALTERED_DEGREES, profile.tensoes.alterada], [NATURAL_DEGREES, profile.tensoes.natural]]) {
    for (const d of degrees) if (out[d] != null && scalePcs.has(mod12(root + d))) out[d] *= factor;
  }
  return out;
}

/** Tudo o que a frase precisa saber de um acorde. */
function chordContext(chord, { style, color, scales, profile }) {
  const voices = sounding(chord);
  const chordPcs = new Set(voices.map((v) => pitchClass(v.note)));
  const hasScale = chord.phrase_pcs.length > 0;
  const scalePcs = hasScale ? new Set(chord.phrase_pcs.map((x) => x.pc)) : chordPcs;
  const root = rootPc(chord);
  const has = (i) => chordPcs.has(mod12(root + i));
  const major3 = has(4);
  const minor3 = has(3) && !major3;
  const quality = major3 && has(10) ? "dominante" : minor3 && has(6) && !has(7) ? "meio-diminuto" : minor3 ? "menor" : major3 ? "maior" : "outro";
  const tense = quality === "dominante" || quality === "meio-diminuto" || (minor3 && has(6));
  const avoid = avoidSetOf(chordPcs, scalePcs, root);
  const palette = paletteOf(scales, { scalePcs, chordPcs, root, stylePenta: style.phrase.pentatonic });
  const range = (set, low, high) => { const out = []; for (let p = low; p <= high; p++) if (set.has(mod12(p))) out.push(p); return out; };
  // notas boas para chegar: da paleta (ou do acorde), da escala, sem as evitadas
  const arrivalPcs = new Set([...palette.set, ...chordPcs].filter((pc) => scalePcs.has(pc) && !avoid.has(pc)));
  const weightOf = (strong) => {
    const table = degreeWeights(quality, strong, profile, { scalePcs, root });
    const map = new Map();
    for (const pc of arrivalPcs) {
      const w = table ? table[mod12(pc - root)] ?? (chordPcs.has(pc) ? 1 : 0) : chordPcs.has(pc) ? 2 : 1;
      if (w > 0) map.set(pc, w);
    }
    if (!map.size) for (const pc of chordPcs) map.set(pc, 1);
    return map;
  };
  const params = style.phrase;
  const loud = color === "cromatico" || color === "outside";
  const factor = tense ? 1 : 0.35; // pouco cromatismo em acorde diatônico sem tensão
  return {
    chord, chordPcs, scalePcs, root, quality, tense, avoid, palette, color,
    // tensões de dominante que a escala traz: nelas o solo gosta de repousar (notas longas)
    restTension: quality === "dominante" ? profile.repousoNaTensao : 1,
    bluesThird: profile.tercaBlue === true, // o blue note b3 -> 3 não depende do cromatismo geral
    tensionDegrees: new Set([...ALTERED_DEGREES, ...NATURAL_DEGREES].filter((d) => scalePcs.has(mod12(root + d)))),
    linePool: range(palette.set, LOW - 5, HIGH + 5),
    strongWeights: weightOf(true), weakWeights: weightOf(false),
    chromatic: color === "dentro" ? 0 : loud ? (tense ? 0.75 : 0.4) : params.chromatic * factor,
    enclosure: color === "dentro" ? 0 : loud ? (tense ? 0.4 : 0.2) : params.enclosure * factor,
    blue: color === "dentro" ? 0 : params.blue,
  };
}

/**
 * O caminho de `a` até `b` em `count` notas, grau a grau na lista `pool` (alturas em ordem): direto, em arco (passa e
 * volta) ou com um mergulho antes (vai para o outro lado e volta). Nunca repete nota seguida.
 */
/** `n` movimentos (em graus da escala) que somam `delta`: por graus conjuntos; se não couber, com terças; se sobrar, com uma bordadura. */
function legMoves(delta, n, rng) {
  if (n <= 0) return [];
  const s = delta > 0 ? 1 : delta < 0 ? -1 : rng.chance(0.5) ? 1 : -1;
  let left = Math.abs(delta);
  const out = [];
  if (left >= n) {
    for (let i = 0; i < n; i++) {
      const step = Math.min(Math.max(1, Math.ceil(left / (n - i))), 3);
      out.push(s * step);
      left -= step;
    }
    return out;
  }
  let spare = n - left;
  const direct = Array(left).fill(s);
  if (spare % 2) {
    if (direct.length) { direct[0] = 2 * s; direct.push(-s); spare -= 1; }
    else if (spare >= 3) { direct.push(2 * s, -s, -s); spare -= 3; }
    else { direct.push(s); spare -= 1; }
  }
  // o que sobra vira ondas curtas (2 a 4 graus) antes de fechar no destino
  let pairs = spare / 2;
  let way = -s;
  while (pairs > 0) {
    const half = Math.min(pairs, rng.pick([2, 3, 4]));
    out.push(...Array(half).fill(way), ...Array(half).fill(-way));
    pairs -= half;
    way = -way;
  }
  out.push(...direct);
  return out;
}

function stepPath(pool, a, b, count, rng, { waves = false, sequence = false } = {}) {
  const ia = pool.indexOf(nearest(pool, a));
  const ib = pool.indexOf(nearest(pool, b));
  const moves = count + 1;
  let d = ib - ia;
  if (d === 0) d = pool[ia] === b ? 0 : b > pool[ia] ? 1 : -1;
  const sign = d > 0 ? 1 : d < 0 ? -1 : rng.chance(0.5) ? 1 : -1;
  // nas corridas do virtuoso a linha fica entre o Lá 3 e o Sol 6: ao chegar na beirada, ela volta em vez de insistir
  const floor = waves ? Math.max(0, pool.findIndex((m) => m >= LOW - 3)) : 0;
  const lastInside = waves ? pool.findLastIndex((m) => m <= HIGH + 3) : -1;
  const ceiling = lastInside >= floor ? lastInside : pool.length - 1;
  let list = [];
  let swept = false;
  if (waves && count >= SWEEP_MIN_NOTES && rng.chance(SWEEP_CHANCE)) {
    // varredura: corre numa direção só, até duas oitavas (14 graus), e depois vem para a chegada
    const room = (w) => (w > 0 ? ceiling - ia : ia - floor);
    let way = rng.chance(0.5) ? 1 : -1;
    if (room(way) < 9 && room(-way) > room(way)) way = -way;
    const reach = Math.min(room(way), rng.pick([10, 12, 14, 14]));
    if (reach >= 8) {
      const apex = ia + way * reach;
      const back = Math.abs(apex - ib);
      // a ida usa os movimentos que der (com terças, se faltarem); a volta fica com o bastante para chegar por graus ou terças
      const out = Math.max(Math.ceil(reach / 2), Math.min(reach, moves - Math.ceil(back / 2)));
      if (moves - out >= Math.ceil(back / 3) && moves - out >= 1) {
        list = [...legMoves(way * reach, out, rng), ...legMoves(ib - apex, moves - out, rng)];
        swept = true;
      }
    }
  }
  if (!swept && sequence && count >= 5 && Math.abs(d) < moves && rng.chance(0.55)) {
    // sequência (guitarra de rock e metal): grupos de 3 ou de 4 notas que andam um grau de cada vez ("1-2-3, 2-3-4...")
    const group = rng.pick([3, 3, 4]);
    const cell = group === 3 ? [1, 1, -1] : [1, 1, 1, -2];
    const groups = Math.max(1, Math.min(Math.floor(moves / group), Math.abs(d) + 3));
    const rest = moves - groups * group;
    const after = d - sign * groups;
    if (rest >= Math.ceil(Math.abs(after) / 3)) {
      for (let g = 0; g < groups; g++) list.push(...cell.map((m) => sign * m));
      list.push(...legMoves(after, rest, rng));
      swept = true;
    }
  }
  if (swept) {
    // já está montada
  } else if (Math.abs(d) >= moves) {
    // distância grande: passos de terça (arpejo) até caber
    let left = Math.abs(d);
    for (let i = 0; i < moves; i++) {
      const step = Math.min(Math.max(1, Math.ceil(left / (moves - i))), 3);
      list.push(sign * step);
      left -= step;
    }
  } else {
    // sobram movimentos: um passo de terça e volta acerta a paridade; o resto vira curva (arco, mergulho ou bordadura)
    let spare = moves - Math.abs(d);
    const direct = Array(Math.abs(d)).fill(sign);
    if (spare % 2) {
      if (direct.length) { direct[0] = 2 * sign; direct.push(-sign); spare -= 1; }
      else if (spare >= 3) { direct.push(2 * sign, -sign, -sign); spare -= 3; }
      else { direct.push(sign); spare -= 1; }
    }
    const extra = spare / 2;
    if (waves && extra > 4) {
      // corrida longa (virtuoso): em vez de um trinado de duas notas, ou de um arco que varre o teclado inteiro, ondas de
      // 4 a 7 graus (sobe e desce, ou desce e sobe), como uma escala que vai e volta; o caminho direto fecha a corrida
      let left = extra;
      let way = rng.chance(0.5) ? sign : -sign;
      while (left > 0) {
        const half = Math.min(left, rng.pick([4, 5, 6, 7]));
        list.push(...Array(half).fill(way), ...Array(half).fill(-way));
        left -= half;
        if (rng.chance(0.35)) way = -way;
      }
      list.push(...direct);
    } else {
      const shape = rng.pick(["arco", "mergulho", "volta"]);
      if (shape === "arco") list.push(...Array(extra).fill(sign), ...direct, ...Array(extra).fill(-sign));
      else if (shape === "mergulho") list.push(...Array(extra).fill(-sign), ...Array(extra).fill(sign), ...direct);
      else { for (let i = 0; i < extra; i++) list.push(sign, -sign); list.push(...direct); }
    }
  }
  const path = [];
  let index = ia;
  for (let i = 0; i < count; i++) {
    let move = list[i] || sign;
    if (waves && (index + move < floor || index + move > ceiling) && index - move >= floor && index - move <= ceiling) move = -move;
    index = Math.max(0, Math.min(pool.length - 1, index + move));
    path.push(pool[index]);
  }
  return path;
}

/**
 * Compõe as frases de todos os acordes de uma vez (a linha atravessa os acordes). items: [{ ctx, slots }] por acorde
 * (slots null = acorde sem frase). Escreve midi e role em cada slot.
 */
function composeSolo(items, { rng, tempo, barTicks, level = "equilibrado", sequence = false }) {
  const secondsPerTick = 60 / (tempo || 100) / TICKS_PER_BEAT;
  const halfBar = barTicks % (2 * TICKS_PER_BEAT) === 0 && barTicks >= 4 * TICKS_PER_BEAT ? barTicks / 2 : barTicks;
  const line = [];
  for (const { ctx, slots } of items) {
    if (!slots) { line.push({ rest: true, ticks: 0, gap: true }); continue; }
    for (const slot of slots) { slot.ctx = ctx; line.push(slot); }
  }
  const notes = line.filter((n) => !n.rest);
  if (!notes.length) return;
  // pausa antes / depois (fim de frase): qualquer pausa ou acorde sem frase entre duas notas
  for (let i = 0, prevNote = null, restBefore = 0; i < line.length; i++) {
    const n = line[i];
    if (n.rest) { restBefore += n.gap ? 99999 : n.ticks; continue; }
    n.after = restBefore; // pausa logo antes (0 = sem pausa)
    if (prevNote) prevNote.restAfter = restBefore;
    n.prev = prevNote;
    if (prevNote) prevNote.next = n;
    prevNote = n;
    restBefore = 0;
  }

  // 1) onde estão as chegadas
  for (const n of notes) {
    const onBeat = n.start % TICKS_PER_BEAT === 0;
    n.strong = n.start === 0;
    if (n.outside) n.arrival = n.outside === "dentro" && n.motifIndex === 0;
    else n.arrival = n.start === 0 || (onBeat && n.start % halfBar === 0) || n.end || (onBeat && n.ticks >= TICKS_PER_BEAT)
      || n.ticks * secondsPerTick >= 0.5 || !n.prev || n.after > 0 || !n.next || n.restAfter > 0;
  }

  // 2) a nota de cada chegada: boa para o acorde, perto da anterior, no sentido em que a linha vai
  const arrivals = notes.filter((n) => n.arrival);
  let cursor = 67 + Math.floor(rng.next() * 6);
  let direction = rng.chance(0.5) ? 1 : -1;
  let previous = null;
  for (const n of arrivals) {
    const between = previous ? notes.indexOf(n) - notes.indexOf(previous) - 1 : 0;
    const linked = previous && n.after === 0 && !notes.slice(notes.indexOf(previous) + 1, notes.indexOf(n)).some((x) => x.after > 0);
    const ideal = linked ? Math.min(9, 1.6 * (between + 1)) : 3;
    const spread = 2 + between * 0.6;
    const weights = n.strong ? n.ctx.strongWeights : n.ctx.weakWeights;
    const options = [];
    for (let p = LOW; p <= HIGH; p++) {
      let w = weights.get(mod12(p));
      if (!w) continue;
      // repouso (nota que dura um tempo ou mais) numa tensão característica do dominante
      if (n.ctx.restTension !== 1 && (n.end || n.ticks >= TICKS_PER_BEAT) && n.ctx.tensionDegrees.has(mod12(p - n.ctx.root))) w *= n.ctx.restTension;
      if (p === cursor && (between === 0 || n.after <= TICKS_PER_BEAT)) continue; // sem repetir a nota
      const distance = Math.abs(p - cursor);
      let score = w * Math.exp(-((distance - ideal) ** 2) / (2 * spread * spread));
      if (Math.sign(p - cursor) === direction) score *= 1.3;
      if (p < 62 || p > 84) score *= 0.5;
      // na troca de acorde, condução de vozes: 3ª ou 7ª do acorde novo perto da nota anterior
      if (n.strong && previous && distance <= 2 && [3, 4, 10, 11].includes(mod12(p - n.ctx.root))) score *= 1.6;
      options.push({ p, score });
    }
    options.sort((x, y) => y.score - x.score);
    const top = options.slice(0, 3);
    const total = top.reduce((sum, o) => sum + o.score, 0);
    let roll = rng.next() * total;
    const chosen = top.find((o) => (roll -= o.score) <= 0) ?? top[0];
    n.midi = chosen ? chosen.p : cursor;
    n.role = n.ctx.chordPcs.has(mod12(n.midi)) && n.start % TICKS_PER_BEAT === 0 ? "alvo" : "";
    if (n.midi > 80) direction = -1;
    else if (n.midi < 64) direction = 1;
    else if (rng.chance(0.3)) direction = -direction;
    cursor = n.midi;
    previous = n;
  }

  // 3) outside em motivo: o motivo dentro (grau a grau), a cópia meio tom fora, e a chegada a meio tom da cópia
  for (let i = 0; i < notes.length; i++) {
    const head = notes[i];
    if (head.outside !== "dentro" || head.motifIndex !== 0) continue;
    const inside = [];
    for (let k = i; k < notes.length && notes[k].outside === "dentro"; k++) inside.push(notes[k]);
    const copy = notes.slice(i + inside.length, i + 2 * inside.length);
    const resolve = notes[i + 2 * inside.length];
    const pool = head.ctx.linePool;
    if (head.prev && head.prev.midi === head.midi && head.after <= TICKS_PER_BEAT) {
      // a resolução do outside anterior caiu na mesma nota: o motivo começa na nota boa vizinha
      const weights = head.strong ? head.ctx.strongWeights : head.ctx.weakWeights;
      const options = pool.filter((p) => weights.has(mod12(p)) && p !== head.midi);
      if (options.length) head.midi = nearest(options, head.midi);
      head.role = head.ctx.chordPcs.has(mod12(head.midi)) && head.start % TICKS_PER_BEAT === 0 ? "alvo" : "";
    }
    let at = pool.indexOf(nearest(pool, head.midi));
    let way = head.midi > 76 ? -1 : head.midi < 66 ? 1 : rng.chance(0.6) ? -1 : 1;
    for (const n of inside.slice(1)) {
      if (pool[at] > 82) way = -1;
      else if (pool[at] < 62) way = 1;
      else if (rng.chance(0.3)) way = -way;
      at = Math.max(1, Math.min(pool.length - 2, at + way * (rng.chance(0.25) ? 2 : 1)));
      if (pool[at] === n.prev.midi) at += way;
      n.midi = pool[at];
      n.role = head.ctx.palette.blue.has(mod12(n.midi)) ? "blue" : "";
    }
    const lastIn = inside.at(-1).midi;
    const candidates = [];
    for (let p = LOW - 6; p <= HIGH + 6; p++) if (resolve && (resolve.ctx.strongWeights.has(mod12(p)) || resolve.ctx.weakWeights.has(mod12(p)))) candidates.push(p);
    let best = null;
    for (const shift of [1, -1]) {
      if (inside[0].midi + shift === lastIn) continue; // a emenda não repete nota
      const lastOut = lastIn + shift;
      const goal = candidates.filter((p) => p !== lastOut).sort((x, y) => Math.abs(x - lastOut) - Math.abs(y - lastOut))[0];
      // melhor: resolver a meio tom, e a cópia de fato fora da escala
      const score = (goal == null ? 9 : Math.abs(goal - lastOut)) + (head.ctx.scalePcs.has(mod12(lastOut)) ? 1.5 : 0);
      if (!best || score < best.score) best = { shift, goal, score };
    }
    const shift = best?.shift ?? 1;
    copy.forEach((n, k) => { n.midi = inside[k].midi + shift; n.role = "outside"; n.locked = true; });
    inside.forEach((n) => { n.locked = true; });
    if (resolve && best?.goal != null) {
      resolve.midi = best.goal;
      resolve.role = resolve.ctx.chordPcs.has(mod12(resolve.midi)) && resolve.start % TICKS_PER_BEAT === 0 ? "alvo" : "";
      resolve.fixed = true;
    }
  }

  // 4) o caminho entre chegadas, e o cromatismo só logo antes de uma chegada (resolve sempre no tempo)
  for (let i = 0; i < arrivals.length - 1; i++) {
    const a = arrivals[i];
    const b = arrivals[i + 1];
    const group = notes.slice(notes.indexOf(a) + 1, notes.indexOf(b));
    if (!group.length || group.some((n) => n.outside)) continue;
    const ctx = group[0].ctx;
    const path = stepPath(ctx.linePool, a.midi, b.midi, group.length, rng, { waves: level === "virtuoso", sequence });
    group.forEach((n, k) => {
      n.midi = path[k];
      n.role = ctx.palette.blue.has(mod12(n.midi)) ? "blue" : "";
    });
    // nada de nota repetida nas pontas do caminho
    if (group[0].midi === a.midi) group[0].midi = nearest(ctx.linePool.filter((p) => p !== a.midi && p !== group[1]?.midi), a.midi);
    const last = group.at(-1);
    if (last.midi === b.midi) last.midi = nearest(ctx.linePool.filter((p) => p !== b.midi && p !== group.at(-2)?.midi), b.midi);
    const onBeatB = b.start % TICKS_PER_BEAT === 0;
    const crossing = last.ctx !== b.ctx;
    // a aproximação que atravessa para o acorde seguinte só vai para nota do acorde (resolve "no acorde")
    const canApproach = onBeatB && last.ticks <= SHORT && !last.locked && b.after === 0 && (!crossing || b.ctx.chordPcs.has(mod12(b.midi)));
    const beforeLast = group.at(-2)?.midi ?? a.midi;
    // estilos com blue notes: antes de uma 3ª maior de chegada, a 3ª menor (blue note) resolve nela, independente do cromatismo
    const blueThirdArrival = ctx.bluesThird && ctx.blue > 0 && canApproach && mod12(b.midi - b.ctx.root) === 4 && b.ctx.chordPcs.has(mod12(b.ctx.root + 4)) && b.midi - 1 !== beforeLast;
    if (blueThirdArrival && rng.chance(ctx.blue * 0.5)) {
      last.midi = b.midi - 1;
      last.role = "blue";
    } else if (canApproach && rng.chance(ctx.chromatic)) {
      const before = group.at(-2)?.midi ?? a.midi;
      const enclose = group.length >= 2 && rng.chance(ctx.enclosure);
      const above = ctx.linePool.find((p) => p > b.midi);
      if (enclose && above != null && above !== group.at(-3)?.midi && above !== b.midi - 1) {
        group.at(-2).midi = above;
        group.at(-2).role = ctx.palette.blue.has(mod12(above)) ? "blue" : "";
        last.midi = b.midi - 1;
        last.role = "aprox";
      } else {
        const side = rng.chance(0.75) ? -1 : 1;
        const pitch = b.midi + side !== before ? b.midi + side : b.midi - side;
        if (pitch !== before) {
          last.midi = pitch;
          // b3 antes da 3ª maior, no estilo que tem blue notes: é blue note
          const blueThird = ctx.blue > 0 && mod12(b.midi - b.ctx.root) === 4 && pitch === b.midi - 1 && b.ctx.chordPcs.has(mod12(b.ctx.root + 4));
          last.role = blueThird && rng.chance(ctx.blue) ? "blue" : "aprox";
        }
      }
    }
  }

  // 5) acabamento: nota evitada no tempo (ou que dura o bastante para soar) vira a vizinha boa; nunca a mesma nota duas
  //    vezes seguidas na frase
  const good = (n, p) => n.ctx.linePool.includes(p) && !n.ctx.avoid.has(mod12(p));
  for (const n of notes) {
    if (n.locked || n.arrival || n.role) continue;
    if ((n.start % TICKS_PER_BEAT === 0 || n.ticks * secondsPerTick >= 0.3) && n.ctx.avoid.has(mod12(n.midi))) {
      const options = n.ctx.linePool.filter((p) => good(n, p) && p !== n.prev?.midi && p !== n.next?.midi);
      if (options.length) n.midi = nearest(options, n.midi);
    }
  }
  for (const n of notes) {
    const before = n.prev;
    if (!before || before.midi !== n.midi || n.after > TICKS_PER_BEAT) continue;
    const movable = [n, before].find((x) => !x.locked && !x.fixed && x.role !== "aprox" && !x.arrival) ?? (!n.locked && !n.fixed && n.role !== "aprox" ? n : null);
    if (!movable) continue;
    const pool = movable.arrival ? [...(movable.strong ? movable.ctx.strongWeights : movable.ctx.weakWeights).keys()].flatMap((pc) => {
      const out = []; for (let p = LOW; p <= HIGH; p++) if (mod12(p) === pc) out.push(p); return out;
    }) : movable.ctx.linePool.filter((p) => good(movable, p));
    const options = pool.filter((p) => p !== movable.prev?.midi && p !== movable.next?.midi && p !== movable.midi);
    if (!options.length) continue;
    movable.midi = nearest(options, movable.midi);
    if (movable.role === "alvo" && !movable.ctx.chordPcs.has(mod12(movable.midi))) movable.role = "";
    if (movable.role === "blue" && !movable.ctx.palette.blue.has(mod12(movable.midi))) movable.role = "";
  }
  // papéis no fim: nota fora da escala sem papel é blue note (da paleta blues) ou nota de passagem
  for (const n of notes) {
    if (n.role || n.ctx.scalePcs.has(mod12(n.midi))) continue;
    n.role = n.ctx.palette.blue.has(mod12(n.midi)) ? "blue" : "passagem";
  }
}

/**
 * Notas de repouso (as chegadas: notas boas do acorde) duram até a próxima nota: as pausas logo depois delas viram
 * ligadura. Aproximações, notas de passagem e o motivo outside não seguram.
 */
function sustainRests(notes, length) {
  const out = [];
  for (const note of notes) {
    const holder = out.at(-1);
    if (note.rest && holder && !holder.rest && holder.arrival && !holder.locked && !["aprox", "outside", "blue"].includes(holder.role)) {
      holder.ticks += note.ticks;
      holder.dur = ticksText(holder.ticks) || `${holder.dur}+${note.dur}`; // uma figura só quando dá; senão, ligadura
      continue;
    }
    out.push(note);
  }
  const end = out.reduce((sum, n) => sum + n.ticks, 0);
  const tail = out.at(-1);
  if (end < length && tail && !tail.rest) {
    tail.dur = ticksText(tail.ticks + length - end) || `${tail.dur}+${ticksText(length - end)}`;
    tail.ticks += length - end;
  } else if (end < length) out.push({ rest: true, dur: ticksText(length - end), ticks: length - end });
  return out;
}

/**
 * Vozes abaixo da melodia nas notas longas (as que dá para tocar assim), conforme a textura do trecho: oitava, sexta da
 * escala ou tríade quartal (duas quartas justas para baixo, com notas da escala); sem quartas na escala, a tríade sai em
 * terças com notas do acorde. Nada cai em nota evitada. Notas curtas, aproximações e outside ficam numa voz só.
 * Devolve um mapa nota -> [alturas abaixo dela].
 */
function extraVoices(notes, { scalePcs, chordPcs, tempo, avoid = new Set() }) {
  const out = new Map();
  const seconds = (note) => (note.ticks * 60) / (tempo || 100) / TICKS_PER_BEAT;
  const ok = (p) => scalePcs.has(mod12(p)) && !avoid.has(mod12(p));
  const stepsDown = (pitch, steps) => {
    for (let k = 0; k < steps; k++) { pitch -= 1; while (!scalePcs.has(mod12(pitch))) pitch -= 1; }
    return pitch;
  };
  for (const note of notes) {
    if (note.rest || !note.texture || ["aprox", "outside", "blue"].includes(note.role) || note.locked) continue;
    if (!scalePcs.has(mod12(note.midi))) continue;
    const time = seconds(note);
    if (time < DUET_MIN_SECONDS - 1e-9) continue;
    const texture = note.texture === "triad" && time < TRIAD_MIN_SECONDS - 1e-9 ? "sixth" : note.texture;
    const sixth = stepsDown(note.midi, 5);
    const duet = ok(sixth) ? [sixth] : [note.midi - 12];
    let below = null;
    if (texture === "octave") below = [note.midi - 12];
    else if (texture === "sixth") below = duet;
    else if (texture === "triad") {
      const fourths = [note.midi - 5, note.midi - 10];
      const thirds = (() => {
        const third = (top) => { for (let p = top - 3; p >= top - 5; p--) if (chordPcs.has(mod12(p)) && ok(p)) return p; return null; };
        const first = third(note.midi);
        const second = first !== null ? third(first) : null;
        return second !== null ? [first, second] : null;
      })();
      below = fourths.every(ok) ? fourths : thirds ?? duet;
    }
    if (below) out.set(note, below);
  }
  return out;
}

/** Nome da nota com a grafia da escala ou do acorde (Eb, não D#, quando a escala diz Eb). */
export function speller(chord, middleC) {
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
  bassFill = {}, drumFill = {}, // controles das viradas: { frequency, freedom }
  riff = null, riffVariation = 0, // riff ou ostinato: a família (engine/riff.js) e o sorteio
  perfil, // perfil de fraseado (kb/fraseado.js), para testes; sem ele vale o do estilo (lo-fi) ou o PERFIL_ATIVO
} = {}) {
  const { project } = loadProject(data);
  const out = project.chords.map(() => ({}));
  const warnings = [];
  if (!style) return { chords: out, notes: ["Escolha um estilo."] };

  if (comp) {
    project.chords.forEach((chord, i) => { out[i].comp = sounding(chord).length ? compFor(style, comp) : ""; });
  }

  if (phrases) {
    let withoutScale = 0;
    const chosenStyles = phraseStyles?.length ? phraseStyles : [style];
    const cellTexts = chosenStyles.flatMap((x) => x.cells);
    const fastTexts = chosenStyles.flatMap((x) => x.fast ?? []);
    const barTicks = Math.round(beatsPerBar(project) * TICKS_PER_BEAT);
    const planner = makePlanner({
      style, cellTexts, fastTexts, rng: makeRng(`${style.id}|${variation}|plano|${intensity}`), level: intensity, tempo: project.tempo,
      totalTicks: Math.round(totalBeats(project) * TICKS_PER_BEAT), barTicks,
    });
    const colorOf = (chord) => {
      const own = chord.phrase_color.toLowerCase();
      return ["dentro", "cromatico", "outside"].includes(own) ? own : ["dentro", "cromatico", "outside"].includes(globalColor) ? globalColor : "";
    };
    // 1º o ritmo de todos os acordes, depois as notas de todos de uma vez (a linha atravessa os acordes)
    const rng = makeRng(`${style.id}|${variation}|outside`);
    const items = project.chords.map((chord, i) => {
      const length = Math.round(chord.duration_beats * TICKS_PER_BEAT);
      if (!sounding(chord).length) { planner.skip(length); return { ctx: null, slots: null, length }; }
      if (!chord.phrase_pcs.length) withoutScale += 1;
      const color = colorOf(chord);
      const ctx = chordContext(chord, { style, color: color === "outside" ? "outside" : color, scales, profile: perfilDoEstilo(style.id, perfil) });
      const nextHasPhrase = Boolean(project.chords[i + 1] && sounding(project.chords[i + 1]).length);
      const toNext = nextHasPhrase && length >= 4 * TICKS_PER_BEAT && rng.chance(0.5);
      const slots = (color === "outside" && length >= 3 * TICKS_PER_BEAT ? planner.takeOutside(length, { toNext }) : null) ?? planner.take(length);
      return { ctx, slots, length };
    });
    composeSolo(items, { rng: makeRng(`${style.id}|${variation}|notas|${intensity}`), tempo: project.tempo, barTicks, level: intensity, sequence: Boolean(style.phrase.sequence) });
    project.chords.forEach((chord, i) => {
      const { ctx, slots, length } = items[i];
      if (!ctx) { out[i].phrase = ""; return; }
      const notes = sustainRests(slots, length);
      const spell = speller(chord, project.middle_c);
      const below = extraVoices(notes, { scalePcs: ctx.scalePcs, chordPcs: ctx.chordPcs, tempo: project.tempo, avoid: ctx.avoid });
      out[i].phrase = notes.map((n) => {
        if (n.rest) return `r/${n.dur}`;
        const name = [n.midi, ...(below.get(n) ?? [])].map(spell).join("&");
        return `${name}/${n.dur}${n.role ? `*${n.role}` : ""}`;
      }).join(" ");
      if (!chord.phrase_pcs.length) {
        const voices = sounding(chord);
        out[i].phrase_scale = [...new Map(voices.map((v) => [pitchClass(v.note), pitchClassName(v.note)])).values()].join(" ");
      }
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
      const result = composeBass({ style, lineId: bass, chord, next: following, length, rng, previous, fill: bassFill });
      previous = result.root;
      const spell = speller(chord, project.middle_c);
      out[i].bass_line = result.notes.map((n) => (n.rest ? `r/${n.dur}` : `${spell(n.midi)}/${n.dur}${n.role ? `*${n.role}` : ""}`)).join(" ");
    });
  }
  if (riff) generateRiff(project, { style, family: riff, variation: riffVariation }).forEach((text, i) => { out[i].riff = text; });
  const result = { chords: out, notes: warnings };
  if (drums) result.drums = drumsFor(style, drums, project, drumVariation, drumFill);
  if (percussion) result.percussion = percussionFor(style, percussion);
  return result;
}
