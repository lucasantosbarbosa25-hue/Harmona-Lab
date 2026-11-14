// Harmona Lab — interface. Edita o modelo (JSON) e mostra o que o motor analisou.
// O motor (engine/) roda aqui mesmo no navegador: o app funciona offline, sem servidor,
// e gera os mesmos bytes de MIDI que a versão em Python (há teste comparando).

import { buildShareHash } from "./ai/link.js";
import { initAssistant } from "./ai/ui.js";
import { Player } from "./audio.js";
import { setupCanto } from "./voz.js";
import { estimateKey } from "./engine/canto.js";
import { addPitchWeights, makeKey, parseKey } from "./tom.js";
import {
  appendSection, joinSection, moveSection, nextSectionName, removeSection, renameSection, repeatSection,
  sectionBlocks, splitSection, voiceNotes, voiceTextOf,
} from "./partes.js";
import { buildPdf, drawDiagramPages } from "./diagram.js";
import { analyzeData } from "./engine/analysis.js";
import { FILL_FREEDOMS, FILL_FREQUENCIES, INTENSITIES, SOURCE_SCALES, bassForComp, bassOptions, beatOptions, compOptions, generateGroove, percussionOptions } from "./engine/groove.js";
import { SECOND_VOICE_MODES, generateSecondVoice, twinGuitars, twinLabel } from "./engine/segunda.js";
import { riffOptions, riffSound } from "./engine/riff.js";
import { DRUM_CHANNEL, TICKS_PER_BEAT, beatsToTicks, midiBytes, noteEvents, notePart, MIDI_PARTS, PERCUSSION_INSTRUMENTS, padNotes, partsPresent, percussionPresent } from "./engine/midi.js";
import { STYLES, findStyle, styleByLabel } from "./kb/estilos.js";
import { loadProject as readProject, renameProjectNotes } from "./engine/model.js";
import { keyboardRange, renderKeyboard } from "./keyboard.js";
import { VOICINGS, revoiceChord } from "./engine/voicing.js";
import { BUILTIN_BANKS, DEFAULT_SOUNDS } from "./kb/sons.js";
import { LARGE_BANK_BYTES, NO_DRUMS, SAME, SIMPLE, SoundFontPlayer, builtinValue, formatSize, parsePatchValue, patchValue, suggestedPreset } from "./sound.js";

const DRAFT_KEY = "harmonalab:draft:v1";
const SOUND_KEY = "harmonalab:sound";
const RIFF_AUTO = "auto"; // som do riff: o sugerido pelo tipo de riff
const GROOVE_KEY = "harmonalab:groove";
const CUSTOM_COMP = "custom"; // levada escrita à mão (ou vinda num projeto), que não é uma das opções do estilo
const TIME_SIGNATURES = ["2/4", "3/4", "4/4", "5/4", "6/4", "3/8", "5/8", "6/8", "7/8", "9/8", "12/8"];
const PART_CLASS = { right_hand: "rh", left_hand: "lh", bass: "bass", notes: "free" };
const PART_LABEL = { right_hand: "Mão direita", left_hand: "Mão esquerda", bass: "Baixo / pedal", notes: "Notas sem mão" };
const CHORD_FIELDS = ["right_hand", "left_hand", "bass", "notes", "top_note", "velocity", "duration_beats", "strum", "omitted", "phrase", "phrase_scale", "comp", "bass_line"];
const PHRASE_MODES = ["both", "line", "chords"];
const COLORS = [["", "Estilo"], ["dentro", "Dentro"], ["cromatico", "Cromático"], ["outside", "Outside"]]; // acorde + frase · mão esquerda + frase · só acorde
const STRUM_LABEL = { up: "grave → agudo", down: "agudo → grave" };
const DEFAULT_STRUM_DELAY_MS = 20;

const $ = (selector) => document.querySelector(selector);

// ---------------------------------------------------------------- ícones
const ICONS = {
  play: '<path class="fill" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>',
  stop: '<rect class="fill" x="6" y="6" width="12" height="12" rx="2"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  dots: '<circle class="fill" cx="5" cy="12" r="1.8"/><circle class="fill" cx="12" cy="12" r="1.8"/><circle class="fill" cx="19" cy="12" r="1.8"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M8 20v-6h8v6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  install: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><rect x="4" y="18" width="16" height="3" rx="1"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13"/><circle class="fill" cx="12" cy="16.5" r="1.1"/>',
  warning: '<path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><circle class="fill" cx="12" cy="17" r="1.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle class="fill" cx="12" cy="7.8" r="1.1"/>',
};

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name];
  return svg;
}

// ---------------------------------------------------------------- DOM
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (typeof value === "boolean") {
      if (key in el) el[key] = value;
      else if (value) el.setAttribute(key, "");
    } else if (key === "value") el.value = value;
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

const noteInputProps = { type: "text", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: false };

// ---------------------------------------------------------------- estado
const state = {
  project: null, // modelo editável (notas como texto)
  report: null, // última análise do servidor
  byId: new Map(), // id do acorde → { chord, issues }
  playing: false,
  mix: {}, // mixer da escuta: { parte: { on, gain } } (parte que não está aqui = ligada, volume normal)
  clock: null, // enquanto toca: { start (ms), secondsPerBeat, fromBeat, beats } para a linha que corre na melodia
  phraseMode: "both", // o que ouvir e exportar: acorde + frase, mão esquerda + frase ou só acorde
  // som da pré-escuta de cada camada: um instrumento do app ("kb:id"), do banco do aparelho ("sf:MSB:LSB:programa"), ou
  // o timbre simples (acordes), o mesmo dos acordes (frase, baixo), o pad sintético do app (pad), sem bateria
  sound: {
    chords: builtinValue(DEFAULT_SOUNDS.chords), phrase: SAME, drums: builtinValue(DEFAULT_SOUNDS.drums),
    bass: builtinValue(DEFAULT_SOUNDS.bass), pad: builtinValue(DEFAULT_SOUNDS.pad), riff: RIFF_AUTO,
  },
  groove: { style: STYLES[0].id, variation: 0, drumVariation: 0 }, // estilo do ritmo e das frases, e as variações das frases e das viradas
  listen: { loop: false, rate: 1, range: null }, // só para ouvir: repetir e andamento de estudo (não muda o projeto nem o MIDI exportado)
};
const refs = new WeakMap(); // acorde → elementos do cartão
const openChords = new Set(); // ids dos acordes com o cartão aberto (os outros ficam recolhidos)
const foldedSections = new Set(); // ids do 1º acorde das partes recolhidas na lista
const player = new Player();
const soundFont = new SoundFontPlayer(); // banco de sons (.sf2): só carrega a biblioteca quando alguém usa
let soundTimers = [];
let soundRestored = false; // o banco guardado já foi lido (antes disso, não descartamos a escolha salva)
let nextId = 1;

const beatsPerBar = () => {
  const [num, den] = String(state.project.time_signature).split("/").map(Number);
  return num && den ? (num * 4) / den : 4;
};
const toNumber = (v) => (v === "" || v == null ? NaN : Number(String(v).replace(",", ".")));
const fmt = (x) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(3)).replace(".", ","));

function barsText(beats) {
  const bars = beats / beatsPerBar();
  if (!Number.isFinite(bars) || bars <= 0) return "";
  if (bars === 0.5) return "½ compasso";
  if (bars === 1) return "1 compasso";
  return Number.isInteger(bars) ? `${bars} compassos` : `${fmt(bars)} compasso`;
}

function slugify(text, fallback = "progressao") {
  const slug = (text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60);
  return slug || fallback;
}

function blankChord(extra = {}) {
  return {
    id: nextId++, symbol: "", duration_beats: beatsPerBar(),
    right_hand: "", left_hand: "", bass: "", notes: "",
    top_note: "", velocity: "", strum: "", function: "", scale: "", omitted: "", comment: "", phrase: "", phrase_scale: "", phrase_color: "", comp: "", bass_line: "", riff: "", section: "", request: "", ...extra,
  };
}

const fillSettings = (raw) => ({
  frequency: FILL_FREQUENCIES.some((x) => x.id === raw?.frequency) ? raw.frequency : "normal",
  freedom: FILL_FREEDOMS.some((x) => x.id === raw?.freedom) ? raw.freedom : "normal",
});

/** As escolhas do painel de ritmo guardadas no projeto (levada, bateria, tags e cor das frases). */
function grooveSettings(raw) {
  const g = raw && typeof raw === "object" ? raw : {};
  const list = (v) => (Array.isArray(v) ? v.map(String) : []);
  return {
    comp: String(g.comp || ""), drums: String(g.drums || ""), bass: String(g.bass || ""), percussion: String(g.percussion || ""),
    phraseStyles: list(g.phraseStyles), scales: list(g.scales), color: ["dentro", "cromatico", "outside"].includes(g.color) ? g.color : "",
    intensity: INTENSITIES.some((i) => i.id === g.intensity) ? g.intensity : "equilibrado",
    // as viradas (quantas e com que liberdade) e a segunda voz (dueto ou contracanto, e a variação do contracanto)
    drumFill: fillSettings(g.drumFill), bassFill: fillSettings(g.bassFill),
    riff: String(g.riff || ""), riffVariation: Number.isInteger(g.riffVariation) ? g.riffVariation : 0,
    voice2: ["dueto", "contracanto"].includes(g.voice2) ? g.voice2 : "", voice2Variation: Number.isInteger(g.voice2Variation) ? g.voice2Variation : 0,
  };
}

/** JSON do projeto → modelo editável (listas de notas viram texto). */
function toEditable(data) {
  const text = (v) => (Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v));
  const sig = Array.isArray(data.time_signature) ? data.time_signature.join("/") : data.time_signature || "4/4";
  const [num, den] = String(sig).split("/").map(Number);
  const bpb = num && den ? (num * 4) / den : 4;
  const chords = (Array.isArray(data.chords) ? data.chords : []).map((c) => {
    c = c && typeof c === "object" ? c : {};
    let beats = c.duration_beats;
    if (beats == null) beats = c.duration_bars != null ? c.duration_bars * bpb : bpb;
    return {
      id: nextId++,
      symbol: text(c.symbol),
      duration_beats: beats,
      right_hand: text(c.right_hand), left_hand: text(c.left_hand),
      bass: text(c.bass), notes: text(c.notes),
      top_note: text(c.top_note), velocity: c.velocity ?? "", strum: text(c.strum),
      omitted: text(c.omitted), comment: text(c.comment), function: text(c.function), scale: text(c.scale),
      phrase: text(c.phrase), phrase_scale: text(c.phrase_scale), phrase_color: text(c.phrase_color), bass_line: text(c.bass_line), riff: text(c.riff),
      comp: Array.isArray(c.comp) ? c.comp.join(" ; ") : text(c.comp),
      section: text(c.section).trim(),
      request: text(c.request),
    };
  });
  // strum do projeto: objeto {direction, delay_ms} ou só a direção ("up")
  const rawStrum = typeof data.strum === "string" ? { direction: data.strum } : data.strum && typeof data.strum === "object" ? data.strum : {};
  return {
    schema_version: 1,
    title: data.title ?? "Nova progressão",
    tempo: data.tempo ?? 80,
    time_signature: sig,
    middle_c: data.middle_c || "C4",
    default_velocity: data.default_velocity ?? 80,
    strum: { direction: rawStrum.direction ?? "off", delay_ms: rawStrum.delay_ms ?? DEFAULT_STRUM_DELAY_MS },
    comment: data.comment ?? "",
    key: typeof data.key === "string" ? data.key : "",
    style: typeof data.style === "string" ? data.style : "",
    groove: grooveSettings(data.groove),
    drums: Array.isArray(data.drums) ? data.drums.join(" | ") : typeof data.drums === "string" ? data.drums : "",
    percussion: Array.isArray(data.percussion) ? data.percussion.join(" | ") : typeof data.percussion === "string" ? data.percussion : "",
    references: Array.isArray(data.references) ? data.references.join(", ") : typeof data.references === "string" ? data.references : "",
    voice: Array.isArray(data.voice) ? data.voice.join(" ") : typeof data.voice === "string" ? data.voice : "",
    voice2: Array.isArray(data.voice2) ? data.voice2.join(" ") : typeof data.voice2 === "string" ? data.voice2 : "",
    pad: data.pad === true,
    example: data.example === true, // só do app: é a progressão de exemplo (o primeiro pedido cria a música da pessoa no lugar dela)
    chords,
  };
}

/** Modelo editável → JSON enviado ao servidor (sem ids internos). */
function toPayload(project = state.project, { draft = false } = {}) {
  const { chords, example, ...rest } = project;
  if (draft && example) rest.example = true;
  // "request" (o pedido de cada parte) é só do app: fica no rascunho, não vai para o JSON nem para a análise
  return { ...rest, chords: chords.map(({ id, request, shift, ...chord }) => (draft && request ? { ...chord, request } : chord)) };
}

// ---------------------------------------------------------------- análise (motor local)
let validateTimer = null;
function scheduleValidate() {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(validateNow, 200);
  saveDraftSoon();
}

function validateNow() {
  clearTimeout(validateTimer);
  const ids = state.project.chords.map((c) => c.id);
  try {
    const report = analyzeData(toPayload());
    state.report = report;
    state.byId = new Map(ids.map((id, i) => [id, { chord: report.chords[i], issues: [] }]));
    for (const issue of report.issues) {
      if (issue.chord != null) state.byId.get(ids[issue.chord])?.issues.push(issue);
    }
    renderAnalysis();
  } catch (err) {
    console.error(err);
    toast(`Erro inesperado na análise: ${err.message}`, { error: true, timeout: 8000 });
  }
}

