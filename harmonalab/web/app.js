// Harmona Lab — interface. Edita o modelo (JSON) e mostra o que o motor analisou.
// O motor (engine/) roda aqui mesmo no navegador: o app funciona offline, sem servidor,
// e gera os mesmos bytes de MIDI que a versão em Python (há teste comparando).

import { buildShareHash } from "./ai/link.js";
import { initAssistant } from "./ai/ui.js";
import { Player } from "./audio.js";
import { analyzeData } from "./engine/analysis.js";
import { compOptions, generateGroove } from "./engine/groove.js";
import { TICKS_PER_BEAT, midiBytes, noteEvents } from "./engine/midi.js";
import { STYLES, findStyle, styleByLabel } from "./kb/estilos.js";
import { loadProject as readProject, renameProjectNotes } from "./engine/model.js";
import { keyboardRange, renderKeyboard } from "./keyboard.js";
import { VOICINGS, revoiceChord } from "./engine/voicing.js";
import { LARGE_BANK_BYTES, SAME, SIMPLE, SoundFontPlayer, formatSize, parsePatchValue, patchValue, suggestedPreset } from "./sound.js";

const DRAFT_KEY = "harmonalab:draft:v1";
const SOUND_KEY = "harmonalab:sound";
const GROOVE_KEY = "harmonalab:groove";
const CUSTOM_COMP = "custom"; // levada escrita à mão (ou vinda num projeto), que não é uma das opções do estilo
const TIME_SIGNATURES = ["2/4", "3/4", "4/4", "5/4", "6/4", "3/8", "5/8", "6/8", "7/8", "9/8", "12/8"];
const PART_CLASS = { right_hand: "rh", left_hand: "lh", bass: "bass", notes: "free" };
const PART_LABEL = { right_hand: "Mão direita", left_hand: "Mão esquerda", bass: "Baixo / pedal", notes: "Notas sem mão" };
const CHORD_FIELDS = ["right_hand", "left_hand", "bass", "notes", "top_note", "velocity", "duration_beats", "strum", "omitted", "phrase", "phrase_scale", "comp"];
const PHRASE_MODES = ["both", "line", "chords"]; // acorde + frase · mão esquerda + frase · só acorde
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
  phraseMode: "both", // o que ouvir e exportar: acorde + frase, mão esquerda + frase ou só acorde
  sound: { chords: SIMPLE, phrase: SAME }, // som da pré-escuta: timbre simples ou um instrumento do banco ("sf:MSB:LSB:programa")
  groove: { style: STYLES[0].id, variation: 0 }, // estilo do ritmo e das frases, e qual variação das frases
};
const refs = new WeakMap(); // acorde → elementos do cartão
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
    top_note: "", velocity: "", strum: "", function: "", scale: "", omitted: "", comment: "", phrase: "", phrase_scale: "", phrase_color: "", comp: "", ...extra,
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
      phrase: text(c.phrase), phrase_scale: text(c.phrase_scale), phrase_color: text(c.phrase_color),
      comp: Array.isArray(c.comp) ? c.comp.join(" ; ") : text(c.comp),
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
    groove: data.groove && typeof data.groove === "object" ? { comp: String(data.groove.comp || "") } : { comp: "" },
    references: Array.isArray(data.references) ? data.references.join(", ") : typeof data.references === "string" ? data.references : "",
    chords,
  };
}

