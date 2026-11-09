// Pré-escuta com banco de sons (.sf2): o SpessaSynth toca exatamente o arquivo MIDI que o app exporta.
// O banco é escolhido pela pessoa, fica guardado só neste aparelho (IndexedDB) e nada é enviado a lugar nenhum.
// A biblioteca (vendor/spessasynth, Apache-2.0) só é carregada quando alguém usa um banco: quem não usa não paga nada.

const VENDOR = new URL("./vendor/spessasynth/", import.meta.url);
const DB_NAME = "harmonalab";
const STORE = "sons";
const KEY = "banco";
export const SIMPLE = "simple"; // o timbre simples do app (osciladores)
export const SAME = "same"; // a frase usa o mesmo som dos acordes
const CHORD_CHANNEL = 0;
const PHRASE_CHANNEL = 1;
/** Acima disso o banco pode pesar demais no celular (avisamos antes de carregar). */
export const LARGE_BANK_BYTES = 200 * 1024 * 1024;

// ---------------------------------------------------------------- escolhas (texto ↔ preset)

/** "sf:MSB:LSB:programa" ↔ o preset do banco. */
export const patchValue = (p) => `sf:${p.bankMSB}:${p.bankLSB}:${p.program}`;
export function parsePatchValue(value) {
  const m = /^sf:(\d+):(\d+):(\d+)$/.exec(String(value || ""));
  return m ? { bankMSB: Number(m[1]), bankLSB: Number(m[2]), program: Number(m[3]) } : null;
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

/** Banco guardado: { name, size, presets, blob } ou null. */
export async function loadSavedBank() {
  try { return (await withStore("readonly", (s) => s.get(KEY))) ?? null; } catch { return null; }
}
const saveBank = (entry) => withStore("readwrite", (s) => s.put(entry, KEY));
export async function deleteSavedBank() {
  try { await withStore("readwrite", (s) => s.delete(KEY)); } catch { /* nada guardado */ }
}

// ---------------------------------------------------------------- tocador

export class SoundFontPlayer {
  constructor() {
    this.ctx = null;
    this.synth = null;
    this.seq = null;
    this.bank = null; // { name, size, presets } do banco guardado
    this.loadedInSynth = false;
    this.stats = { noteOns: 0, songs: 0 }; // para conferência (testes)
    this.onEnd = null;
  }

  /** Lê o que está guardado (só os dados; a biblioteca nem é carregada). */
  async restore() {
    const saved = await loadSavedBank();
    this.bank = saved ? { name: saved.name, size: saved.size, presets: saved.presets } : null;
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
      await withTimeout(this.synth.soundBankManager.addSoundBank(buffer, "main"), 60000, "o arquivo demorou demais para abrir");
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
    if (this.loadedInSynth) await this.synth.soundBankManager.deleteSoundBank("main").catch(() => {});
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

  /** Trava o instrumento de um canal (o tocador reinicia os canais a cada música; travado, o escolhido fica). */
  #setPatch(channel, patch) {
    const midi = this.synth.midiChannels[channel];
    midi.setSystemParameter("presetLock", false);
    this.synth.controllerChange(channel, 0, patch.bankMSB);
    this.synth.controllerChange(channel, 32, patch.bankLSB);
    this.synth.programChange(channel, patch.program);
    midi.setSystemParameter("presetLock", true);
  }

  /**
   * Toca os bytes de um .mid com os instrumentos escolhidos: { chords, phrase } no formato "sf:MSB:LSB:programa"
   * (phrase pode ser SAME). Resolve quando começa a tocar; `onEnd` é chamado quando o arquivo termina.
   */
  async play(bytes, { chords, phrase = SAME, onEnd } = {}) {
    this.unlock();
    await this.#ensureSynth();
    await this.#ensureBank();
    const chordPatch = parsePatchValue(chords);
    if (!chordPatch) throw new Error("Escolha um instrumento do banco de sons.");
    this.stop();
    this.#setPatch(CHORD_CHANNEL, chordPatch);
    this.#setPatch(PHRASE_CHANNEL, parsePatchValue(phrase) ?? chordPatch);
    this.onEnd = onEnd ?? null;
    this.stats.songs += 1;
    this.seq.loadNewSongList([{ binary: bytes.slice().buffer, fileName: "harmona-lab.mid" }]);
    this.seq.play();
  }

  stop() {
    this.onEnd = null;
    if (!this.seq) return;
    try { this.seq.pause(); } catch { /* já parado */ }
    try { this.synth.stopAll(true); } catch { /* sem notas */ }
  }
}