// ---------------------------------------------------------------- rascunho
let draftTimer = null;
function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(toPayload(state.project, { draft: true }))); } catch { /* sem armazenamento */ }
  }, 400);
}
function loadDraft() {
  try {
    const data = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    return data && Array.isArray(data.chords) ? data : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- avisos rápidos
function toast(message, { error = false, action = null, timeout = 4500 } = {}) {
  const box = $("#toasts");
  const el = h("div", { class: `toast${error ? " error" : ""}` }, h("p", null, message));
  if (action) el.append(h("button", { type: "button", onclick: () => { action.run(); el.remove(); } }, action.label));
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => el.remove(), action ? Math.max(timeout, 7000) : timeout);
}

function snapshot() {
  const saved = JSON.stringify(state.project);
  return () => {
    state.project = JSON.parse(saved);
    renderAll();
    saveDraftSoon(); // o desfeito também fica salvo para a próxima vez
  };
}

// ---------------------------------------------------------------- configurações do projeto
/** Tom e artistas de referência, em destaque acima da progressão. */
function renderMeta() {
  const p = state.project;
  const refs = String(p.references || "").split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const box = $("#project-meta");
  box.replaceChildren(
    ...(p.key && String(p.key).trim() ? [h("span", { class: "meta-chip key" }, `Tom: ${String(p.key).trim()}`)] : []),
    ...(p.style && String(p.style).trim() ? [h("span", { class: "meta-chip key" }, `Levada: ${String(p.style).trim()}`)] : []),
    ...refs.map((name) => h("span", { class: "meta-chip" }, name)),
  );
  box.hidden = !box.children.length;
}

function renderSettings() {
  const p = state.project;
  const known = styleByLabel(p.style);
  if (known && known.id !== state.groove.style) state.groove.style = known.id;
  $("#title").value = p.title;
  $("#tempo").value = p.tempo;
  $("#default-velocity").value = p.default_velocity;
  $("#middle-c").value = p.middle_c;
  $("#project-comment").value = p.comment || "";
  $("#project-key").value = p.key || "";
  $("#project-refs").value = p.references || "";
  $("#project-style").value = p.style || "";
  $("#project-voice").value = p.voice || "";
  renderMeta();
  const select = $("#time-signature");
  const options = TIME_SIGNATURES.includes(p.time_signature) ? TIME_SIGNATURES : [...TIME_SIGNATURES, p.time_signature];
  select.replaceChildren(...options.map((sig) => h("option", { value: sig }, sig)));
  select.value = p.time_signature;
  renderStrumSettings();
}

/** Atualiza os controles de strum do projeto a partir do estado. */
function renderStrumSettings() {
  const { direction, delay_ms: delay } = state.project.strum;
  document.querySelectorAll("#strum-direction button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === direction)));
  $("#strum-delay-row").hidden = direction === "off";
  $("#strum-delay").value = delay;
  updateStrumDelayInfo();
}

function updateStrumDelayInfo() {
  const { direction, delay_ms: delay } = state.project.strum;
  const ms = toNumber(delay);
  document.querySelectorAll("#strum-presets button").forEach((b) => b.setAttribute("aria-pressed", String(ms === Number(b.dataset.ms))));
  $("#strum-hint").textContent = direction === "off"
    ? "Desligado: as notas de cada acorde começam juntas. Cada acorde pode ligar o strum em “Mais”."
    : `A 1ª nota entra no tempo e cada próxima entra ${Number.isFinite(ms) ? fmt(ms) : "…"} ms depois da anterior, ${STRUM_LABEL[direction] || "…"}. O acorde termina no mesmo instante.`;
}

function bindSettings() {
  const bind = (selector, key, after) => $(selector).addEventListener("input", (e) => {
    state.project[key] = e.target.value;
    after?.();
    scheduleValidate();
  });
  bind("#title", "title");
  bind("#project-comment", "comment");
  bind("#project-key", "key", renderMeta);
  bind("#project-refs", "references", renderMeta);
  bind("#project-style", "style", renderMeta);
  bind("#project-voice", "voice", () => { refreshSecondVoice(); renderGroove(); drawSongRoll(); });
  bind("#tempo", "tempo");
  bind("#default-velocity", "default_velocity", () => {
    for (const chord of state.project.chords) refs.get(chord).velocity.placeholder = state.project.default_velocity || "80";
  });
  bind("#time-signature", "time_signature", () => state.project.chords.forEach(updateDuration));
  $("#middle-c").addEventListener("change", changeConvention);

  document.querySelectorAll("#strum-direction button").forEach((b) => b.addEventListener("click", () => {
    state.project.strum.direction = b.dataset.value;
    renderStrumSettings();
    scheduleValidate();
  }));
  document.querySelectorAll("#strum-presets button").forEach((b) => b.addEventListener("click", () => {
    state.project.strum.delay_ms = Number(b.dataset.ms);
    renderStrumSettings();
    scheduleValidate();
  }));
  $("#strum-delay").addEventListener("input", (e) => {
    state.project.strum.delay_ms = e.target.value; // sem redesenhar o campo enquanto a pessoa digita
    updateStrumDelayInfo();
    scheduleValidate();
  });
}

function changeConvention(e) {
  const to = e.target.value;
  const from = state.project.middle_c;
  if (to === from) return;
  try {
    const converted = renameProjectNotes(toPayload(), to);
    const ids = state.project.chords.map((c) => c.id);
    state.project = toEditable(converted);
    state.project.chords.forEach((c, i) => { if (ids[i]) c.id = ids[i]; });
    renderAll();
    toast(`Nomes reescritos com MIDI 60 = ${to}. As teclas exportadas não mudaram.`);
  } catch {
    e.target.value = from;
    toast("Não foi possível trocar a convenção agora.", { error: true });
  }
}

// ---------------------------------------------------------------- cartões de acorde
function noteField(chord, r, part, placeholder) {
  const id = `f-${chord.id}-${part}`;
  r.inputs[part] = h("input", {
    ...noteInputProps, id, class: "notes", value: chord[part], placeholder,
    "aria-describedby": `${id}-msg`,
    oninput: (e) => { chord[part] = e.target.value; scheduleValidate(); },
  });
  r.msgs[part] = h("span", { class: "field-msg", id: `${id}-msg` });
  return h("label", { class: `field part-field ${PART_CLASS[part]}`, for: id },
    h("span", { class: "label" }, PART_LABEL[part]), r.inputs[part], r.msgs[part]);
}

function chordCard(chord, index, total) {
  const r = { inputs: {}, msgs: {} };
  refs.set(chord, r);
  const n = index + 1;

  // Cabeçalho: número, nome, ponta e ▶
  r.symbol = h("input", {
    type: "text", class: "chord-symbol", value: chord.symbol, placeholder: "Nome do acorde",
    autocomplete: "off", spellcheck: false, "aria-label": `Nome do acorde ${n}`,
    oninput: (e) => { chord.symbol = e.target.value; scheduleValidate(); },
  });
  r.pos = h("span", { class: "chord-pos" });
  r.fn = h("span", { class: "chord-fn" });
  r.note = h("p", { class: "chord-note" }); // a frase de função do acorde: o que ele faz ali
  r.phraseLine = h("p", { class: "chord-phrase", hidden: true });
  r.colorSelect = h("select", {
    "aria-label": `Cor da frase do acorde ${n}`,
    onchange: (e) => {
      const value = e.target.value;
      applyGroove({ phrases: true, before: () => { chord.phrase_color = value; } }, `Cor da frase do acorde ${n}: ${e.target.selectedOptions[0].textContent}.`);
    },
  }, ...COLORS.map(([value, label]) => h("option", { value }, value ? label : "A geral")));
  r.colorSelect.value = chord.phrase_color || "";
  r.colorRow = h("label", { class: "phrase-color", hidden: true }, "Cor da frase", r.colorSelect);
  r.badge = h("span", { class: "ponta-badge", title: "Ponta: a nota mais aguda" });
  const head = h("div", { class: "chord-head" },
    h("span", { class: "chord-index", "aria-hidden": "true" }, n),
    h("div", { style: "flex:1;min-width:0" }, r.symbol, r.fn, r.pos),
    r.badge,
    h("button", { type: "button", class: "btn ghost icon-only", "aria-label": `Ouvir acorde ${n}`, title: "Ouvir este acorde", onclick: () => playOne(chord) }, icon("play")),
    r.toggle = h("button", {
      type: "button", class: "btn ghost small chord-toggle", "aria-expanded": String(openChords.has(chord.id)), "aria-label": `Editar o acorde ${n}`,
      onclick: () => setChordOpen(chord, !openChords.has(chord.id)),
    }, openChords.has(chord.id) ? "Fechar" : "Editar"),
  );

  // O que vai para o MIDI: teclado + notas do grave ao agudo
  r.kb = h("div", { class: "kb", role: "img", "aria-label": "Teclas do voicing" });
  r.spacing = h("p", { class: "spacing" });
  const view = h("div", { class: "voicing-view" }, r.kb, r.spacing);

  const hands = h("div", { class: "hands" },
    noteField(chord, r, "right_hand", "ex.: D4 Eb4 G4 C5"),
    noteField(chord, r, "left_hand", "ex.: B2 A3"),
  );

  // Voicing da mão direita
  const voicingRow = h("div", { class: "field voicing-row" },
    h("span", { class: "label" }, "Voicing da mão direita"),
    h("div", { class: "segmented", role: "group", "aria-label": `Voicing do acorde ${n}` },
      VOICINGS.map((v) => h("button", { type: "button", onclick: () => revoiceChords({ kind: v.id }, chord) }, v.label))));

  // Duração
// a duração é fixa: a melodia e as partes dependem dela (para outro tamanho, crie ou ajuste a parte pelo pedido)
  r.segments = [];
  r.beats = h("input", {
    type: "number", class: "beats-input", value: chord.duration_beats, readonly: "", tabindex: "-1",
    "aria-label": "Duração em tempos de semínima (fixa)", title: "A duração é fixa",
  });
  r.inputs.duration_beats = r.beats;
  r.durHint = h("span", { class: "unit-hint" });
  r.msgs.duration_beats = h("span", { class: "field-msg" });
  const duration = h("div", { class: "field duration" },
    h("span", { class: "label" }, "Duração (fixa)"),
    h("div", { class: "duration-row" }, r.beats),
    r.durHint, r.msgs.duration_beats);

  // Velocity
  const velId = `f-${chord.id}-vel`;
  r.velocity = h("input", {
    id: velId, type: "number", inputmode: "numeric", min: "1", max: "127", step: "1",
    value: chord.velocity, placeholder: String(state.project.default_velocity || 80),
    oninput: (e) => { chord.velocity = e.target.value; scheduleValidate(); },
  });
  r.inputs.velocity = r.velocity;
  r.msgs.velocity = h("span", { class: "field-msg" });
  const velocity = h("label", { class: "field", for: velId }, h("span", { class: "label" }, "Velocity"), r.velocity, r.msgs.velocity);

  // Ponta travada
  const topId = `f-${chord.id}-top`;
  r.top = h("input", {
    ...noteInputProps, id: topId, class: "notes", value: chord.top_note, placeholder: "auto",
    oninput: (e) => { chord.top_note = e.target.value; updateLock(chord); scheduleValidate(); },
  });
  r.inputs.top_note = r.top;
  r.lock = h("button", { type: "button", class: "btn secondary small", onclick: () => toggleLock(chord) });
  r.msgs.top_note = h("span", { class: "field-msg" });
  const ponta = h("div", { class: "field" },
    h("label", { class: "label", for: topId }, "Ponta travada"),
    h("div", { class: "with-button" }, r.top, r.lock), r.msgs.top_note);

  const params = h("div", { class: "chord-params" }, duration, h("div", { class: "params-pair" }, velocity, ponta));

  // Mais opções
  r.omitted = h("input", {
    type: "text", value: chord.omitted, placeholder: "ex.: 5, B", autocomplete: "off",
    oninput: (e) => { chord.omitted = e.target.value; scheduleValidate(); },
  });
  r.inputs.omitted = r.omitted;
  r.msgs.omitted = h("span", { class: "field-msg" });
  r.comment = h("textarea", {
    rows: "2", placeholder: "Ideia, origem da escala, o que testar…",
    oninput: (e) => { chord.comment = e.target.value; updateFn(chord); saveDraftSoon(); },
  });
  r.comment.value = chord.comment;
  r.strum = h("select", {
    id: `f-${chord.id}-strum`,
    onchange: (e) => { chord.strum = e.target.value; scheduleValidate(); },
  }, h("option", { value: "" }, "Seguir o projeto"), h("option", { value: "off" }, "Desligado"),
  h("option", { value: "up" }, "Grave → agudo"), h("option", { value: "down" }, "Agudo → grave"));
  r.strum.value = chord.strum;
  r.inputs.strum = r.strum;
  r.msgs.strum = h("span", { class: "field-msg" });
  const textField = (label, key, placeholder) => h("label", { class: "field" }, h("span", { class: "label" }, label), h("input", {
    type: "text", value: chord[key], placeholder, autocomplete: "off",
    oninput: (e) => { chord[key] = e.target.value; updateFn(chord); saveDraftSoon(); },
  }));
  const phraseField = (label, key, placeholder, wide = false) => {
    const id = `f-${chord.id}-${key}`;
    r.inputs[key] = h("input", {
      id, type: "text", class: "notes", value: chord[key], placeholder, autocomplete: "off", autocapitalize: "off", spellcheck: false,
      oninput: (e) => { chord[key] = e.target.value; scheduleValidate(); },
    });
    r.msgs[key] = h("span", { class: "field-msg" });
    return h("label", { class: `field${wide ? " wide" : ""}`, for: id }, h("span", { class: "label" }, label), r.inputs[key], r.msgs[key]);
  };
  const hasMore = Boolean(chord.strum || chord.bass || chord.notes || chord.omitted); // o comentário e a frase já aparecem no cartão
  r.more = h("details", { class: "more", open: hasMore },
    h("summary", null, "Mais: função, escala, frase, levada, strum, baixo/pedal e comentário"),
    h("div", { class: "more-body" },
      textField("Função (graus)", "function", "ex.: V7alt/ii"),
      textField("Escala ou modo", "scale", "ex.: menor melódica a partir de B"),
      phraseField("Frase (nota/duração, * para o papel)", "phrase", "ex.: G5/8 F5/8 Eb5/4*alvo", true),
      phraseField("Notas da escala (sem oitava)", "phrase_scale", "ex.: B C D Eb F G A", true),
      phraseField("Levada (ritmo do acorde)", "comp", "ex.: E/4 D/8 D/8 E/4 D/4", true),
      phraseField("Linha de baixo (nota/duração)", "bass_line", "ex.: E1/4. B1/8+4 E2/4", true),
      h("label", { class: "field wide", for: `f-${chord.id}-strum` }, h("span", { class: "label" }, "Strum deste acorde"), r.strum, r.msgs.strum),
      noteField(chord, r, "bass", "ex.: E1 (soa junto)"),
      noteField(chord, r, "notes", "ex.: G3 B3"),
      h("label", { class: "field" }, h("span", { class: "label" }, "Notas omitidas (só anotação)"), r.omitted, r.msgs.omitted),
      h("label", { class: "field" }, h("span", { class: "label" }, "Comentário"), r.comment),
    ));

  r.issues = h("ul", { class: "issues" });

  const actions = h("div", { class: "chord-actions" },
    index > 0 && !String(chord.section || "").trim() ? h("button", {
      type: "button", class: "btn ghost small", title: "Começar uma parte nova da música neste acorde",
      onclick: () => { const next = splitSection(state.project.chords, state.project.chords.indexOf(chord)); changeSections(next && { chords: next }, "Parte nova começando neste acorde."); },
    }, "Nova parte aqui") : null,
  );

  // O cartão vem recolhido (nome, função, teclado e frase); "Editar" abre as notas, o voicing e o resto.
  r.body = h("div", { class: "chord-body" }, r.colorRow, hands, voicingRow, params, r.more, actions);
  r.card = h("li", { class: `card chord${openChords.has(chord.id) ? "" : " collapsed"}`, dataset: { id: chord.id } }, head, r.note, view, r.phraseLine, r.issues, r.body);
  updateDuration(chord);
  updateLock(chord);
  updateFn(chord);
  return r.card;
}

/** Abre ou recolhe o cartão de um acorde. */
function setChordOpen(chord, open) {
  if (open) openChords.add(chord.id); else openChords.delete(chord.id);
  const r = refs.get(chord);
  if (!r) return;
  r.card.classList.toggle("collapsed", !open);
  r.toggle.textContent = open ? "Fechar" : "Editar";
  r.toggle.setAttribute("aria-expanded", String(open));
  renderToggleAll();
}

function renderToggleAll() {
  const chords = state.project.chords;
  const allOpen = chords.length > 0 && chords.every((c) => openChords.has(c.id));
  const button = $("#chords-toggle-all");
  button.textContent = allOpen ? "Recolher todos" : "Abrir todos";
  button.hidden = chords.length === 0;
}

/** Função e escala logo abaixo do nome do acorde, e a frase que diz o que ele faz ali: é o que o app ensina em cada acorde. */
function updateFn(chord) {
  const r = refs.get(chord);
  if (!r) return;
  const text = [chord.function, chord.scale].map((t) => String(t || "").trim()).filter(Boolean).join(" · ");
  r.fn.textContent = text;
  r.fn.hidden = !text;
  const note = String(chord.comment || "").trim();
  r.note.textContent = note;
  r.note.hidden = !note;
}

/** A frase melódica do acorde numa linha: as notas, com os alvos em destaque. */
function renderPhraseLine(r, phrase) {
  r.phraseLine.hidden = !phrase;
  r.colorRow.hidden = !phrase;
  if (!phrase) { r.phraseLine.replaceChildren(); return; }
  r.phraseLine.replaceChildren(
    icon("note"),
    ...phrase.events.map((e) => h("span", {
      class: `pn${e.role === "alvo" ? " is-alvo" : e.role === "aprox" ? " is-aprox" : ""}`,
      title: `${e.role ? `${e.role} · ` : ""}MIDI ${e.midi}`,
    }, e.name)),
  );
  r.phraseLine.setAttribute("aria-label", `Frase: ${phrase.events.map((e) => e.name).join(" ")}`);
}

function updateDuration(chord) {
  const r = refs.get(chord);
  if (!r) return;
  const beats = toNumber(chord.duration_beats);
  const bpb = beatsPerBar();
  r.segments.forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(beats - bpb * Number(b.dataset.factor)) < 1e-9)));
  const bars = barsText(beats);
  r.durHint.textContent = `${bars ? `tempos de semínima · = ${bars}` : "tempos de semínima"} · a melodia depende dela`;
}

function updateLock(chord) {
  const r = refs.get(chord);
  const locked = Boolean(String(chord.top_note).trim());
  r.lock.replaceChildren(icon(locked ? "unlock" : "lock"), locked ? "Soltar" : "Travar");
  r.lock.title = locked ? "Voltar à ponta automática" : "Travar a nota mais aguda atual";
}

function toggleLock(chord) {
  const r = refs.get(chord);
  if (String(chord.top_note).trim()) {
    chord.top_note = "";
  } else {
    const top = state.byId.get(chord.id)?.chord?.top;
    if (!top) { toast("Digite as notas do acorde antes de travar a ponta."); return; }
    chord.top_note = top.name;
  }
  r.top.value = chord.top_note;
  updateLock(chord);
  scheduleValidate();
}

function renderChords() {
  const chords = state.project.chords;
  const blocks = sectionBlocks(chords);
  const starts = new Map(blocks.map((b, i) => [b.from, { ...b, index: i }]));
  const items = [];
  let folded = false;
  chords.forEach((c, i) => {
    const block = starts.get(i);
    if (block) folded = blocks.length > 1 && foldedSections.has(c.id);
    if (block && blocks.length > 1) {
      const isFolded = folded;
      items.push(h("li", { class: "section-divider-row" }, h("button", {
        type: "button", class: "section-divider", style: `--hue:${sectionHue(block.name)}`, dataset: { section: block.index }, "aria-expanded": String(!isFolded),
        title: isFolded ? "Mostrar os acordes desta parte" : "Recolher esta parte",
        onclick: () => { if (isFolded) foldedSections.delete(c.id); else foldedSections.add(c.id); renderChords(); },
      }, h("span", { "aria-hidden": "true" }, isFolded ? "▸" : "▾"), `Parte ${block.name}`, h("small", null, `${barsText(block.beats)}${isFolded ? ` · ${block.to - block.from} acorde${block.to - block.from === 1 ? "" : "s"} recolhido${block.to - block.from === 1 ? "" : "s"}` : ""}`))));
    }
    const card = chordCard(c, i, chords.length);
    card.hidden = folded;
    items.push(card);
  });
  $("#chords").replaceChildren(...items);
  renderToggleAll();
  renderForm();
  renderAnalysis();
}

