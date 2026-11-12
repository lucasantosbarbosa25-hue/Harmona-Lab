// Canto -> notas: o que o app faz com uma melodia cantada. Tudo roda no aparelho; o áudio não vai para lugar nenhum.
//
// Etapas:
//   1. trackPitch: a altura da voz a cada 10 ms (algoritmo YIN), num sinal reduzido para 16 kHz (a voz cabe aí e fica rápido).
//      Os instantes dos cliques do metrônomo (que o app sabe exatamente quando tocou) podem ser ignorados ("máscaras").
//   2. segmentNotes: trechos estáveis viram notas; o vibrato não quebra a nota, um salto que dura quebra; a voz que cai e
//      volta (sílabas) separa notas repetidas.
//   3. estimateTuning: quanto a pessoa está, no conjunto, acima ou abaixo da afinação (em centésimos), para não punir quem
//      canta "todo um pouco baixo".
//   4. estimateKey: a tonalidade provável (perfis de Krumhansl), que decide as notas duvidosas (perto de meio semitom).
//   5. quantize: o ritmo encaixado no pulso do metrônomo (semicolcheias ou tercinas).
//   6. voiceText: o resultado na notação de frase do app ("E4/8 G4/8 A4/4 r/4 ..."), que vira a camada Voz.
// measureClicks mede, nos cliques da contagem, se o metrônomo vazou para o microfone e com que atraso (o atraso do caminho
// alto-falante -> microfone é o mesmo que o da pessoa ouvindo e cantando, então serve para alinhar a voz com o pulso).

import { ticksText } from "./groove.js";
import { TICKS_PER_BEAT } from "./phrase.js";
import { makeNote, noteName } from "./pitch.js";

const mod12 = (n) => ((n % 12) + 12) % 12;
export const midiFromHz = (hz) => 69 + 12 * Math.log2(hz / 440);
export const hzFromMidi = (midi) => 440 * 2 ** ((midi - 69) / 12);

const ANALYSIS_RATE = 16000;
const FRAME_SECONDS = 0.064;
const HOP_SECONDS = 0.01;

const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------- metrônomo amadeirado

/**
 * Altura do clique, de propósito ENTRE dois semitons (um quarto de tom): nenhuma nota cantada afinada cai aí, então o app
 * reconhece o clique (e o eco dele na sala) pela altura e o descarta, sem apagar a voz. Tempo 1 mais agudo.
 */
export const CLICK_MIDI = { normal: 82.5, accent: 86.5 };

/**
 * O clique do metrônomo: um "woodblock" curto e seco (duas parciais que morrem rápido e um estalo de 2 ms). O tempo 1
 * (accent) é mais agudo. O mesmo som toca no app e serve nos testes.
 */
export function woodblockSamples(sampleRate, accent = false) {
  const length = Math.round(sampleRate * 0.06);
  const out = new Float32Array(length);
  const f1 = hzFromMidi(accent ? CLICK_MIDI.accent : CLICK_MIDI.normal);
  const f2 = f1 * 2.41;
  let seed = 12345;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const body = Math.sin(2 * Math.PI * f1 * t) * Math.exp(-t / 0.018) + 0.45 * Math.sin(2 * Math.PI * f2 * t) * Math.exp(-t / 0.008);
    const tick = t < 0.002 ? noise() * (1 - t / 0.002) * 0.6 : 0;
    out[i] = 0.7 * (body + tick) * Math.min(1, t / 0.0006);
  }
  return out;
}

// ---------------------------------------------------------------- altura (YIN)

