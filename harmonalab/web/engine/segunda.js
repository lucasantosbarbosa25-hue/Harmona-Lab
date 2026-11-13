// A segunda voz: uma linha escrita pelo app a partir da Voz (cantada ou vinda de um MIDI).
//   dueto        a mesma rítmica da Voz, uma sexta abaixo (sexta da escala do acorde; nas notas de apoio, nota do acorde);
//   contracanto  uma linha própria: segura as notas-guia do acorde (3ª e 7ª) enquanto a Voz se mexe e responde, com um
//                desenho por graus conjuntos, quando a Voz segura uma nota longa ou respira.
// Cada estilo tem o seu jeito (SECOND_VOICE_STYLES): quanto o dueto acompanha as notas rápidas, e se o contracanto segura
// notas ou cala enquanto a Voz canta, e com que figura responde. Só o app usa (não há espelho no Python): o resultado é o
// texto do campo "voice2", que os dois motores leem.

import { makeRng, speller, ticksText } from "./groove.js";
import { loadProject, sounding } from "./model.js";
import { TICKS_PER_BEAT } from "./phrase.js";
import { noteName, makeNote, pitchClass } from "./pitch.js";

export const SECOND_VOICE_MODES = [
  { id: "", label: "Sem segunda voz" },
  { id: "dueto", label: "Dueto (sexta abaixo)" },
  { id: "contracanto", label: "Contracanto" },
];

/**
 * O jeito de cada estilo. duet: "todas" (acompanha todas as notas) ou "apoio" (só as de meio tempo ou mais; nas rápidas,
 * segura a nota anterior). counter: enquanto a Voz canta, "segura" as notas-guia ou "cala" (pergunta e resposta);
 * counter "gemeas" (rock e metal): guitarras gêmeas, que dobram a Voz em terças, nota por nota.
 * unit: a figura da resposta (em tempos); notes: quantas notas, no máximo, tem a resposta.
 */
export const SECOND_VOICE_STYLES = {
  swing: { duet: "apoio", counter: "segura", unit: 0.5, notes: 4 },
  blues: { duet: "todas", counter: "cala", unit: 0.5, notes: 4 },
  fusion: { duet: "apoio", counter: "segura", unit: 0.5, notes: 5 },
  neosoul: { duet: "todas", counter: "segura", unit: 0.5, notes: 3 },
  lofi: { duet: "apoio", counter: "segura", unit: 1, notes: 3 },
  gospel: { duet: "todas", counter: "segura", unit: 0.5, notes: 5 },
  funk: { duet: "todas", counter: "cala", unit: 0.25, notes: 5 },
  salsa: { duet: "todas", counter: "cala", unit: 0.5, notes: 4 },
  samba: { duet: "todas", counter: "cala", unit: 0.5, notes: 4 },
  bossa: { duet: "todas", counter: "segura", unit: 1, notes: 3 },
  rock: { duet: "todas", counter: "gemeas", unit: 0.5, notes: 4 },
  ska: { duet: "todas", counter: "cala", unit: 0.5, notes: 3 },
  worship: { duet: "todas", counter: "segura", unit: 1, notes: 3 },
  balada: { duet: "todas", counter: "segura", unit: 1, notes: 3 },
  metal: { duet: "todas", counter: "gemeas", unit: 0.5, notes: 4 },
  disco: { duet: "todas", counter: "cala", unit: 0.5, notes: 3 },
};
const DEFAULT_STYLE = { duet: "todas", counter: "segura", unit: 0.5, notes: 4 };

const LOW = 43; // Sol 2: abaixo disso a segunda voz embola com o baixo
const HIGH = 79; // Sol 5
const mod12 = (n) => ((n % 12) + 12) % 12;

/** Os acordes no tempo: [{ start, end, chord, chordPcs, scale (Set de classes), root }]. Pausa herda a escala do vizinho. */
function timeline(project) {
  const out = [];
  let tick = 0;
  for (const chord of project.chords) {
    const length = Math.round(chord.duration_beats * TICKS_PER_BEAT);
    const voices = sounding(chord);
    const chordPcs = new Set(voices.map((v) => pitchClass(v.note)));
    const scale = new Set([...chord.phrase_pcs.map((x) => x.pc), ...chordPcs]);
    out.push({ start: tick, end: tick + length, chord, chordPcs, scale, root: voices.length ? pitchClass(voices[0].note) : null });
    tick += length;
  }
  // acorde vazio (compasso só com a melodia): vale a escala do acorde mais próximo que tenha; sem nenhum, as notas da Voz
  const voicePcs = new Set(project.voice_events.map((e) => pitchClass(e.note)));
  out.forEach((seg, i) => {
    if (seg.scale.size) return;
    const near = out.slice(0, i).reverse().find((s) => s.scale.size) ?? out.slice(i + 1).find((s) => s.scale.size);
    seg.scale = new Set(near ? near.scale : voicePcs);
  });
  return out;
}