// ---------------------------------------------------------------- partes da música (A, B, C...)
/** A cor de uma parte: a mesma letra tem sempre a mesma cor (A repetido aparece igual). */
const sectionHue = (name) => {
  const text = String(name || "A").toUpperCase();
  const index = text.length === 1 && text >= "A" && text <= "Z" ? text.charCodeAt(0) - 65 : [...text].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return [28, 205, 140, 280, 350, 95, 245, 55][index % 8];
};
let formSelected = -1; // o bloco escolhido na faixa das partes
let formAdding = false; // o "+" está aberto, mostrando os jeitos de criar uma parte

/** A faixa das partes: um bloco por parte, na ordem da música. Arrastar muda a ordem; tocar abre as opções. */
function renderForm() {
  const chords = state.project.chords;
  const blocks = sectionBlocks(chords);
  const strip = $("#form-strip");
  strip.hidden = chords.length < 2 && blocks.length < 2;
  if (formSelected >= blocks.length) formSelected = -1;
  const tiles = blocks.map((b, i) => {
    const tile = h("button", {
      type: "button", class: "form-block", style: `--hue:${sectionHue(b.name)}`, "aria-pressed": String(i === formSelected),
      "aria-label": `Parte ${b.name}, ${barsText(b.beats)}`, dataset: { index: i },
    }, h("strong", null, b.name), h("small", null, barsText(b.beats) || "vazia"));
    bindFormDrag(tile, i);
    return tile;
  });
  tiles.push(h("button", {
    type: "button", class: "form-block add", "aria-label": "Acrescentar uma parte", "aria-pressed": String(formAdding),
    onclick: () => { formAdding = !formAdding; formSelected = -1; renderForm(); },
  }, h("strong", null, "+"), h("small", null, "parte")));
  $("#form-blocks").replaceChildren(...tiles);
  drawSongRoll();
  const actions = $("#form-actions");
  const b = blocks[formSelected];
  if (formAdding && !b) {
    // parte nova: descrever para a IA, cantar a melodia, ou repetir uma parte que já existe
    const name = nextSectionName(chords);
    const option = (label, run, primary = false) => h("button", { type: "button", class: `btn small ${primary ? "primary" : "secondary"}`, onclick: () => { formAdding = false; run(); } }, label);
    const seen = new Set();
    const repeats = blocks.map((block, index) => ({ block, index })).filter(({ block }) => !seen.has(block.name) && seen.add(block.name));
    actions.hidden = false;
    actions.replaceChildren(
      h("span", { class: "who" }, `Como criar a parte ${name}?`),
      option("Descrever para a IA", () => describeNewSection(), true),
      option("Cantar a melodia", () => { renderForm(); $("#canto-open").click(); $('#canto-target [data-target="nova"]')?.click(); }),
      ...repeats.map(({ block, index }) => option(`Repetir a parte ${block.name}`, () => repeatAtEnd(index))),
    );
    return;
  }
  actions.hidden = !b;
  if (!b) return;
  const i = formSelected;
  const button = (label, run, { disabled = false, danger = false, iconName = null } = {}) => h("button", {
    type: "button", class: `btn ghost small${danger ? " danger" : ""}`, disabled, onclick: run,
  }, iconName ? icon(iconName) : null, label);
  const rename = h("input", {
    type: "text", class: "form-rename", value: b.name, maxlength: "24", "aria-label": "Nome da parte", autocomplete: "off",
    onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } },
    onchange: (e) => {
      const name = e.target.value.trim();
      if (!name || name === b.name) { e.target.value = b.name; return; }
      const chordsNow = renameSection(state.project.chords, i, name);
      changeSections(chordsNow && { chords: chordsNow }, `Parte renomeada para ${name}.`, i);
    },
  });
  actions.replaceChildren(
    h("label", { class: "who" }, "Parte", rename),
    button("Ouvir", () => playRange(b.from, b.to), { iconName: "play" }),
    button("Ouvir daqui", () => playRange(b.from, chords.length), { disabled: i === blocks.length - 1 }),
    // tocar no bloco não rola a tela: quem quiser ir até o pedido ou até os acordes da parte usa estes botões
    button("Pedido à IA", () => selectPart(i, { focus: true })),
    button("Ver acordes", () => $(`.section-divider[data-section="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })),
    button("◀ Antes", () => changeSections(moveSection(state.project, i, i - 1), `Parte ${b.name} foi para antes.`, i - 1), { disabled: i === 0 }),
    button("Depois ▶", () => changeSections(moveSection(state.project, i, i + 1), `Parte ${b.name} foi para depois.`, i + 1), { disabled: i === blocks.length - 1 }),
    button("Repetir", () => changeSections(repeatSection(state.project, i), `Parte ${b.name} repetida (acordes e melodia).`, i + 1), { iconName: "copy" }),
    button("Juntar à anterior", () => {
      const chordsNow = joinSection(state.project.chords, i);
      changeSections(chordsNow && { chords: chordsNow }, `Parte ${b.name} juntada à anterior.`, i - 1);
    }, { disabled: i === 0 }),
    button("Apagar", () => changeSections(removeSection(state.project, i), `Parte ${b.name} apagada (acordes e melodia).`, -1), { disabled: blocks.length < 2, danger: true, iconName: "trash" }),
  );
}

/** Ouve só um trecho: do acorde `from` até antes do `to`. Com "Repetir" ligado, o trecho fica em laço. */
function playRange(from, to) {
  stopPlayback();
  state.listen.range = { from, to };
  playAll();
}

/**
 * A melodia ao longo das partes: uma faixa colorida por parte, as notas da Voz por cima e, tocando, a linha que corre e a
 * nota que soa acesa. Um toque ouve a partir da parte que está embaixo do dedo.
 */
function drawSongRoll() {
  const canvas = $("#song-roll");
  const chords = state.project.chords;
  const blocks = sectionBlocks(chords);
  const notes = voiceNotes(state.project.voice, state.project.middle_c) || [];
  const total = blocks.reduce((sum, b) => sum + b.beats, 0);
  canvas.hidden = !notes.length || total <= 0;
  if (canvas.hidden) return;
  const width = canvas.clientWidth || 320;
  const height = 72;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  const g = canvas.getContext("2d");
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);
  const css = getComputedStyle(document.documentElement);
  const color = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const x = (beat) => (beat / total) * width;
  blocks.forEach((b) => {
    g.fillStyle = `hsl(${sectionHue(b.name)} 60% 50% / .18)`;
    g.fillRect(x(b.startBeat), 0, x(b.beats), height);
    g.fillStyle = color("--muted", "#666");
    g.font = "bold 11px system-ui, sans-serif";
    g.fillText(b.name, x(b.startBeat) + 4, 12);
    g.fillStyle = color("--border-strong", "#bbb");
    g.fillRect(x(b.startBeat), 0, 1, height);
  });
  const pitches = notes.map((n) => n.midi);
  const low = Math.min(...pitches) - 1;
  const high = Math.max(...pitches) + 1;
  const y = (midi) => 18 + ((high - midi) / Math.max(1, high - low)) * (height - 28);
  const clock = state.clock;
  const playhead = clock ? clock.fromBeat + Math.max(0, (performance.now() - clock.start) / 1000 / clock.secondsPerBeat) : null;
  const visible = playhead !== null && playhead <= clock.fromBeat + clock.beats;
  for (const n of notes) {
    const from = n.start / TICKS_PER_BEAT;
    const length = n.length / TICKS_PER_BEAT;
    const lit = visible && playhead >= from && playhead < from + length;
    g.fillStyle = lit ? color("--primary", "#a85a00") : color("--muted", "#666");
    g.globalAlpha = visible && !lit ? 0.55 : 1;
    g.fillRect(x(from), y(n.midi) - (lit ? 4 : 2.5), Math.max(2, x(length) - 1), lit ? 8 : 5);
  }
  g.globalAlpha = 1;
  if (visible) {
    g.fillStyle = color("--primary", "#a85a00");
    g.fillRect(x(playhead) - 1, 0, 2, height);
  }
}

/** Aplica uma mudança nas partes ({ chords, voice? }), com Desfazer. `select`: o bloco que fica escolhido depois. */
function changeSections(result, message, select = -1) {
  if (!result) {
    toast("Não deu para mudar as partes. Se a Voz tiver um erro de escrita, corrija-o primeiro (em “Sobre esta progressão”).", { error: true });
    return;
  }
  const undo = snapshot();
  stopPlayback();
  state.project.chords = result.chords.map((c) => ({ ...c, id: c.id ?? nextId++ }));
  state.project.example = false; // mexeu nas partes: a música passa a ser da pessoa
  if (result.voice !== undefined) state.project.voice = result.voice;
  refreshSecondVoice();
  formSelected = select;
  renderAll();
  toast(message, { action: { label: "Desfazer", run: undo } });
}

/** Parte nova por texto: reserva 4 compassos vazios (a IA decide o tamanho de verdade) e leva a pessoa ao pedido, vazio. */
function describeNewSection() {
  const chords = state.project.chords;
  const name = nextSectionName(chords);
  const bpb = beatsPerBar();
  const next = chords.map((c, i) => (i === 0 && !String(c.section || "").trim() ? { ...c, section: "A" } : c));
  for (let k = 0; k < 4; k++) next.push(blankChord({ duration_beats: bpb, section: k === 0 ? name : "" }));
  const index = sectionBlocks(next).length - 1;
  changeSections({ chords: next }, `Parte ${name} criada. Escreva o pedido dela e copie para a sua IA.`, index);
  selectPart(index, { focus: true });
}

/** Repete uma parte no fim da música (acordes e melodia). */
function repeatAtEnd(index) {
  const copied = repeatSection(state.project, index);
  if (!copied) { changeSections(null); return; }
  const count = sectionBlocks(copied.chords).length;
  const name = sectionBlocks(state.project.chords)[index].name;
  const moved = index + 1 === count - 1 ? copied : moveSection({ ...state.project, ...copied }, index + 1, count - 1);
  changeSections(moved, `Parte ${name} repetida no fim (acordes e melodia).`, count - 1);
}

/** Arrastar um bloco para o lugar de outro (dedo ou mouse). Um toque sem arrastar escolhe o bloco. */
function bindFormDrag(tile, index) {
  let start = null;
  let dragging = false;
  let target = null;
  const clear = () => document.querySelectorAll(".form-block.drop-target").forEach((el) => el.classList.remove("drop-target"));
  tile.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    start = { x: event.clientX, y: event.clientY };
    dragging = false;
    target = null;
    tile.setPointerCapture?.(event.pointerId);
  });
  tile.addEventListener("pointermove", (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!dragging && Math.hypot(dx, dy) < 10) return;
    dragging = true;
    tile.classList.add("dragging");
    tile.style.transform = `translate(${dx}px, ${dy}px)`;
    tile.style.pointerEvents = "none"; // para achar o bloco que está embaixo do dedo
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".form-block:not(.add)");
    tile.style.pointerEvents = "";
    clear();
    target = under && under !== tile ? Number(under.dataset.index) : null;
    if (target !== null) under.classList.add("drop-target");
  });
  const end = (event) => {
    if (!start) return;
    const wasDragging = dragging;
    start = null;
    dragging = false;
    tile.classList.remove("dragging");
    tile.style.transform = "";
    clear();
    try { tile.releasePointerCapture?.(event.pointerId); } catch { /* já solto */ }
    if (wasDragging) {
      if (target !== null && target !== index) {
        const name = sectionBlocks(state.project.chords)[index]?.name;
        changeSections(moveSection(state.project, index, target), `Parte ${name} mudou de lugar.`, target);
      }
      return;
    }
    if (event.type === "pointercancel") return;
    formSelected = formSelected === index ? -1 : index;
    formAdding = false;
    if (formSelected >= 0) selectPart(index);
    renderForm();
  };
  tile.addEventListener("pointerup", end);
  tile.addEventListener("pointercancel", end);
  tile.addEventListener("keydown", (event) => { // teclado: Enter/espaço escolhe (o arrasto fica nos botões Antes/Depois)
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    formSelected = formSelected === index ? -1 : index;
    formAdding = false;
    if (formSelected >= 0) selectPart(index);
    renderForm();
  });
}

function renderAll() {
  renderSettings();
  renderChords();
  validateNow();
  saveDraftSoon();
}

// ---------------------------------------------------------------- análise na tela
const ISSUE_ICON = { error: "error", warning: "warning", info: "info" };
const issueItem = (issue) => h("li", { class: `issue ${issue.level}` }, icon(ISSUE_ICON[issue.level]), h("span", null, issue.message));

/**
 * O guia do topo: uma linha que diz o próximo passo, conforme o que a música já tem (melodia, harmonia, parte nova
 * esperando a harmonia, erros), com os botões que levam até lá.
 */
function renderGuide() {
  const p = state.project;
  const hasVoice = Boolean(String(p.voice || "").trim());
  const harmony = hasProgression();
  const errors = (state.report?.issues || []).filter((i) => i.level === "error").length;
  const waiting = harmony ? getParts().find((part) => part.empty) ?? null : null;
  const go = (selector) => () => $(selector).scrollIntoView({ behavior: "smooth", block: "start" });
  const button = (label, run, primary = false) => h("button", { type: "button", class: `btn small ${primary ? "primary" : "secondary"}`, onclick: run }, label);
  const sing = () => $("#canto-open").click();
  let step;
  let text;
  let actions;
  if (errors) {
    step = "Corrigir";
    text = errors === 1 ? "Há 1 erro para corrigir antes de gerar o MIDI." : `Há ${errors} erros para corrigir antes de gerar o MIDI.`;
    actions = [button("Ver o primeiro erro", focusFirstError, true)];
  } else if (!hasVoice && !harmony) {
    step = "Passo 1";
    text = "Comece cantando uma melodia, ou descreva a progressão que você quer.";
    actions = [button("Cantar uma melodia", sing, true), button("Escrever o pedido", () => { go("#assistant")(); $("#ai-prompt").focus({ preventScroll: true }); })];
  } else if (hasVoice && !harmony) {
    step = "Passo 2";
    text = "A melodia está pronta. Agora peça a harmonia: copie o pedido para a sua IA e abra o link que ela mandar.";
    actions = [button("Ir para o pedido", go("#assistant"), true), button("Cantar de novo", sing)];
  } else if (waiting) {
    step = `Parte ${waiting.name}`;
    text = waiting.melody
      ? `A parte ${waiting.name} já tem melodia; falta a harmonia. Copie o pedido dela para a sua IA.`
      : `A parte ${waiting.name} está vazia. Escreva o pedido dela e copie para a sua IA.`;
    actions = [button(`Ir para o pedido da parte ${waiting.name}`, () => selectPart(waiting.index, { focus: true }), true)];
  } else {
    step = hasVoice ? "Passo 3" : "Passo 2";
    text = "Ouça e ajuste. Depois, crie a próxima parte (no “+” das partes) ou gere o MIDI.";
    actions = [
      button("Ouvir", () => { state.listen.range = null; if (!state.playing) playAll(); }, true),
      button("Criar a próxima parte", () => { formAdding = true; formSelected = -1; renderForm(); $("#song").scrollIntoView({ behavior: "smooth", block: "start" }); }),
      button("Gerar MIDI", exportMidi),
    ];
  }
  $("#guide-step").textContent = step;
  $("#guide-text").textContent = text;
  $("#guide-actions").replaceChildren(...actions);
  $("#guide").hidden = false;
}

function renderAnalysis() {
  const p = state.project;
  const report = state.report;
  const middleC = report?.middle_c || p.middle_c;

  // Mesma faixa de teclado em todos os cartões: fica fácil ver as vozes andando.
  const all = [];
  for (const chord of p.chords) for (const note of state.byId.get(chord.id)?.chord?.notes || []) all.push(note.midi);
  const [low, high] = keyboardRange(all);

  let start = 0;
  const bpb = beatsPerBar();
  p.chords.forEach((chord) => {
    const r = refs.get(chord);
    if (!r) return;
    const entry = state.byId.get(chord.id);
    const info = entry?.chord;
    const issues = entry?.issues || [];

    const bar = Math.floor(start / bpb + 1e-9) + 1;
    const beatInBar = start - (bar - 1) * bpb + 1;
    r.pos.textContent = Math.abs(beatInBar - 1) < 1e-9 ? `compasso ${bar}` : `compasso ${bar} · tempo ${fmt(beatInBar)}`;
    const beats = toNumber(chord.duration_beats);
    start += Number.isFinite(beats) && beats > 0 ? beats : 0;

    renderKeyboard(r.kb, { low, high, notes: info?.notes || [], top: info?.top?.midi ?? null, middleC });
    r.card.classList.toggle("is-rest", Boolean(info?.is_rest));

    // Ponta
    r.badge.replaceChildren();
    if (info?.top) r.badge.append(icon(info.top_locked ? "lock" : "note"), info.top.name);
    r.top.placeholder = info?.top ? `auto · ${info.top.name}` : "auto";

    renderPhraseLine(r, info?.phrase ?? null);

    // Fichas
    if (!info) {
      r.spacing.textContent = "";
    } else if (info.is_rest) {
      r.spacing.textContent = `Pausa · silêncio de ${barsText(info.duration_beats) || `${fmt(info.duration_beats)} tempos`}`;
    } else {
      const parts = [info.notes.map((n) => n.name).join(" ")]; // as notas, do grave ao agudo, numa linha só
      if (info.strum && info.strum !== "off") parts.push(`strum ${STRUM_LABEL[info.strum]}, ${fmt(report.strum_delay_ms)} ms`);
      if (info.comp) parts.push("com levada");
      if (info.spacing.length) parts.push(`intervalos entre vozes: ${info.spacing.join(" · ")} semitons`);
      if (info.doublings.length) parts.push(`dobras: ${info.doublings.join(", ")}`);
      r.spacing.textContent = parts.join(" — ");
    }

    // Erros por campo; avisos e notas embaixo
    let hasError = false;
    for (const field of CHORD_FIELDS) {
      const messages = issues.filter((i) => i.level === "error" && i.field === field).map((i) => i.message);
      if (r.msgs[field]) r.msgs[field].textContent = messages.join(" ");
      if (r.inputs[field]) r.inputs[field].setAttribute("aria-invalid", String(messages.length > 0));
      if (messages.length) {
        hasError = true;
        if (["bass", "notes", "omitted", "strum", "phrase", "phrase_scale", "comp", "bass_line"].includes(field)) r.more.open = true;
      }
    }
    const rest = issues.filter((i) => !(i.level === "error" && CHORD_FIELDS.includes(i.field)));
    if (rest.some((i) => i.level === "error")) hasError = true;
    r.issues.replaceChildren(...rest.map(issueItem));
    r.card.classList.toggle("has-error", hasError);
  });

  // Problemas do projeto (BPM, compasso…)
  const projectIssues = (report?.issues || []).filter((i) => i.chord == null);
  $("#project-issues").replaceChildren(...projectIssues.map(issueItem));
  for (const [selector, field] of [["#tempo", "tempo"], ["#time-signature", "time_signature"], ["#default-velocity", "default_velocity"], ["#strum-delay", "strum"]]) {
    $(selector).setAttribute("aria-invalid", String(projectIssues.some((i) => i.field === field && i.level === "error")));
  }

  renderPhraseMode();
  renderGroove();
  updateSoundPhraseField();
  renderSummary();
  renderGuide();
  assistant?.refresh();
}

/** O seletor "ouvir e exportar" só aparece quando alguma frase tem notas. */
function renderPhraseMode() {
  const any = (state.report?.chords || []).some((c) => c.phrase);
  $("#phrase-mode-box").hidden = !any;
  renderMixer();
  $("#voice-edit").hidden = !String(state.project.voice || "").trim();
  document.querySelectorAll("#phrase-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.phraseMode)));
}

function renderSummary() {
  const report = state.report;
  const errors = (report?.issues || []).filter((i) => i.level === "error").length;
  const t = report?.totals;
  if (t) {
    const seconds = Math.round(t.seconds);
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const bars = t.bars === 1 ? "1 compasso" : `${fmt(t.bars)} compassos`;
    const bpm = toNumber(state.project.tempo);
    $("#summary").replaceChildren(
      h("strong", null, bars),
      `${t.chords} ${t.chords === 1 ? "acorde" : "acordes"} · ${time}${bpm > 0 ? ` · ${fmt(bpm)} BPM` : ""}`,
    );
  }
  const exportBtn = $("#export");
  exportBtn.replaceChildren(icon("download"), "Gerar MIDI");
  if (errors) exportBtn.append(h("span", { class: "badge-count", title: `${errors} erro(s)` }, errors));
}

// ---------------------------------------------------------------- ações
function addChord(extra = {}) {
  const chord = blankChord(extra);
  state.project.chords.push(chord);
  openChords.add(chord.id); // acorde novo já vem aberto, para escrever as notas
  renderChords();
  validateNow();
  saveDraftSoon();
  const r = refs.get(chord);
  r.card.scrollIntoView({ behavior: "smooth", block: "center" });
  if (!extra.symbol) r.symbol.focus({ preventScroll: true });
}

function moveChord(chord, delta) {
  const list = state.project.chords;
  const i = list.indexOf(chord);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  [list[i].section, list[j].section] = [list[j].section, list[i].section]; // as marcas das partes ficam onde estavam
  renderChords();
  validateNow();
  saveDraftSoon();
  refs.get(chord).card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Muda o voicing da mão direita de um acorde (ou de todos): fechado, aberto, drop 2, drop 3, ou ponta pedal. */
function revoiceChords({ kind = null, pedal = null }, only = null) {
  const targets = only ? [only] : state.project.chords;
  const undo = snapshot();
  const middleC = state.project.middle_c;
  let changed = 0;
  let skipped = 0;
  let added = 0;
  let firstReason = "";
  try {
    for (const chord of targets) {
      const result = revoiceChord(chord, { kind, pedal, middleC });
      if (result.skipped) { skipped += 1; firstReason ||= result.skipped; continue; }
      chord[result.field] = result.text;
      if (pedal) chord.top_note = result.top; // a ponta agora é o pedal: a trava acompanha
      changed += 1;
      if (result.added) added += 1;
    }
  } catch {
    toast("Ponta pedal: use uma nota com oitava, como F#5 ou C5.", { error: true });
    return;
  }
  if (!changed) { toast(`Nada mudou (${firstReason}).`); return; }
  renderChords();
  validateNow();
  saveDraftSoon();
  const what = pedal ? `Ponta pedal ${pedal}` : VOICINGS.find((v) => v.id === kind).label;
  const notes = [
    `${what}: ${changed} ${changed === 1 ? "acorde mudou" : "acordes mudaram"}.`,
    skipped ? ` ${skipped} ficaram como estavam (${firstReason}).` : "",
    added ? ` Em ${added} a nota não fazia parte do acorde: ouça a tensão.` : "",
  ].join("");
  toast(notes, { action: { label: "Desfazer", run: undo }, timeout: 7000 });
}

function duplicateChord(chord) {
  const list = state.project.chords;
  const copy = { ...chord, id: nextId++, section: "" };
  if (openChords.has(chord.id)) openChords.add(copy.id);
  list.splice(list.indexOf(chord) + 1, 0, copy);
  const entry = state.byId.get(chord.id);
  if (entry) state.byId.set(copy.id, { chord: entry.chord, issues: [] });
  renderChords();
  validateNow();
  saveDraftSoon();
  refs.get(copy).card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function removeChord(chord) {
  const undo = snapshot();
  const list = state.project.chords;
  const index = list.indexOf(chord);
  const mark = String(chord.section || "").trim();
  list.splice(index, 1);
  if (mark && list[index] && !String(list[index].section || "").trim()) list[index].section = mark; // a parte continua, a partir do acorde seguinte
  renderChords();
  validateNow();
  saveDraftSoon();
  toast(`Acorde ${index + 1}${chord.symbol ? ` (${chord.symbol})` : ""} removido.`, { action: { label: "Desfazer", run: undo } });
}

/**
 * O projeto que a pré-escuta toca: a progressão inteira ou um acorde só (no máximo ~4 s, se ele não tiver frase nem levada).
 * É lido pelo motor como na exportação, então o que se ouve é o que sai no arquivo.
 */
function previewProject(only = null) {
  const { project } = readProject(toPayload());
  const index = only ? state.project.chords.indexOf(only) : -1;
  project.tempo *= state.listen.rate; // andamento de estudo: só na escuta
  let offset = 0; // quantos acordes ficaram para trás (ao ouvir só um trecho)
  let fromBeat = 0;
  if (only) {
    project.chords = [project.chords[index]];
    const [chord] = project.chords;
    if (!chord.phrase_events.length && !chord.comp_layers.length) chord.duration_beats = Math.min(chord.duration_beats, (project.tempo / 60) * 4);
    project.drum_bars = []; // um acorde só: sem a bateria
    project.percussion_bars = [];
    project.voice_events = []; // nem a Voz (ela é da música inteira)
  } else if (state.listen.range) {
    // só um trecho (uma parte, ou dali até o fim): os acordes dele e a Voz que está em cima
    const { from, to } = state.listen.range;
    const ticks = (list) => list.reduce((sum, c) => sum + beatsToTicks(c.duration_beats), 0);
    const startTick = ticks(project.chords.slice(0, from));
    const endTick = startTick + ticks(project.chords.slice(from, to));
    fromBeat = startTick / TICKS_PER_BEAT;
    project.voice_events = project.voice_events.filter((e) => e.start >= startTick && e.start < endTick).map((e) => ({ ...e, start: e.start - startTick }));
    project.chords = project.chords.slice(from, to);
    offset = from;
  }
  return { project, index, offset, fromBeat };
}

// ---------------------------------------------------------------- mixer (só para ouvir)
const MIX_KEY = "harmona-lab:mix";
const mixOf = (part) => ({ on: true, gain: 1, ...(state.mix[part] || {}) });
const mixGain = (part) => (mixOf(part).on ? mixOf(part).gain : 0);
function loadMix() {
  try { const saved = JSON.parse(localStorage.getItem(MIX_KEY) || "{}"); if (saved && typeof saved === "object") state.mix = saved; } catch { /* fica o padrão */ }
}
function saveMix() {
  try { localStorage.setItem(MIX_KEY, JSON.stringify(state.mix)); } catch { /* sem armazenamento */ }
}

/** O mixer mostra só as partes que a música tem agora. */
function renderMixer() {
  let present = [];
  try { if (state.report?.ok) present = partsPresent(readProject(toPayload()).project, { phraseMode: state.phraseMode }); } catch { /* projeto com erro */ }
  const box = $("#mixer");
  box.hidden = present.length < 2;
  const off = present.filter((id) => !mixOf(id).on).map((id) => MIDI_PARTS.find((p) => p.id === id).label);
  $("#mixer-summary").textContent = off.length ? `desligado: ${off.join(", ")}` : "todas as partes ligadas";
  $("#mixer-rows").replaceChildren(...MIDI_PARTS.filter((p) => present.includes(p.id)).map((p) => {
    const m = mixOf(p.id);
    const change = (patch) => {
      state.mix[p.id] = { ...mixOf(p.id), ...patch };
      saveMix();
      if (state.playing) stopPlayback();
      renderMixer();
    };
    return h("div", { class: `mixer-row${m.on ? "" : " off"}`, dataset: { part: p.id } },
      h("label", null, h("input", { type: "checkbox", checked: m.on, onchange: (e) => change({ on: e.target.checked }) }), h("span", null, p.label)),
      h("input", { type: "range", min: "0.2", max: "1.5", step: "0.05", value: String(m.gain), disabled: !m.on, "aria-label": `Volume: ${p.label}`, onchange: (e) => change({ gain: Number(e.target.value) }) }));
  }));
}

/** Timbre simples: toca a lista de notas do motor (acordes, levada, strum e frase), já com o mixer. */
function playSimple(project, index, { onEnd, offset = 0, fromBeat = 0 }) {
  const seconds = 60 / project.tempo / TICKS_PER_BEAT;
  const { notes: all, starts, end } = noteEvents(project, { phraseMode: state.phraseMode });
  const notes = all.filter((n) => mixGain(notePart(n)) > 0)
    .map((n) => ({ ...n, velocity: Math.max(1, Math.min(127, Math.round(n.velocity * mixGain(notePart(n))))) }));
  player.play(
    notes.map((n) => ({ midi: n.pitch, start: n.start * seconds, length: (n.end - n.start) * seconds, velocity: n.velocity, drum: n.channel === DRUM_CHANNEL, pad: Boolean(n.pad) })),
    {
      steps: starts.map((tick, i) => ({ time: tick * seconds, index: index >= 0 ? index : offset + i })),
      total: end * seconds, onStep: (i) => setPlaying(i), onEnd,
    },
  );
  if (index < 0) startClock({ secondsPerBeat: 60 / project.tempo, fromBeat, beats: end / TICKS_PER_BEAT, delay: 60 });
  return notes.filter((n) => n.channel !== DRUM_CHANNEL).length;
}

/** A linha que corre na melodia das partes enquanto a música toca. */
function startClock({ secondsPerBeat, fromBeat, beats, delay = 0 }) {
  state.clock = { start: performance.now() + delay, secondsPerBeat, fromBeat, beats };
  const tick = () => {
    if (!state.clock) return;
    drawSongRoll();
    state.clock.frame = requestAnimationFrame(tick);
  };
  tick();
}
function stopClock() {
  if (!state.clock) return;
  cancelAnimationFrame(state.clock.frame);
  state.clock = null;
  drawSongRoll();
}

function setPlaying(index) {
  state.project.chords.forEach((c, i) => refs.get(c)?.card.classList.toggle("is-playing", i === index));
}

function renderPlayButton() {
  const label = state.playing ? "Parar" : "Ouvir";
  const button = $("#play-all");
  button.replaceChildren(icon(state.playing ? "stop" : "play"), h("span", { class: "btn-text" }, label));
  button.setAttribute("aria-label", state.playing ? "Parar a pré-escuta" : "Ouvir a progressão (pré-escuta simples)");
}

function stopPlayback() {
  stopClock();
  player.stop();
  soundFont.stop();
  soundTimers.forEach(clearTimeout);
  soundTimers = [];
  state.playing = false;
  setPlaying(-1);
  renderPlayButton();
}

async function playAll() {
  if (state.playing) return stopPlayback();
  if (usingSoundFont()) soundFont.unlock(); // no toque, antes de esperar qualquer coisa (exigência do iPhone)
  await validateNow();
  state.playing = true;
  renderPlayButton();
  await startAll();
}

/** Toca a progressão inteira; com "Repetir" ligado, recomeça quando chega ao fim. */
async function startAll() {
  const onEnd = () => {
    if (state.playing && state.listen.loop) { soundTimers.forEach(clearTimeout); soundTimers = []; stopClock(); startAll(); } else stopPlayback();
  };
  if (usingSoundFont() && (await playWithSoundFont(null, onEnd))) return;
  const { project, offset, fromBeat } = previewProject();
  playSimple(project, -1, { onEnd, offset, fromBeat });
}

async function playOne(chord) {
  stopPlayback();
  if (usingSoundFont()) soundFont.unlock();
  await validateNow();
  if (usingSoundFont() && (await playWithSoundFont(chord))) return;
  const { project, index } = previewProject(chord);
  if (!playSimple(project, index, { onEnd: () => setPlaying(-1) })) { player.stop(); toast("Este acorde ainda não tem notas válidas."); }
}

/**
 * Reescreve a segunda voz a partir da Voz, dos acordes e do estilo de agora (ou apaga, se estiver desligada ou sem a Voz).
 * É chamada sempre que um deles muda. Devolve os avisos do gerador.
 */
function refreshSecondVoice() {
  const p = state.project;
  const mode = p.groove?.voice2 || "";
  if (!mode || !String(p.voice || "").trim()) { p.voice2 = ""; return []; }
  try {
    const { voice2, ...data } = toPayload();
    const result = generateSecondVoice(data, { mode, style: grooveStyle(), variation: p.groove.voice2Variation || 0 });
    p.voice2 = result.text;
    return result.notes;
  } catch {
    p.voice2 = ""; // projeto com erro de escrita: a segunda voz volta quando ele for corrigido
    return [];
  }
}

// ---------------------------------------------------------------- ritmo e frases (escritos pelo app, sem IA)
const grooveStyle = () => findStyle(state.groove.style) ?? STYLES[0];
const anyChord = (key) => state.project.chords.some((c) => String(c[key] || "").trim());

function saveGroove() {
  try { localStorage.setItem(GROOVE_KEY, JSON.stringify(state.groove)); } catch { /* sem armazenamento */ }
}

function loadGroove() {
  try {
    const saved = JSON.parse(localStorage.getItem(GROOVE_KEY) || "null");
    if (saved && findStyle(saved.style)) {
      state.groove = { style: saved.style, variation: Number.isInteger(saved.variation) ? saved.variation : 0, drumVariation: Number.isInteger(saved.drumVariation) ? saved.drumVariation : 0 };
    }
  } catch { /* fica o padrão */ }
}

/** O painel: estilo, levada e o interruptor das frases, sempre a partir do que a progressão tem agora. */
function renderGroove() {
  if (!state.project) return;
  const style = grooveStyle();
  const styleSelect = $("#groove-style");
  if (!styleSelect.children.length) styleSelect.replaceChildren(...STYLES.map((s) => h("option", { value: s.id }, s.label)));
  styleSelect.value = style.id;
  $("#groove-info").textContent = `${style.summary} Influências: ${style.influences.join(", ")}.`;

  const options = compOptions(style);
  const hasComp = anyChord("comp");
  const chosen = state.project.groove?.comp || "";
  const value = !hasComp ? "" : options.some((o) => o.id === chosen) ? chosen : CUSTOM_COMP;
  const group = (label, kind) => h("optgroup", { label }, ...options.filter((o) => o.kind === kind).map((o) => h("option", { value: o.id }, o.label)));
  $("#groove-comp").replaceChildren(
    h("option", { value: "" }, "Desligada (acorde inteiro)"),
    group("Levadas", "levada"),
    group("Ostinatos e riffs", "ostinato"),
    ...(value === CUSTOM_COMP ? [h("option", { value: CUSTOM_COMP }, "Personalizada (do projeto)")] : []),
  );
  $("#groove-comp").value = value;

  const beats = beatOptions(style);
  const hasDrums = Boolean(String(state.project.drums || "").trim());
  const beat = state.project.groove?.drums || "";
  const drumValue = !hasDrums ? "" : beats.some((o) => o.id === beat) ? beat : CUSTOM_COMP;
  $("#groove-drums").replaceChildren(
    h("option", { value: "" }, "Desligada"),
    ...beats.map((o) => h("option", { value: o.id }, o.label)),
    ...(drumValue === CUSTOM_COMP ? [h("option", { value: CUSTOM_COMP }, "Personalizada (do projeto)")] : []),
  );
  $("#groove-drums").value = drumValue;
  const lines = bassOptions(style);
  const hasBass = anyChord("bass_line");
  const bassId = state.project.groove?.bass || "";
  const bassValue = !hasBass ? "" : lines.some((o) => o.id === bassId) ? bassId : CUSTOM_COMP;
  $("#groove-bass").replaceChildren(
    h("option", { value: "" }, "Desligado"),
    ...lines.map((o) => h("option", { value: o.id }, o.label)),
    ...(bassValue === CUSTOM_COMP ? [h("option", { value: CUSTOM_COMP }, "Personalizado (do projeto)")] : []),
  );
  $("#groove-bass").value = bassValue;
  const percs = percussionOptions(style);
  const hasPerc = Boolean(String(state.project.percussion || "").trim());
  const percId = state.project.groove?.percussion || "";
  const percValue = !hasPerc ? "" : percs.some((o) => o.id === percId) ? percId : CUSTOM_COMP;
  $("#groove-percussion").replaceChildren(
    h("option", { value: "" }, "Desligada"),
    ...percs.map((o) => h("option", { value: o.id }, o.label)),
    ...(percValue === CUSTOM_COMP ? [h("option", { value: CUSTOM_COMP }, "Personalizada (do projeto)")] : []),
  );
  $("#groove-percussion").value = percValue;
  const drumFills = hasDrums && drumValue !== CUSTOM_COMP;
  const bassFills = hasBass && bassValue !== CUSTOM_COMP;
  $("#groove-fill-row").hidden = !(drumFills || bassFills);
  $("#fills-drums").hidden = !drumFills;
  $("#fills-bass").hidden = !bassFills;
  const fills = state.project.groove;
  const labelOf = (list, id) => list.find((x) => x.id === id)?.label.toLowerCase() ?? "normal";
  $("#fills-summary").textContent = [
    drumFills ? `bateria: ${labelOf(FILL_FREQUENCIES, fills.drumFill.frequency)}, ${labelOf(FILL_FREEDOMS, fills.drumFill.freedom)}` : "",
    bassFills ? `baixo: ${labelOf(FILL_FREQUENCIES, fills.bassFill.frequency)}, ${labelOf(FILL_FREEDOMS, fills.bassFill.freedom)}` : "",
  ].filter(Boolean).join(" · ");
  const segmented = (selector, list, key, field, what) => $(selector).replaceChildren(...list.map((x) => h("button", {
    type: "button", "aria-pressed": String(fills[key][field] === x.id),
    onclick: () => {
      const g = state.project.groove;
      const drums = key === "drumFill" && g.drums && g.drums !== CUSTOM_COMP ? g.drums : undefined;
      const bass = key === "bassFill" && g.bass && g.bass !== CUSTOM_COMP ? g.bass : undefined;
      applyGroove({ drums, bass, settings: { [key]: { ...g[key], [field]: x.id } } }, `Viradas ${what}: ${x.label.toLowerCase()}.`);
    },
  }, x.label)));
  segmented("#fill-drum-frequency", FILL_FREQUENCIES, "drumFill", "frequency", "de bateria");
  segmented("#fill-drum-freedom", FILL_FREEDOMS, "drumFill", "freedom", "de bateria");
  segmented("#fill-bass-frequency", FILL_FREQUENCIES, "bassFill", "frequency", "de baixo");
  segmented("#fill-bass-freedom", FILL_FREEDOMS, "bassFill", "freedom", "de baixo");

  // riff: as famílias do estilo; o que estiver no projeto e não for do estilo aparece como "Personalizado"
  const families = riffOptions(style);
  const hasRiff = anyChord("riff");
  const riffId = fills.riff || "";
  const riffValue = !hasRiff ? "" : families.some((o) => o.id === riffId) ? riffId : CUSTOM_COMP;
  $("#groove-riff").replaceChildren(
    h("option", { value: "" }, "Desligado"),
    ...families.map((o) => h("option", { value: o.id }, o.label)),
    ...(riffValue === CUSTOM_COMP ? [h("option", { value: CUSTOM_COMP }, "Personalizado (do projeto)")] : []),
  );
  $("#groove-riff").value = riffValue;
  $("#groove-riff-row").hidden = !hasRiff || riffValue === CUSTOM_COMP;

  // segunda voz: só aparece quando há uma Voz
  const hasVoice = Boolean(String(state.project.voice || "").trim());
  const second = hasVoice ? fills.voice2 : "";
  $("#groove-voice2-field").hidden = !hasVoice;
  $("#groove-voice2").replaceChildren(...SECOND_VOICE_MODES.map((m) => h("option", { value: m.id }, m.label)));
  $("#groove-voice2").value = second;
  $("#groove-voice2-row").hidden = !second;
  $("#groove-voice2-again").hidden = second !== "contracanto";
  $("#groove-voice2-hint").textContent = second === "dueto"
    ? `Acompanha a Voz uma sexta abaixo, no jeito do estilo (${style.label}). Sai no MIDI na faixa “Voz 2”.`
    : second === "contracanto" && twinGuitars(style) ? `Guitarras gêmeas: dobra a Voz nota por nota, uma ${twinLabel(fills.voice2Variation || 0)} (“Outra” troca o intervalo). Sai no MIDI na faixa “Voz 2”.`
    : second === "contracanto" ? `Segura as notas-guia e responde quando a Voz descansa, no jeito do estilo (${style.label}). Sai no MIDI na faixa “Voz 2”.` : "";

  $("#groove-pad").checked = Boolean(state.project.pad);
  const phrases = anyChord("phrase");
  $("#groove-phrases").checked = phrases;
  $("#groove-again").hidden = !phrases;
  $("#phrase-tags").hidden = !phrases;
  const g = state.project.groove;
  const chosenStyles = g.phraseStyles?.length ? g.phraseStyles : [style.id];
  const chosenScales = g.scales?.length ? g.scales : ["acorde"];
  const tag = (label, pressed, onclick) => h("button", { type: "button", class: "tag", "aria-pressed": String(pressed), onclick }, label);
  $("#tags-styles").replaceChildren(...STYLES.map((s) => tag(s.label, chosenStyles.includes(s.id), () => toggleTag("phraseStyles", s.id, chosenStyles))));
  $("#tags-scales").replaceChildren(...SOURCE_SCALES.map((s) => tag(s.label, chosenScales.includes(s.id), () => toggleTag("scales", s.id, chosenScales))));
  $("#tags-color").replaceChildren(...COLORS.map(([value, label]) => h("button", {
    type: "button", "aria-pressed": String((g.color || "") === value),
    onclick: () => applyGroove({ phrases: true, settings: { color: value } }, `Cor das frases: ${label}.`),
  }, label)));
  $("#tags-intensity").replaceChildren(...INTENSITIES.map(({ id, label }) => h("button", {
    type: "button", "aria-pressed": String((g.intensity || "equilibrado") === id),
    onclick: () => applyGroove({ phrases: true, settings: { intensity: id } }, `Intensidade do solo: ${label}.`),
  }, label)));
}

/** Liga ou desliga uma tag (sempre fica pelo menos uma) e refaz as frases. */
function toggleTag(key, id, current) {
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  if (!next.length) { toast("Deixe pelo menos uma marcada."); return; }
  applyGroove({ phrases: true, settings: { [key]: next } }, "Frases refeitas com as tags marcadas.");
}

/** Escreve (ou apaga) a levada e/ou as frases em todos os acordes. Tudo pode ser desfeito. */
function applyGroove({ comp, phrases, drums, bass, percussion, riff, settings, before, only = null, quiet = false }, message) {
  // only: conjunto de índices de acordes; só neles a levada, o baixo e a frase são reescritos (a bateria é da música inteira)
  const touch = (i) => !only || only.has(i);
  const undo = quiet ? null : snapshot();
  before?.();
  if (settings) state.project.groove = { ...state.project.groove, ...settings };
  stopPlayback();
  const style = grooveStyle();
  const result = generateGroove(toPayload(), {
    style, comp: comp || null, phrases: phrases === true, variation: state.groove.variation,
    drums: drums || null, drumVariation: state.groove.drumVariation,
    bass: bass || null, percussion: percussion || null,
    phraseStyles: (state.project.groove?.phraseStyles || []).map(findStyle).filter(Boolean),
    scales: state.project.groove?.scales || [], color: state.project.groove?.color || "",
    intensity: state.project.groove?.intensity || "equilibrado",
    bassFill: state.project.groove?.bassFill, drumFill: state.project.groove?.drumFill,
    riff: riff || null, riffVariation: state.project.groove?.riffVariation || 0,
  });
  if (riff !== undefined) {
    state.project.chords.forEach((chord, i) => { if (touch(i)) chord.riff = riff ? result.chords[i]?.riff ?? "" : ""; });
    state.project.groove = { ...state.project.groove, riff: riff || "" };
  }
  if (bass !== undefined) {
    state.project.chords.forEach((chord, i) => { if (touch(i)) chord.bass_line = bass ? result.chords[i]?.bass_line ?? "" : ""; });
    state.project.groove = { ...state.project.groove, bass: bass || "" };
  }
  if (drums !== undefined) {
    state.project.drums = drums ? result.drums ?? "" : "";
    state.project.groove = { ...state.project.groove, drums: drums || "" };
  }
  if (percussion !== undefined) {
    state.project.percussion = percussion ? result.percussion ?? "" : "";
    state.project.groove = { ...state.project.groove, percussion: percussion || "" };
  }
  state.project.chords.forEach((chord, i) => {
    const made = result.chords[i] || {};
    if (!touch(i)) return;
    if (comp !== undefined) chord.comp = comp ? made.comp ?? "" : "";
    if (phrases === true) {
      chord.phrase = made.phrase ?? "";
      if (made.phrase_scale && !String(chord.phrase_scale || "").trim()) chord.phrase_scale = made.phrase_scale;
    } else if (phrases === false) {
      chord.phrase = "";
    }
  });
  if (comp !== undefined) state.project.groove = { ...state.project.groove, comp: comp || "" };
  if (comp || drums || bass || percussion || riff || phrases === true) state.project.style = style.label;
  refreshSecondVoice(); // o estilo dá o jeito da segunda voz
  renderSound(); // o som automático do riff acompanha o tipo de riff
  renderSettings();
  renderChords();
  validateNow();
  saveDraftSoon();
  if (!quiet) toast([message, ...result.notes].join(" "), { action: { label: "Desfazer", run: undo }, timeout: result.notes.length ? 9000 : 4500 });
}

function bindGroove() {
  loadGroove();
  loadMix();
  $("#listen-loop").addEventListener("change", (e) => { state.listen.loop = e.target.checked; });
  $("#listen-rate").addEventListener("change", (e) => {
    state.listen.rate = Number(e.target.value) || 1;
    if (state.playing) stopPlayback();
  });
  $("#groove-style").addEventListener("change", (e) => {
    state.groove.style = e.target.value;
    saveGroove();
    const style = grooveStyle();
    const current = state.project.groove?.comp || "";
    const hasComp = anyChord("comp") && current && current !== CUSTOM_COMP;
    const phrases = anyChord("phrase");
    const beat = state.project.groove?.drums || "";
    const hasDrums = Boolean(String(state.project.drums || "").trim()) && beat && beat !== CUSTOM_COMP;
    const percId = state.project.groove?.percussion || "";
    const hasPerc = Boolean(String(state.project.percussion || "").trim()) && percId && percId !== CUSTOM_COMP;
    if (!hasComp && !phrases && !hasDrums && !hasPerc && !anyChord("bass_line") && !anyChord("riff")) { renderGroove(); return; }
    const percussion = hasPerc ? (percussionOptions(style).some((o) => o.id === percId) ? percId : style.percussion[0].id) : undefined;
    const comp = hasComp ? (compOptions(style).some((o) => o.id === current) ? current : style.comps[0].id) : undefined;
    const drums = hasDrums ? (beatOptions(style).some((o) => o.id === beat) ? beat : style.beats[0].id) : undefined;
    const hasBass = anyChord("bass_line") && state.project.groove?.bass && state.project.groove.bass !== CUSTOM_COMP;
    const bass = hasBass ? bassForComp(style, comp ?? current) : undefined;
    // o riff segue o estilo: a mesma família, se ele tiver; senão a primeira dele
    const riffId = state.project.groove?.riff || "";
    const hasRiff = anyChord("riff") && riffId && riffId !== CUSTOM_COMP;
    const riff = hasRiff ? (riffOptions(style).some((o) => o.id === riffId) ? riffId : riffOptions(style)[0]?.id ?? "") : undefined;
    applyGroove({ comp, drums, bass, percussion, riff, phrases: phrases ? true : undefined }, `Ritmo refeito em ${style.label}.`);
  });
  $("#groove-comp").addEventListener("change", (e) => {
    const id = e.target.value;
    if (id === CUSTOM_COMP) return;
    const label = e.target.selectedOptions[0]?.textContent ?? "";
    // o baixo segue a levada: com o baixo ligado, ele troca para a linha que combina com ela
    const bass = anyChord("bass_line") && id ? bassForComp(grooveStyle(), id) : undefined;
    applyGroove({ comp: id, bass }, id ? `Levada nos acordes: ${label}.` : "Levada desligada: cada acorde volta a soar inteiro.");
  });
  $("#groove-drums").addEventListener("change", (e) => {
    const id = e.target.value;
    if (id === CUSTOM_COMP) return;
    const label = e.target.selectedOptions[0]?.textContent ?? "";
    applyGroove({ drums: id }, id ? `Bateria: ${label}.` : "Bateria desligada.");
  });
  $("#groove-percussion").addEventListener("change", (e) => {
    const id = e.target.value;
    if (id === CUSTOM_COMP) return;
    const label = e.target.selectedOptions[0]?.textContent ?? "";
    applyGroove({ percussion: id }, id ? `Percussão: ${label}.` : "Percussão desligada.");
  });
  $("#groove-bass").addEventListener("change", (e) => {
    const id = e.target.value;
    if (id === CUSTOM_COMP) return;
    const label = e.target.selectedOptions[0]?.textContent ?? "";
    applyGroove({ bass: id }, id ? `Baixo: ${label}.` : "Baixo desligado.");
  });
  $("#groove-fill").addEventListener("click", () => {
    state.groove.drumVariation += 1;
    saveGroove();
    const g = state.project.groove || {};
    const drums = String(state.project.drums || "").trim() && g.drums && g.drums !== CUSTOM_COMP ? g.drums : undefined;
    const bass = anyChord("bass_line") && g.bass && g.bass !== CUSTOM_COMP ? g.bass : undefined;
    applyGroove({ drums, bass }, "Outras viradas sorteadas.");
  });
  $("#groove-riff").addEventListener("change", (e) => {
    const id = e.target.value;
    if (id === CUSTOM_COMP) return;
    const label = e.target.selectedOptions[0]?.textContent ?? "";
    applyGroove({ riff: id }, id ? `Riff: ${label}.` : "Riff desligado.");
  });
  $("#groove-riff-again").addEventListener("click", () => {
    const g = state.project.groove;
    if (!g.riff || g.riff === CUSTOM_COMP) return;
    applyGroove({ riff: g.riff, settings: { riffVariation: (g.riffVariation || 0) + 1 } }, `Outro riff (${(g.riffVariation || 0) + 2}).`);
  });
  $("#groove-voice2").addEventListener("change", (e) => {
    const undo = snapshot();
    const mode = e.target.value;
    state.project.groove = { ...state.project.groove, voice2: mode };
    stopPlayback();
    const notes = refreshSecondVoice();
    renderAll();
    const label = SECOND_VOICE_MODES.find((m) => m.id === mode).label;
    toast([mode ? `Segunda voz: ${label}.` : "Segunda voz desligada.", ...notes].join(" "), { action: { label: "Desfazer", run: undo } });
  });
  $("#groove-voice2-again").addEventListener("click", () => {
    const undo = snapshot();
    state.project.groove = { ...state.project.groove, voice2Variation: (state.project.groove.voice2Variation || 0) + 1 };
    stopPlayback();
    refreshSecondVoice();
    renderAll();
    toast(twinGuitars(grooveStyle()) ? `Guitarras gêmeas: ${twinLabel(state.project.groove.voice2Variation)}.` : `Outro contracanto (${state.project.groove.voice2Variation + 1}).`, { action: { label: "Desfazer", run: undo } });
  });
  $("#groove-pad").addEventListener("change", (e) => {
    state.project.pad = e.target.checked;
    if (state.playing) stopPlayback();
    scheduleValidate();
    toast(e.target.checked ? "Pad ligado: o acorde aberto e parado sustenta a música." : "Pad desligado.");
  });
  $("#groove-phrases").addEventListener("change", (e) => {
    if (e.target.checked) applyGroove({ phrases: true }, `Frases escritas em ${grooveStyle().label}.`);
    else applyGroove({ phrases: false }, "Frases apagadas.");
  });
  $("#groove-again").addEventListener("click", () => {
    state.groove.variation += 1;
    saveGroove();
    applyGroove({ phrases: true }, `Outra variação das frases (${state.groove.variation + 1}).`);
  });
}

// ---------------------------------------------------------------- banco de sons (.sf2)
const APP_PAD = "app"; // o pad sintético do próprio app (sem banco de sons)
/** O som do riff: o escolhido, ou (em "automático") o sugerido pela família do riff neste estilo, se o app o tiver. */
function riffSoundValue() {
  if (state.sound.riff !== RIFF_AUTO) return state.sound.riff;
  const id = riffSound(grooveStyle(), state.project?.groove?.riff);
  return id && BUILTIN_BANKS.some((b) => b.id === id) ? builtinValue(id) : SAME;
}
const usingSoundFont = () => parsePatchValue(state.sound.chords) !== null && (parsePatchValue(state.sound.chords).bank !== "aparelho" || Boolean(soundFont.bank));

/**
 * Toca com o banco de sons o mesmo MIDI que "Gerar MIDI" exporta (no modo de frase escolhido).
 * Devolve false quando não dá (há erros na progressão): aí quem chamou usa o timbre simples.
 */
async function playWithSoundFont(only = null, onEnd = null) {
  if (!state.report?.ok) {
    toast("Há erros na progressão: por enquanto, ela toca com o timbre simples.");
    return false;
  }
  const { project, index, offset, fromBeat } = previewProject(only);
  // o pad toca com o som escolhido (cordas ou pad do banco) ou, em "Pad do app", com o timbre sintético do próprio app,
  // junto com o banco. O mixer vale aqui também.
  const ids = MIDI_PARTS.map((p) => p.id);
  const padPatch = project.pad && state.sound.pad !== APP_PAD && parsePatchValue(state.sound.pad) ? state.sound.pad : null;
  const hasBass = project.chords.some((c) => c.bass_events.length);
  const bytes = midiBytes(project, {
    phraseMode: state.phraseMode, parts: ids.filter((id) => (id !== "pad" || padPatch) && mixGain(id) > 0), gains: Object.fromEntries(ids.map((id) => [id, mixGain(id)])),
  });
  const hasDrums = project.drum_bars.length || project.percussion_bars.length;
  const hasRiff = project.chords.some((c) => c.riff_events.length);
  const fresh = [state.sound.chords, state.sound.phrase, hasDrums ? state.sound.drums : "", hasBass ? state.sound.bass : "", padPatch ?? "", hasRiff ? riffSoundValue() : ""]
    .map(parsePatchValue).filter((patch) => patch && patch.bank !== "aparelho");
  const slow = setTimeout(() => toast(fresh.length ? "Baixando o banco de sons (só na primeira vez)…" : "Carregando o banco de sons…"), 500);
  try {
    await soundFont.play(bytes, {
      chords: state.sound.chords, phrase: state.sound.phrase, drums: hasDrums ? state.sound.drums : NO_DRUMS,
      bass: hasBass ? state.sound.bass : SAME, pad: padPatch, riff: hasRiff ? riffSoundValue() : SAME,
      onEnd: onEnd ?? (() => (only ? setPlaying(-1) : stopPlayback())),
    });
  } catch (err) {
    // sem os sons (sem internet na primeira vez, arquivo que não abriu): a música toca assim mesmo, com o timbre simples
    clearTimeout(slow);
    soundFont.stop();
    const why = err instanceof TypeError ? "Não consegui baixar os sons (sem internet?)." : err.message;
    toast(`${why} Tocando com o timbre simples do app.`, { error: true, timeout: 8000 });
    return false;
  }
  clearTimeout(slow);
  if (project.pad && !padPatch && mixGain("pad") > 0) {
    const seconds = 60 / project.tempo / TICKS_PER_BEAT;
    const pads = padNotes(project);
    const level = (velocity) => Math.max(1, Math.min(127, Math.round(velocity * mixGain("pad"))));
    player.play(pads.map(([from, to, pitch, velocity]) => ({ midi: pitch, start: from * seconds, length: (to - from) * seconds, velocity: level(velocity), pad: true })),
      { total: Math.max(0, ...pads.map((n) => n[1])) * seconds + 1.5 });
  }
  // destaca o acorde que está soando (os tempos vêm do próprio projeto, como no arquivo)
  const secondsPerBeat = 60 / project.tempo;
  let start = 0;
  project.chords.forEach((chord, i) => {
    soundTimers.push(setTimeout(() => setPlaying(only ? index : offset + i), start * secondsPerBeat * 1000));
    start += chord.duration_beats;
  });
  if (!only) startClock({ secondsPerBeat, fromBeat, beats: start });
  return true;
}

function saveSoundChoice() {
  try { localStorage.setItem(SOUND_KEY, JSON.stringify(state.sound)); } catch { /* sem armazenamento */ }
}

function loadSoundChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOUND_KEY) || "null");
    if (saved && typeof saved.chords === "string") {
      state.sound = {
        chords: saved.chords, phrase: typeof saved.phrase === "string" ? saved.phrase : SAME,
        drums: typeof saved.drums === "string" ? saved.drums : builtinValue(DEFAULT_SOUNDS.drums),
        // escolhas novas: quem já usava o app ganha o baixo e as cordas de verdade
        bass: typeof saved.bass === "string" ? saved.bass : builtinValue(DEFAULT_SOUNDS.bass),
        pad: typeof saved.pad === "string" ? saved.pad : builtinValue(DEFAULT_SOUNDS.pad),
        riff: typeof saved.riff === "string" ? saved.riff : RIFF_AUTO,
      };
    }
  } catch { /* fica o padrão */ }
}

/** Os menus de som (acordes, frase, bateria), o resumo e os botões: bancos do app e o banco do aparelho. */
function renderSound() {
  const bank = soundFont.bank;
  const presets = bank?.presets ?? [];
  const keys = BUILTIN_BANKS.filter((b) => b.kind === "teclado");
  const kits = BUILTIN_BANKS.filter((b) => b.kind === "bateria");
  const basses = BUILTIN_BANKS.filter((b) => b.kind === "baixo");
  const pads = BUILTIN_BANKS.filter((b) => b.kind === "pad");
  const melodic = new Set([...keys.map((b) => builtinValue(b.id)), ...presets.filter((p) => !p.isDrum).map(patchValue)]);
  const drums = new Set([...kits.map((b) => builtinValue(b.id)), ...presets.filter((p) => p.isDrum).map(patchValue)]);
  if (soundRestored) {
    if (state.sound.chords !== SIMPLE && !melodic.has(state.sound.chords)) state.sound.chords = SIMPLE;
    if (state.sound.phrase !== SAME && !melodic.has(state.sound.phrase)) state.sound.phrase = SAME;
    if (state.sound.drums !== NO_DRUMS && !drums.has(state.sound.drums)) state.sound.drums = kits[0] ? builtinValue(kits[0].id) : NO_DRUMS;
    const device = new Set(presets.filter((p) => !p.isDrum).map(patchValue));
    if (state.sound.bass !== SAME && !device.has(state.sound.bass) && !basses.some((b) => builtinValue(b.id) === state.sound.bass) && !melodic.has(state.sound.bass)) state.sound.bass = builtinValue(DEFAULT_SOUNDS.bass);
    if (state.sound.pad !== APP_PAD && !device.has(state.sound.pad) && !pads.some((b) => builtinValue(b.id) === state.sound.pad) && !melodic.has(state.sound.pad)) state.sound.pad = builtinValue(DEFAULT_SOUNDS.pad);
  }
  // os sons do app, agrupados por família (Teclados, Sopros e vozes...); os antigos, sem grupo, ficam em "Outros do app"
  const builtinOptions = (list) => {
    const groups = new Map();
    for (const b of list) { const g = b.group || "Outros do app"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(b); }
    return [...groups].map(([label, items]) => h("optgroup", { label }, ...items.map((b) => h("option", { value: builtinValue(b.id) }, `${b.label} · ${formatSize(b.size)}`))));
  };
  const deviceGroup = (drum) => {
    const list = presets.filter((p) => Boolean(p.isDrum) === drum);
    return list.length ? [h("optgroup", { label: `Do aparelho: ${bank.name}` }, ...list.map((p) => h("option", { value: patchValue(p) }, p.name)))] : [];
  };
  const melodicOptions = () => [...builtinOptions(keys), ...deviceGroup(false)];
  const chords = $("#sound-chords");
  chords.replaceChildren(h("option", { value: SIMPLE }, "Timbre simples do app"), ...melodicOptions());
  chords.value = state.sound.chords;
  const phrase = $("#sound-phrase");
  phrase.replaceChildren(h("option", { value: SAME }, "O mesmo dos acordes"), ...melodicOptions());
  phrase.value = state.sound.phrase;
  const drumSelect = $("#sound-drums");
  drumSelect.replaceChildren(
    h("option", { value: NO_DRUMS }, "Sem bateria na escuta"),
    ...builtinOptions(kits),
    ...deviceGroup(true),
  );
  drumSelect.value = state.sound.drums;
  const bassSelect = $("#sound-bass");
  bassSelect.replaceChildren(h("option", { value: SAME }, "O mesmo dos acordes"), ...builtinOptions(basses), ...deviceGroup(false));
  bassSelect.value = state.sound.bass;
  const riffSelect = $("#sound-riff");
  const auto = parsePatchValue(riffSoundValue());
  const autoLabel = state.sound.riff === RIFF_AUTO && auto ? BUILTIN_BANKS.find((b) => b.id === auto.bank)?.label : "";
  riffSelect.replaceChildren(h("option", { value: RIFF_AUTO }, autoLabel ? `Automático: ${autoLabel}` : "Automático (o do tipo de riff)"), h("option", { value: SAME }, "O mesmo dos acordes"), ...melodicOptions());
  riffSelect.value = state.sound.riff;
  const padSelect = $("#sound-pad");
  padSelect.replaceChildren(h("option", { value: APP_PAD }, "Pad do app (sintético)"), ...builtinOptions(pads), ...deviceGroup(false));
  padSelect.value = state.sound.pad;
  updateSoundPhraseField();
  $("#sound-remove").hidden = !bank;
  $("#sound-load").textContent = bank ? "Trocar o banco do aparelho" : "Carregar banco do aparelho (.sf2)";
  const label = (value) => {
    const patch = parsePatchValue(value);
    if (!patch) return "";
    if (patch.bank !== "aparelho") return BUILTIN_BANKS.find((b) => b.id === patch.bank)?.label ?? "";
    return presets.find((p) => patchValue(p) === value)?.name ?? "";
  };
  $("#sound-summary").textContent = state.sound.chords === SIMPLE ? "timbre simples" : label(state.sound.chords);
}

/** "Som da frase" só aparece com alguma frase na progressão; "Som da bateria", com bateria ligada. Os dois só fora do timbre simples. */
function updateSoundPhraseField() {
  const banks = state.sound.chords !== SIMPLE;
  const anyPhrase = (state.report?.chords || []).some((c) => c.phrase);
  $("#sound-phrase-field").hidden = !banks || !anyPhrase;
  $("#sound-drums-field").hidden = !banks || !String(state.project?.drums || state.project?.percussion || "").trim();
  $("#sound-bass-field").hidden = !banks || !(state.project?.chords || []).some((c) => String(c.bass_line || "").trim());
  $("#sound-pad-field").hidden = !banks || !state.project?.pad;
  $("#sound-riff-field").hidden = !banks || !(state.project?.chords || []).some((c) => String(c.riff || "").trim());
  $("#sound-simple-hint").hidden = banks;
}

async function chooseSoundFile(file) {
  if (!file) return;
  if (file.size > LARGE_BANK_BYTES
    && !window.confirm(`Este banco tem ${formatSize(file.size)}. No celular, bancos grandes podem travar o app. Carregar mesmo assim?`)) return;
  stopPlayback();
  const slow = setTimeout(() => toast(`Lendo ${file.name}…`), 300);
  try {
    const { bank, saved } = await soundFont.loadFile(file);
    clearTimeout(slow);
    soundRestored = true;
    const preset = suggestedPreset(bank.presets);
    const kit = bank.presets.find((p) => p.isDrum);
    state.sound = { ...state.sound, chords: preset ? patchValue(preset) : SIMPLE, phrase: SAME, drums: kit ? patchValue(kit) : state.sound.drums };
    saveSoundChoice();
    renderSound();
    toast(saved
      ? `${bank.name}: ${bank.presets.length} instrumento(s). Tocando com ${preset?.name ?? "o primeiro"}.`
      : `${bank.name} carregado, mas não coube para guardar neste aparelho: vale só até fechar o app.`);
  } catch (err) {
    clearTimeout(slow);
    toast(err.message, { error: true, timeout: 8000 });
  }
}

function bindSound() {
  loadSoundChoice();
  $("#sound-chords").addEventListener("change", (e) => {
    state.sound.chords = e.target.value;
    if (state.playing) stopPlayback();
    saveSoundChoice();
    renderSound();
  });
  $("#sound-phrase").addEventListener("change", (e) => {
    state.sound.phrase = e.target.value;
    if (state.playing) stopPlayback();
    saveSoundChoice();
  });
  $("#sound-drums").addEventListener("change", (e) => {
    state.sound.drums = e.target.value;
    if (state.playing) stopPlayback();
    saveSoundChoice();
  });
  for (const key of ["bass", "pad", "riff"]) {
    $(`#sound-${key}`).addEventListener("change", (e) => {
      state.sound[key] = e.target.value;
      if (state.playing) stopPlayback();
      saveSoundChoice();
    });
  }
  $("#sound-load").addEventListener("click", () => $("#sound-file").click());
  $("#sound-file").addEventListener("change", (e) => {
    const [file] = e.target.files;
    e.target.value = "";
    chooseSoundFile(file);
  });
  $("#sound-remove").addEventListener("click", async () => {
    if (!window.confirm(`Remover ${soundFont.bank?.name ?? "o banco de sons"} deste aparelho?`)) return;
    await soundFont.removeBank();
    state.sound = { ...state.sound, chords: parsePatchValue(state.sound.chords)?.bank === "aparelho" ? SIMPLE : state.sound.chords, phrase: SAME };
    saveSoundChoice();
    renderSound();
    toast("Banco de sons removido. A pré-escuta voltou ao timbre simples.");
  });
  renderSound();
  soundFont.restore().catch(() => null).then(() => { soundRestored = true; renderSound(); });
}

