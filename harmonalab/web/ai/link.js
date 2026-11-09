// Links do Harmona Lab: o endereço carrega a progressão (ou só o pedido) depois do "#".
// O que fica depois do "#" nunca vai para o servidor: a progressão não sai do aparelho de quem abre.
//
// Formatos (parâmetros separados por &):
//   #t=título&k=tom&bpm=80&ts=4/4&ref=A,B&st=Levada&x=explicação&p=cifra:notas:duração:função:escala:comentário:frase:escala_da_frase;...
//                                                                                                compacto, para qualquer IA
//   #json=<JSON do projeto, com % codificado>                                                   para quem monta com código
//   #z=<JSON comprimido com deflate e escrito em base64url>                                     o mais curto (o app e o script geram)
//   #pedido=<texto>                                                                             só preenche o pedido; nunca gera sozinho

import { noteName, parseNote } from "../engine/pitch.js";

const MAX_HASH = 40000; // links maiores que isso não são lidos (nenhuma progressão normal chega perto)

const decode = (text) => {
  try { return decodeURIComponent(text); } catch { return text; } // % solto não derruba o link
};
const textOf = (raw) => decode(raw).replace(/_/g, " ").trim();

/** Nota escrita no link: "Fs4" e "F%234" valem como "F#4". Lixo continua como está (o motor aponta o erro). */
function normalizeNote(token) {
  const text = decode(token).trim();
  const m = text.match(/^([A-Ga-g])([sb#♯♭]*)(-?\d+)$/);
  return m ? `${m[1]}${m[2].replace(/s/g, "#")}${m[3]}` : text;
}

const noteList = (raw) => (raw || "").split(",").map(normalizeNote).filter(Boolean);

/** Frase no link: fichas separadas por "_", notas com "s" no lugar do "#" ("Fs5/8*alvo"). A notação em si é a do motor (engine/phrase.js). */
function normalizePhrase(raw) {
  return decode(raw).split(/[_\s+]+/).filter(Boolean).map((token) => {
    const m = token.match(/^([A-Ga-g])([sb#♯♭]*)(-?\d+)(\/.*)$/);
    return m ? `${m[1]}${m[2].replace(/s/g, "#")}${m[3]}${m[4]}` : token;
  }).join(" ");
}

/** Escala da frase no link: "B_C_D_Eb_F_G_A", com "s" no lugar do "#". */
function normalizeScale(raw) {
  return decode(raw).split(/[_\s,+]+/).filter(Boolean).map((token) => {
    const m = token.match(/^([A-Ga-g])([sb#♯♭]*)$/);
    return m ? `${m[1]}${m[2].replace(/s/g, "#")}` : token;
  }).join(" ");
}

function highestNote(lists) {
  let best = null;
  for (const token of lists.flat()) {
    try {
      const note = parseNote(token);
      if (!best || note.midi > best.midi) best = { midi: note.midi, token: noteName(note) };
    } catch { return null; } // com nota inválida o motor já avisa; não inventamos a ponta
  }
  return best?.token ?? null;
}

function chordFromSpec(spec) {
  const [symbol = "", notes = "", beats = "", fn = "", scale = "", comment = "", phrase = "", phraseScale = ""] = spec.split(":");
  const parts = notes.split("/");
  // 1 parte = só mão direita; 2 = esquerda/direita; 3 = baixo/esquerda/direita
  const [bass, left, right] = parts.length >= 3 ? parts : parts.length === 2 ? [null, parts[0], parts[1]] : [null, null, parts[0]];
  const hands = { bass: noteList(bass), left_hand: noteList(left), right_hand: noteList(right) };
  const chord = { symbol: decode(symbol).trim() };
  const duration = Number(decode(beats).replace(",", "."));
  if (beats.trim() && Number.isFinite(duration)) chord.duration_beats = duration;
  else if (beats.trim()) chord.duration_beats = decode(beats); // o motor mostra o erro
  for (const [key, list] of Object.entries(hands)) if (list.length) chord[key] = list;
  const top = highestNote(Object.values(hands));
  if (top) chord.top_note = top;
  if (fn.trim()) chord.function = textOf(fn);
  if (scale.trim()) chord.scale = textOf(scale);
  if (comment.trim()) chord.comment = textOf(comment);
  if (phrase.trim()) chord.phrase = normalizePhrase(phrase);
  if (phraseScale.trim()) chord.phrase_scale = normalizeScale(phraseScale);
  return chord;
}

/** Parâmetros do formato compacto → projeto (JSON do app). */
export function compactToProject(params) {
  const project = {};
  if (params.t) project.title = textOf(params.t);
  if (params.k) project.key = textOf(params.k);
  if (params.bpm) project.tempo = Number(decode(params.bpm).replace(",", ".")) || decode(params.bpm);
  if (params.ts) project.time_signature = decode(params.ts).trim();
  if (params.st) project.style = textOf(params.st);
  if (params.ref) project.references = textOf(params.ref).split(",").map((t) => t.trim()).filter(Boolean);
  if (params.x) project.comment = textOf(params.x);
  project.chords = (params.p || "").split(";").map((s) => s.trim()).filter(Boolean).map(chordFromSpec);
  return project;
}

function readParams(hash) {
  const params = {};
  for (const piece of hash.replace(/^#/, "").split("&")) {
    const i = piece.indexOf("=");
    if (i > 0) params[piece.slice(0, i).trim().toLowerCase()] = piece.slice(i + 1);
  }
  return params;
}

// ---------------------------------------------------------------- compressão (deflate sem cabeçalho + base64url)
const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipeThrough(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes).then(() => writer.close()).catch(() => {}); // o erro de dado inválido aparece na leitura, logo abaixo
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export const canCompress = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

/** JSON sem campos vazios (nulls, textos e listas vazias), para o link ficar curto. */
const compactJson = (value) => JSON.stringify(value, (_, v) => (v === null || v === "" || (Array.isArray(v) && !v.length) ? undefined : v));

/** Link de compartilhamento da progressão: "#z=..." (curto) ou "#json=..." onde não há compressão. */
export async function buildShareHash(project) {
  const json = compactJson(project);
  if (canCompress()) {
    const bytes = await pipeThrough(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
    return `#z=${toBase64Url(bytes)}`;
  }
  return `#json=${encodeURIComponent(json)}`;
}

// ---------------------------------------------------------------- leitura

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Aceita o projeto direto ou a resposta {projeto, explicacao}. */
function fromJson(data) {
  if (isObject(data) && isObject(data.projeto)) {
    return { kind: "project", project: data.projeto, explanation: typeof data.explicacao === "string" ? data.explicacao : "" };
  }
  if (isObject(data) && Array.isArray(data.chords)) return { kind: "project", project: data, explanation: "" };
  return { kind: "error", message: "O link não tem uma progressão (falta a lista de acordes)." };
}

/**
 * Lê o que vem depois do "#" de um link do Harmona Lab.
 * Devolve { kind: "none" } | { kind: "request", request } | { kind: "project", project, explanation } | { kind: "error", message }.
 */
export async function parseLinkHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) return { kind: "none" };
  if (raw.length > MAX_HASH) return { kind: "error", message: "O link é grande demais para abrir." };
  const params = readParams(raw);
  try {
    if (params.pedido) return { kind: "request", request: textOf(params.pedido) };
    if (params.z) {
      if (!canCompress()) return { kind: "error", message: "Este navegador não abre links comprimidos. Peça a versão com #json= ou #p=." };
      const bytes = await pipeThrough(fromBase64Url(params.z.trim()), new DecompressionStream("deflate-raw"));
      return fromJson(JSON.parse(new TextDecoder().decode(bytes)));
    }
    if (params.json) return fromJson(JSON.parse(decode(params.json)));
    if (params.p) {
      const project = compactToProject(params);
      return { kind: "project", project, explanation: project.comment || "" };
    }
  } catch {
    return { kind: "error", message: "Não consegui ler este link: ele parece cortado ou com erro. Peça à IA para mandar de novo (ou use o JSON)." };
  }
  return { kind: "none" };
}

/** Acha um link do Harmona Lab dentro de um texto colado (resposta de chat, com markdown em volta). */
export function findLinkInText(text) {
  for (const match of String(text || "").matchAll(/https?:\/\/[^\s<>"'`]*?(#[^\s<>"'`]+)/g)) {
    let hash = match[1];
    while (/[.,;:]$/.test(hash)) hash = hash.slice(0, -1);
    // "[texto](url)": o ")" final fecha o markdown, não faz parte do link, se sobrar um a mais
    if (hash.endsWith(")") && (hash.match(/\)/g) || []).length > (hash.match(/\(/g) || []).length) hash = hash.slice(0, -1);
    if (/(^|&)(p|z|json|pedido)=/i.test(hash.slice(1))) return hash;
  }
  return null;
}