const segmentAt = (segments, tick) => segments.find((s) => tick >= s.start && tick < s.end) ?? segments.at(-1);

/** As alturas de uma escala (classes) entre dois limites, do grave ao agudo. */
function ladder(scale, low, high) {
  const out = [];
  for (let m = low; m <= high; m++) if (scale.has(mod12(m))) out.push(m);
  return out;
}

/** `steps` graus da escala abaixo (negativo) ou acima de uma altura. Altura fora da escala parte do grau mais perto. */
function scaleMove(scale, midi, steps) {
  const rungs = ladder(scale, midi - 30, midi + 30);
  if (!rungs.length) return midi + Math.round(steps * 1.7);
  let i = rungs.indexOf(midi);
  if (i < 0) {
    i = rungs.reduce((best, m, k) => (Math.abs(m - midi) < Math.abs(rungs[best] - midi) ? k : best), 0);
    // de uma nota de fora, o grau "de partida" fica do lado contrário ao movimento, para o intervalo não encolher
    if (steps < 0 && rungs[i] < midi) i += 1;
    if (steps > 0 && rungs[i] > midi) i -= 1;
  }
  return rungs[Math.max(0, Math.min(rungs.length - 1, i + steps))];
}

/** A nota do dueto para uma nota da Voz: a sexta da escala abaixo; nas notas de repouso, a nota do acorde mais perto dela. */
function duetPitch(midi, seg, strong) {
  let pitch = scaleMove(seg.scale, midi, -5);
  if (strong && seg.chordPcs.size && !seg.chordPcs.has(mod12(pitch))) {
    // 5ª ou 7ª abaixo, se for nota do acorde (a mais perto da sexta); senão fica a sexta mesmo
    const options = [scaleMove(seg.scale, midi, -4), scaleMove(seg.scale, midi, -6)].filter((m) => seg.chordPcs.has(mod12(m)) && midi - m >= 5 && midi - m <= 11);
    if (options.length) pitch = options.sort((a, b) => Math.abs(midi - a - 8.5) - Math.abs(midi - b - 8.5))[0];
  }
  while (pitch < LOW) pitch += 12; // grave demais: sobe uma oitava (vira terça acima)
  return pitch;
}

function duet(project, segments, config) {
  const out = [];
  const half = TICKS_PER_BEAT / 2;
  for (const e of project.voice_events) {
    const seg = segmentAt(segments, e.start);
    const last = out.at(-1);
    if (config.duet === "apoio" && e.length < half) {
      // nota rápida: a segunda voz não articula; segura a nota anterior, se ela vinha colada
      if (last && last.start + last.length === e.start) last.length += e.length;
      continue;
    }
    const strong = e.length >= 2 * TICKS_PER_BEAT; // nota de repouso (2 tempos ou mais): aí vale procurar uma nota do acorde
    out.push({ start: e.start, length: e.length, midi: duetPitch(e.note.midi, seg, strong) });
  }
  return out;
}

/** A nota-guia de um acorde (3ª ou 7ª; sem elas, 5ª ou fundamental) mais perto de `near`, abaixo de `ceiling`. */
function guideTone(seg, near, ceiling) {
  if (seg.root === null) return null;
  const kinds = [[3, 4], [10, 11], [7, 6, 8], [0]];
  let pcs = [];
  for (const group of kinds.slice(0, 2)) for (const i of group) if (seg.chordPcs.has(mod12(seg.root + i))) pcs.push(mod12(seg.root + i));
  if (!pcs.length) for (const group of kinds.slice(2)) for (const i of group) if (!pcs.length && seg.chordPcs.has(mod12(seg.root + i))) pcs.push(mod12(seg.root + i));
  if (!pcs.length) pcs = [...seg.chordPcs];
  const top = Math.min(HIGH, ceiling - 3);
  const pool = [];
  for (let m = LOW; m <= Math.max(LOW + 12, top); m++) if (pcs.includes(mod12(m))) pool.push(m);
  return pool.sort((a, b) => Math.abs(a - near) - Math.abs(b - near))[0] ?? null;
}