function focusFirstError() {
  for (const chord of state.project.chords) {
    const r = refs.get(chord);
    if (r?.card.classList.contains("has-error")) {
      foldedSections.clear();
      if (r.card.hidden) { renderChords(); return focusFirstError(); }
      setChordOpen(chord, true);
      r.card.scrollIntoView({ behavior: "smooth", block: "center" });
      r.card.querySelector('[aria-invalid="true"]')?.focus({ preventScroll: true });
      return;
    }
  }
  $(".project").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveFile(blob, filename, description, mime, ext) {
  if ("showSaveFilePicker" in window) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description, accept: { [mime]: [ext] } }] });
    } catch (err) {
      if (err.name === "AbortError") return null;
      handle = null; // sem permissão: cai para o download comum
    }
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { name: handle.name, picked: true };
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { name: filename, picked: false };
}

/** Partes que a pessoa DESMARCOU na exportação (guardadas no aparelho; parte nova entra marcada). */
const EXPORT_OFF_KEY = "harmona-lab:export-off";
const loadExportOff = () => { try { return new Set(JSON.parse(localStorage.getItem(EXPORT_OFF_KEY) || "[]")); } catch { return new Set(); } };
const saveExportOff = (off) => { try { localStorage.setItem(EXPORT_OFF_KEY, JSON.stringify([...off])); } catch { /* sem armazenamento */ } };