/** Modelo editável → JSON enviado ao servidor (sem ids internos). */
function toPayload(project = state.project) {
  const { chords, ...rest } = project;
  return { ...rest, chords: chords.map(({ id, ...chord }) => chord) };
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
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(toPayload())); } catch { /* sem armazenamento */ }
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
  r.badge = h("span", { class: "ponta-badge", title: "Ponta: a nota mais aguda" });
  const head = h("div", { class: "chord-head" },
    h("span", { class: "chord-index", "aria-hidden": "true" }, n),
    h("div", { style: "flex:1;min-width:0" }, r.symbol, r.fn, r.pos),
    r.badge,
    h("button", { type: "button", class: "btn ghost icon-only", "aria-label": `Ouvir acorde ${n}`, title: "Ouvir este acorde", onclick: () => playOne(chord) }, icon("play")),
  );

  // O que vai para o MIDI: teclado + notas do grave ao agudo
  r.kb = h("div", { class: "kb", role: "img", "aria-label": "Teclas do voicing" });
  r.chips = h("div", { class: "chips" });
  r.spacing = h("p", { class: "spacing" });
  const view = h("div", { class: "voicing-view" }, r.kb, r.chips, r.spacing);

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
  r.segments = [0.5, 1, 2].map((factor) => h("button", {
    type: "button", "aria-pressed": "false",
    onclick: () => {
      chord.duration_beats = beatsPerBar() * factor;
      r.beats.value = chord.duration_beats;
      updateDuration(chord);
      scheduleValidate();
    },
  }, factor === 0.5 ? "½ comp." : `${factor} comp.`));
  r.segments.forEach((b, i) => { b.dataset.factor = [0.5, 1, 2][i]; });
  r.beats = h("input", {
    type: "number", class: "beats-input", inputmode: "decimal", min: "0", step: "any",
    value: chord.duration_beats, "aria-label": "Duração em tempos de semínima", title: "Tempos de semínima",
    oninput: (e) => { chord.duration_beats = e.target.value; updateDuration(chord); scheduleValidate(); },
  });
  r.inputs.duration_beats = r.beats;
  r.durHint = h("span", { class: "unit-hint" });
  r.msgs.duration_beats = h("span", { class: "field-msg" });
  const duration = h("div", { class: "field duration" },
    h("span", { class: "label" }, "Duração"),
    h("div", { class: "duration-row" }, h("div", { class: "segmented", role: "group", "aria-label": "Duração em compassos" }, r.segments), r.beats),
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
      phraseField("Cor da frase (dentro, cromatico ou outside)", "phrase_color", "vazio = costume do estilo"),
      phraseField("Levada (ritmo do acorde)", "comp", "ex.: E/4 D/8 D/8 E/4 D/4", true),
      h("label", { class: "field wide", for: `f-${chord.id}-strum` }, h("span", { class: "label" }, "Strum deste acorde"), r.strum, r.msgs.strum),
      noteField(chord, r, "bass", "ex.: E1 (soa junto)"),
      noteField(chord, r, "notes", "ex.: G3 B3"),
      h("label", { class: "field" }, h("span", { class: "label" }, "Notas omitidas (só anotação)"), r.omitted, r.msgs.omitted),
      h("label", { class: "field" }, h("span", { class: "label" }, "Comentário"), r.comment),
    ));

  r.issues = h("ul", { class: "issues" });

  const actions = h("div", { class: "chord-actions" },
    h("button", { type: "button", class: "btn ghost small icon-only", "aria-label": `Mover acorde ${n} para cima`, title: "Mover para cima", disabled: index === 0, onclick: () => moveChord(chord, -1) }, icon("up")),
    h("button", { type: "button", class: "btn ghost small icon-only", "aria-label": `Mover acorde ${n} para baixo`, title: "Mover para baixo", disabled: index === total - 1, onclick: () => moveChord(chord, 1) }, icon("down")),
    h("span", { class: "spacer" }),
    h("button", { type: "button", class: "btn ghost small", onclick: () => duplicateChord(chord) }, icon("copy"), "Duplicar"),
    h("button", { type: "button", class: "btn ghost small danger", onclick: () => removeChord(chord) }, icon("trash"), "Remover"),
  );

  r.card = h("li", { class: "card chord", dataset: { id: chord.id } }, head, r.note, view, r.phraseLine, hands, voicingRow, params, r.more, r.issues, actions);
  updateDuration(chord);
  updateLock(chord);
  updateFn(chord);
  return r.card;
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
  r.durHint.textContent = bars ? `em tempos de semínima · = ${bars}` : "em tempos de semínima";
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
  $("#chords").replaceChildren(...chords.map((c, i) => chordCard(c, i, chords.length)));
  renderAnalysis();
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
      r.chips.replaceChildren();
      r.spacing.textContent = "";
    } else if (info.is_rest) {
      r.chips.replaceChildren(h("span", { class: "rest-note" }, `Pausa · silêncio de ${barsText(info.duration_beats) || `${fmt(info.duration_beats)} tempos`}`));
      r.spacing.textContent = "";
    } else {
      const topMidi = info.top?.midi;
      r.chips.replaceChildren(...info.notes.map((note) => h("span", {
        class: `chip ${PART_CLASS[note.part]}${note.midi === topMidi ? " top" : ""}`,
        title: `${PART_LABEL[note.part]} · MIDI ${note.midi}`,
      }, h("b", null, note.name), h("small", null, note.midi === topMidi ? `${note.midi} · topo` : note.midi))));
      const parts = ["grave → agudo"];
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
        if (["bass", "notes", "omitted", "strum", "phrase", "phrase_scale", "comp"].includes(field)) r.more.open = true;
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
  assistant?.refresh();
}