/** Os jeitos das guitarras gêmeas: quantos graus da escala acima (ou abaixo) da Voz a segunda guitarra toca. */
export const TWIN_INTERVALS = [
  { steps: 2, label: "terça acima" },
  { steps: -2, label: "terça abaixo" },
  { steps: 5, label: "sexta acima" },
];
const TWIN_HIGH = 91; // Sol 6: a guitarra de cima pode passar da Voz

/**
 * Guitarras gêmeas (o contracanto do rock e do metal, à Iron Maiden): a segunda voz dobra a Voz nota por nota, com a
 * mesma rítmica, uma terça da escala acima (ou abaixo, ou uma sexta acima: `variation` escolhe). Nas notas de repouso (dois
 * tempos ou mais), se a terça não for nota do acorde e a quarta for, vale a quarta (na sexta, a quinta): é o ajuste que as duas guitarras fazem.
 */
function twin(project, segments, variation) {
  const { steps } = TWIN_INTERVALS[((variation % TWIN_INTERVALS.length) + TWIN_INTERVALS.length) % TWIN_INTERVALS.length];
  const out = [];
  for (const e of project.voice_events) {
    const seg = segmentAt(segments, e.start);
    const midi = e.note.midi;
    let pitch = scaleMove(seg.scale, midi, steps);
    if (e.length >= 2 * TICKS_PER_BEAT && seg.chordPcs.size && !seg.chordPcs.has(mod12(pitch))) {
      // a terça vira quarta; a sexta vira quinta
      const other = scaleMove(seg.scale, midi, Math.abs(steps) === 2 ? steps + Math.sign(steps) : steps - Math.sign(steps));
      if (seg.chordPcs.has(mod12(other))) pitch = other;
    }
    if (pitch === midi) pitch = scaleMove(seg.scale, midi, steps + Math.sign(steps));
    while (pitch > TWIN_HIGH) pitch -= 12; // aguda demais: desce uma oitava (a terça acima vira sexta abaixo)
    while (pitch < LOW) pitch += 12;
    out.push({ start: e.start, length: e.length, midi: pitch });
  }
  return out;
}

function counter(project, segments, config, rng) {
  const voice = project.voice_events;
  const total = segments.at(-1)?.end ?? 0;
  const grid = TICKS_PER_BEAT / 2; // a Voz é lida de colcheia em colcheia
  // ocupado: a Voz ataca uma nota naquela colcheia, ou ainda está no primeiro tempo de uma nota
  const busy = new Array(Math.ceil(total / grid)).fill(false);
  for (const e of voice) {
    const until = Math.min(e.start + Math.min(e.length, TICKS_PER_BEAT), total);
    for (let k = Math.floor(e.start / grid); k * grid < until; k++) busy[k] = true;
  }
  const sorted = voice.map((e) => e.note.midi).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 67;
  const center = Math.max(LOW + 7, Math.min(HIGH - 12, median - 9));
  const ceilingIn = (from, to) => { // a nota mais grave da Voz no trecho: a segunda voz fica abaixo dela
    const pitches = voice.filter((e) => e.start < to && e.start + e.length > from).map((e) => e.note.midi);
    return pitches.length ? Math.min(...pitches) : median + 12;
  };
  const out = [];
  const push = (start, length, midi) => {
    if (length <= 0 || midi === null) return;
    const last = out.at(-1);
    if (last && last.midi === midi && last.start + last.length === start) last.length += length; // nota igual: ligada
    else out.push({ start, length, midi });
  };
  const unit = Math.round(config.unit * TICKS_PER_BEAT);
  const minGap = Math.max(TICKS_PER_BEAT, 2 * unit);
  let previous = center;

  segments.forEach((seg, index) => {
    if (seg.root === null) return; // acorde vazio: a segunda voz respira
    const guide = guideTone(seg, previous, ceilingIn(seg.start, seg.end));
    const next = segments[index + 1];
    const nextGuide = next && next.root !== null ? guideTone(next, guide ?? previous, ceilingIn(next.start, next.end)) : null;
    // as respostas: trechos em que a Voz segura ou respira
    const gaps = [];
    let from = null;
    for (let t = seg.start; t <= seg.end; t += grid) {
      const free = t < seg.end && !busy[Math.floor(t / grid)];
      if (free && from === null) from = t;
      if (!free && from !== null) { if (t - from >= minGap) gaps.push([from, t]); from = null; }
    }
    let cursor = seg.start;
    const body = (to) => { if (config.counter === "segura") push(cursor, to - cursor, guide); cursor = to; };
    for (const [start, end] of gaps) {
      body(start);
      // quem cala enquanto a Voz canta não corre para o próximo acorde (chegaria num silêncio): responde e pousa aqui mesmo
      const reachesEnd = config.counter === "segura" && end === seg.end && nextGuide !== null;
      const goal = reachesEnd ? nextGuide : guide; // a resposta caminha para a nota-guia (a do próximo acorde, se chega nele)
      const room = Math.floor((end - start) / unit);
      const count = Math.max(2, Math.min(config.notes, room - (reachesEnd ? 0 : 1)));
      if (room < 2 || goal === null) { push(start, end - start, guide); cursor = end; previous = guide ?? previous; continue; }
      const scale = seg.scale;
      const ceiling = ceilingIn(start, end) - 2;
      // o desenho: sobe até a chegada, desce até ela, ou dá a volta (vizinha de cima, vizinha de baixo, chegada)
      const shape = rng.pick(["sobe", "desce", "volta"]);
      const moving = reachesEnd ? count : count - 1; // chegando no próximo acorde, a chegada é dele: aqui só o caminho
      let path = [];
      for (let k = moving; k >= 1; k--) {
        if (shape === "sobe") path.push(scaleMove(scale, goal, -k));
        else if (shape === "desce") path.push(scaleMove(scale, goal, k));
        else path.push(scaleMove(scale, goal, k % 2 ? 1 : -1));
      }
      if (!reachesEnd) path.push(goal);
      while (path.some((m) => m > ceiling) && path.every((m) => m - 12 >= LOW)) path = path.map((m) => m - 12);
      path = path.map((m) => Math.max(LOW, Math.min(HIGH, m)));
      // a resposta ocupa o fim do trecho quando leva ao próximo acorde; senão começa logo e a última nota fica segurada
      const span = path.length * unit;
      const at = reachesEnd ? end - span : start;
      if (reachesEnd && config.counter === "segura") push(start, at - start, guide);
      path.forEach((midi, k) => push(at + k * unit, k === path.length - 1 && !reachesEnd ? end - (at + k * unit) : unit, midi));
      cursor = end;
      previous = path.at(-1);
    }
    body(seg.end);
    if (config.counter === "segura" && guide !== null && !gaps.length) previous = guide;
  });
  return out;
}