/** "Gerar MIDI": confere os erros e abre a lista das partes (só as que existem no projeto). */
function exportMidi() {
  validateNow();
  if (!state.report?.ok) {
    const n = state.report.issues.filter((i) => i.level === "error").length;
    toast(n === 1 ? "Há 1 erro para corrigir antes de gerar o MIDI." : `Há ${n} erros para corrigir antes de gerar o MIDI.`, { error: true });
    focusFirstError();
    return;
  }
  const { project } = readProject(toPayload());
  const present = partsPresent(project, { phraseMode: state.phraseMode });
  const off = loadExportOff();
  $("#export-parts").replaceChildren(...MIDI_PARTS.filter((p) => present.includes(p.id)).map((p) => h("label", { class: "export-part" },
    h("input", { type: "checkbox", value: p.id, checked: !off.has(p.id), onchange: renderExportNote }),
    h("span", null, p.label))));
  // a percussão sai numa faixa por instrumento: dá para escolher quais (todos, alguns ou um só) ou juntar tudo numa faixa
  const instruments = percussionPresent(project, { phraseMode: state.phraseMode });
  $("#export-perc-list").replaceChildren(...PERCUSSION_INSTRUMENTS.filter((i) => instruments.includes(i.id)).map((i) => h("label", { class: "export-part" },
    h("input", { type: "checkbox", value: i.id, checked: !off.has(`perc:${i.id}`), onchange: renderExportNote }),
    h("span", null, i.label))));
  $("#export-perc-single").checked = off.has("perc:juntar");
  renderExportNote();
  $("#export-dialog").showModal();
}