/** O seletor "ouvir e exportar" só aparece quando alguma frase tem notas. */
function renderPhraseMode() {
  const any = (state.report?.chords || []).some((c) => c.phrase);
  $("#phrase-mode-box").hidden = !any;
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
  const copy = { ...chord, id: nextId++ };
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
  list.splice(index, 1);
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
  if (only) {
    project.chords = [project.chords[index]];
    const [chord] = project.chords;
    if (!chord.phrase_events.length && !chord.comp_layers.length) chord.duration_beats = Math.min(chord.duration_beats, (project.tempo / 60) * 4);
  }
  return { project, index };
}

/** Timbre simples: toca a lista de notas do motor (acordes, levada, strum e frase). */
function playSimple(project, index, { onEnd }) {
  const seconds = 60 / project.tempo / TICKS_PER_BEAT;
  const { notes, starts, end } = noteEvents(project, { phraseMode: state.phraseMode });
  player.play(
    notes.map((n) => ({ midi: n.pitch, start: n.start * seconds, length: (n.end - n.start) * seconds, velocity: n.velocity })),
    {
      steps: starts.map((tick, i) => ({ time: tick * seconds, index: index >= 0 ? index : i })),
      total: end * seconds, onStep: (i) => setPlaying(i), onEnd,
    },
  );
  return notes.length;
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
  if (usingSoundFont() && (await playWithSoundFont())) return;
  playSimple(previewProject().project, -1, { onEnd: () => stopPlayback() });
}

async function playOne(chord) {
  stopPlayback();
  if (usingSoundFont()) soundFont.unlock();
  await validateNow();
  if (usingSoundFont() && (await playWithSoundFont(chord))) return;
  const { project, index } = previewProject(chord);
  if (!playSimple(project, index, { onEnd: () => setPlaying(-1) })) { player.stop(); toast("Este acorde ainda não tem notas válidas."); }
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
    if (saved && findStyle(saved.style)) state.groove = { style: saved.style, variation: Number.isInteger(saved.variation) ? saved.variation : 0 };
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
  $("#groove-comp").replaceChildren(
    h("option", { value: "" }, "Desligada (acorde inteiro)"),
    ...options.map((o) => h("option", { value: o.id }, o.label)),
    ...(value === CUSTOM_COMP ? [h("option", { value: CUSTOM_COMP }, "Personalizada (do projeto)")] : []),
  );
  $("#groove-comp").value = value;

  const phrases = anyChord("phrase");
  $("#groove-phrases").checked = phrases;
  $("#groove-again").hidden = !phrases;
}

/** Escreve (ou apaga) a levada e/ou as frases em todos os acordes. Tudo pode ser desfeito. */
function applyGroove({ comp, phrases }, message) {
  const undo = snapshot();
  stopPlayback();
  const style = grooveStyle();
  const result = generateGroove(toPayload(), { style, comp: comp || null, phrases: phrases === true, variation: state.groove.variation });
  state.project.chords.forEach((chord, i) => {
    const made = result.chords[i] || {};
    if (comp !== undefined) chord.comp = comp ? made.comp ?? "" : "";
    if (phrases === true) {
      chord.phrase = made.phrase ?? "";
      if (made.phrase_scale && !String(chord.phrase_scale || "").trim()) chord.phrase_scale = made.phrase_scale;
    } else if (phrases === false) {
      chord.phrase = "";
    }
  });
  if (comp !== undefined) state.project.groove = { comp: comp || "" };
  if (comp || phrases === true) state.project.style = style.label;
  renderSettings();
  renderChords();
  validateNow();
  saveDraftSoon();
  toast([message, ...result.notes].join(" "), { action: { label: "Desfazer", run: undo }, timeout: result.notes.length ? 9000 : 4500 });
}

