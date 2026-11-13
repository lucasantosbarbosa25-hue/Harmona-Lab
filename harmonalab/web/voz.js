// Cantar uma melodia: metrônomo amadeirado, um compasso de contagem, a gravação (só no aparelho) e as notas que o app
// ouviu, para conferir, ajustar e usar como a camada Voz do projeto. A análise está em engine/canto.js.
import { SIXTEENTHS_UP_TO_BPM, estimateKey, hatTickSamples, hzFromMidi, speller, transcribe, voiceText, woodblockSamples } from "./engine/canto.js";
import { TICKS_PER_BEAT, parsePhrase } from "./engine/phrase.js";
import { describeShift, readShift, shiftKey } from "./tom.js";
import { melodyFromMidi, melodyTracks, parseMidi } from "./engine/midi-read.js";

const COUNT_IN_BARS = 1; // 2 quando há anacruse ou quando o fim da parte anterior toca antes (parte nova)
const PREROLL_BARS = 2;
const MAX_MIDI_BYTES = 5 * 1024 * 1024; // um MIDI de melodia tem poucos KB; acima disso nem é lido
// Cantar devagar acerta mais (para quem não é cantor profissional). A Voz fica guardada em figuras, então depois o BPM do
// projeto pode subir (no campo BPM ou pelo prompt) e a melodia acompanha, sem gravar de novo.
export const SING_BPM = { min: 60, max: 100, suggested: 80 };
const MAX_SECONDS = 120;
const MODES = {
  fone: { volume: 0.7, hint: "O clique toca só no fone. É a captação mais limpa." },
  semfone: { volume: 0.25, hint: "O clique toca baixinho no alto-falante e o app separa o clique da voz. Cante perto do celular." },
  contagem: { volume: 0.5, hint: "Só o compasso de contagem toca. Depois, o pulso aparece apenas na tela." },
};

/** Grava a voz com o metrônomo no mesmo relógio: sabe, amostra por amostra, onde caiu cada clique. */
export class CantoRecorder {
  /** music: notas do trecho anterior da música ({ midi, start (s, desde o 1º clique), length, velocity }), tocadas na contagem. */
  async start({ bpm, beatsPerBar, mode, volume, eighths = true, countInBars = COUNT_IN_BARS, music = [], onBeat, onLimit }) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") await this.ctx.resume();
    // sem os "filtros de ligação" do celular (eco, ruído, ganho automático): eles deformam a voz cantada
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.chunks = [];
    if (this.ctx.audioWorklet && window.AudioWorkletNode) {
      await this.ctx.audioWorklet.addModule(new URL("./canto-gravador.js", import.meta.url));
      this.node = new AudioWorkletNode(this.ctx, "canto-gravador", { numberOfOutputs: 1, outputChannelCount: [1] });
      this.node.port.onmessage = (event) => this.chunks.push(event.data);
    } else {
      this.node = this.ctx.createScriptProcessor(4096, 1, 1); // navegadores antigos
      this.node.onaudioprocess = (event) => this.chunks.push({
        frame: Math.round(event.playbackTime * this.ctx.sampleRate), samples: Float32Array.from(event.inputBuffer.getChannelData(0)),
      });
    }
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    source.connect(this.node);
    this.node.connect(silent);
    silent.connect(this.ctx.destination);

    this.clickGain = this.ctx.createGain();
    this.clickGain.gain.value = volume;
    this.clickGain.connect(this.ctx.destination);
    this.buffers = [false, true].map((accent) => {
      const data = woodblockSamples(this.ctx.sampleRate, accent);
      const buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      buffer.copyToChannel(data, 0);
      return buffer;
    });
    // o tique das colcheias, como um chimbal fechado, bem mais baixo que o woodblock
    const hat = hatTickSamples(this.ctx.sampleRate);
    this.hatBuffer = this.ctx.createBuffer(1, hat.length, this.ctx.sampleRate);
    this.hatBuffer.copyToChannel(hat, 0);
    this.hatGain = this.ctx.createGain();
    this.hatGain.gain.value = 0.6;
    this.hatGain.connect(this.clickGain);
    this.eighths = eighths;
    this.ticks = [];
    this.beat = 60 / bpm;
    this.beatsPerBar = beatsPerBar;
    this.countIn = Math.round(beatsPerBar * countInBars);
    this.mode = mode;
    this.t0 = this.ctx.currentTime + 0.5;
    this.playMusic(music);
    this.next = 0;
    this.clicks = [];
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
    const draw = () => {
      const elapsed = this.ctx.currentTime - (this.ctx.outputLatency || 0) - this.t0;
      if (elapsed >= 0) onBeat?.(Math.floor(elapsed / this.beat), elapsed - this.countIn * this.beat);
      if (elapsed > MAX_SECONDS) { onLimit?.(); return; }
      this.raf = requestAnimationFrame(draw);
    };
    this.raf = requestAnimationFrame(draw);
  }

  /** O fim da parte anterior, num timbre suave e grave em agudos (para não se confundir com o clique), junto da contagem. */
  playMusic(notes) {
    if (!notes.length) return;
    const bus = this.ctx.createGain();
    bus.gain.value = 0.5;
    bus.connect(this.clickGain);
    const share = 1 / Math.sqrt(Math.max(1, Math.min(6, notes.length / 4)));
    for (const n of notes) {
      const from = this.t0 + n.start;
      const to = from + Math.max(0.08, n.length);
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hzFromMidi(n.midi);
      const env = this.ctx.createGain();
      const peak = ((n.velocity ?? 80) / 127) * 0.35 * share;
      env.gain.setValueAtTime(0, from);
      env.gain.linearRampToValueAtTime(peak, from + 0.02);
      env.gain.setTargetAtTime(0, to - 0.04, 0.03);
      osc.connect(env).connect(bus);
      osc.start(from);
      osc.stop(to + 0.2);
    }
  }

  /** Agenda os cliques que entram nos próximos 200 ms (o relógio do áudio é preciso; o do JavaScript, não). */
  schedule() {
    while (this.t0 + this.next * this.beat < this.ctx.currentTime + 0.2) {
      const time = this.t0 + this.next * this.beat;
      if (this.mode !== "contagem" || this.next < this.countIn) {
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[this.next % this.beatsPerBar === 0 ? 1 : 0];
        source.connect(this.clickGain);
        source.start(time);
        this.clicks.push(time);
        if (this.eighths) {
          // a colcheia entre este tempo e o próximo: o "tsss" do chimbal
          const tick = this.ctx.createBufferSource();
          tick.buffer = this.hatBuffer;
          tick.connect(this.hatGain);
          tick.start(time + this.beat / 2);
          this.ticks.push(time + this.beat / 2);
        }
      }
      this.next += 1;
    }
  }

  setVolume(volume) { if (this.clickGain) this.clickGain.gain.value = volume; }

  async stop() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.node.port?.postMessage("flush");
    await new Promise((resolve) => setTimeout(resolve, 200));
    this.stream.getTracks().forEach((t) => t.stop());
    this.node.disconnect();
    const rate = this.ctx.sampleRate;
    const chunks = [...this.chunks].sort((a, b) => a.frame - b.frame);
    const latencyFallback = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) + 0.01;
    await this.ctx.close();
    if (!chunks.length) return null;
    const first = chunks[0].frame;
    const last = chunks.at(-1);
    const samples = new Float32Array(last.frame + last.samples.length - first);
    for (const c of chunks) if (c.frame - first + c.samples.length <= samples.length) samples.set(c.samples, c.frame - first);
    const start = first / rate;
    return {
      samples, sampleRate: rate, clickTimes: this.clicks.map((t) => t - start), tickTimes: this.ticks.map((t) => t - start),
      countInBeats: this.countIn, latencyFallback,
    };
  }

  cancel() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
  }
}

