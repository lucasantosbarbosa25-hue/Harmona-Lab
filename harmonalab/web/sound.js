// Pré-escuta com bancos de sons (.sf2): o SpessaSynth toca exatamente o arquivo MIDI que o app exporta.
// Há três tipos de banco: os que vêm com o app (kb/sons.js, baixados de sons/ só quando escolhidos); o banco GERAL
// carregado do aparelho, que oferece os instrumentos dele a todos os sons; e um banco POR SOM (SLOTS: acordes, frase,
// baixo, riff, pad, bateria), carregado do aparelho só para aquela camada. Todos os do aparelho ficam guardados só nele
// (IndexedDB). Cada banco por som entra no tocador com um deslocamento de banco próprio, para não colidir com os outros.
// A biblioteca (vendor/spessasynth, Apache-2.0) só é carregada quando alguém usa um banco: quem não usa não paga nada.

import { BUILTIN_BANKS, findBuiltin } from "./kb/sons.js";

const VENDOR = new URL("./vendor/spessasynth/", import.meta.url);
const SOUNDS = new URL("./sons/", import.meta.url);
const DEVICE = "aparelho"; // o id do banco carregado do aparelho
const DRUM_CHANNEL = 9;
const BASS_CHANNEL = 2;
/** Cada banco embutido de teclado ganha um deslocamento de banco próprio, para não colidir com os outros (todos usam o programa 0). */
const builtinOffset = (id) => 40 + BUILTIN_BANKS.findIndex((b) => b.id === id); // de 40 até 103: os bancos por som começam no 104
const DB_NAME = "harmonalab";
const STORE = "sons";
const KEY = "banco";
/** Os sons que podem ter um banco próprio do aparelho (a percussão toca no canal da bateria: usa o banco dela). */
export const SLOTS = ["chords", "phrase", "bass", "riff", "pad", "drums"];
/** O deslocamento de banco de cada um (os embutidos usam de 40 a 103; aqui, de 4 em 4, do 104 ao 124). */
const SLOT_OFFSET = { chords: 104, phrase: 108, bass: 112, riff: 116, pad: 120, drums: 124 };
const slotId = (slot) => `${DEVICE}-${slot}`;
const slotKey = (slot) => `${KEY}:${slot}`;
export const SIMPLE = "simple"; // o timbre simples do app (osciladores)
export const SAME = "same"; // a frase usa o mesmo som dos acordes
export const NO_DRUMS = "none"; // bateria muda na escuta (no MIDI ela continua)
const CHORD_CHANNEL = 0;
const PHRASE_CHANNEL = 1;
const VOICE_CHANNEL = 3; // a Voz (melodia cantada) toca com o som da frase
const VOICE2_CHANNEL = 5; // a segunda voz, também
const PAD_CHANNEL = 4; // o pad (cordas ou pad do banco)
const RIFF_CHANNEL = 6; // o riff ou ostinato (guitarra, dedilhado, synth)
/** Acima disso o banco pode pesar demais no celular (avisamos antes de carregar). */
export const LARGE_BANK_BYTES = 200 * 1024 * 1024;

// ---------------------------------------------------------------- escolhas (texto ↔ preset)

/**
 * Escolha de som em texto: "sf:MSB:LSB:programa" = instrumento do banco do aparelho; "kb:id" = banco embutido (kb/sons.js).
 * parsePatchValue devolve { bank: "aparelho" | id, bankMSB, bankLSB, program } ou null.
 */
export const patchValue = (p) => `sf:${p.bankMSB}:${p.bankLSB}:${p.program}`;
/** Instrumento do banco carregado só para um som: "sf@bass:112:0:33" (o banco já vem com o deslocamento do som). */
export const slotPatchValue = (slot, p) => `sf@${slot}:${p.bankMSB}:${p.bankLSB}:${p.program}`;
export const builtinValue = (id) => `kb:${id}`;
export function parsePatchValue(value) {
  const text = String(value || "");
  const m = /^sf:(\d+):(\d+):(\d+)$/.exec(text);
  if (m) return { bank: DEVICE, bankMSB: Number(m[1]), bankLSB: Number(m[2]), program: Number(m[3]) };
  const own = /^sf@(\w+):(\d+):(\d+):(\d+)$/.exec(text);
  if (own && SLOTS.includes(own[1])) return { bank: slotId(own[1]), slot: own[1], bankMSB: Number(own[2]), bankLSB: Number(own[3]), program: Number(own[4]) };
  const k = /^kb:([\w-]+)$/.exec(text);
  const builtin = k ? findBuiltin(k[1]) : null;
  return builtin ? { bank: builtin.id, ...builtin.preset } : null;
}