/** Reduz a taxa de amostragem (média móvel como passa-baixa, depois amostra). */
export function downsample(samples, fromRate, toRate = ANALYSIS_RATE) {
  if (fromRate <= toRate) return { samples: Float32Array.from(samples), rate: fromRate };
  const ratio = fromRate / toRate;
  const n = Math.floor(samples.length / ratio);
  const prefix = new Float64Array(samples.length + 1);
  for (let i = 0; i < samples.length; i++) prefix[i + 1] = prefix[i] + samples[i];
  const width = Math.max(1, Math.round(ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = Math.floor(i * ratio);
    const a = Math.max(0, c - width + 1);
    const b = Math.min(samples.length, c + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return { samples: out, rate: fromRate / ratio };
}

/** YIN: a frequência fundamental de um trecho, ou null se não houver altura clara. */
export function yin(buf, rate, { minHz = 65, maxHz = 1100, threshold = 0.15 } = {}) {
  const tauMin = Math.max(2, Math.floor(rate / maxHz));
  const tauMax = Math.min(Math.floor(rate / minHz), Math.floor(buf.length / 2));
  const width = buf.length - tauMax;
  const cmnd = new Float64Array(tauMax + 2);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < width; j++) { const x = buf[j] - buf[j + tau]; sum += x * x; }
    running += sum;
    cmnd[tau] = running ? (sum * tau) / running : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  let exact = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
    const den = a + c - 2 * b;
    if (den > 0) exact = tau + (a - c) / (2 * den);
  }
  return { hz: rate / exact, clarity: 1 - cmnd[tau] };
}

/**
 * A altura a cada 10 ms. masks: [[início, fim], ...] em segundos, instantes a ignorar. reject: { windows, midis, tolerance }:
 * nas janelas, quadros com altura perto de uma das midis viram silêncio (o clique do metrônomo e o eco dele).
 * Devolve { frames: [{ t, rms, midi, clarity, masked }], hop, frame }.
 */
export function trackPitch(samples, sampleRate, { masks = [], reject = null } = {}) {
  const { samples: x, rate } = downsample(samples, sampleRate);
  const size = Math.round(FRAME_SECONDS * rate);
  const step = Math.round(HOP_SECONDS * rate);
  const frames = [];
  for (let start = 0; start + size <= x.length; start += step) {
    let energy = 0;
    for (let i = start; i < start + size; i++) energy += x[i] * x[i];
    const t = (start + size / 2) / rate;
    frames.push({ start, t, rms: Math.sqrt(energy / size), midi: null, clarity: 0, masked: masks.some(([a, b]) => t >= a && t <= b) });
  }
  const loud = [...frames.map((f) => f.rms)].sort((a, b) => a - b)[Math.floor(frames.length * 0.95)] ?? 0;
  const gate = Math.max(1e-4, loud * 0.08); // abaixo disso é silêncio (ou respiração)
  for (const f of frames) {
    if (f.masked || f.rms < gate) continue;
    const found = yin(x.subarray(f.start, f.start + size), rate);
    if (!found || found.hz < 65 || found.hz > 1100) continue;
    const midi = midiFromHz(found.hz);
    // o clique (ou o eco dele): na janela do clique, na altura do clique (ou uma oitava abaixo, erro comum de detecção)
    if (reject && reject.windows.some(([a, b]) => f.t >= a && f.t <= b) && reject.midis.some((m) => Math.abs(midi - m) < reject.tolerance)) continue;
    f.midi = midi;
    f.clarity = found.clarity;
  }
  return { frames, hop: HOP_SECONDS, frame: FRAME_SECONDS, gate };
}

// ---------------------------------------------------------------- notas

/**
 * Trechos estáveis viram notas: [{ start, end, midi (com fração), frames }]. Um desvio que dura (salto) começa outra nota;
 * desvio curto (vibrato, falha da detecção, oitava errada num quadro) não. Silêncio maior que maxGap encerra a nota; a voz
 * que cai e volta (nova sílaba) separa a mesma nota repetida. Os quadros mascarados (cliques) não interrompem nada.
 */
export function segmentNotes(track, { minDur = 0.08, jump = 0.8, persist = 4, maxGap = 0.05 } = {}) {
  const { frames, hop } = track;
  const notes = [];
  let cur = null;
  let pending = [];
  let gap = 0;
  const finish = (note) => {
    if (!note || note.frames.length * hop < minDur) return;
    const first = note.frames[0];
    const last = note.frames.at(-1);
    // a nota que começou escondida por um clique começa no clique (o ataque dela caiu ali)
    const start = note.hiddenStart != null ? note.hiddenStart : first.t - track.frame / 4;
    notes.push({ start, end: last.t + hop, midi: median(note.frames.map((f) => f.midi)), frames: note.frames.length });
  };
  let maskedSince = null; // começo da sequência de quadros mascarados logo antes deste quadro
  let lastMasked = null;
  const open = (list) => {
    const note = { frames: list, peak: Math.max(...list.map((f) => f.rms)), dip: false, hiddenStart: null };
    if (lastMasked != null && list[0].t - lastMasked <= hop * 1.5) note.hiddenStart = maskedSince;
    return note;
  };
  for (const f of frames) {
    if (f.masked) {
      if (lastMasked == null || f.t - lastMasked > hop * 1.5) maskedSince = f.t;
      lastMasked = f.t;
      continue;
    }
    if (f.midi == null) {
      gap += 1;
      if (cur && gap * hop > maxGap) { finish(cur); cur = null; pending = []; }
      continue;
    }
    gap = 0;
    if (!cur) { cur = open([f]); continue; }
    const center = median(cur.frames.slice(-12).map((g) => g.midi));
    if (Math.abs(f.midi - center) > jump) {
      pending.push(f);
      if (pending.length >= persist) { finish(cur); cur = open(pending); pending = []; }
      continue;
    }
    if (pending.length) { cur.frames.push(...pending); pending = []; }
    if (f.rms < cur.peak * 0.35) cur.dip = true;
    else if (cur.dip && f.rms > cur.peak * 0.7) { finish(cur); cur = open([f]); continue; }
    cur.frames.push(f);
    cur.peak = Math.max(cur.peak, f.rms);
  }
  finish(cur);
  return notes;
}

/** Quanto o canto está acima (+) ou abaixo (-) da afinação, em semitons (média circular dos desvios, pela duração). */
export function estimateTuning(notes) {
  let sx = 0, sy = 0, total = 0;
  for (const n of notes) {
    const d = n.midi - Math.round(n.midi);
    const w = n.end - n.start;
    sx += w * Math.cos(2 * Math.PI * d);
    sy += w * Math.sin(2 * Math.PI * d);
    total += w;
  }
  if (!total) return { offset: 0, strength: 0 };
  const strength = Math.hypot(sx, sy) / total;
  const offset = Math.atan2(sy, sx) / (2 * Math.PI);
  return { offset: strength > 0.3 ? offset : 0, strength };
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);

const correlation = (a, b) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
};