/**
 * Escreve a segunda voz. data: o JSON do projeto (com a Voz). options: { mode ("dueto" | "contracanto"), style (da base
 * de estilos, ou só { id }), variation (número: outro desenho do contracanto) }. Devolve { text, notes: [avisos] }.
 */
export function generateSecondVoice(data, { mode = "dueto", style = null, variation = 0 } = {}) {
  const { project } = loadProject(data);
  if (!project.voice_events.length) return { text: "", notes: ["A segunda voz nasce da Voz: cante uma melodia (ou use um MIDI) primeiro."] };
  if (!project.chords.length) return { text: "", notes: [] };
  const config = { ...DEFAULT_STYLE, ...(SECOND_VOICE_STYLES[style?.id] ?? {}) };
  const segments = timeline(project);
  const total = segments.at(-1).end;
  const notes = [];
  let events = mode === "contracanto" && config.counter === "gemeas"
    ? twin(project, segments, variation)
    : mode === "contracanto"
    ? counter(project, segments, config, makeRng(`${style?.id ?? ""}|segunda|${variation}`))
    : duet(project, segments, config);
  events = events.filter((e) => e.start < total).map((e) => ({ ...e, length: Math.min(e.length, total - e.start) })).sort((a, b) => a.start - b.start);
  if (mode === "contracanto" && !segments.some((s) => s.root !== null)) notes.push("O contracanto segue os acordes: ele aparece quando a harmonia estiver pronta.");
  const tokens = [];
  let at = 0;
  for (const e of events) {
    const start = Math.max(e.start, at);
    const length = e.start + e.length - start;
    if (length <= 0) continue;
    if (start > at) tokens.push(`r/${ticksText(start - at)}`);
    const seg = segmentAt(segments, start);
    const name = seg.root !== null || seg.chord.phrase_pcs.length ? speller(seg.chord, project.middle_c)(e.midi) : noteName(makeNote(e.midi), project.middle_c);
    tokens.push(`${name}/${ticksText(length)}`);
    at = start + length;
  }
  return { text: tokens.join(" "), notes };
}

/** O contracanto deste estilo é o das guitarras gêmeas? E qual é o intervalo da variação. */
export const twinGuitars = (style) => (SECOND_VOICE_STYLES[style?.id]?.counter === "gemeas");
export const twinLabel = (variation = 0) => TWIN_INTERVALS[((variation % TWIN_INTERVALS.length) + TWIN_INTERVALS.length) % TWIN_INTERVALS.length].label;