/** Instrumento sugerido ao carregar um banco: um piano elétrico, se houver; senão o primeiro. */
export function suggestedPreset(presets) {
  const usable = presets.filter((p) => !p.isDrum);
  return usable.find((p) => /rhodes|wurli|e\.?\s?piano|electric\s*piano|\bep\b|suitcase/i.test(p.name)) ?? usable[0] ?? presets[0] ?? null;
}

/**
 * Confere a estrutura antes de entregar ao tocador (que, com um arquivo estragado, fica esperando sem avisar).
 * Lê só os cabeçalhos: SF2/SF3 ("RIFF....sfbk" com as listas INFO, sdta e pdta) ou DLS ("RIFF....DLS ").
 * Devolve "" quando está tudo certo, ou o problema em português.
 */
export function soundBankProblem(buffer) {
  const NOT_BANK = "Este arquivo não é um banco de sons (.sf2, .sf3 ou .dls).";
  const CUT = "O arquivo parece incompleto (cortado no download?). Baixe de novo e tente outra vez.";
  if (!buffer || buffer.byteLength < 12) return NOT_BANK;
  const view = new DataView(buffer);
  const id = (at) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  const form = id(8);
  if (id(0) !== "RIFF" || !["sfbk", "DLS "].includes(form)) return NOT_BANK;
  const end = 8 + view.getUint32(4, true);
  if (end > buffer.byteLength + 1) return CUT; // +1: alguns programas não gravam o byte de alinhamento final
  if (form !== "sfbk") return "";
  const lists = new Map(); // tipo da lista → [início do conteúdo, fim]
  for (let at = 12; at + 8 <= Math.min(end, buffer.byteLength);) {
    const size = view.getUint32(at + 4, true);
    const next = at + 8 + size + (size % 2);
    if (at + 8 + size > buffer.byteLength) return CUT;
    if (id(at) === "LIST" && size >= 4) lists.set(id(at + 8), [at + 12, at + 8 + size]);
    at = next;
  }
  if (!["INFO", "sdta", "pdta"].every((name) => lists.has(name))) return CUT;
  const [from, to] = lists.get("pdta");
  for (let at = from; at + 8 <= to; at += 8 + view.getUint32(at + 4, true)) if (id(at) === "phdr") return "";
  return CUT;
}

/** Áudio (AudioBuffer ou { sampleRate, channels: [Float32Array, ...] }) → bytes de um arquivo WAV de 16 bits. */
export function wavBytes(audio) {
  const channels = audio.channels ?? Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const frames = channels[0]?.length ?? 0;
  const count = channels.length;
  const out = new DataView(new ArrayBuffer(44 + frames * count * 2));
  const text = (at, value) => { for (let i = 0; i < value.length; i++) out.setUint8(at + i, value.charCodeAt(i)); };
  text(0, "RIFF"); out.setUint32(4, 36 + frames * count * 2, true); text(8, "WAVE");
  text(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, count, true);
  out.setUint32(24, audio.sampleRate, true); out.setUint32(28, audio.sampleRate * count * 2, true); out.setUint16(32, count * 2, true); out.setUint16(34, 16, true);
  text(36, "data"); out.setUint32(40, frames * count * 2, true);
  for (let i = 0, at = 44; i < frames; i++) {
    for (let c = 0; c < count; c++, at += 2) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      out.setInt16(at, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
    }
  }
  return new Uint8Array(out.buffer);
}