/** A tonalidade provável das notas (já com a afinação corrigida): { tonic, mode, name, scale (Set de classes), r }. */
export function estimateKey(notes) {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[mod12(Math.round(n.midi))] += n.end - n.start;
  let best = { tonic: 0, mode: "maior", r: -2 };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [["maior", MAJOR_PROFILE], ["menor", MINOR_PROFILE]]) {
      const rotated = profile.map((_, i) => profile[mod12(i - tonic)]);
      const r = correlation(hist, rotated);
      if (r > best.r) best = { tonic, mode, r };
    }
  }
  const steps = best.mode === "maior" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11];
  const flats = best.mode === "maior" ? FLAT_MAJOR.has(best.tonic) : FLAT_MINOR.has(best.tonic);
  const names = flats ? NAMES_FLAT : NAMES_SHARP;
  return { ...best, flats, name: `${names[best.tonic]}${best.mode === "menor" ? "m" : ""}`, scale: new Set(steps.map((s) => mod12(best.tonic + s))) };
}

/** A nota MIDI de uma altura cantada: corrige a afinação geral e, se ficar perto do meio do caminho, prefere a da escala. */
export function snapPitch(midi, offset = 0, scale = null) {
  const x = midi - offset;
  let n = Math.round(x);
  const dev = x - n;
  if (scale && Math.abs(dev) > 0.3) {
    const other = n + Math.sign(dev);
    if (!scale.has(mod12(n)) && scale.has(mod12(other))) n = other;
  }
  return n;
}

// ---------------------------------------------------------------- ritmo

/**
 * Encaixa as notas no pulso: o início de cada nota vai para a semicolcheia (ou a tercina, se ficar bem mais perto) mais
 * próxima; a duração também; um respiro curto entre duas notas vira ligado. beatZero: o instante (s) do tempo 1 depois da
 * contagem. Notas antes dele (anacruse) puxam a melodia um compasso para trás. Devolve { events: [{ beat, beats, midi }],
 * shift (tempos acrescentados no começo) }.
 */
