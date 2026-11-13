// O tom de cada parte: nome por extenso, modulação em semitons e transposição de uma parte pronta.
//
// O tom da música é o da parte A (campo "key" do projeto, ex.: "Am"). Cada parte guarda só a distância até ele, em
// semitons ("+2" quer dizer sempre a mesma coisa, mesmo se os blocos mudarem de ordem); o modo (maior ou menor) é o da
// música. Tudo aqui é lógica pura (sem tela), para poder ser testado sozinho.

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LONG = { C: "Dó", D: "Ré", E: "Mi", F: "Fá", G: "Sol", A: "Lá", B: "Si" };
const SOLFEGE = { do: "C", "dó": "C", re: "D", "ré": "D", mi: "E", fa: "F", "fá": "F", sol: "G", la: "A", "lá": "A", si: "B" };
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);
const mod12 = (n) => ((n % 12) + 12) % 12;
const pcOf = (letter, accidental) => mod12(LETTER_PC[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0));

/** A maior modulação que o campo aceita (para cima ou para baixo). */
export const MAX_SHIFT = 11;

/** { tonic (0–11), mode } → o tom completo: { tonic, mode, flats, name ("Bm"), long ("Si menor"), scale (Set de classes) }. */
export function makeKey(tonic, mode = "maior") {
  const t = mod12(tonic);
  const minor = mode === "menor";
  const flats = minor ? FLAT_MINOR.has(t) : FLAT_MAJOR.has(t);
  const short = (flats ? FLAT : SHARP)[t];
  const steps = minor ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11]; // no menor, a sensível também vale
  const long = `${LONG[short[0]]}${short[1] === "#" ? " sustenido" : short[1] === "b" ? " bemol" : ""} ${minor ? "menor" : "maior"}`;
  return { tonic: t, mode: minor ? "menor" : "maior", flats, name: `${short}${minor ? "m" : ""}`, long, scale: new Set(steps.map((s) => mod12(t + s))) };
}

