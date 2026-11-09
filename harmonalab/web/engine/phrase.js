// Frases melódicas — espelho de harmonalab/phrase.py.
//
// Cada nota é NOTA/DURAÇÃO e pode levar um papel depois de "*":
//   G5/8 F5/8 Eb5/4*alvo D5/8 C5/8 B4/4*alvo        (r/8 é uma pausa de colcheia)
// A duração é o valor da figura (4 = semínima = 1 tempo, 8 = colcheia, 16 = semicolcheia...), com t para tercina,
// q para quiáltera de cinco e . para ponto. O início de cada nota é a soma das durações anteriores.
//
// Pontos de extensão: DURATION_MODIFIERS (novas divisões), ROLE_ALIASES e SCALE_EXEMPT_ROLES (papéis das notas).
// Qualquer papel é aceito: o que não for conhecido vale como texto livre.

import { NoteParseError, parseNote, pitchClassSpelling, renameNoteText, splitNoteList } from "./pitch.js";

export const TICKS_PER_BEAT = 480;
export const WHOLE_NOTE_TICKS = 4 * TICKS_PER_BEAT;
export const DURATION_VALUES = [1, 2, 4, 8, 16, 32, 64];
/** Divisões irregulares: fator = [numerador, denominador] (tercina = 2/3, quiáltera de cinco = 4/5). */
export const DURATION_MODIFIERS = { t: [2, 3], q: [4, 5] };
/** Papéis com outro nome comum → nome canônico (sem acento e em minúsculas). */
export const ROLE_ALIASES = { aproximacao: "aprox", approach: "aprox", target: "alvo" };
/** Papéis cujas notas podem ficar fora da escala declarada da frase. */
export const SCALE_EXEMPT_ROLES = new Set(["aprox", "passagem", "cromatica", "blue"]);

const SEPARATORS = /[\s,;|]+/u;
const DURATION_RE = /^(\d+)([tq]?)(\.?)$/;

export class PhraseError extends Error {}

/** Fichas de uma frase (texto ou lista de textos); separadas por espaço, vírgula, ; ou |. */
export function splitPhrase(value) {
  if (value == null) return [];
  const text = Array.isArray(value) ? value.map(String).join(" ") : String(value);
  return text.trim().split(SEPARATORS).filter(Boolean);
}

/** A frase com um espaço só entre as fichas. */
export const phraseText = (value) => splitPhrase(value).join(" ");

export function normalizeRole(text) {
  const plain = text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return Object.hasOwn(ROLE_ALIASES, plain) ? ROLE_ALIASES[plain] : plain;
}

/** "8" → 240, "8t" → 160, "4." → 720 (em 480 ticks por semínima). */
export function durationTicks(text) {
  const m = text.trim().toLowerCase().match(DURATION_RE);
  if (!m || !DURATION_VALUES.includes(parseInt(m[1], 10))) {
    throw new PhraseError(`Duração "${text}" não existe: use 1, 2, 4, 8, 16, 32 ou 64 (4 = semínima), `
      + "com t (tercina), q (quiáltera de 5) ou . (ponto).");
  }
  const [fn, fd] = m[2] ? DURATION_MODIFIERS[m[2]] : [1, 1];
  const [dn, dd] = m[3] ? [3, 2] : [1, 1];
  const num = WHOLE_NOTE_TICKS * fn * dn;
  const den = parseInt(m[1], 10) * fd * dd;
  if (num % den) throw new PhraseError(`A duração "${text}" não cai na grade do MIDI (${TICKS_PER_BEAT} ticks por semínima).`);
  return num / den;
}

const partition = (text, sep) => {
  const i = text.indexOf(sep);
  return i < 0 ? [text, "", ""] : [text.slice(0, i), sep, text.slice(i + sep.length)];
};

/** Lê a frase. Devolve { events (notas com tempo), ticks (duração total), errors } sem parar no primeiro erro. */
export function parsePhrase(value, middleC) {
  const events = [];
  const errors = [];
  let tick = 0;
  for (const token of splitPhrase(value)) {
    const [head, star, roleText] = partition(token, "*");
    const [name, slash, durText] = partition(head, "/");
    if (!slash || !name || !durText) {
      errors.push(`Não entendi "${token}" na frase: escreva NOTA/DURAÇÃO, por exemplo G5/8, ou r/4 para uma pausa.`);
      continue;
    }
    let length;
    try {
      length = durationTicks(durText);
    } catch (err) {
      if (!(err instanceof PhraseError)) throw err;
      errors.push(`${err.message} (em "${token}")`);
      continue;
    }
    if (star && !roleText.trim()) {
      errors.push(`Papel vazio em "${token}": escreva, por exemplo, ${name}/${durText}*alvo.`);
      continue;
    }
    if (name === "r" || name === "R") {
      tick += length;
      continue;
    }
    let note;
    try {
      note = parseNote(name, middleC);
    } catch (err) {
      if (!(err instanceof NoteParseError)) throw err;
      errors.push(`Frase: ${err.message}`);
      tick += length;
      continue;
    }
    events.push({ note, start: tick, length, role: star ? normalizeRole(roleText) : "", token });
    tick += length;
  }
  return { events, ticks: tick, errors };
}

/** Escala da frase ("B C D Eb F G A") → { scale: [{pc, name}] sem repetir, errors }. */
export function parseScale(value) {
  const scale = [];
  const errors = [];
  for (const token of splitNoteList(value)) {
    try {
      const { pc, name } = pitchClassSpelling(token);
      if (scale.every((s) => s.pc !== pc)) scale.push({ pc, name });
    } catch (err) {
      if (!(err instanceof NoteParseError)) throw err;
      errors.push(`Escala da frase: ${err.message}`);
    }
  }
  return { scale, errors };
}

/** Reescreve as notas da frase para outra convenção de oitava, sem mudar as alturas. */
export function renamePhraseText(value, fromMiddleC, toMiddleC) {
  if (value == null || !(typeof value === "string" || Array.isArray(value))) return value;
  return splitPhrase(value).map((token) => {
    const [head, star, role] = partition(token, "*");
    let [name, slash, dur] = partition(head, "/");
    if (slash && name && name !== "r" && name !== "R") name = renameNoteText(name, fromMiddleC, toMiddleC);
    return `${name}${slash}${dur}${star}${role}`;
  }).join(" ");
}