/**
 * Liga a janela "Cantar uma melodia". options: { defaults() -> { bpm, timeSignature, middleC }, onUse({ text, bpm,
 * timeSignature, beats }), play(notes, total), stop(), toast(texto) }.
 */
export function setupCanto({ defaults, onUse, play, stop, toast, preroll }) {
  const $ = (s) => document.querySelector(s);
  const dialog = $("#canto-dialog");
  const state = { mode: "fone", fastest: "auto", target: "toda", recorder: null, recording: false, result: null, selected: -1, taps: [], midi: null, zoom: 1, history: [] };
  /** A melodia entra como parte nova (depois da música que já existe)? */
  const asNewPart = () => state.target === "nova" && Boolean(defaults().canAppend);
  /** A melodia entra numa parte que já tem harmonia e ainda não tem melodia (canta-se por cima dela, de fone)? */
  const overPart = () => (state.target === "parte" ? defaults().overPart ?? null : null);

  const beatsPerBarOf = (sig) => {
    const [num, den] = String(sig).split("/").map(Number);
    return num && den ? (num * 4) / den : 4;
  };
  const status = (text, error = false) => {
    const el = $("#canto-status");
    el.textContent = text;
    el.classList.toggle("error", error);
  };
  const renderMode = () => {
    document.querySelectorAll("#canto-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
    document.querySelectorAll("#canto-fastest button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fastest === state.fastest)));
    const bpm = Number($("#canto-bpm").value);
    $("#canto-fastest-hint").textContent = state.fastest === "auto"
      ? `Automático: semicolcheias até ${SIXTEENTHS_UP_TO_BPM} BPM, colcheias acima${bpm ? ` (a ${bpm} BPM: ${bpm <= SIXTEENTHS_UP_TO_BPM ? "semicolcheias" : "colcheias"})` : ""}.`
      : state.fastest === "8" ? "Colcheias: o melhor para melodias simples." : "Semicolcheias: para melodias com notas rápidas.";
    $("#canto-mode-hint").textContent = MODES[state.mode].hint;
    const d = defaults();
    $("#canto-target-box").hidden = !d.canAppend || state.result?.target === "editar";
    const overButton = document.querySelector('#canto-target [data-target="parte"]');
    overButton.hidden = !d.overPart;
    if (d.overPart) overButton.textContent = `Na parte ${d.overPart.name}`;
    if (state.target === "parte" && !d.overPart) state.target = d.hasVoice ? "nova" : "toda";
    document.querySelectorAll("#canto-target button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.target === state.target)));
    const fresh = asNewPart();
    const over = overPart();
    // o tom da parte nova: a pessoa digita os semitons, o app escreve o nome; o canto fica na escala desse tom
    $("#canto-shift-box").hidden = !(fresh && d.song) || state.result?.target === "editar";
    if (fresh && d.song) $("#canto-key-text").textContent = `Tom da parte ${d.nextSection}: ${describeShift(d.song, readShift($("#canto-shift").value))}. As notas cantadas ficam nessa escala.`;
    $("#canto-target-hint").textContent = over
      ? `Você canta por cima da harmonia da parte ${over.name} (${over.bars} compasso${over.bars === 1 ? "" : "s"}), que toca enquanto você canta. Use fone, para a música não vazar no microfone.${over.key ? ` As notas ficam na escala de ${over.key.long}.` : ""}`
      : fresh
      ? `Vira a parte ${d.nextSection}, depois da música que já existe. Antes de você cantar, o app toca os 2 últimos compassos dela${$("#canto-pickup").checked && state.mode !== "fone" ? " (com anacruse e sem fone, só o clique: use fone para ouvir o trecho)" : ""}. O BPM e o compasso do projeto não mudam.`
      : "A melodia vale para a música inteira, a partir do compasso 1, e substitui a Voz que houver.";
    $("#canto-signature").disabled = fresh || Boolean(over); // a parte segue o compasso do projeto
    if (fresh || over) $("#canto-signature").value = d.timeSignature;
    $("#canto-use").textContent = state.result?.target === "editar" ? "Salvar a melodia" : state.result?.target === "parte" ? `Usar na parte ${state.result.over.name}` : state.result?.target === "nova" ? `Usar como parte ${d.nextSection}` : "Usar como Voz";
  };
  const renderDots = (beatsPerBar, active = -1) => {
    const box = $("#canto-beats");
    if (box.children.length !== beatsPerBar) box.replaceChildren(...Array.from({ length: beatsPerBar }, () => document.createElement("span")));
    [...box.children].forEach((dot, i) => dot.classList.toggle("on", i === active));
  };

  const open = () => {
    const d = defaults();
    $("#canto-bpm").value = d.bpm >= SING_BPM.min && d.bpm <= SING_BPM.max ? d.bpm : SING_BPM.suggested;
    $("#canto-signature").value = ["2/4", "3/4", "4/4", "6/8"].includes(d.timeSignature) ? d.timeSignature : "4/4";
    $("#canto-volume").value = MODES[state.mode].volume;
    state.target = d.canAppend && d.hasVoice ? "nova" : "toda"; // já há melodia: o natural é continuar a música
    $("#canto-shift").value = "0";
    if (state.result?.target === "parte") state.result = null;
    if (state.result && state.result.target === "nova" && !d.canAppend) state.result = null;
    if (state.result?.target === "editar") state.result = null; // a edição da melodia do projeto não fica de um dia para o outro
    renderMode();
    renderDots(beatsPerBarOf($("#canto-signature").value));
    $("#canto-result").hidden = !state.result;
    status("Escolha o BPM e toque em Gravar. Depois da contagem, cante.");
    dialog.showModal();
  };

  /** Abre a janela já com a melodia do projeto no desenho, para mexer no tempo e na altura das notas (sem gravar). */
  const edit = () => {
    const d = defaults();
    const text = String(d.voiceText || "").trim();
    const { events, errors } = parsePhrase(text, d.middleC);
    if (!text || errors.length || !events.length) { toast?.("A melodia do projeto tem um erro de escrita: corrija o texto dela em “Sobre esta progressão”."); return; }
    open();
    const notes = events.filter((e) => e.voice === 0).map((e) => ({ beat: e.start / TICKS_PER_BEAT, beats: e.length / TICKS_PER_BEAT, midi: e.note.midi }));
    const guess = estimateKey(notes.map((n) => ({ midi: n.midi, start: n.beat, end: n.beat + n.beats })));
    // a grafia segue a da melodia como está escrita (bemóis ou sustenidos)
    const key = { ...guess, flats: /[A-G]b/.test(text) || (!text.includes("#") && guess.flats) };
    const onEighths = notes.every((n) => Number.isInteger(Math.round(n.beat * 1e6) / 5e5) && Number.isInteger(Math.round(n.beats * 1e6) / 5e5));
    state.midi = null;
    state.selected = -1;
    state.history = []; // melodia nova no desenho: o Desfazer e o zoom começam do zero
    state.zoom = 1;
    state.result = {
      events: notes, key, warnings: [], bpm: d.bpm, signature: d.timeSignature, shift: 0, leak: { leak: false }, latency: 0,
      fastest: onEighths ? "8" : "16", diatonic: false, source: "projeto", target: "editar", maxBeats: d.totalBeats,
    };
    status("A melodia do projeto. Toque numa nota para escolher; arraste para os lados para mexer no tempo.");
    renderResult();
    $("#canto-result").scrollIntoView({ block: "start" });
  };

  const record = async () => {
    if (state.recording) return finish();
    const bpm = Number(String($("#canto-bpm").value).replace(",", "."));
    if (!(bpm >= SING_BPM.min && bpm <= SING_BPM.max)) {
      status(bpm > SING_BPM.max
        ? `Para cantar, use até ${SING_BPM.max} BPM: devagar o app acerta mais. Depois é só subir o BPM do projeto (ou pedir no prompt): a melodia acompanha.`
        : `Escolha um BPM entre ${SING_BPM.min} e ${SING_BPM.max}: é ele que o app usa para encaixar o ritmo.`, true);
      $("#canto-bpm").focus();
      return;
    }
    const signature = $("#canto-signature").value;
    const beatsPerBar = beatsPerBarOf(signature);
    stopListening();
    stop?.();
    state.recorder = new CantoRecorder();
    state.bpm = bpm;
    state.signature = signature;
    // parte nova: o fim da música toca na contagem; anacruse: dá para entrar cantando no 2º compasso da contagem
    const over = overPart();
    if (over && state.mode !== "fone") { state.mode = "fone"; renderMode(); } // por cima da harmonia, só de fone
    const pickup = !over && $("#canto-pickup").checked;
    const newPart = asNewPart();
    const withMusic = over ? true : newPart && !(pickup && state.mode !== "fone"); // sem fone, o trecho vazaria por cima da anacruse
    const countInBars = pickup || withMusic ? PREROLL_BARS : COUNT_IN_BARS;
    const song = defaults().song;
    const keyShift = newPart ? readShift($("#canto-shift").value) : 0;
    state.take = {
      pickup, withMusic, target: over ? "parte" : newPart ? "nova" : "toda", countInBeats: beatsPerBar * countInBars, over, keyShift,
      key: over ? over.key : newPart && song ? shiftKey(song, keyShift) : null, // o tom da parte prende as notas à escala dele
    };
    try {
      await state.recorder.start({
        bpm, beatsPerBar, mode: state.mode, volume: Number($("#canto-volume").value), eighths: $("#canto-eighths").checked,
        countInBars, music: withMusic ? preroll?.({ bpm, bars: PREROLL_BARS, part: over }) ?? [] : [],
        onBeat: (index, sung) => {
          renderDots(beatsPerBar, ((index % beatsPerBar) + beatsPerBar) % beatsPerBar);
          const countIn = beatsPerBar * countInBars;
          if (over && sung >= over.beats * (60 / bpm) + 0.4) { finish(); return; } // a parte acabou: para sozinho
          if (index < countIn) status(pickup && index >= countIn - beatsPerBar ? `Contagem: ${index + 1}… (já pode entrar)` : withMusic ? `Ouça o fim da música: ${index + 1}…` : `Contagem: ${index + 1}…`);
          else status(`Cante! ${Math.floor(sung / 60)}:${String(Math.floor(sung % 60)).padStart(2, "0")} — toque em Parar quando terminar.`);
        },
        onLimit: () => finish(),
      });
    } catch (err) {
      state.recorder?.cancel();
      state.recorder = null;
      status(err?.name === "NotAllowedError" ? "O navegador não deixou usar o microfone. Libere o microfone para este site e tente de novo." : `Não deu para gravar: ${err.message || err}`, true);
      return;
    }
    state.recording = true;
    $("#canto-record").textContent = "Parar";
    $("#canto-record").classList.add("recording");
    $("#canto-result").hidden = true;
  };

  const finish = async () => {
    if (!state.recording) return;
    state.recording = false;
    $("#canto-record").textContent = "Gravar";
    $("#canto-record").classList.remove("recording");
    renderDots(beatsPerBarOf(state.signature));
    status("Analisando o canto…");
    const take = await state.recorder.stop();
    state.recorder = null;
    if (!take) { status("A gravação veio vazia. Tente de novo.", true); return; }
    await new Promise((resolve) => setTimeout(resolve, 30)); // deixa a tela mostrar "Analisando" antes da conta
    const bar = beatsPerBarOf(state.signature);
    const { pickup, withMusic, target, over, keyShift, key } = state.take;
    const result = transcribe(take.samples, take.sampleRate, {
      bpm: state.bpm, beatsPerBar: bar, clickTimes: take.clickTimes, tickTimes: take.tickTimes, countInBeats: take.countInBeats,
      // com anacruse, o atraso do clique é medido só no 1º compasso da contagem (no 2º a pessoa já pode estar cantando)
      measureBeats: pickup ? take.countInBeats - bar : take.countInBeats,
      pickupBeats: pickup ? bar : withMusic ? 0 : Infinity, music: withMusic,
      latencyFallback: take.latencyFallback, middleC: defaults().middleC, fastest: state.fastest, diatonic: $("#canto-diatonic").checked, key,
    });
    if (over) {
      // só o que cabe na parte
      result.events = result.events.filter((e) => e.beat < over.beats - 1e-9).map((e) => ({ ...e, beats: Math.min(e.beats, over.beats - e.beat) }));
    }
    if (!result.events.length) { status(result.warnings[0] || "Não encontrei notas cantadas.", true); return; }
    state.midi = null;
    state.history = []; // melodia nova no desenho: o Desfazer e o zoom começam do zero
    state.zoom = 1;
    state.result = { ...result, bpm: state.bpm, signature: state.signature, target, over, keyShift, ...(over ? { maxBeats: over.beats } : {}) };
    state.selected = -1;
    status("Pronto! Confira as notas: toque numa nota do desenho para ajustá-la.");
    renderResult();
  };

  const totalBeats = () => Math.max(...state.result.events.map((e) => e.beat + e.beats));
  const text = () => voiceText(state.result.events, { key: state.result.key, middleC: defaults().middleC });

  const renderResult = () => {
    const r = state.result;
    $("#canto-result").hidden = false;
    const leak = r.leak.leak ? `o clique vazou para o microfone (atraso medido: ${Math.round(r.latency * 1000)} ms, usado para alinhar)` : "o clique não vazou para o microfone";
    const grid = r.fastest === "16" ? "semicolcheias" : "colcheias";
    const scale = r.diatonic ? ` (notas na escala de ${r.key?.name ?? "?"})` : "";
    $("#canto-info").textContent = r.source === "projeto"
      ? `${r.events.length} notas da melodia do projeto · grade em ${grid}.`
      : r.source === "midi"
      ? `${r.events.length} notas do arquivo MIDI · tom provável: ${r.key?.name ?? "?"} · ${r.bpm} BPM, compasso ${r.signature}.`
      : `${r.events.length} notas · ${r.target === "parte" || (r.target === "nova" && defaults().song) ? "tom da parte" : "tom provável"}: ${r.key?.name ?? "?"}${scale} · ${r.bpm} BPM, ritmo em ${grid} · ${leak}.`;
    $("#canto-track-box").hidden = !(r.source === "midi" && state.midi && state.midi.tracks.length > 1);
    $("#canto-again").hidden = r.source === "midi" || r.source === "projeto";
    renderMode();
    $("#canto-warnings").replaceChildren(...r.warnings.map((w) => Object.assign(document.createElement("li"), { textContent: w })));
    $("#canto-text").textContent = text();
    const hasSelection = state.selected >= 0;
    for (const id of ["#canto-semi-down", "#canto-semi-up", "#canto-delete"]) $(id).disabled = !hasSelection;
    $("#canto-undo").disabled = !state.history.length;
    // oitava: com uma nota escolhida, mexe só nela; sem nenhuma, na melodia toda (o texto do botão diz qual)
    $("#canto-octave-down").textContent = hasSelection ? "Nota −8ª" : "Tudo −8ª";
    $("#canto-octave-up").textContent = hasSelection ? "Nota +8ª" : "Tudo +8ª";
    drawRoll();
  };

  // ------------------------------------------------------------ o desenho das notas (com grade, zoom e arrasto)
  /** O passo da grade em tempos: o da quantização (colcheia = 0,5; semicolcheia = 0,25). */
  const gridStep = () => (state.result?.fastest === "8" ? 0.5 : 0.25);
  /** As medidas do desenho: quantos pixels vale um tempo (zoom: uns 2 compassos na largura da tela) e as linhas das alturas. */
  /** Computador (mouse, tela larga): o desenho fica mais alto e mostra mais compassos. */
  const roomy = () => ($("#canto-roll-wrap").clientWidth || 320) >= 600;
  /** As medidas do desenho: quantos pixels vale um tempo (zoom) e as linhas das alturas. */
  const rollLayout = () => {
    const r = state.result;
    const wrap = $("#canto-roll-wrap");
    const view = wrap.clientWidth || 320;
    const bpb = beatsPerBarOf(r.signature);
    const step = gridStep();
    const bars = Math.ceil(Math.max(totalBeats(), 1) / bpb - 1e-9) + 1; // um compasso de folga, para dar para atrasar o fim
    const span = r.maxBeats ? Math.max(r.maxBeats, totalBeats()) : bars * bpb; // editando a do projeto: até o fim da música
    // cada quadradinho com pelo menos 14 px (o dedo precisa acertar), sem passar do que o navegador desenha de uma vez;
    // na tela larga cabem 4 compassos; o zoom (Ctrl + roda, ou os botões) multiplica
    const base = Math.max(view / ((roomy() ? 4 : 2) * bpb), 14 / step);
    const perBeat = Math.min(Math.max(base * state.zoom, 6 / step), 7600 / span);
    const pitches = r.events.map((e) => e.midi);
    // folga de alturas para dar para arrastar a nota para cima e para baixo (na tela larga, mais)
    const margin = roomy() ? 5 : 2;
    const low = Math.max(21, Math.min(...pitches) - margin);
    const high = Math.min(110, Math.max(...pitches) + margin);
    const height = roomy() ? 300 : 170;
    const row = (height - 22) / (high - low + 1);
    return {
      view, bpb, step, span, perBeat, low, high, height, row, width: Math.max(view, Math.round(span * perBeat) + 8),
      x: (beat) => 4 + beat * perBeat, beatAt: (px) => (px - 4) / perBeat, y: (midi) => 18 + (high - midi) * row,
      midiAt: (py) => high - Math.floor((py - 18) / row),
    };
  };

  const drawRoll = (frozen = null) => {
    const canvas = $("#canto-roll");
    const r = state.result;
    const L = frozen ?? rollLayout(); // durante um arrasto, as medidas ficam paradas (a grade não pula sob o mouse)
    canvas.style.height = `${L.height}px`;
    const { width, height } = L;
    const ratio = Math.min(window.devicePixelRatio || 1, 15000 / width);
    canvas.style.width = `${width}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const g = canvas.getContext("2d");
    g.scale(ratio, ratio);
    const css = getComputedStyle(document.documentElement);
    const color = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    g.clearRect(0, 0, width, height);
    // a grade: quadradinhos do tamanho do passo da quantização, bem transparentes; tempos e compassos um pouco mais fortes
    g.fillStyle = color("--text", "#111");
    for (let m = L.low; m <= L.high + 1; m++) { g.globalAlpha = 0.07; g.fillRect(0, Math.round(L.y(m) + L.row), width, 1); }
    for (let k = 0; k * L.step <= L.span + 1e-9; k++) {
      const beat = k * L.step;
      const onBar = Math.abs(beat / L.bpb - Math.round(beat / L.bpb)) < 1e-6;
      const onBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
      g.globalAlpha = onBar ? 0.4 : onBeat ? 0.17 : 0.07;
      g.fillRect(Math.round(L.x(beat)), 0, 1, height);
      if (onBar && beat < L.span) { g.globalAlpha = 0.55; g.font = "10px system-ui, sans-serif"; g.fillText(String(Math.round(beat / L.bpb) + 1), L.x(beat) + 3, 10); }
    }
    g.globalAlpha = 1;
    const spell = speller(r.key, defaults().middleC);
    const playing = state.listen ? r.events.findIndex((e) => state.listen.beat >= e.beat && state.listen.beat < e.beat + e.beats) : -1;
    r.events.forEach((e, i) => {
      const left = L.x(e.beat);
      const w = Math.max(3, L.x(e.beat + e.beats) - left - 1);
      const top = L.y(e.midi) + 1;
      const h = Math.max(6, L.row - 1);
      const lit = i === playing;
      const chosen = playing < 0 && i === state.selected; // só UMA nota fica escolhida: com contorno e o nome em destaque
      g.globalAlpha = playing >= 0 && !lit ? 0.45 : 1; // ao ouvir, as outras notas apagam um pouco
      g.fillStyle = lit || chosen ? color("--primary", "#a85a00") : color("--muted", "#666");
      g.fillRect(left, top, w, h);
      if (chosen) {
        g.strokeStyle = color("--text", "#111");
        g.lineWidth = 2;
        g.strokeRect(left, top, w, h);
        // as alças de esticar: na ponta direita e, com espaço, na esquerda
        g.fillStyle = color("--text", "#111");
        g.fillRect(left + w - 4, top + 2, 2, h - 4);
        if (w >= 20) g.fillRect(left + 2, top + 2, 2, h - 4);
      }
      if (i === state.selected && playing >= 0) { g.strokeStyle = color("--primary", "#a85a00"); g.lineWidth = 2; g.strokeRect(left, top, w, h); }
      g.globalAlpha = 1;
      if (w > 22 || chosen || lit) {
        const strong = chosen || lit;
        g.font = strong ? "bold 12px system-ui, sans-serif" : "11px system-ui, sans-serif";
        g.fillStyle = strong ? color("--text", "#111") : color("--muted", "#666"); // os nomes das outras ficam discretos: não parecem escolhidas
        g.globalAlpha = strong ? 1 : 0.7;
        g.fillText(spell(e.midi), left, top - 4 > 22 ? top - 4 : top + h + 12);
        g.globalAlpha = 1;
      }
    });
    if (state.listen) {
      // a linha que corre junto com o som (e a tela acompanha)
      const at = L.x(Math.min(L.span, state.listen.beat));
      g.strokeStyle = color("--primary", "#a85a00");
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(at, 0); g.lineTo(at, height); g.stroke();
      const wrap = $("#canto-roll-wrap");
      if (at < wrap.scrollLeft + 20 || at > wrap.scrollLeft + L.view - 40) wrap.scrollLeft = Math.max(0, at - 40);
    }
    canvas.dataset.beats = String(L.span);
    canvas.dataset.step = String(L.step);
    canvas.dataset.perBeat = String(L.perBeat);
    canvas.dataset.row = String(L.row);
    canvas.dataset.high = String(L.high);
    canvas.dataset.playing = String(playing);
  };

  /** A nota que está embaixo de um ponto do desenho (índice, ou -1). `exact`: só vale acertar a nota mesmo (mouse). */
  const noteAt = (px, py, exact = false, L = rollLayout()) => {
    const beat = L.beatAt(px);
    const tolerance = (exact ? 2 : 6) / L.perBeat;
    const reach = exact ? L.row / 2 + 1 : Math.max(14, L.row);
    let index = state.result.events.findIndex((e) => beat >= e.beat - tolerance && beat <= e.beat + e.beats + tolerance && Math.abs(py - (L.y(e.midi) + L.row / 2)) <= reach);
    if (index < 0 && !exact) index = state.result.events.findIndex((e) => beat >= e.beat && beat <= e.beat + e.beats); // dedo fora da altura: vale a coluna
    return index;
  };

  // ------------------------------------------------------------ desfazer (dentro do editor)
  const snapshotNotes = () => JSON.stringify({ events: state.result.events, selected: state.selected });
  /** Guarda o estado antes de uma mudança, para o Desfazer (Ctrl+Z). */
  const remember = () => {
    const now = snapshotNotes();
    if (state.history.at(-1) !== now) state.history.push(now);
    if (state.history.length > 100) state.history.shift();
  };
  const undo = () => {
    const last = state.history.pop();
    if (!last || !state.result) return;
    halt();
    const saved = JSON.parse(last);
    state.result.events = saved.events;
    state.selected = saved.selected;
    renderResult();
  };

  /** Toca a nota por um instante: é o retorno de quem muda a altura de uma nota (como numa DAW). */
  const audition = (midi) => { if (!state.listen) play?.([{ midi, start: 0, length: 0.22, velocity: 90 }], 0.3); };

  // ------------------------------------------------------------ mudanças nas notas (as mesmas para mouse, dedo e teclado)
  const snapTo = (value, step) => Math.round(value / step) * step;
  const tidy = (value) => Math.round(value * 12) / 12;
  /** Move a nota `index` para o tempo `beat` (preso à grade e às vizinhas) e, se pedido, para a altura `midi`. */
  const moveNote = (index, beat, midi, L) => {
    const events = state.result.events;
    const e = events[index];
    const before = events[index - 1];
    const after = events[index + 1];
    const min = before ? before.beat + before.beats : 0;
    const max = (after ? after.beat : L.span) - e.beats;
    let changed = false;
    if (max >= min) {
      const next = tidy(Math.max(min, Math.min(max, snapTo(beat, L.step))));
      if (next !== e.beat) { e.beat = next; changed = true; }
    }
    if (midi != null) {
      const pitch = Math.max(24, Math.min(108, midi));
      if (pitch !== e.midi) { e.midi = pitch; changed = true; audition(pitch); }
    }
    return changed;
  };
  /** Estica ou encurta pela ponta direita (`end`) ou pela esquerda (`start`), de quadradinho em quadradinho. */
  const resizeNote = (index, { start = null, end = null }, L) => {
    const events = state.result.events;
    const e = events[index];
    const before = events[index - 1];
    const after = events[index + 1];
    const stop = e.beat + e.beats;
    if (end !== null) {
      const limit = after ? after.beat : L.span;
      const length = tidy(Math.max(L.step, Math.min(limit - e.beat, snapTo(end, L.step) - e.beat)));
      if (length === e.beats) return false;
      e.beats = length;
      return true;
    }
    const floor = before ? before.beat + before.beats : 0;
    const from = tidy(Math.max(floor, Math.min(stop - L.step, snapTo(start, L.step))));
    if (from === e.beat) return false;
    e.beat = from;
    e.beats = tidy(stop - from);
    return true;
  };
  /** Cria uma nota num espaço vazio (um tempo, ou o que couber até a próxima). Devolve o índice, ou -1 se não couber. */
  const createNote = (beat, midi, L) => {
    const events = state.result.events;
    const start = tidy(Math.floor(beat / L.step + 1e-9) * L.step);
    if (start < 0 || start >= L.span || events.some((e) => start >= e.beat && start < e.beat + e.beats)) return -1;
    const next = events.find((e) => e.beat > start);
    const room = (next ? next.beat : L.span) - start;
    const length = tidy(Math.max(L.step, Math.min(1, room)));
    if (room < L.step - 1e-9) return -1;
    remember();
    const note = { beat: start, beats: length, midi: Math.max(24, Math.min(108, midi)) };
    events.push(note);
    events.sort((a, b) => a.beat - b.beat);
    audition(note.midi);
    return events.indexOf(note);
  };
  const removeSelected = () => {
    if (state.selected < 0) return;
    halt();
    remember();
    state.result.events.splice(state.selected, 1);
    state.selected = -1;
    if (!state.result.events.length) { state.result = null; $("#canto-result").hidden = true; status("Todas as notas foram apagadas. Grave de novo."); return; }
    renderResult();
  };

  /**
   * O ponteiro no desenho. Há dois jeitos, escolhidos sozinhos pelo tipo de ponteiro:
   *   mouse (ou caneta): como numa DAW. Arrastar uma nota move no tempo (lados) e na altura (cima e baixo); as pontas
   *     esticam; duplo clique no vazio cria; arrastar o vazio rola.
   *   dedo: um toque escolhe; só a nota ESCOLHIDA anda, e só para os lados (ou estica pela ponta direita), para ninguém
   *     mudar uma nota sem querer ao rolar a tela. A altura fica nos botões.
   * O interruptor "Edição completa no toque" (Mais opções) dá ao dedo o jeito do mouse.
   */
  const bindRollPointer = () => {
    const canvas = $("#canto-roll");
    const wrap = $("#canto-roll-wrap");
    const full = (event) => event.pointerType !== "touch" || $("#canto-full-touch").checked;
    const point = (event) => { const rect = canvas.getBoundingClientRect(); return { px: event.clientX - rect.left, py: event.clientY - rect.top }; };
    /** Em que parte da nota o ponteiro está: "start" (ponta esquerda), "end" (ponta direita) ou "body". */
    const zone = (note, px, L, both) => {
      const left = L.x(note.beat);
      const right = L.x(note.beat + note.beats);
      const grip = Math.min(both ? 8 : 14, (right - left) / (both ? 3 : 2));
      if (px >= right - grip && px <= right + (both ? 4 : 8)) return "end";
      if (both && right - left >= 20 && px <= left + grip) return "start";
      return "body";
    };
    let drag = null;
    canvas.addEventListener("pointerdown", (event) => {
      if (!state.result || event.button > 0) return;
      canvas.focus({ preventScroll: true });
      const L = rollLayout();
      const { px, py } = point(event);
      const isFull = full(event);
      const index = noteAt(px, py, isFull, L);
      const note = state.result.events[index];
      let mode = "pan";
      if (note && isFull) {
        // mouse: pegar a nota já a escolhe
        const where = zone(note, px, L, true);
        mode = where === "body" ? "move" : where;
        if (state.selected !== index) { state.selected = index; renderResult(); }
      } else if (note && index === state.selected) {
        mode = zone(note, px, L, false) === "end" ? "end" : "move";
      }
      drag = { x: event.clientX, y: event.clientY, index, moved: false, mode, full: isFull, L, scroll: wrap.scrollLeft, beat: note?.beat ?? 0, beats: note?.beats ?? 0, midi: note?.midi ?? 0 };
      try { canvas.setPointerCapture?.(event.pointerId); } catch { /* ponteiro que não dá para capturar: segue sem */ }
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) {
        // mouse parado sobre o desenho: o cursor mostra o que o arrasto vai fazer
        if (event.pointerType === "mouse" && state.result) {
          const L = rollLayout();
          const { px, py } = point(event);
          const note = state.result.events[noteAt(px, py, true, L)];
          canvas.style.cursor = !note ? "default" : zone(note, px, L, true) === "body" ? "grab" : "ew-resize";
        }
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, drag.full ? dy : 0) < (drag.full ? 4 : 6)) return;
      if (!drag.moved && drag.mode !== "pan") { halt(); remember(); } // mexer numa nota para a escuta e guarda o antes
      drag.moved = true;
      if (drag.mode === "pan") { wrap.scrollLeft = drag.scroll - dx; return; }
      const L = drag.L;
      let changed;
      if (drag.mode === "end") changed = resizeNote(drag.index, { end: drag.beat + drag.beats + dx / L.perBeat }, L);
      else if (drag.mode === "start") changed = resizeNote(drag.index, { start: drag.beat + dx / L.perBeat }, L);
      else {
        // com mouse, a nota também sobe e desce (dentro das alturas à vista); com o dedo, só anda para os lados
        const midi = drag.full ? Math.max(L.low, Math.min(L.high, drag.midi - Math.round(dy / L.row))) : null;
        changed = moveNote(drag.index, drag.beat + dx / L.perBeat, midi, L);
        canvas.style.cursor = "grabbing";
      }
      if (changed) drawRoll(L);
    });
    const end = (event) => {
      if (!drag) return;
      const { moved, mode, index, full: isFull } = drag;
      drag = null;
      try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* já solto */ }
      if (moved) {
        if (mode !== "pan") { if (state.history.at(-1) === snapshotNotes()) state.history.pop(); renderResult(); } // nada mudou: sem passo de desfazer
        return;
      }
      if (event.type === "pointercancel") return;
      if (isFull) {
        // mouse: clicar na nota já a escolheu (no pointerdown); clicar no vazio solta a escolha
        if (index < 0 && state.selected >= 0) { state.selected = -1; renderResult(); }
        return;
      }
      state.selected = index === state.selected ? -1 : index; // dedo: um toque escolhe (ou solta) a nota
      renderResult();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    let lastPointer = "mouse";
    canvas.addEventListener("pointerdown", (event) => { lastPointer = event.pointerType; }, true);
    canvas.addEventListener("dblclick", (event) => {
      // duplo clique no vazio cria uma nota (só no jeito completo)
      if (!state.result || (lastPointer === "touch" && !$("#canto-full-touch").checked)) return;
      const L = rollLayout();
      const { px, py } = point(event);
      if (noteAt(px, py, true, L) >= 0) return;
      halt();
      const index = createNote(L.beatAt(px), L.midiAt(py), L);
      if (index >= 0) { state.selected = index; renderResult(); }
    });
    // roda do mouse: rola o desenho para os lados; com Ctrl, dá zoom (mantendo no lugar o ponto sob o mouse)
    wrap.addEventListener("wheel", (event) => {
      if (!state.result) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX - wrap.getBoundingClientRect().left);
      } else if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && wrap.scrollWidth > wrap.clientWidth) {
        event.preventDefault();
        wrap.scrollLeft += event.deltaY;
      }
    }, { passive: false });
    // teclado (com o desenho em foco): setas movem a nota escolhida, Delete apaga, Ctrl+Z desfaz, Espaço ouve
    canvas.addEventListener("keydown", (event) => {
      if (!state.result) return;
      const key = event.key;
      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
      if (key === " ") { event.preventDefault(); $("#canto-play").click(); return; }
      if (state.selected < 0) return;
      const L = rollLayout();
      const e = state.result.events[state.selected];
      if (key === "Delete" || key === "Backspace") { event.preventDefault(); removeSelected(); return; }
      const arrows = { ArrowLeft: [-L.step, 0], ArrowRight: [L.step, 0], ArrowUp: [0, event.shiftKey ? 12 : 1], ArrowDown: [0, event.shiftKey ? -12 : -1] };
      if (!arrows[key]) return;
      event.preventDefault();
      halt();
      const before = snapshotNotes();
      const [beats, semis] = arrows[key];
      if (moveNote(state.selected, e.beat + beats, semis ? e.midi + semis : null, L)) { state.history.push(before); renderResult(); }
    });
  };

  /** Zoom do desenho: `factor` multiplica; `anchor` (px dentro da área visível) fica no mesmo tempo depois do zoom. */
  const zoomBy = (factor, anchor = null) => {
    const wrap = $("#canto-roll-wrap");
    const before = rollLayout();
    const at = anchor ?? wrap.clientWidth / 2;
    const beat = before.beatAt(wrap.scrollLeft + at);
    state.zoom = Math.max(0.4, Math.min(5, state.zoom * factor));
    drawRoll();
    wrap.scrollLeft = Math.max(0, rollLayout().x(beat) - at);
  };

  /** Para o destaque do "Ouvir" (o som em si para com stop()). */
  const stopListening = () => {
    if (!state.listen) return;
    cancelAnimationFrame(state.listen.frame);
    state.listen = null;
    $("#canto-play").textContent = "Ouvir";
    $("#canto-play").setAttribute("aria-pressed", "false");
    if (state.result) drawRoll();
  };
  const halt = () => { if (state.listen) { stopListening(); stop?.(); } };

  const shiftAll = (semitones) => {
    halt();
    remember();
    state.result.events = state.result.events.map((e) => ({ ...e, midi: Math.max(24, Math.min(108, e.midi + semitones)) }));
    renderResult();
  };
  const shiftSelected = (semitones) => {
    halt();
    remember();
    const e = state.result.events[state.selected];
    if (e) e.midi = Math.max(24, Math.min(108, e.midi + semitones));
    renderResult();
  };

  $("#canto-open").addEventListener("click", open);
  $("#canto-close").addEventListener("click", () => { state.recorder?.cancel(); state.recorder = null; state.recording = false; stop?.(); dialog.close(); });
  dialog.addEventListener("close", () => { halt(); state.recorder?.cancel(); state.recorder = null; state.recording = false; $("#canto-record").textContent = "Gravar"; $("#canto-record").classList.remove("recording"); });
  $("#canto-record").addEventListener("click", record);
  document.querySelectorAll("#canto-mode button").forEach((b) => b.addEventListener("click", () => {
    state.mode = b.dataset.mode;
    $("#canto-volume").value = MODES[state.mode].volume;
    state.recorder?.setVolume(MODES[state.mode].volume);
    renderMode();
  }));
  document.querySelectorAll("#canto-fastest button").forEach((b) => b.addEventListener("click", () => {
    state.fastest = b.dataset.fastest;
    renderMode();
  }));
  $("#canto-volume").addEventListener("input", (e) => state.recorder?.setVolume(Number(e.target.value)));
  $("#canto-bpm").addEventListener("input", () => renderMode());
  $("#canto-signature").addEventListener("change", (e) => renderDots(beatsPerBarOf(e.target.value)));
  $("#canto-tap").addEventListener("click", () => {
    const now = performance.now();
    if (state.taps.length && now - state.taps.at(-1) > 2000) state.taps = [];
    state.taps.push(now);
    const recent = state.taps.slice(-5);
    if (recent.length >= 2) {
      const gaps = recent.slice(1).map((t, i) => t - recent[i]);
      const tapped = Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
      // rápido demais para cantar: a metade (cantar em meio tempo); devagar demais: o dobro
      const fit = tapped > SING_BPM.max && tapped / 2 >= SING_BPM.min ? Math.round(tapped / 2) : tapped < SING_BPM.min && tapped * 2 <= SING_BPM.max ? tapped * 2 : tapped;
      $("#canto-bpm").value = Math.max(SING_BPM.min, Math.min(SING_BPM.max, fit));
    }
  });
  bindRollPointer();
  $("#canto-octave-down").addEventListener("click", () => (state.selected >= 0 ? shiftSelected(-12) : shiftAll(-12)));
  $("#canto-octave-up").addEventListener("click", () => (state.selected >= 0 ? shiftSelected(12) : shiftAll(12)));
  $("#canto-semi-down").addEventListener("click", () => shiftSelected(-1));
  $("#canto-semi-up").addEventListener("click", () => shiftSelected(1));
  $("#canto-delete").addEventListener("click", removeSelected);
  $("#canto-undo").addEventListener("click", undo);
  $("#canto-zoom-in").addEventListener("click", () => zoomBy(1.3));
  $("#canto-zoom-out").addEventListener("click", () => zoomBy(1 / 1.3));
  $("#canto-full-touch").addEventListener("change", (e) => { $("#canto-roll").style.touchAction = e.target.checked ? "none" : ""; });
  $("#canto-play").addEventListener("click", () => {
    if (state.listen) { stopListening(); stop?.(); return; }
    const seconds = 60 / state.result.bpm;
    const total = totalBeats() * seconds;
    play(state.result.events.map((e) => ({ midi: e.midi, start: e.beat * seconds, length: e.beats * seconds, velocity: 95 })), total, { onEnd: () => stopListening() });
    // o som começa 60 ms depois (o mesmo atraso do tocador); a linha segue o relógio da página a partir daí
    state.listen = { start: performance.now() + 60, seconds, total, beat: 0, frame: 0 };
    $("#canto-play").textContent = "Parar";
    $("#canto-play").setAttribute("aria-pressed", "true");
    const tick = () => {
      if (!state.listen) return;
      const elapsed = (performance.now() - state.listen.start) / 1000;
      if (elapsed > total + 0.1) { stopListening(); return; }
      state.listen.beat = Math.max(0, elapsed) / seconds;
      drawRoll();
      state.listen.frame = requestAnimationFrame(tick);
    };
    tick();
  });
  $("#canto-use").addEventListener("click", () => {
    const r = state.result;
    onUse({
      text: text(), bpm: r.bpm, timeSignature: r.signature, beats: totalBeats(),
      target: r.target === "editar" ? "editar" : r.target === "parte" ? "parte" : r.target === "nova" && defaults().canAppend ? "nova" : "toda",
      part: r.over?.index ?? -1, keyShift: r.target === "nova" ? r.keyShift ?? readShift($("#canto-shift").value) : 0,
      events: r.events.map((e) => ({ ...e })), pickup: r.shift || 0, spell: speller(r.key, defaults().middleC), source: r.source || "canto",
    });
    state.result = null; // já foi para o projeto: a próxima vez começa limpa
    dialog.close();
  });

  // ------------------------------------------------------------ a melodia de um arquivo MIDI, no lugar do canto
  const useMidiTrack = (index) => {
    const d = defaults();
    const melody = melodyFromMidi(state.midi.parsed, index, { middleC: d.middleC });
    if (!melody.events.length) { status(melody.warnings[0] || "Esta faixa não tem notas.", true); return; }
    const newPart = asNewPart();
    const known = ["2/4", "3/4", "4/4", "6/8"];
    const signature = newPart ? d.timeSignature : known.includes(melody.timeSignature) ? melody.timeSignature : d.timeSignature;
    const warnings = [...melody.warnings];
    if (melody.timeSignature && melody.timeSignature !== signature) warnings.push(`O MIDI está em ${melody.timeSignature}; a melodia entra no compasso ${signature} do projeto. Confira os tempos.`);
    const bpm = newPart ? d.bpm : Math.round(melody.bpm ?? d.bpm) || d.bpm;
    if (newPart && melody.bpm && Math.round(melody.bpm) !== Math.round(d.bpm)) warnings.push(`O MIDI está a ${Math.round(melody.bpm)} BPM; a parte nova segue o BPM do projeto (${d.bpm}). As figuras são as mesmas.`);
    state.history = []; // melodia nova no desenho: o Desfazer e o zoom começam do zero
    state.zoom = 1;
    state.result = { ...melody, warnings, bpm, signature, shift: 0, leak: { leak: false }, latency: 0, fastest: "16", diatonic: false, target: newPart ? "nova" : "toda" };
    state.selected = -1;
    status("Melodia lida do MIDI. Confira as notas: toque numa nota do desenho para ajustá-la.");
    renderResult();
  };
  $("#canto-midi").addEventListener("click", () => { if (!state.recording) $("#canto-midi-file").click(); });
  $("#canto-midi-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    halt();
    if (file.size > MAX_MIDI_BYTES) { status("Este arquivo é grande demais para ser um MIDI de melodia (o limite é 5 MB).", true); return; }
    try {
      const parsed = parseMidi(new Uint8Array(await file.arrayBuffer()));
      const tracks = melodyTracks(parsed);
      if (!tracks.length) { status("Este MIDI não tem notas de melodia (só bateria, ou está vazio).", true); return; }
      state.midi = { parsed, tracks };
      $("#canto-track").replaceChildren(...tracks.map((t) => Object.assign(document.createElement("option"), { value: String(t.index), textContent: t.label })));
      useMidiTrack(tracks[0].index);
    } catch (err) {
      status(err.message || "Não consegui ler este arquivo MIDI.", true);
    }
  });
  $("#canto-track").addEventListener("change", (event) => { halt(); useMidiTrack(Number(event.target.value)); });
  document.querySelectorAll("#canto-target button").forEach((b) => b.addEventListener("click", () => {
    const was = state.target;
    state.target = b.dataset.target;
    // cantar por cima de uma parte é outra gravação (com a harmonia tocando): o resultado de antes não serve
    if (state.result && state.result.target !== "editar" && (was === "parte") !== (state.target === "parte")) { state.result = null; $("#canto-result").hidden = true; }
    if (state.result && state.result.target !== "editar" && state.target !== "parte") state.result.target = asNewPart() ? "nova" : "toda";
    renderMode();
  }));
  $("#canto-pickup").addEventListener("change", () => renderMode());
  $("#canto-shift").addEventListener("input", () => renderMode());
  $("#canto-again").addEventListener("click", () => { halt(); state.result = null; $("#canto-result").hidden = true; record(); });
  return { edit };
}