export function quantize(notes, { bpm, beatZero = 0, beatsPerBar = 4, triplets = true } = {}) {
  const toBeats = (t) => ((t - beatZero) * bpm) / 60;
  const snap = (b) => {
    const sixteenth = Math.round(b * 4) / 4;
    if (!triplets) return sixteenth;
    const triplet = Math.round(b * 3) / 3;
    return Math.abs(triplet - b) < Math.abs(sixteenth - b) * 0.5 ? triplet : sixteenth;
  };
  let events = notes.filter((n) => n.note != null).map((n) => ({ midi: n.note, beat: snap(toBeats(n.start)), end: toBeats(n.end) }));
  events.sort((a, b) => a.beat - b.beat);
  const merged = [];
  for (const e of events) {
    const last = merged.at(-1);
    if (last && Math.abs(last.beat - e.beat) < 1e-6) { if (e.end > last.end) Object.assign(last, e); continue; }
    merged.push(e);
  }
  events = merged;
  let shift = 0;
  if (events.length && events[0].beat < 0) shift = Math.ceil(-events[0].beat / beatsPerBar) * beatsPerBar;
  const out = [];
  events.forEach((e, i) => {
    const beat = e.beat + shift;
    const next = events[i + 1] ? events[i + 1].beat + shift : null;
    let beats = Math.max(0.25, snap(e.end - e.beat));
    if (next != null) {
      if (next - beat - beats < 0.26) beats = next - beat; // respiro curto: ligado até a próxima
      beats = Math.min(beats, next - beat);
    }
    if (beats > 0 && beat >= 0) out.push({ beat: Math.round(beat * 12) / 12, beats: Math.round(beats * 12) / 12, midi: e.midi });
  });
  return { events: out, shift };
}

/** O nome das notas na grafia da tonalidade (Bb, e não A#, em Fá maior). */
export function speller(key, middleC = "C4") {
  const names = key?.flats ? NAMES_FLAT : NAMES_SHARP;
  return (midi) => {
    const name = names[mod12(midi)];
    const accidental = name.length > 1 ? (name[1] === "#" ? 1 : -1) : 0;
    return noteName(makeNote(midi, name[0], accidental), middleC);
  };
}

/** A melodia na notação de frase do app, do tempo 0 até o fim (pausas incluídas). */
export function voiceText(events, { key = null, middleC = "C4" } = {}) {
  const spell = speller(key, middleC);
  const tokens = [];
  let at = 0;
  for (const e of events) {
    const start = Math.round(e.beat * TICKS_PER_BEAT);
    const ticks = Math.round(e.beats * TICKS_PER_BEAT);
    if (start > at) tokens.push(`r/${ticksText(start - at)}`);
    if (ticks > 0) tokens.push(`${spell(e.midi)}/${ticksText(ticks)}`);
    at = start + ticks;
  }
  return tokens.join(" ");
}

// ---------------------------------------------------------------- cliques: vazamento e atraso

/**
 * Procura os cliques do metrônomo na gravação (de preferência os da contagem, quando ninguém canta). Se aparecem, o clique
 * vazou para o microfone, e o tempo entre o clique agendado e o que chegou é o atraso do caminho (o mesmo que a pessoa
 * sente ao ouvir e cantar). Devolve { leak, latency (s), found, total, level (dB do clique em relação ao fundo) }.
 */
export function measureClicks(samples, sampleRate, clickTimes, { maxLatency = 0.35 } = {}) {
  const step = Math.max(1, Math.round(sampleRate * 0.002));
  const env = [];
  for (let i = 1; i + step < samples.length; i += step) {
    let e = 0;
    for (let j = i; j < i + step; j++) { const d = samples[j] - samples[j - 1]; e += d * d; }
    env.push(Math.sqrt(e / step));
  }
  const at = (t) => Math.max(0, Math.min(env.length - 1, Math.floor((t * sampleRate) / step)));
  const latencies = [];
  const levels = [];
  for (const t of clickTimes) {
    const before = env.slice(at(t - 0.06), at(t));
    const base = Math.max(median(before) ?? 0, 1e-6);
    for (let k = at(t); k <= at(t + maxLatency); k++) {
      if (env[k] > base * 8 && env[k] > 1e-4) { latencies.push((k * step) / sampleRate - t); levels.push(20 * Math.log10(env[k] / base)); break; }
    }
  }
  const latency = median(latencies);
  const spread = latencies.length ? median(latencies.map((l) => Math.abs(l - latency))) : 1;
  const leak = latencies.length >= Math.max(2, Math.ceil(clickTimes.length * 0.75)) && spread < 0.012;
  return { leak, latency: leak ? latency : null, found: latencies.length, total: clickTimes.length, level: median(levels) };
}