const percChoice = () => [...document.querySelectorAll("#export-perc-list input")].filter((i) => i.checked).map((i) => i.value);
const exportChoice = () => [...document.querySelectorAll("#export-parts input")].filter((i) => i.checked).map((i) => i.value);

function renderExportNote() {
  const chosen = exportChoice();
  const note = $("#export-note");
  const percussion = chosen.includes("percussao") && $("#export-perc-list").children.length > 0;
  const noInstrument = percussion && percChoice().length === 0;
  $("#export-perc").hidden = !percussion;
  note.hidden = chosen.length > 0 && !noInstrument;
  note.textContent = noInstrument ? "Marque pelo menos um instrumento de percussão (ou desmarque a Percussão)." : "Marque pelo menos uma parte.";
  $("#export-go").disabled = chosen.length === 0 || noInstrument;
}

/** Gera o .mid só com as partes marcadas. */
async function exportChosen() {
  const boxes = [...document.querySelectorAll("#export-parts input")];
  const parts = exportChoice();
  if (!parts.length) return;
  const off = loadExportOff();
  for (const b of boxes) (b.checked ? off.delete(b.value) : off.add(b.value));
  const percBoxes = [...document.querySelectorAll("#export-perc-list input")];
  const percussion = parts.includes("percussao");
  const instruments = percChoice();
  const single = $("#export-perc-single").checked;
  if (percussion) {
    for (const b of percBoxes) (b.checked ? off.delete(`perc:${b.value}`) : off.add(`perc:${b.value}`));
    if (single) off.add("perc:juntar"); else off.delete("perc:juntar");
  }
  saveExportOff(off);
  $("#export-dialog").close();
  const { project } = readProject(toPayload());
  const allInstruments = !percussion || instruments.length === percBoxes.length;
  const every = boxes.length === parts.length && allInstruments;
  const bytes = midiBytes(project, {
    phraseMode: state.phraseMode, parts: boxes.length === parts.length ? null : parts,
    percussionSingle: single, percussionOnly: allInstruments ? null : instruments,
  });
  const names = parts.map((id) => (id === "percussao" && !allInstruments ? `percussao-${instruments.join("-")}` : id));
  const suffix = every ? "" : `-${names.join("-")}`;
  const filename = `${slugify(state.project.title)}${suffix}.mid`;
  const saved = await saveFile(new Blob([bytes], { type: "audio/midi" }), filename, "Arquivo MIDI", "audio/midi", ".mid");
  if (!saved) return;
  if (saved.picked) {
    toast(`${saved.name} salvo. Arraste para a sua DAW.`);
    return;
  }
  // No celular: se o sistema deixar, oferece mandar o arquivo direto (Drive, WhatsApp, e-mail…).
  const file = new File([bytes], filename, { type: "audio/midi" });
  let canShare = false;
  try { canShare = Boolean(navigator.canShare?.({ files: [file] })); } catch { /* sem suporte */ }
  if (canShare) {
    toast(`${filename} baixado.`, { action: { label: "Enviar", run: () => navigator.share({ files: [file], title: filename }).catch(() => {}) } });
  } else {
    toast(`${filename} baixado. Arraste da pasta de downloads para a sua DAW.`);
  }
}

