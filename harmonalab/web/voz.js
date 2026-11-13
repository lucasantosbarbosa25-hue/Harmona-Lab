// Cantar uma melodia: metrônomo amadeirado, um compasso de contagem, a gravação (só no aparelho) e as notas que o app
// ouviu, para conferir, ajustar e usar como a camada Voz do projeto. A análise está em engine/canto.js.
import { SIXTEENTHS_UP_TO_BPM, hatTickSamples, hzFromMidi, speller, transcribe, voiceText, woodblockSamples } from "./engine/canto.js";
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
  const state = { mode: "fone", fastest: "auto", target: "toda", recorder: null, recording: false, result: null, selected: -1, taps: [], midi: null };
  /** A melodia entra como parte nova (depois da música que já existe)? */
  const asNewPart = () => state.target === "nova" && Boolean(defaults().canAppend);

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
    $("#canto-target-box").hidden = !d.canAppend;
    document.querySelectorAll("#canto-target button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.target === state.target)));
    const fresh = asNewPart();
    $("#canto-target-hint").textContent = fresh
      ? `Vira a parte ${d.nextSection}, depois da música que já existe. Antes de você cantar, o app toca os 2 últimos compassos dela${$("#canto-pickup").checked && state.mode !== "fone" ? " (com anacruse e sem fone, só o clique: use fone para ouvir o trecho)" : ""}. O BPM e o compasso do projeto não mudam.`
      : "A melodia vale para a música inteira, a partir do compasso 1, e substitui a Voz que houver.";
    $("#canto-signature").disabled = fresh; // a parte nova segue o compasso do projeto
    if (fresh) $("#canto-signature").value = d.timeSignature;
    $("#canto-use").textContent = state.result?.target === "nova" ? `Usar como parte ${d.nextSection}` : "Usar como Voz";
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
    if (state.result && state.result.target === "nova" && !d.canAppend) state.result = null;
    renderMode();
    renderDots(beatsPerBarOf($("#canto-signature").value));
    $("#canto-result").hidden = !state.result;
    status("Escolha o BPM e toque em Gravar. Depois da contagem, cante.");
    dialog.showModal();
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
    const pickup = $("#canto-pickup").checked;
    const newPart = asNewPart();
    const withMusic = newPart && !(pickup && state.mode !== "fone"); // sem fone, o trecho vazaria por cima da anacruse
    const countInBars = pickup || withMusic ? PREROLL_BARS : COUNT_IN_BARS;
    state.take = { pickup, withMusic, target: newPart ? "nova" : "toda", countInBeats: beatsPerBar * countInBars };
    try {
      await state.recorder.start({
        bpm, beatsPerBar, mode: state.mode, volume: Number($("#canto-volume").value), eighths: $("#canto-eighths").checked,
        countInBars, music: withMusic ? preroll?.({ bpm, bars: PREROLL_BARS }) ?? [] : [],
        onBeat: (index, sung) => {
          renderDots(beatsPerBar, ((index % beatsPerBar) + beatsPerBar) % beatsPerBar);
          const countIn = beatsPerBar * countInBars;
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
    const { pickup, withMusic, target } = state.take;
    const result = transcribe(take.samples, take.sampleRate, {
      bpm: state.bpm, beatsPerBar: bar, clickTimes: take.clickTimes, tickTimes: take.tickTimes, countInBeats: take.countInBeats,
      // com anacruse, o atraso do clique é medido só no 1º compasso da contagem (no 2º a pessoa já pode estar cantando)
      measureBeats: pickup ? take.countInBeats - bar : take.countInBeats,
      pickupBeats: pickup ? bar : withMusic ? 0 : Infinity, music: withMusic,
      latencyFallback: take.latencyFallback, middleC: defaults().middleC, fastest: state.fastest, diatonic: $("#canto-diatonic").checked,
    });
    if (!result.events.length) { status(result.warnings[0] || "Não encontrei notas cantadas.", true); return; }
    state.midi = null;
    state.result = { ...result, bpm: state.bpm, signature: state.signature, target };
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
    $("#canto-info").textContent = r.source === "midi"
      ? `${r.events.length} notas do arquivo MIDI · tom provável: ${r.key?.name ?? "?"} · ${r.bpm} BPM, compasso ${r.signature}.`
      : `${r.events.length} notas · tom provável: ${r.key?.name ?? "?"}${scale} · ${r.bpm} BPM, ritmo em ${grid} · ${leak}.`;
    $("#canto-track-box").hidden = !(r.source === "midi" && state.midi && state.midi.tracks.length > 1);
    $("#canto-again").hidden = r.source === "midi";
    renderMode();
    $("#canto-warnings").replaceChildren(...r.warnings.map((w) => Object.assign(document.createElement("li"), { textContent: w })));
    $("#canto-text").textContent = text();
    const hasSelection = state.selected >= 0;
    for (const id of ["#canto-semi-down", "#canto-semi-up", "#canto-delete"]) $(id).disabled = !hasSelection;
    // oitava: com uma nota escolhida, mexe só nela; sem nenhuma, na melodia toda (o texto do botão diz qual)
    $("#canto-octave-down").textContent = hasSelection ? "Nota −8ª" : "Tudo −8ª";
    $("#canto-octave-up").textContent = hasSelection ? "Nota +8ª" : "Tudo +8ª";
    drawRoll();
  };

  const drawRoll = () => {
    const canvas = $("#canto-roll");
    const r = state.result;
    const width = canvas.clientWidth || 320;
    const height = 150;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const g = canvas.getContext("2d");
    g.scale(ratio, ratio);
    const css = getComputedStyle(document.documentElement);
    const color = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const beats = Math.max(totalBeats(), 1);
    const pitches = r.events.map((e) => e.midi);
    const low = Math.min(...pitches) - 2;
    const high = Math.max(...pitches) + 2;
    const x = (b) => 4 + (b / beats) * (width - 8);
    const y = (m) => 6 + ((high - m) / (high - low)) * (height - 24);
    g.clearRect(0, 0, width, height);
    const bpb = beatsPerBarOf(r.signature);
    g.strokeStyle = color("--border", "#ccc");
    g.lineWidth = 1;
    for (let b = 0; b <= beats; b += bpb) { g.beginPath(); g.moveTo(x(b), 0); g.lineTo(x(b), height); g.stroke(); }
    const spell = speller(r.key, defaults().middleC);
    g.font = "11px system-ui, sans-serif";
    const playing = state.listen ? r.events.findIndex((e) => state.listen.beat >= e.beat && state.listen.beat < e.beat + e.beats) : -1;
    r.events.forEach((e, i) => {
      const left = x(e.beat);
      const w = Math.max(3, x(e.beat + e.beats) - left - 2);
      const top = y(e.midi) - 5;
      const lit = i === playing;
      const chosen = playing < 0 && i === state.selected; // só UMA nota fica escolhida: maior, com contorno e o nome em destaque
      g.globalAlpha = playing >= 0 && !lit ? 0.45 : 1; // ao ouvir, as outras notas apagam um pouco
      g.fillStyle = lit || chosen ? color("--primary", "#a85a00") : color("--muted", "#666");
      if (lit || chosen) g.fillRect(left - 1, top - 3, w + 2, 16); // a nota que soa (ou a escolhida) cresce
      else g.fillRect(left, top, w, 10);
      if (chosen) { g.strokeStyle = color("--text", "#111"); g.lineWidth = 2; g.strokeRect(left - 1, top - 3, w + 2, 16); }
      if (i === state.selected && playing >= 0) { g.strokeStyle = color("--primary", "#a85a00"); g.lineWidth = 2; g.strokeRect(left, top, w, 10); }
      g.globalAlpha = 1;
      if (w > 22 || chosen || lit) {
        const strong = chosen || lit;
        g.font = strong ? "bold 12px system-ui, sans-serif" : "11px system-ui, sans-serif";
        g.fillStyle = strong ? color("--text", "#111") : color("--muted", "#666"); // os nomes das outras ficam discretos: não parecem escolhidas
        g.globalAlpha = strong ? 1 : 0.7;
        g.fillText(spell(e.midi), left, top - 6 > 10 ? top - 6 : top + 24);
        g.globalAlpha = 1;
      }
    });
    if (state.listen) {
      // a linha que corre junto com o som
      const at = x(Math.min(beats, state.listen.beat));
      g.strokeStyle = color("--primary", "#a85a00");
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(at, 0); g.lineTo(at, height); g.stroke();
    }
    canvas.dataset.beats = String(beats);
    canvas.dataset.playing = String(playing);
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
    state.result.events = state.result.events.map((e) => ({ ...e, midi: Math.max(24, Math.min(108, e.midi + semitones)) }));
    renderResult();
  };
  const shiftSelected = (semitones) => {
    halt();
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
  $("#canto-roll").addEventListener("click", (event) => {
    if (!state.result) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const beat = ((event.clientX - rect.left - 4) / (rect.width - 8)) * Number(canvas.dataset.beats || 1);
    const index = state.result.events.findIndex((e) => beat >= e.beat - 0.1 && beat <= e.beat + e.beats + 0.1);
    state.selected = index === state.selected ? -1 : index;
    renderResult();
  });
  $("#canto-octave-down").addEventListener("click", () => (state.selected >= 0 ? shiftSelected(-12) : shiftAll(-12)));
  $("#canto-octave-up").addEventListener("click", () => (state.selected >= 0 ? shiftSelected(12) : shiftAll(12)));
  $("#canto-semi-down").addEventListener("click", () => shiftSelected(-1));
  $("#canto-semi-up").addEventListener("click", () => shiftSelected(1));
  $("#canto-delete").addEventListener("click", () => {
    halt();
    state.result.events.splice(state.selected, 1);
    state.selected = -1;
    if (!state.result.events.length) { state.result = null; $("#canto-result").hidden = true; status("Todas as notas foram apagadas. Grave de novo."); return; }
    renderResult();
  });
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
      text: text(), bpm: r.bpm, timeSignature: r.signature, beats: totalBeats(), target: r.target === "nova" && defaults().canAppend ? "nova" : "toda",
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
    state.target = b.dataset.target;
    if (state.result) state.result.target = asNewPart() ? "nova" : "toda";
    renderMode();
  }));
  $("#canto-pickup").addEventListener("change", () => renderMode());
  $("#canto-again").addEventListener("click", () => { halt(); state.result = null; $("#canto-result").hidden = true; record(); });
}