/** Lê um tom escrito ("Am", "Bb", "F# menor", "Lá menor", "C major"). Não entendeu: null. */
export function parseKey(text) {
  let s = String(text || "").trim().replace(/♯/g, "#").replace(/♭/g, "b");
  if (!s) return null;
  const word = s.match(/^(dó|do|ré|re|mi|fá|fa|sol|lá|la|si)(?![a-zà-ú])\s*(sustenido|bemol|#|b)?/i);
  let letter, accidental, rest;
  if (word) {
    letter = SOLFEGE[word[1].toLowerCase()];
    accidental = !word[2] ? "" : /^(sustenido|#)$/i.test(word[2]) ? "#" : "b";
    rest = s.slice(word[0].length);
  } else {
    const m = s.match(/^([A-Ga-g])\s*(#|b(?!em)|sustenido|bemol)?/);
    if (!m) return null;
    letter = m[1].toUpperCase();
    accidental = !m[2] ? "" : /^(sustenido|#)$/i.test(m[2]) ? "#" : "b";
    rest = s.slice(m[0].length);
  }
  rest = rest.trim().toLowerCase();
  const minor = /^(m(?!a)|min|menor)/.test(rest) || /\bmenor\b|\bminor\b/.test(rest);
  return makeKey(pcOf(letter, accidental), minor ? "menor" : "maior");
}

/** O tom `semitones` acima (ou abaixo, se negativo), no mesmo modo. */
export const shiftKey = (key, semitones) => makeKey(key.tonic + semitones, key.mode);

/** O que a pessoa digitou no campo de modulação → inteiro entre -MAX_SHIFT e MAX_SHIFT (vazio ou inválido: 0). */
export function readShift(value) {
  const n = Math.round(Number(String(value ?? "").replace(",", ".").replace("−", "-").replace("+", "")));
  return Number.isFinite(n) ? Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, n)) : 0;
}

/** O texto do tom de uma parte, escrito pelo app: "Lá menor" ou "Lá menor → Si menor (2 semitons acima)". */
export function describeShift(songKey, semitones) {
  if (!songKey) return "";
  if (!semitones) return `${songKey.long} (o tom da música)`;
  const n = Math.abs(semitones);
  return `${songKey.long} → ${shiftKey(songKey, semitones).long} (${n} semitom${n > 1 ? "s" : ""} ${semitones > 0 ? "acima" : "abaixo"})`.replace("semitoms", "semitons");
}

/**
 * A modulação (de -5 a +6) cuja escala melhor explica um conjunto de notas: `weights` = 12 pesos, um por classe de altura.
 * Serve para descobrir o tom que a IA escolheu quando a pessoa deixou "a IA decide". Empate: a menor distância.
 */
export function bestShift(songKey, weights) {
  let best = 0;
  let bestScore = -Infinity;
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  for (const shift of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]) {
    const key = shiftKey(songKey, shift);
    let score = 0;
    for (let pc = 0; pc < 12; pc++) if (key.scale.has(pc)) score += weights[pc];
    score = score / total + (weights[key.tonic] / total) * 0.25; // a tônica presente desempata tons vizinhos
    if (score > bestScore + 1e-9) { best = shift; bestScore = score; }
  }
  return best;
}

// ---------------------------------------------------------------- transposição
const spell = (pc, flats) => (flats ? FLAT : SHARP)[mod12(pc)];

/** Notas com oitava dentro de um texto ("A2 G3", "E2&B2/8 r/4 C5/4*alvo"): sobem ou descem `n` semitons. */
export function transposeNotes(text, n, flats = false) {
  if (!n || !text) return text;
  return String(text).replace(/(?<![A-Za-z#])([A-G])([#b]?)(-?\d+)(?!\d)/g, (_, letter, accidental, octave) => {
    const at = LETTER_PC[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) + n;
    return `${spell(at, flats)}${Number(octave) + Math.floor(at / 12)}`;
  });
}

/** Nomes de nota sem oitava ("B C D Eb F G A"): sobem ou descem `n` semitons. */
export function transposeNames(text, n, flats = false) {
  if (!n || !text) return text;
  return String(text).replace(/(?<![A-Za-zÀ-ú#])([A-G])([#b]?)(?![A-Za-zÀ-ú0-9#])/g, (_, letter, accidental) => spell(pcOf(letter, accidental) + n, flats));
}

/** A cifra ("Dbmaj7/Ab"): a fundamental e o baixo sobem ou descem `n` semitons; o resto fica igual. */
export function transposeSymbol(symbol, n, flats = false) {
  if (!n || !symbol) return symbol;
  return String(symbol)
    .replace(/^(\s*)([A-G])([#b]?)/, (_, space, letter, accidental) => `${space}${spell(pcOf(letter, accidental) + n, flats)}`)
    .replace(/\/([A-G])([#b]?)(?![A-Za-z0-9])/g, (_, letter, accidental) => `/${spell(pcOf(letter, accidental) + n, flats)}`);
}

const NOTE_FIELDS = ["bass", "left_hand", "right_hand", "notes", "top_note", "phrase", "bass_line", "riff"];
const NAME_FIELDS = ["phrase_scale", "omitted", "scale"];

/** Um acorde do app (campos em texto) `n` semitons acima: cifra, notas, frase, baixo, riff e escalas. */
export function transposeChord(chord, n, flats = false) {
  if (!n) return chord;
  const out = { ...chord };
  if (/^\s*[A-G]/.test(String(chord.symbol || "")) && !/^\s*pausa/i.test(String(chord.symbol))) out.symbol = transposeSymbol(chord.symbol, n, flats);
  for (const f of NOTE_FIELDS) if (typeof chord[f] === "string" && chord[f]) out[f] = transposeNotes(chord[f], n, flats);
  for (const f of NAME_FIELDS) if (typeof chord[f] === "string" && chord[f]) out[f] = transposeNames(chord[f], n, flats);
  return out;
}

/** Os pesos das 12 classes de altura das notas com oitava de um texto ("A2 G3 C4"), cada nota valendo `weight`. */
export function addPitchWeights(weights, text, weight = 1) {
  for (const m of String(text || "").matchAll(/(?<![A-Za-z#])([A-G])([#b]?)-?\d+/g)) weights[pcOf(m[1], m[2])] += weight;
  return weights;
}

/** A modulação guardada, sempre entre -5 e +6 (a mesma distância, pelo caminho mais curto). */
export const wrapShift = (n) => { const m = mod12(n); return m > 6 ? m - 12 : m; };