/** Imagem (PNG) com o desenho do teclado de cada acorde, a função, a escala e a frase de função. */
async function exportDiagrams() {
  validateNow();
  const report = state.report;
  const all = [];
  for (const c of report?.chords || []) for (const n of c.notes) all.push(n.midi);
  if (!all.length) { toast("A progressão ainda não tem notas para desenhar.", { error: true }); return; }
  const [low, high] = keyboardRange(all);
  const p = state.project;
  // a música em ordem: o começo de cada parte, os acordes, e os acordes vazios seguidos resumidos numa linha
  const blocks = sectionBlocks(p.chords);
  const starts = new Map(blocks.map((b) => [b.from, b.name]));
  const items = [];
  p.chords.forEach((chord, i) => {
    if (blocks.length > 1 && starts.has(i)) items.push({ section: starts.get(i) });
    const info = state.byId.get(chord.id)?.chord;
    const notes = info?.notes || [];
    if (!notes.length && !String(chord.symbol || "").trim()) {
      const last = items.at(-1);
      if (last?.rests) last.rests += 1; else items.push({ rests: 1 });
      return;
    }
    items.push({
      number: i + 1, symbol: chord.symbol,
      fn: [chord.function, chord.scale].map((t) => String(t || "").trim()).filter(Boolean).join(" · "),
      note: String(chord.comment || "").trim(), notes, top: info?.top?.midi ?? null,
    });
  });
  const pages = drawDiagramPages({
    title: p.title,
    subtitle: [p.key && `Tom: ${p.key}`, toNumber(p.tempo) > 0 && `${fmt(toNumber(p.tempo))} BPM`, p.time_signature, p.style].filter(Boolean).join(" · "),
    low, high, items,
  });
  const images = [];
  for (const canvas of pages) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
  }
  const filename = `${slugify(p.title)}-diagramas.pdf`;
  const saved = await saveFile(new Blob([buildPdf(images)], { type: "application/pdf" }), filename, "Documento PDF", "application/pdf", ".pdf");
  if (saved) toast(`${saved.name} salvo (${pages.length} página${pages.length > 1 ? "s" : ""}).`);
}

async function saveProject() {
  validateNow();
  const data = state.report?.ok ? state.report.project : toPayload();
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const saved = await saveFile(blob, `${slugify(state.project.title)}.json`, "Projeto Harmona Lab", "application/json", ".json");
  if (saved) toast(`Projeto salvo: ${saved.name}`);
}

function loadProject(data, message) {
  const undo = snapshot();
  stopPlayback();
  state.project = toEditable(data);
  state.byId = new Map();
  assistTarget = -1;
  formSelected = -1;
  formAdding = false;
  renderAll();
  toast(message, { action: { label: "Desfazer", run: undo } });
}

/** Aceita o JSON puro ou dentro de um bloco ```json … ``` (como o ChatGPT costuma responder). */
function parseProjectText(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Não encontrei um objeto JSON ({ … }) no texto.");
  let data;
  try {
    data = JSON.parse(source.slice(start, end + 1));
  } catch (err) {
    throw new Error(`JSON inválido: ${err.message}`);
  }
  if (!Array.isArray(data.chords)) throw new Error('O JSON precisa ter a lista "chords".');
  return data;
}

function openPaste() {
  $("#paste-error").textContent = "";
  $("#paste-dialog").showModal();
  $("#paste-text").focus();
}

async function openFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    loadProject(data, `Projeto aberto: ${data.title || file.name}`);
  } catch {
    toast(`Não consegui ler ${file.name} como projeto JSON.`, { error: true });
  }
}

async function loadExample() {
  try {
    const res = await fetch("./example.json");
    if (!res.ok) throw new Error();
    loadProject({ ...(await res.json()), example: true }, "Exemplo carregado.");
  } catch {
    toast("Exemplo indisponível.", { error: true });
  }
}

function newProject() {
  if (hasProgression() && !state.project.example && !window.confirm("Começar outra música? A atual sai da tela (dá para desfazer logo em seguida, ou salve o JSON antes).")) return;
  loadProject({ title: "Nova progressão", tempo: state.project.tempo, time_signature: state.project.time_signature,
    middle_c: state.project.middle_c, default_velocity: state.project.default_velocity, strum: state.project.strum, chords: [{}] }, "Projeto novo.");
}

// ---------------------------------------------------------------- início
function bindUi() {
  $("#menu-button").append(icon("dots"));
  renderPlayButton();
  document.querySelectorAll(".menu-item[data-icon]").forEach((b) => b.prepend(icon(b.dataset.icon)));

  $("#play-all").addEventListener("click", () => { if (!state.playing) state.listen.range = null; playAll(); });
  $("#voicing-all").replaceChildren(...VOICINGS.map((v) => h("button", { type: "button", onclick: () => revoiceChords({ kind: v.id }) }, v.label)));
  $("#pedal-apply").addEventListener("click", () => {
    const pedal = $("#pedal-note").value.trim();
    if (!pedal) { toast("Digite a nota da ponta pedal, por exemplo F#5.", { error: true }); return; }
    revoiceChords({ pedal });
  });
  $("#export").addEventListener("click", exportMidi);
  $("#export-go").addEventListener("click", exportChosen);
  $("#export-perc-single").addEventListener("change", renderExportNote);
  $("#chords-toggle-all").addEventListener("click", () => {
    const chords = state.project.chords;
    const open = !chords.every((c) => openChords.has(c.id));
    foldedSections.clear();
    for (const c of chords) { if (open) openChords.add(c.id); else openChords.delete(c.id); }
    renderChords();
  });
  $("#song-roll").addEventListener("click", (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const blocks = sectionBlocks(state.project.chords);
    const total = blocks.reduce((sum, b) => sum + b.beats, 0);
    const beat = ((event.clientX - rect.left) / rect.width) * total;
    const block = blocks.findLast((b) => beat >= b.startBeat) ?? blocks[0];
    playRange(block.from, state.project.chords.length);
  });
  window.addEventListener("resize", () => drawSongRoll());
  $("#export-all").addEventListener("click", () => { document.querySelectorAll("#export-parts input, #export-perc-list input").forEach((i) => (i.checked = true)); renderExportNote(); });
  $("#export-none").addEventListener("click", () => { document.querySelectorAll("#export-parts input").forEach((i) => (i.checked = false)); renderExportNote(); });
  document.querySelectorAll("#phrase-mode button").forEach((b) => b.addEventListener("click", () => {
    if (!PHRASE_MODES.includes(b.dataset.mode)) return;
    state.phraseMode = b.dataset.mode;
    if (state.playing) stopPlayback();
    renderPhraseMode();
  }));

  const menu = $("#menu");
  $("#menu-button").addEventListener("click", () => menu.showModal());
  menu.addEventListener("click", (e) => { if (e.target === menu) menu.close("close"); });
  menu.addEventListener("close", () => {
    const action = menu.returnValue;
    menu.returnValue = "";
    if (action === "open") $("#file-input").click();
    else if (action === "paste") openPaste();
    else if (action === "share") copyShareLink();
    else if (action === "diagrams") exportDiagrams();
    else if (action === "save") saveProject();
    else if (action === "example") loadExample();
    else if (action === "new") newProject();
    else if (action === "install") installApp();
  });
  const paste = $("#paste-dialog");
  $("#paste-load").addEventListener("click", (e) => {
    const text = $("#paste-text").value.trim();
    try {
      const data = parseProjectText(text);
      loadProject(data, `Projeto colado: ${data.title || "sem título"}`);
    } catch (err) {
      e.preventDefault(); // mantém o diálogo aberto
      $("#paste-error").textContent = err.message;
    }
  });
  paste.addEventListener("click", (e) => { if (e.target === paste) paste.close(); });
  $("#file-input").addEventListener("change", (e) => {
    const [file] = e.target.files;
    if (file) openFile(file);
    e.target.value = "";
  });
  bindSettings();
  bindGroove();
  bindSound();
  const canto = setupCanto({
    defaults: () => ({
      bpm: toNumber(state.project.tempo) || 80, timeSignature: state.project.time_signature, middleC: state.project.middle_c,
      // dá para acrescentar uma parte quando já existe música (acordes de verdade ou uma Voz)
      canAppend: hasProgression() || Boolean(String(state.project.voice || "").trim()),
      hasVoice: Boolean(String(state.project.voice || "").trim()), nextSection: nextSectionName(state.project.chords),
      song: songKey(), overPart: singOverPart(),
      voiceText: state.project.voice || "", totalBeats: state.project.chords.reduce((n, c) => n + (toNumber(c.duration_beats) || 0), 0),
    }),
    onUse: useVoice,
    preroll: prerollNotes,
    toast,
    play: (notes, total, options = {}) => { stopPlayback(); player.play(notes, { total, ...options }); },
    stop: () => stopPlayback(),
  });
  $("#voice-edit").addEventListener("click", () => { stopPlayback(); canto.edit(); });

}

/**
 * O fim da música (os últimos `bars` compassos: acordes, baixo e Voz, sem bateria) como notas em segundos, no andamento
 * do canto, para tocar na contagem antes de a pessoa cantar a parte seguinte. O tempo 0 é o primeiro clique da contagem.
 */
/** A parte em que dá para cantar por cima da harmonia: tem acordes e ainda não tem melodia (a do assistente, se servir). */
function singOverPart() {
  const fits = (part) => part && !part.empty && !part.melody && part.kind !== "new";
  const parts = getParts();
  const part = fits(parts[assistTarget]) ? parts[assistTarget] : parts.find(fits);
  return part ? { index: part.index, name: part.name, beats: part.beats, startBeat: part.startBeat, bars: part.toBar - part.fromBar + 1, key: part.key } : null;
}

function prerollNotes({ bpm, bars, part = null }) {
  try {
    const { project } = readProject(toPayload());
    const { notes, end } = noteEvents(project, { phraseMode: "chords", drums: false });
    // parte nova: toca o fim da música na contagem. Por cima de uma parte: o trecho antes dela na contagem e depois ela inteira.
    const anchor = part ? Math.round(part.startBeat * TICKS_PER_BEAT) : end; // onde o canto começa
    const until = part ? Math.round((part.startBeat + part.beats) * TICKS_PER_BEAT) : end;
    const count = Math.round(bars * beatsPerBar() * TICKS_PER_BEAT);
    const span = Math.min(anchor, count);
    const from = anchor - span;
    const seconds = 60 / bpm / TICKS_PER_BEAT;
    const lead = (count - span) * seconds; // música mais curta que a contagem: entra depois
    return notes.filter((n) => n.end > from && n.start < until && !n.pad)
      .map((n) => ({ midi: n.pitch, start: lead + (Math.max(n.start, from) - from) * seconds, length: (Math.min(n.end, until) - Math.max(n.start, from)) * seconds, velocity: n.velocity }));
  } catch {
    return []; // projeto com erro: só a contagem
  }
}

/**
 * A melodia (cantada ou de um MIDI) vai para o projeto. target "toda": vira a Voz da música inteira, com o BPM e o compasso
 * dela, e compassos vazios no fim se não couber. target "nova": vira uma parte nova, no fim (o BPM e o compasso do projeto
 * não mudam; a anacruse entra por cima do fim da parte anterior).
 */
