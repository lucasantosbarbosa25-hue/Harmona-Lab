// Pré-escuta simples no navegador (Web Audio). Não substitui o seu VST:
// serve só para conferir rapidamente o voicing enquanto edita.

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Player {
  constructor() {
    this.ctx = null;
    this.voices = [];
    this.timers = [];
  }

  #ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  /** Uma nota: timbre de piano elétrico simples (senoide + harmônico suave). */
  #voice(midi, velocity, t0, seconds, share) {
    const ctx = this.ctx;
    const peak = ((velocity / 127) ** 1.6 * 0.42) / Math.sqrt(Math.max(1, share));
    const end = t0 + Math.max(0.05, seconds - 0.03);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    env.gain.setTargetAtTime(peak * 0.3, t0 + 0.01, 0.9);
    env.gain.setTargetAtTime(0, end, 0.07);
    env.connect(this.master);

    const body = ctx.createOscillator();
    body.type = "sine";
    body.frequency.value = freq(midi);
    const bell = ctx.createOscillator();
    bell.type = "triangle";
    bell.frequency.value = freq(midi) * 2;
    const bellGain = ctx.createGain();
    bellGain.gain.setValueAtTime(0.18, t0);
    bellGain.gain.setTargetAtTime(0.02, t0, 0.25);

    body.connect(env);
    bell.connect(bellGain).connect(env);
    for (const osc of [body, bell]) {
      osc.start(t0);
      osc.stop(end + 0.6);
      this.voices.push(osc);
    }
  }

  /** Ruído branco, criado uma vez (pratos, caixa, ganzá). */
  /** Uma nota do pad: entra devagar, fica parada e sai devagar (duas ondas levemente desafinadas, com o agudo cortado). */
  #pad(midi, velocity, t0, seconds) {
    const ctx = this.ctx;
    const peak = (velocity / 127) ** 1.2 * 0.075;
    const end = t0 + Math.max(0.2, seconds);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.45);
    env.gain.setTargetAtTime(0, end - 0.05, 0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.4;
    filter.connect(env).connect(this.master);
    for (const cents of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq(midi);
      osc.detune.value = cents;
      osc.connect(filter);
      osc.start(t0);
      osc.stop(end + 1.4);
      this.voices.push(osc);
    }
  }

  #noise() {
    if (!this.noiseBuffer) {
      const length = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    return source;
  }

  /** Uma peça de bateria (notas General MIDI), sintetizada de forma simples: só para conferir o ritmo. */
  #drum(note, velocity, t0) {
    const ctx = this.ctx;
    const level = (velocity / 127) ** 1.4;
    const out = ctx.createGain();
    out.connect(this.master);
    const tone = (from, to, decay, gain, type = "sine") => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      osc.frequency.exponentialRampToValueAtTime(to, t0 + decay);
      const env = ctx.createGain();
      env.gain.setValueAtTime(gain * level, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      osc.connect(env).connect(out);
      osc.start(t0);
      osc.stop(t0 + decay + 0.05);
      this.voices.push(osc);
    };
    const hiss = (frequency, decay, gain, type = "highpass") => {
      const source = this.#noise();
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      const env = ctx.createGain();
      env.gain.setValueAtTime(gain * level, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      source.connect(filter).connect(env).connect(out);
      source.start(t0);
      source.stop(t0 + decay + 0.05);
      this.voices.push(source);
    };
    switch (note) {
      case 36: tone(150, 45, 0.22, 0.9); break; // bumbo
      case 38: hiss(1800, 0.16, 0.5, "bandpass"); tone(190, 140, 0.1, 0.3); break; // caixa
      case 37: hiss(2600, 0.04, 0.35, "bandpass"); tone(800, 700, 0.03, 0.2, "triangle"); break; // aro
      case 42: case 44: hiss(7500, 0.045, 0.22); break; // chimbal fechado / de pé
      case 46: hiss(6500, 0.28, 0.2); break; // chimbal aberto
      case 51: hiss(5500, 0.4, 0.12); tone(3200, 3100, 0.25, 0.04, "triangle"); break; // condução
      case 53: tone(3400, 3300, 0.3, 0.1, "triangle"); hiss(6000, 0.2, 0.06); break; // cúpula
      case 49: hiss(4500, 0.9, 0.22); break; // ataque
      case 50: tone(260, 180, 0.2, 0.6); break; // tons
      case 47: tone(190, 130, 0.22, 0.6); break;
      case 43: tone(130, 85, 0.26, 0.65); break;
      case 56: tone(545, 540, 0.12, 0.2, "square"); tone(815, 810, 0.1, 0.14, "square"); break; // cowbell
      case 75: tone(2500, 2450, 0.035, 0.4); break; // clave
      case 54: hiss(8000, 0.07, 0.22); break; // pandeirola / tamborim
      case 70: hiss(6000, 0.05, 0.16); break; // ganzá
      case 63: tone(340, 300, 0.12, 0.5); break; // congas
      case 64: tone(240, 200, 0.16, 0.5); break;
      case 62: hiss(2200, 0.03, 0.3, "bandpass"); tone(380, 360, 0.04, 0.3); break; // conga muda (tapa)
      case 60: tone(620, 560, 0.08, 0.45); break; // bongô agudo
      case 61: tone(440, 400, 0.1, 0.45); break; // bongô grave
      case 65: tone(700, 640, 0.12, 0.35, "triangle"); hiss(3000, 0.06, 0.15, "bandpass"); break; // timbal agudo
      case 66: tone(500, 450, 0.14, 0.35, "triangle"); hiss(2500, 0.07, 0.15, "bandpass"); break; // timbal grave
      case 73: hiss(4200, 0.05, 0.22, "bandpass"); break; // güiro curto
      case 74: hiss(4200, 0.18, 0.18, "bandpass"); break; // güiro longo
      case 67: tone(1050, 1040, 0.12, 0.18, "square"); break; // agogô
      default: hiss(5000, 0.05, 0.15);
    }
  }

  /**
   * Toca uma lista de notas (a mesma de onde sai o arquivo MIDI).
   * notes: [{midi, start, length, velocity, drum (peça de bateria?), pad (nota do pad?)}] em segundos; steps: [{time, index}] para destacar o acorde que soa;
   * total: duração em segundos; onStep(index) / onEnd().
   */
  play(notes, { steps = [], total = 0, onStep, onEnd } = {}) {
    this.stop();
    const ctx = this.#ensure();
    const t0 = ctx.currentTime + 0.06;
    const together = new Map(); // quantas notas entram juntas (para o volume não estourar nos acordes cheios)
    const bucket = (n) => Math.round(n.start * 25);
    for (const n of notes) if (!n.drum && !n.pad) together.set(bucket(n), (together.get(bucket(n)) || 0) + 1);
    for (const n of notes) {
      if (n.pad) this.#pad(n.midi, n.velocity, t0 + n.start, n.length);
      else if (n.drum) this.#drum(n.midi, n.velocity, t0 + n.start);
      else this.#voice(n.midi, n.velocity, t0 + n.start, n.length, together.get(bucket(n)));
    }
    for (const step of steps) this.timers.push(setTimeout(() => onStep?.(step.index), (t0 + step.time - ctx.currentTime) * 1000));
    this.timers.push(setTimeout(() => { this.voices = []; onEnd?.(); }, (t0 + total - ctx.currentTime) * 1000 + 50));
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const now = this.ctx?.currentTime ?? 0;
    for (const osc of this.voices) {
      try { osc.stop(now + 0.02); } catch { /* já parado */ }
    }
    this.voices = [];
  }
}