/**
 * Os controles de timbre de cada som, em mensagens MIDI. Cada controle vai de 0 a 100; sem valor (null), nada é enviado
 * e vale o som como ele é. Nos de ataque, decay, release, brilho e ressonância, 50 é "como está" (o controle é relativo);
 * reverb, chorus e delay são a quantidade do efeito.
 */
export const SHAPE_CONTROLS = [
  { id: "attack", label: "Ataque", cc: 73, relative: true, hint: "para a direita, o som entra mais devagar" },
  { id: "decay", label: "Decay", cc: 75, relative: true, hint: "quanto o som demora para cair depois do ataque" },
  { id: "sustain", label: "Sustain", cc: null, hint: "segura cada nota além do escrito (até 2 tempos); vale a partir do próximo play" },
  { id: "release", label: "Release", cc: 72, relative: true, hint: "quanto o som demora para sumir depois de solto" },
  { id: "cutoff", label: "Brilho (cutoff)", cc: 74, relative: true, floor: 30, hint: "para a esquerda, o som fica mais abafado" },
  { id: "resonance", label: "Ressonância", cc: 71, relative: true, hint: "realça a região do corte" },
  { id: "reverb", label: "Reverb", cc: 91, hint: "ambiente" },
  { id: "chorus", label: "Chorus", cc: 93, hint: "som mais largo" },
  { id: "delay", label: "Delay", cc: 94, hint: "eco" },
];
/** O valor de cada controle quando ninguém mexeu: o meio nos relativos (o som como ele é), zero nos efeitos e no sustain. */
export const shapeDefault = (control) => (control.relative ? 50 : 0);
/** Os canais MIDI de cada som (a frase leva junto a Voz e a segunda voz). */
export const SOUND_CHANNELS = { chords: [CHORD_CHANNEL], phrase: [PHRASE_CHANNEL, VOICE_CHANNEL, VOICE2_CHANNEL], bass: [BASS_CHANNEL], riff: [RIFF_CHANNEL], pad: [PAD_CHANNEL], drums: [DRUM_CHANNEL] };
/** O "sustain" de um som (0 a 100) → quantos tempos a nota é segurada além do escrito. */
export const holdBeats = (value) => (Number(value) > 0 ? (Math.min(100, Number(value)) / 100) * 2 : 0);

/** O valor do fader (0 a 100) → o valor MIDI do controle (0 a 127). Nos relativos, 50 vira 64 (sem mudança). */
export function shapeByte(control, value) {
  const v = Math.max(0, Math.min(100, Number(value)));
  if (!control.relative) return Math.round((v / 100) * 127);
  const low = control.floor ?? 0; // abaixo disso o som some (o brilho fechado demais cala o instrumento)
  return Math.round(v <= 50 ? low + (v / 50) * (64 - low) : 64 + ((v - 50) / 50) * 63);
}

/**
 * shaping: { chords: { attack: 30, reverb: 60 }, ... } → as mensagens de controle ([status, controlador, valor]).
 * Sem `all`, só vão os controles que saíram do padrão (o arquivo fica limpo); com `all`, todos (na escuta ao vivo, para
 * um controle que voltou ao padrão não ficar com o valor antigo no tocador).
 */
export function shapeSetup(shaping, { all = false } = {}) {
  const out = [];
  for (const [sound, channels] of Object.entries(SOUND_CHANNELS)) {
    for (const control of SHAPE_CONTROLS) {
      if (control.cc === null) continue;
      const value = shaping?.[sound]?.[control.id] ?? shapeDefault(control);
      if (!all && Number(value) === shapeDefault(control)) continue;
      for (const channel of channels) out.push([0xb0 | channel, control.cc, shapeByte(control, value)]);
    }
  }
  return out;
}