function useVoice({ text, bpm, timeSignature, beats, target = "toda", events = [], pickup = 0, spell = null, part = -1 }) {
  const undo = snapshot();
  stopPlayback();
  const p = state.project;
  p.example = false; // cantou em cima: a música passa a ser da pessoa
  if (target === "editar") {
    // a melodia do projeto, depois de mexida no desenho: só o texto dela muda (BPM, compasso e acordes ficam)
    p.voice = text;
    refreshSecondVoice();
    renderAll();
    validateNow();
    saveDraftSoon();
    toast("Melodia atualizada.", { action: { label: "Desfazer", run: undo } });
    return;
  }
  if (target === "parte") {
    // cantada por cima da harmonia de uma parte: as notas entram no lugar dela, e o resto da melodia fica
    const block = sectionBlocks(p.chords)[part];
    const old = voiceNotes(p.voice, p.middle_c);
    if (!block || old === null) { toast("Não deu para pôr a melodia na parte: a Voz atual tem um erro de escrita. Corrija-o em “Sobre esta progressão”.", { error: true }); return; }
    const from = Math.round(block.startBeat * TICKS_PER_BEAT);
    const to = Math.round((block.startBeat + block.beats) * TICKS_PER_BEAT);
    const fresh = events.filter((e) => e.beat < block.beats - 1e-9).map((e) => {
      const start = from + Math.round(e.beat * TICKS_PER_BEAT);
      return { name: spell(e.midi), start, length: Math.min(Math.round(e.beats * TICKS_PER_BEAT), to - start) };
    }).filter((n) => n.length > 0);
    p.voice = voiceTextOf([...old.filter((n) => n.start < from || n.start >= to).map((n) => (n.start < from ? { ...n, length: Math.min(n.length, from - n.start) } : n)), ...fresh]);
    refreshSecondVoice();
    formSelected = part;
    renderAll();
    validateNow();
    saveDraftSoon();
    toast(`Melodia na parte ${block.name}: ${fresh.length} nota${fresh.length === 1 ? "" : "s"}. A harmonia não mudou.`, { action: { label: "Desfazer", run: undo }, timeout: 7000 });
    return;
  }
  if (target === "nova") {
    const result = appendSection(p, { events, pickup, beatsPerBar: beatsPerBar(), spell, blankChord });
    if (!result) { toast("Não deu para acrescentar a parte: a Voz atual tem um erro de escrita. Corrija-o em “Sobre esta progressão”.", { error: true }); return; }
    p.chords = result.chords;
    p.voice = result.voice;
    refreshSecondVoice();
    formSelected = sectionBlocks(p.chords).length - 1;
    renderAll();
    validateNow();
    saveDraftSoon();
    assistTarget = formSelected;
    assistant?.refresh();
    toast(`Parte ${result.section} criada: ${result.bars} compasso${result.bars > 1 ? "s" : ""} com a melodia. Agora peça a harmonia dela: no assistente, “Criar a parte ${result.section}”.`,
      { action: { label: "Desfazer", run: undo }, timeout: 9000 });
    return;
  }
  p.tempo = bpm;
  p.time_signature = timeSignature;
  p.voice = text;
  const bpb = beatsPerBar();
  const needed = Math.ceil(beats / bpb - 1e-9) * bpb;
  let have = p.chords.reduce((n, c) => n + (toNumber(c.duration_beats) || 0), 0);
  let added = 0;
  while (have < needed) {
    p.chords.push(blankChord({ duration_beats: bpb }));
    have += bpb;
    added += 1;
  }
  refreshSecondVoice();
  renderAll();
  validateNow();
  saveDraftSoon();
  const notes = text.split(/\s+/).filter((t) => t && !t.startsWith("r/")).length;
  toast(`Voz com ${notes} notas no projeto${added ? ` (${added} compasso${added > 1 ? "s" : ""} vazio${added > 1 ? "s" : ""} para ela caber)` : ""}. Ela toca na escuta e sai no MIDI, numa faixa própria.`,
    { action: { label: "Desfazer", run: undo }, timeout: 7000 });
}

// ---------------------------------------------------------------- links
/** Copia um link que abre esta progressão no Harmona Lab de quem receber (vai depois do #, não passa por servidor). */
async function copyShareLink() {
  validateNow();
  const data = state.report?.ok ? state.report.project : toPayload();
  const url = `${location.origin}${location.pathname}${await buildShareHash(data)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copiado. Quem abrir vê esta progressão no Harmona Lab.");
  } catch {
    window.prompt("Copie o link desta progressão:", url);
  }
}

/** Abre o link que trouxe a pessoa até aqui (ou que ela tocou com o app já aberto) e limpa o endereço. */
async function handleHash(askBeforeReplacing) {
  if (location.hash.length < 3 || !assistant) return;
  const hash = location.hash;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  const handled = await assistant.openLink(hash, { askBeforeReplacing });
  if (handled) $("#assistant").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------- assistente de IA
let assistant = null;

/** O que a IA pode ajustar: o projeto como está (já conferido, se estiver sem erros). */
function currentProjectJson() {
  return state.report?.ok ? state.report.project : toPayload();
}

/** A melodia cantada (a Voz) do projeto, para o pedido à IA. */
const getVoice = () => (state.project.voice ? { text: state.project.voice, tempo: state.project.tempo, timeSignature: state.project.time_signature } : null);

// ---------------------------------------------------------------- o assistente trabalha por PARTE
let assistTarget = -1; // a parte em que o assistente está trabalhando (índice do bloco); -1 = o app escolhe

/** As partes da música, com o que o assistente precisa saber de cada uma. */
function getParts() {
  const chords = state.project.chords;
  const report = state.report;
  const blocks = sectionBlocks(chords);
  const bpb = beatsPerBar();
  const notes = voiceNotes(state.project.voice, state.project.middle_c) || [];
  const harmony = hasProgression();
  const song = songKey();
  return blocks.map((b, index) => {
    const empty = chords.slice(b.from, b.to).every((c) => report?.chords?.[chords.indexOf(c)]?.is_rest ?? true);
    const from = Math.round(b.startBeat * TICKS_PER_BEAT);
    const to = Math.round((b.startBeat + b.beats) * TICKS_PER_BEAT);
    const melody = notes.some((n) => n.start >= from && n.start < to);
    const names = chords.slice(b.from, b.to).filter((c) => !(report?.chords?.[chords.indexOf(c)]?.is_rest ?? true)).map((c) => String(c.symbol || "").trim()).filter(Boolean);
    // "new": a música ainda não tem harmonia nenhuma e só tem uma parte (ou é o exemplo): o pedido cria a música inteira
    const kind = state.project.example || (empty && !harmony && blocks.length === 1) ? "new" : empty ? "create" : "adjust";
    return {
      index, name: b.name, hue: sectionHue(b.name), beats: b.beats, empty, melody, kind, example: state.project.example === true,
      from: b.from, to: b.to, previous: blocks[index - 1]?.name ?? null, hasNext: index < blocks.length - 1,
      fromBar: Math.floor(b.startBeat / bpb + 1e-9) + 1, toBar: Math.ceil((b.startBeat + b.beats) / bpb - 1e-9),
      // o tamanho é livre só numa parte vazia e sem melodia (criada pelo pedido); com melodia ou com acordes, é fixo
      fixed: !(empty && !melody),
      request: String(chords[b.from]?.request || ""),
      startBeat: b.startBeat,
      // o tom: todas as partes ficam no tom da música (o da parte A)
      shift: 0, auto: false, key: song, songKey: song,
      firstSymbol: names[0] || "", lastSymbols: names.slice(-2),
    };
  });
}

/** A parte em que o assistente trabalha: a escolhida; senão a primeira vazia; senão a última. */
function getTarget() {
  const parts = getParts();
  if (!parts.length) return null;
  return parts[assistTarget] ?? parts.find((p) => p.empty) ?? parts.at(-1);
}

/** Escolhe a parte do assistente (e a mostra na faixa das partes). focus: leva a pessoa até o pedido. */
function selectPart(index, { focus = false } = {}) {
  assistTarget = index;
  if (formSelected !== index || formAdding) { formSelected = index; formAdding = false; renderForm(); }
  assistant?.refresh();
  if (focus) {
    $("#assistant").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#ai-prompt").focus({ preventScroll: true });
  }
}

/** O tom da música: o que está escrito no projeto; sem ele, o das notas da parte A (acordes e melodia). */
function songKey() {
  const p = state.project;
  const typed = parseKey(p.key);
  if (typed) return typed;
  const block = sectionBlocks(p.chords)[0];
  if (!block) return null;
  const weights = new Array(12).fill(0);
  for (const c of p.chords.slice(block.from, block.to)) {
    for (const field of ["bass", "left_hand", "right_hand", "notes"]) addPitchWeights(weights, c[field], toNumber(c.duration_beats) || 1);
  }
  const until = Math.round(block.beats * TICKS_PER_BEAT);
  for (const n of voiceNotes(p.voice, p.middle_c) || []) if (n.start < until) addPitchWeights(weights, n.name, n.length / TICKS_PER_BEAT);
  if (!weights.some((w) => w > 0)) return null;
  const guess = estimateKey(weights.map((w, pc) => ({ midi: 60 + pc, start: 0, end: w })).filter((n) => n.end > 0));
  return makeKey(guess.tonic, guess.mode);
}

/** O pedido de cada parte fica guardado no primeiro acorde dela (campo "request", só do app). */
function setPartRequest(index, text) {
  const block = sectionBlocks(state.project.chords)[index];
  if (!block) return;
  state.project.chords[block.from].request = text;
  saveDraftSoon();
}

const hasProgression = () => Boolean(state.report?.chords?.some((c) => !c.is_rest));

/**
 * Encaixa a resposta de uma PARTE: a IA mandou só os acordes novos (primeiro os reescritos do fim da parte anterior,
 * `continuation.retouched` deles, depois os da parte). Todo o resto da música fica como está, com a levada, o baixo e as
 * frases; nos acordes novos, o app escreve o ritmo que estiver ligado. Parte com melodia ou com harmonia não muda de
 * tamanho; parte criada só pelo pedido tem o tamanho que a IA der (as partes seguintes, e a melodia delas, se deslocam).
 * options: { explanation, request (o texto do pedido, que fica guardado na parte), index (a parte para a qual o pedido foi
 * copiado) }. Devolve { problems, title }.
 */
function applyContinuation(data, { explanation = "", request = "", index: asked = -1 } = {}) {
  const parts = getParts();
  const wanted = String(data.continuation?.section || "").trim().toLowerCase();
  const same = (p) => !wanted || p.name.toLowerCase() === wanted;
  // a parte: a do pedido copiado, se o nome bater; senão a parte vazia com esse nome; senão a primeira com esse nome
  const target = (parts[asked] && same(parts[asked]) ? parts[asked] : null) ?? parts.find((p) => p.empty && same(p)) ?? parts.find((p) => same(p)) ?? null;
  if (!target) return { problems: [`A resposta é da parte "${data.continuation?.section}", mas a música não tem uma parte com esse nome.`] };
  const p = state.project;
  const mc = p.middle_c;
  const raw = { middle_c: "C4", chords: Array.isArray(data.chords) ? data.chords : [] };
  const incoming = toEditable(mc === "C4" ? raw : renameProjectNotes(raw, mc)).chords;
  const before = target.index > 0 ? parts[target.index - 1] : null;
  // retoque do fim da parte anterior: só ao CRIAR uma parte, e no máximo 2 acordes
  const allowed = target.kind === "create" && before ? Math.min(2, before.to - before.from) : 0;
  const count = Math.max(0, Math.min(allowed, Math.round(Number(data.continuation?.retouched) || 0), Math.max(0, incoming.length - 1)));
  const sum = (list) => list.reduce((n, c) => n + (toNumber(c.duration_beats) || 0), 0);
  const replaced = p.chords.slice(target.from - count, target.from);
  const retouched = incoming.slice(0, count);
  const fresh = incoming.slice(count);
  const problems = [];
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  if (!fresh.length) problems.push(`Faltam os acordes da parte "${target.name}".`);
  else if (target.fixed && !near(sum(fresh), target.beats)) {
    problems.push(`Os acordes da parte "${target.name}" somam ${fmt(sum(fresh))} tempos, mas a parte tem ${fmt(target.beats)} `
      + `(${target.melody ? "a melodia dela não pode sair do lugar" : "uma parte que já existe não muda de tamanho"}).`);
  }
  if (count && !near(sum(retouched), sum(replaced))) {
    problems.push(`Os ${count} acordes reescritos do fim da parte "${before.name}" somam ${fmt(sum(retouched))} tempos, mas os que eles substituem somam ${fmt(sum(replaced))}.`);
  }
  if (problems.length) return { problems };
  const undo = snapshot();
  stopPlayback();
  // as marcas das partes ficam onde estavam: a do começo da parte anterior (se o 1º acorde dela foi reescrito) e a desta
  retouched.forEach((c, i) => { c.section = i === 0 ? String(replaced[0]?.section || "").trim() : ""; c.request = i === 0 ? String(replaced[0]?.request || "") : ""; });
  fresh.forEach((c, i) => { c.section = i === 0 ? target.name : ""; });
  fresh[0].request = request || target.request;
  const start = target.from - count;
  const after = p.chords.slice(target.to);
  // parte criada só pelo pedido: se o tamanho mudou, a melodia das partes seguintes se desloca junto
  const delta = Math.round((sum(fresh) - target.beats) * TICKS_PER_BEAT);
  if (delta && after.length) {
    const edge = Math.round(sectionBlocks(p.chords)[target.index + 1].startBeat * TICKS_PER_BEAT);
    const notes = voiceNotes(p.voice, mc);
    if (notes) p.voice = voiceTextOf(notes.map((n) => (n.start >= edge ? { ...n, start: n.start + delta } : n)));
  }
  p.chords = [...p.chords.slice(0, start), ...retouched, ...fresh, ...after];
  if (explanation) p.comment = [p.comment, `Parte ${target.name}: ${explanation}`].filter(Boolean).join("\n\n");
  // o ritmo que já estava ligado continua, agora também nos acordes novos (os outros não mudam)
  const g = p.groove || {};
  const only = new Set(Array.from({ length: retouched.length + fresh.length }, (_, i) => start + i));
  const others = p.chords.filter((_, i) => !only.has(i));
  const had = (key) => others.some((c) => String(c[key] || "").trim());
  const pick = (id) => (id && id !== CUSTOM_COMP ? id : undefined);
  const options = {
    comp: had("comp") ? pick(g.comp) : undefined, bass: had("bass_line") ? pick(g.bass) : undefined,
    drums: String(p.drums || "").trim() ? pick(g.drums) : undefined, percussion: String(p.percussion || "").trim() ? pick(g.percussion) : undefined,
    phrases: had("phrase") ? true : undefined, riff: had("riff") ? pick(g.riff) : undefined,
  };
  formSelected = target.index;
  assistTarget = target.index;
  renderAll();
  if (Object.values(options).some((v) => v !== undefined)) applyGroove({ ...options, only, quiet: true });
  refreshSecondVoice();
  renderAll();
  validateNow();
  saveDraftSoon();
  const what = count ? ` e ${count} acorde${count > 1 ? "s" : ""} do fim da parte ${before.name} reescrito${count > 1 ? "s" : ""}` : "";
  const verb = target.kind === "adjust" ? "ajustada" : "criada";
  toast(`Parte ${target.name} ${verb}: ${fresh.length} acordes${what}. O resto da música ficou como estava.`, { action: { label: "Desfazer", run: undo }, timeout: 9000 });
  $("#progression-heading").scrollIntoView({ behavior: "smooth", block: "start" });
  return { problems: [], title: `parte ${target.name} de ${p.title}` };
}

/** Carrega a progressão gerada. A IA escreve em C4 = dó central; convertemos para a convenção escolhida aqui. */
function applyGenerated(data, { comment, message }) {
  const project = { ...data, comment, middle_c: "C4" };
  if (!("strum" in project)) project.strum = state.project.strum; // pedido que não fala de strum mantém o seu
  const mc = state.project.middle_c;
  const converted = mc === "C4" ? project : renameProjectNotes(project, mc);
  if (!converted.voice && state.project.voice) converted.voice = state.project.voice; // a Voz cantada (já na convenção daqui) continua no projeto
  // as escolhas da segunda voz e das viradas também continuam; a segunda voz é reescrita em cima da harmonia nova
  const kept = state.project.groove || {};
  converted.groove = { ...(converted.groove || {}), voice2: kept.voice2, voice2Variation: kept.voice2Variation, drumFill: kept.drumFill, bassFill: kept.bassFill };
  loadProject(converted, message);
  if (state.project.groove.voice2) { refreshSecondVoice(); renderAll(); }
  $("#progression-heading").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------- app instalável (PWA)
let installPrompt = null;

function setupInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // o convite aparece no menu ⋯, sem barra insistente
    installPrompt = e;
    $("#install-item").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    $("#install-item").hidden = true;
    toast("Harmona Lab instalado. Ele abre pelo ícone e funciona offline.");
  });
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* sem offline, o resto funciona */ });
  }
}

async function installApp() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  $("#install-item").hidden = true;
}

async function init() {
  bindUi();
  setupInstall();
  let data = loadDraft();
  const hadDraft = Boolean(data); // quem já tinha trabalho salvo é avisado antes de um link trocar a progressão
  if (!data) {
    try {
      const res = await fetch("./example.json");
      if (res.ok) data = { ...(await res.json()), example: true };
    } catch { /* sem exemplo: começa vazio */ }
  }
  state.project = toEditable(data || { title: "Nova progressão", chords: [{}] });
  renderAll();
  assistant = initAssistant({
    $, h, icon, toast, getProjectJson: currentProjectJson, getVoice, getParts, getTarget, selectPart, setPartRequest, describeNewSection, hasProgression, applyGenerated, applyContinuation,
  });
  window.addEventListener("hashchange", () => handleHash(true));
  await handleHash(hadDraft);
}

init();