// ---------------------------------------------------------------- tudo junto

/**
 * Da gravação às notas. options: { bpm, beatsPerBar, clickTimes (s, na linha do tempo da gravação: os agendados),
 * countInBeats (quantos cliques são da contagem), latencyFallback (s, quando não dá para medir pelo vazamento), middleC,
 * maskClicks (apagar da análise os instantes dos cliques que vazaram; false: nos testes, apagar atrapalhou as notas curtas que
 * começam junto do clique, e a nota é lida bem mesmo com o clique por cima) }. O clique (e o eco dele) é descartado pela
 * altura: ele soa entre dois semitons (CLICK_MIDI), onde nenhuma nota cantada afinada cai.
 * Devolve { events, text, key, tuning, leak, latency, shift, notes (brutas), warnings }.
 */
export function transcribe(samples, sampleRate, { bpm, beatsPerBar = 4, clickTimes = [], countInBeats = 4, latencyFallback = 0, middleC = "C4", maskClicks = false } = {}) {
  const warnings = [];
  const countIn = clickTimes.slice(0, countInBeats);
  const leak = countIn.length ? measureClicks(samples, sampleRate, countIn) : { leak: false, latency: null, found: 0, total: 0 };
  const latency = leak.leak ? leak.latency : latencyFallback;
  // o clique morre em uns 40 ms: só esse trecho é ignorado
  const masks = leak.leak && maskClicks ? clickTimes.map((t) => [t + latency - 0.008, t + latency + 0.045]) : [];
  // o clique e o eco dele na sala são reconhecidos pela altura (entre dois semitons) e viram silêncio
  const reject = leak.leak ? {
    windows: clickTimes.map((t) => [t + latency - 0.01, t + latency + 0.6]),
    midis: [CLICK_MIDI.normal, CLICK_MIDI.accent, CLICK_MIDI.normal - 12, CLICK_MIDI.accent - 12],
    tolerance: 0.3,
  } : null;
  const track = trackPitch(samples, sampleRate, { masks, reject });
  const notes = segmentNotes(track);
  if (!notes.length) {
    warnings.push("Não encontrei notas cantadas. Cante mais perto do microfone, ou mais alto.");
    return { events: [], text: "", key: null, tuning: { offset: 0, strength: 0 }, leak, latency, shift: 0, notes, warnings };
  }
  const tuning = estimateTuning(notes);
  const key = estimateKey(notes.map((n) => ({ ...n, midi: n.midi - tuning.offset })));
  for (const n of notes) n.note = snapPitch(n.midi, tuning.offset, key.scale);
  const firstBeat = clickTimes[countInBeats] ?? (countIn.length ? countIn.at(-1) + 60 / bpm : 0);
  const { events, shift } = quantize(notes, { bpm, beatZero: firstBeat + latency, beatsPerBar });
  // o clique chegou ao microfone mais alto que a voz? (com eco forte, aí sim pode confundir)
  let clickVsVoice = null;
  if (leak.leak) {
    const voiced = track.frames.filter((f) => f.midi != null).map((f) => f.rms);
    const win = Math.round(sampleRate * 0.02);
    const clickRms = median(clickTimes.slice(0, countInBeats).map((t) => {
      const a = Math.max(0, Math.round((t + latency) * sampleRate));
      let e = 0;
      for (let i = a; i < Math.min(samples.length, a + win); i++) e += samples[i] * samples[i];
      return Math.sqrt(e / win);
    }));
    const voiceRms = median(voiced);
    if (clickRms && voiceRms) clickVsVoice = 20 * Math.log10(clickRms / voiceRms);
    if (clickVsVoice != null && clickVsVoice > 0) warnings.push("O clique do metrônomo chegou ao microfone mais alto que a voz. Baixe o volume do clique ou use fone, para não confundir as notas.");
  }
  if (Math.abs(tuning.offset) > 0.25) warnings.push(`O canto estava ${Math.round(Math.abs(tuning.offset) * 100)} centésimos ${tuning.offset > 0 ? "acima" : "abaixo"} da afinação; corrigi.`);
  if (shift) warnings.push("A melodia começou antes do tempo 1 (anacruse): ela ganhou um compasso no começo.");
  return { events, text: voiceText(events, { key, middleC }), key, tuning, leak, latency, shift, notes, warnings, clickVsVoice };
}