function bindGroove() {
  loadGroove();
  $("#groove-style").addEventListener("change", (e) => {
    state.groove.style = e.target.value;
    saveGroove();
    const style = grooveStyle();
    const current = state.project.groove?.comp || "";
    const hasComp = anyChord("comp") && current && current !== CUSTOM_COMP;
    const phrases = anyChord("phrase");
    if (!hasComp && !phrases) { renderGroove(); return; }
    const comp = hasComp ? (compOptions(style).some((o) => o.id === current) ? current : style.comps[0].id) : undefined;
    applyGroove({ comp, phrases: phrases ? true : undefined }, `Ritmo e frases refeitos em ${style.label}.`);
  });
  $("#groove-comp").addEventListener("change", (e) => {
    const id = e.target.value;
    if (id === CUSTOM_COMP) return;
    const label = e.target.selectedOptions[0]?.textContent ?? "";
    applyGroove({ comp: id }, id ? `Levada nos acordes: ${label}.` : "Levada desligada: cada acorde volta a soar inteiro.");
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
const usingSoundFont = () => Boolean(soundFont.bank) && parsePatchValue(state.sound.chords) !== null;

/**
 * Toca com o banco de sons o mesmo MIDI que "Gerar MIDI" exporta (no modo de frase escolhido).
 * Devolve false quando não dá (há erros na progressão): aí quem chamou usa o timbre simples.
 */
async function playWithSoundFont(only = null) {
  if (!state.report?.ok) {
    toast("Há erros na progressão: por enquanto, ela toca com o timbre simples.");
    return false;
  }
  const { project, index } = previewProject(only);
  const bytes = midiBytes(project, { phraseMode: state.phraseMode });
  const slow = setTimeout(() => toast("Carregando o banco de sons…"), 500);
  try {
    await soundFont.play(bytes, {
      chords: state.sound.chords, phrase: state.sound.phrase,
      onEnd: () => (only ? setPlaying(-1) : stopPlayback()),
    });
  } catch (err) {
    clearTimeout(slow);
    toast(err.message, { error: true, timeout: 8000 });
    stopPlayback();
    return true;
  }
  clearTimeout(slow);
  // destaca o acorde que está soando (os tempos vêm do próprio projeto, como no arquivo)
  const secondsPerBeat = 60 / project.tempo;
  let start = 0;
  project.chords.forEach((chord, i) => {
    soundTimers.push(setTimeout(() => setPlaying(only ? index : i), start * secondsPerBeat * 1000));
    start += chord.duration_beats;
  });
  return true;
}

function saveSoundChoice() {
  try { localStorage.setItem(SOUND_KEY, JSON.stringify(state.sound)); } catch { /* sem armazenamento */ }
}

function loadSoundChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOUND_KEY) || "null");
    if (saved && typeof saved.chords === "string") state.sound = { chords: saved.chords, phrase: typeof saved.phrase === "string" ? saved.phrase : SAME };
  } catch { /* fica o padrão */ }
}

/** Os dois menus de som, o resumo e os botões, a partir do banco guardado. */
function renderSound() {
  const bank = soundFont.bank;
  const presets = bank?.presets ?? [];
  const valid = new Set(presets.map(patchValue));
  if (soundRestored) {
    if (!valid.has(state.sound.chords)) state.sound.chords = SIMPLE;
    if (state.sound.phrase !== SAME && !valid.has(state.sound.phrase)) state.sound.phrase = SAME;
  }
  const presetOptions = () => presets.map((p) => h("option", { value: patchValue(p) }, `${p.name}${p.isDrum ? " (bateria)" : ""}`));
  const chords = $("#sound-chords");
  chords.replaceChildren(
    h("option", { value: SIMPLE }, "Timbre simples do app"),
    ...(presets.length ? [h("optgroup", { label: `${bank.name} · ${formatSize(bank.size)}` }, ...presetOptions())] : []),
  );
  chords.value = state.sound.chords;
  const phrase = $("#sound-phrase");
  phrase.replaceChildren(h("option", { value: SAME }, "O mesmo dos acordes"), ...presetOptions());
  phrase.value = state.sound.phrase;
  updateSoundPhraseField();
  $("#sound-remove").hidden = !bank;
  $("#sound-load").textContent = bank ? "Trocar o banco de sons" : "Carregar banco de sons (.sf2)";
  const current = presets.find((p) => patchValue(p) === state.sound.chords);
  $("#sound-summary").textContent = current ? current.name : "timbre simples";
}