const withTimeout = (promise, ms, message) => Promise.race([
  promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
]);

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.ceil(bytes / 1024)} KB`);
export { formatSize };

// ---------------------------------------------------------------- guardado no aparelho

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Banco guardado: { name, size, presets, blob } ou null. `key`: o geral (KEY) ou o de um som (slotKey). */
export async function loadSavedBank(key = KEY) {
  try { return (await withStore("readonly", (s) => s.get(key))) ?? null; } catch { return null; }
}
const saveBank = (entry, key = KEY) => withStore("readwrite", (s) => s.put(entry, key));
export async function deleteSavedBank(key = KEY) {
  try { await withStore("readwrite", (s) => s.delete(key)); } catch { /* nada guardado */ }
}

// ---------------------------------------------------------------- tocador

export class SoundFontPlayer {
  constructor() {
    this.ctx = null;
    this.synth = null;
    this.seq = null;
    this.bank = null; // { name, size, presets } do banco guardado no aparelho
    this.loadedInSynth = false; // o banco do aparelho já está no tocador
    this.slots = {}; // o banco próprio de cada som: { chords: { name, size, presets }, ... }
    this.slotLoaded = new Set(); // os que já estão no tocador
    this.builtinLoaded = new Set(); // bancos embutidos já no tocador
    this.stats = { noteOns: 0, songs: 0 }; // para conferência (testes)
    this.onEnd = null;
  }

  /** Lê o que está guardado (só os dados; a biblioteca nem é carregada). */
  async restore() {
    const saved = await loadSavedBank();
    this.bank = saved ? { name: saved.name, size: saved.size, presets: saved.presets } : null;
    for (const slot of SLOTS) {
      const own = await loadSavedBank(slotKey(slot));
      if (own) this.slots[slot] = { name: own.name, size: own.size, presets: own.presets };
    }
    return this.bank;
  }

  /** Cria/retoma o áudio. Chame no toque do botão, antes de qualquer espera (o iPhone exige). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  async #ensureSynth() {
    if (this.synth) return;
    const ctx = this.unlock();
    const { WorkletSynthesizer, Sequencer } = await import(new URL("spessasynth.min.js", VENDOR).href);
    await ctx.audioWorklet.addModule(new URL("spessasynth_processor.min.js", VENDOR).href);
    const synth = new WorkletSynthesizer(ctx);
    synth.connect(ctx.destination);
    await synth.isReady;
    synth.eventHandler.addEvent("noteOn", "harmona", () => { this.stats.noteOns += 1; });
    const seq = new Sequencer(synth, { skipToFirstNoteOn: false });
    seq.loopCount = 0;
    seq.eventHandler.addEvent("songEnded", "harmona", () => { const done = this.onEnd; this.onEnd = null; done?.(); });
    this.synth = synth;
    this.seq = seq;
  }

  /** Coloca um banco no tocador e devolve a lista de instrumentos. Lança Error se o arquivo não for um banco de sons. */
  async #addToSynth(buffer) {
    const problem = soundBankProblem(buffer);
    if (problem) throw new Error(problem);
    await this.#ensureSynth();
    const listed = new Promise((resolve) => {
      this.synth.eventHandler.addEvent("presetListChange", "harmona-load", (list) => { if (list?.length) resolve(list); });
      setTimeout(() => resolve(this.synth.presetList), 5000);
    });
    try {
      // mesmo id: o banco novo substitui o anterior só se for lido sem erro
      await withTimeout(this.synth.soundBankManager.addSoundBank(buffer, DEVICE), 60000, "o arquivo demorou demais para abrir");
    } catch (err) {
      this.synth.eventHandler.removeEvent("presetListChange", "harmona-load");
      throw new Error(`Não consegui ler este arquivo como banco de sons: ${err?.message || err}`);
    }
    const list = await listed;
    this.synth.eventHandler.removeEvent("presetListChange", "harmona-load");
    this.loadedInSynth = true;
    const presets = (list || []).map(({ name, program, bankMSB, bankLSB, isDrum }) => ({ name, program, bankMSB, bankLSB, isDrum: Boolean(isDrum) }));
    if (!presets.length) throw new Error("O arquivo abriu, mas não tem nenhum instrumento.");
    return presets;
  }

  /**
   * Coloca no tocador o banco próprio de um som, com o deslocamento dele, e devolve só os instrumentos DESTE arquivo
   * (os que apareceram na lista do tocador depois de carregar), já com o banco deslocado.
   */
  async #addSlotToSynth(slot, buffer) {
    const problem = soundBankProblem(buffer);
    if (problem) throw new Error(problem);
    await this.#ensureSynth();
    const id = slotId(slot);
    if (this.slotLoaded.has(slot)) {
      await this.synth.soundBankManager.deleteSoundBank(id).catch(() => {});
      this.slotLoaded.delete(slot);
      await new Promise((resolve) => setTimeout(resolve, 150)); // a lista do tocador se atualiza
    }
    const key = (p) => `${p.bankMSB}:${p.bankLSB}:${p.program}:${p.isDrum ? 1 : 0}`;
    const before = new Set((this.synth.presetList || []).map(key));
    const listed = new Promise((resolve) => {
      this.synth.eventHandler.addEvent("presetListChange", `harmona-${slot}`, (list) => { if (list?.length) resolve(list); });
      setTimeout(() => resolve(this.synth.presetList), 5000);
    });
    try {
      await withTimeout(this.synth.soundBankManager.addSoundBank(buffer, id, SLOT_OFFSET[slot]), 60000, "o arquivo demorou demais para abrir");
    } catch (err) {
      this.synth.eventHandler.removeEvent("presetListChange", `harmona-${slot}`);
      throw new Error(`Não consegui ler este arquivo como banco de sons: ${err?.message || err}`);
    }
    const list = await listed;
    this.synth.eventHandler.removeEvent("presetListChange", `harmona-${slot}`);
    this.slotLoaded.add(slot);
    // só os deste arquivo, e só os que cabem num número de banco MIDI (até 127) depois do deslocamento
    const presets = (list || []).filter((p) => !before.has(key(p)) && p.bankMSB >= SLOT_OFFSET[slot] && p.bankMSB <= 127)
      .map(({ name, program, bankMSB, bankLSB, isDrum }) => ({ name, program, bankMSB, bankLSB, isDrum: Boolean(isDrum) }));
    if (!presets.length) {
      // não serve: sai do tocador (o banco que estava guardado para este som volta na próxima vez que ele tocar)
      await this.synth.soundBankManager.deleteSoundBank(id).catch(() => {});
      this.slotLoaded.delete(slot);
      throw new Error("O arquivo abriu, mas não tem nenhum instrumento que dê para usar neste som. Se for um banco só de bateria, carregue-o no som da bateria.");
    }
    return presets;
  }

  /** Banco escolhido só para um som (slot de SLOTS): carrega, confere e guarda no aparelho. Devolve { bank, saved }. */
  async loadSlotFile(slot, file) {
    const buffer = await file.arrayBuffer();
    const presets = await this.#addSlotToSynth(slot, buffer.slice(0));
    this.slots[slot] = { name: file.name, size: file.size, presets };
    let saved = true;
    try { await saveBank({ ...this.slots[slot], blob: new Blob([buffer]) }, slotKey(slot)); } catch { saved = false; }
    return { bank: this.slots[slot], saved };
  }

  async removeSlot(slot) {
    this.stop();
    if (this.slotLoaded.has(slot)) await this.synth.soundBankManager.deleteSoundBank(slotId(slot)).catch(() => {});
    this.slotLoaded.delete(slot);
    delete this.slots[slot];
    await deleteSavedBank(slotKey(slot));
  }

  /** Garante no tocador o banco próprio de um som (na primeira vez que alguém toca depois de abrir o app). */
  async #ensureSlot(slot) {
    if (this.slotLoaded.has(slot)) return;
    const saved = await loadSavedBank(slotKey(slot));
    if (!saved?.blob) throw new Error("O banco deste som não está mais guardado neste aparelho. Carregue o arquivo de novo.");
    this.slots[slot] = { name: saved.name, size: saved.size, presets: await this.#addSlotToSynth(slot, await saved.blob.arrayBuffer()) };
  }

  /** Arquivo escolhido pela pessoa: carrega, confere e guarda no aparelho. Devolve { bank, saved }. */
  async loadFile(file) {
    const buffer = await file.arrayBuffer();
    const presets = await this.#addToSynth(buffer.slice(0));
    this.bank = { name: file.name, size: file.size, presets };
    let saved = true;
    try {
      await saveBank({ ...this.bank, blob: new Blob([buffer]) });
    } catch {
      saved = false; // sem espaço ou sem IndexedDB: toca agora, mas não fica guardado
    }
    return { bank: this.bank, saved };
  }

  async removeBank() {
    this.stop();
    if (this.loadedInSynth) await this.synth.soundBankManager.deleteSoundBank(DEVICE).catch(() => {});
    this.loadedInSynth = false;
    this.bank = null;
    await deleteSavedBank();
  }

  /** Garante o banco guardado dentro do tocador (na primeira vez que alguém toca depois de abrir o app). */
  async #ensureBank() {
    if (this.loadedInSynth) return;
    const saved = await loadSavedBank();
    if (!saved?.blob) throw new Error("O banco de sons não está mais guardado neste aparelho. Carregue o arquivo de novo.");
    this.bank = { name: saved.name, size: saved.size, presets: await this.#addToSynth(await saved.blob.arrayBuffer()) };
  }

  /** Baixa (do próprio site; depois, do cache do aparelho) e coloca no tocador um banco embutido. */
  async #ensureBuiltin(id) {
    if (this.builtinLoaded.has(id)) return;
    const builtin = findBuiltin(id);
    const response = await fetch(new URL(encodeURIComponent(builtin.file), SOUNDS));
    if (!response.ok) throw new Error(`Não consegui baixar ${builtin.label} (${response.status}). Confira a internet e tente de novo.`);
    const buffer = await response.arrayBuffer();
    const problem = soundBankProblem(buffer);
    if (problem) throw new Error(`${builtin.label}: ${problem}`);
    await this.#ensureSynth();
    const offset = builtin.kind === "bateria" ? 0 : builtinOffset(id);
    await withTimeout(this.synth.soundBankManager.addSoundBank(buffer, `kb-${id}`, offset), 60000, `${builtin.label} demorou demais para abrir`);
    this.builtinLoaded.add(id);
  }

  /** Garante no tocador o banco de uma escolha ("sf:..." ou "kb:id") e devolve o instrumento com o banco já deslocado. */
  async #resolve(value) {
    const patch = parsePatchValue(value);
    if (!patch) return null;
    if (patch.slot) {
      await this.#ensureSlot(patch.slot);
      return patch; // o banco deste som já foi guardado com o deslocamento
    }
    if (patch.bank === DEVICE) {
      await this.#ensureBank();
      return patch;
    }
    await this.#ensureBuiltin(patch.bank);
    const builtin = findBuiltin(patch.bank);
    return builtin.kind === "bateria" ? patch : { ...patch, bankMSB: patch.bankMSB + builtinOffset(patch.bank) };
  }

  /** Trava o instrumento de um canal (o tocador reinicia os canais a cada música; travado, o escolhido fica). */
  #setPatch(channel, patch) {
    const midi = this.synth.midiChannels[channel];
    midi.setSystemParameter("presetLock", false);
    if (channel === DRUM_CHANNEL) midi.setDrums(true);
    this.synth.controllerChange(channel, 0, patch.bankMSB);
    this.synth.controllerChange(channel, 32, patch.bankLSB);
    this.synth.programChange(channel, patch.program);
    midi.setSystemParameter("presetLock", true);
  }

  /**
   * Toca os bytes de um .mid com os instrumentos escolhidos: { chords, phrase } no formato "sf:MSB:LSB:programa"
   * (phrase e bass podem ser SAME; pad é opcional: sem ele, o pad não vai no arquivo). Resolve quando começa a tocar; `onEnd` é chamado quando o arquivo termina.
   */
  async play(bytes, { chords, phrase = SAME, drums = NO_DRUMS, bass = SAME, pad = null, riff = SAME, onEnd } = {}) {
    this.unlock();
    await this.#ensureSynth();
    const chordPatch = await this.#resolve(chords);
    if (!chordPatch) throw new Error("Escolha um instrumento do banco de sons.");
    const phrasePatch = phrase === SAME ? chordPatch : (await this.#resolve(phrase)) ?? chordPatch;
    const drumPatch = drums === NO_DRUMS ? null : await this.#resolve(drums);
    const bassPatch = bass === SAME ? chordPatch : (await this.#resolve(bass)) ?? chordPatch;
    const padPatch = pad ? await this.#resolve(pad) : null;
    const riffPatch = riff === SAME ? chordPatch : (await this.#resolve(riff)) ?? chordPatch;
    this.stop();
    this.#setPatch(CHORD_CHANNEL, chordPatch);
    this.#setPatch(PHRASE_CHANNEL, phrasePatch);
    this.#setPatch(VOICE_CHANNEL, phrasePatch);
    this.#setPatch(VOICE2_CHANNEL, phrasePatch);
    this.#setPatch(BASS_CHANNEL, bassPatch); // o som de baixo escolhido (ou o dos acordes: a mão esquerda de um tecladista)
    if (padPatch) this.#setPatch(PAD_CHANNEL, padPatch);
    this.#setPatch(RIFF_CHANNEL, riffPatch);
    if (drumPatch) {
      // o banco da bateria escolhida fica na frente, para o canal 10 pegar o kit dele
      const bank = parsePatchValue(drums).bank;
      const first = bank === DEVICE || bank.startsWith(`${DEVICE}-`) ? bank : `kb-${bank}`;
      const order = this.synth.soundBankManager.priorityOrder;
      this.synth.soundBankManager.priorityOrder = [first, ...order.filter((id) => id !== first)];
      this.#setPatch(DRUM_CHANNEL, drumPatch);
    }
    this.synth.midiChannels[DRUM_CHANNEL].setSystemParameter("isMuted", !drumPatch);
    this.onEnd = onEnd ?? null;
    this.stats.songs += 1;
    this.seq.loadNewSongList([{ binary: bytes.slice().buffer, fileName: "harmona-lab.mid" }]);
    this.seq.play();
  }

  /** Com a música tocando, mexer num controle de timbre vale na hora (menos o sustain, que muda as notas do arquivo). */
  setControl(sound, controlId, value) {
    const control = SHAPE_CONTROLS.find((c) => c.id === controlId);
    if (!this.synth || !control || control.cc === null) return;
    for (const channel of SOUND_CHANNELS[sound] ?? []) this.synth.controllerChange(channel, control.cc, shapeByte(control, value));
  }

  /** O instrumento de uma escolha, com o banco já deslocado, sem carregar nada (para montar o MIDI da exportação). */
  #patchOf(value) {
    const patch = parsePatchValue(value);
    if (!patch) return null;
    if (patch.slot || patch.bank === DEVICE) return patch;
    const builtin = findBuiltin(patch.bank);
    return builtin.kind === "bateria" ? patch : { ...patch, bankMSB: patch.bankMSB + builtinOffset(patch.bank) };
  }

  /**
   * As mensagens que põem cada som no seu canal (banco e programa), para o MIDI da exportação em áudio: lá não há como
   * travar o instrumento de fora, então ele vai escrito no próprio arquivo. Mesmos argumentos de play().
   */
  patchSetup({ chords, phrase = SAME, drums = NO_DRUMS, bass = SAME, pad = null, riff = SAME }) {
    const chordPatch = this.#patchOf(chords);
    if (!chordPatch) return [];
    const or = (value) => (value === SAME ? chordPatch : this.#patchOf(value) ?? chordPatch);
    const byChannel = [
      [CHORD_CHANNEL, chordPatch], [PHRASE_CHANNEL, or(phrase)], [VOICE_CHANNEL, or(phrase)], [VOICE2_CHANNEL, or(phrase)],
      [BASS_CHANNEL, or(bass)], [RIFF_CHANNEL, or(riff)], ...(pad ? [[PAD_CHANNEL, this.#patchOf(pad) ?? chordPatch]] : []),
      ...(drums !== NO_DRUMS && this.#patchOf(drums) ? [[DRUM_CHANNEL, this.#patchOf(drums)]] : []),
    ];
    return byChannel.flatMap(([channel, p]) => [[0xb0 | channel, 0, p.bankMSB], [0xb0 | channel, 32, p.bankLSB], [0xc0 | channel, p.program]]);
  }

  /** Os bancos que uma exportação precisa, como arquivos: [{ soundBankBuffer, bankOffset }], o da bateria primeiro. */
  async #banksFor(values) {
    const wanted = new Map(); // id → { load(), offset }
    const drumBank = values.drums && values.drums !== NO_DRUMS ? parsePatchValue(values.drums)?.bank : null;
    for (const value of Object.values(values)) {
      const patch = parsePatchValue(value);
      if (!patch || wanted.has(patch.bank)) continue;
      if (patch.slot) {
        wanted.set(patch.bank, { offset: SLOT_OFFSET[patch.slot], load: async () => (await loadSavedBank(slotKey(patch.slot)))?.blob?.arrayBuffer() });
      } else if (patch.bank === DEVICE) {
        wanted.set(patch.bank, { offset: 0, load: async () => (await loadSavedBank())?.blob?.arrayBuffer() });
      } else {
        const builtin = findBuiltin(patch.bank);
        wanted.set(patch.bank, {
          offset: builtin.kind === "bateria" ? 0 : builtinOffset(patch.bank),
          load: async () => { const r = await fetch(new URL(encodeURIComponent(builtin.file), SOUNDS)); if (!r.ok) throw new Error(`Não consegui baixar ${builtin.label}.`); return r.arrayBuffer(); },
        });
      }
    }
    const order = [...wanted.keys()].sort((a, b) => (a === drumBank ? -1 : 0) - (b === drumBank ? -1 : 0));
    const out = [];
    for (const id of order) {
      const buffer = await wanted.get(id).load();
      if (!buffer) throw new Error("Um dos bancos de sons não está mais guardado neste aparelho. Carregue o arquivo de novo.");
      out.push({ soundBankBuffer: buffer, bankOffset: wanted.get(id).offset });
    }
    return out;
  }

  /**
   * Renderiza os bytes de um .mid em áudio, fora do tempo real (bem mais rápido que tocar). O arquivo já precisa trazer
   * o instrumento de cada canal (patchSetup). values: as escolhas de som, para saber que bancos carregar. seconds: a
   * duração do áudio. Devolve um AudioBuffer estéreo.
   */
  async render(bytes, values, { seconds, sampleRate = 44100 } = {}) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) throw new Error("Este navegador não exporta áudio (sem OfflineAudioContext).");
    const banks = await this.#banksFor(values);
    if (!banks.length) throw new Error("Escolha um som de banco nos acordes para exportar o áudio.");
    const { WorkletSynthesizer, BasicMIDI } = await import(new URL("spessasynth.min.js", VENDOR).href);
    const ctx = new Offline(2, Math.max(1, Math.ceil(seconds * sampleRate)), sampleRate);
    await ctx.audioWorklet.addModule(new URL("spessasynth_processor.min.js", VENDOR).href);
    const synth = new WorkletSynthesizer(ctx);
    synth.connect(ctx.destination);
    await synth.isReady;
    await withTimeout(synth.startOfflineRender({ midiSequence: BasicMIDI.fromArrayBuffer(bytes.slice().buffer), soundBankList: banks, loopCount: 0 }), 120000, "os bancos demoraram demais para abrir");
    return ctx.startRendering();
  }

  /** Para conferência (testes): o instrumento que cada canal está usando agora: { 0: "Tine Electric Piano", ... }. */
  channelPatches() {
    const out = {};
    for (const channel of [CHORD_CHANNEL, PHRASE_CHANNEL, BASS_CHANNEL, PAD_CHANNEL, RIFF_CHANNEL, DRUM_CHANNEL]) out[channel] = this.synth?.midiChannels[channel]?.patch?.name ?? "";
    return out;
  }

  stop() {
    this.onEnd = null;
    if (!this.seq) return;
    try { this.seq.pause(); } catch { /* já parado */ }
    try { this.synth.stopAll(true); } catch { /* sem notas */ }
  }
}