/** "Som da frase" só aparece com banco carregado, instrumento escolhido e alguma frase na progressão. */
function updateSoundPhraseField() {
  const anyPhrase = (state.report?.chords || []).some((c) => c.phrase);
  $("#sound-phrase-field").hidden = !soundFont.bank?.presets?.length || !anyPhrase || state.sound.chords === SIMPLE;
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
    state.sound = { chords: preset ? patchValue(preset) : SIMPLE, phrase: SAME };
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
  $("#sound-load").addEventListener("click", () => $("#sound-file").click());
  $("#sound-file").addEventListener("change", (e) => {
    const [file] = e.target.files;
    e.target.value = "";
    chooseSoundFile(file);
  });
  $("#sound-remove").addEventListener("click", async () => {
    if (!window.confirm(`Remover ${soundFont.bank?.name ?? "o banco de sons"} deste aparelho?`)) return;
    await soundFont.removeBank();
    state.sound = { chords: SIMPLE, phrase: SAME };
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

async function exportMidi() {
  validateNow();
  if (!state.report?.ok) {
    const n = state.report.issues.filter((i) => i.level === "error").length;
    toast(n === 1 ? "Há 1 erro para corrigir antes de gerar o MIDI." : `Há ${n} erros para corrigir antes de gerar o MIDI.`, { error: true });
    focusFirstError();
    return;
  }
  const { project } = readProject(toPayload());
  const bytes = midiBytes(project, { phraseMode: state.phraseMode });
  const filename = `${slugify(state.project.title)}.mid`;
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
    loadProject(await res.json(), "Exemplo carregado.");
  } catch {
    toast("Exemplo indisponível.", { error: true });
  }
}

function newProject() {
  loadProject({ title: "Nova progressão", tempo: state.project.tempo, time_signature: state.project.time_signature,
    middle_c: state.project.middle_c, default_velocity: state.project.default_velocity, strum: state.project.strum, chords: [{}] }, "Projeto novo.");
}

// ---------------------------------------------------------------- início
function bindUi() {
  $("#menu-button").append(icon("dots"));
  $("#add-chord").append(icon("plus"), "Acorde");
  $("#add-rest").append(icon("plus"), "Pausa");
  renderPlayButton();
  document.querySelectorAll(".menu-item[data-icon]").forEach((b) => b.prepend(icon(b.dataset.icon)));

  $("#add-chord").addEventListener("click", () => addChord());
  $("#add-rest").addEventListener("click", () => addChord({ symbol: "Pausa" }));
  $("#play-all").addEventListener("click", playAll);
  $("#voicing-all").replaceChildren(...VOICINGS.map((v) => h("button", { type: "button", onclick: () => revoiceChords({ kind: v.id }) }, v.label)));
  $("#pedal-apply").addEventListener("click", () => {
    const pedal = $("#pedal-note").value.trim();
    if (!pedal) { toast("Digite a nota da ponta pedal, por exemplo F#5.", { error: true }); return; }
    revoiceChords({ pedal });
  });
  $("#export").addEventListener("click", exportMidi);
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

const hasProgression = () => Boolean(state.report?.chords?.some((c) => !c.is_rest));

/** Carrega a progressão gerada. A IA escreve em C4 = dó central; convertemos para a convenção escolhida aqui. */
function applyGenerated(data, { comment, message }) {
  const project = { ...data, comment, middle_c: "C4" };
  if (!("strum" in project)) project.strum = state.project.strum; // pedido que não fala de strum mantém o seu
  const mc = state.project.middle_c;
  loadProject(mc === "C4" ? project : renameProjectNotes(project, mc), message);
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
      if (res.ok) data = await res.json();
    } catch { /* sem exemplo: começa vazio */ }
  }
  state.project = toEditable(data || { title: "Nova progressão", chords: [{}] });
  renderAll();
  assistant = initAssistant({
    $, h, icon, toast, getProjectJson: currentProjectJson, hasProgression, applyGenerated,
  });
  window.addEventListener("hashchange", () => handleHash(true));
  await handleHash(hadDraft);
}

init();
