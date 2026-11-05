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

  /** Um acorde: timbre de piano elétrico simples (senoide + harmônico suave). */
  #chord(midis, velocity, start, seconds) {
    const ctx = this.ctx;
    const peak = ((velocity / 127) ** 1.6 * 0.42) / Math.sqrt(Math.max(1, midis.length));
    const end = start + Math.max(0.08, seconds - 0.03);
    for (const midi of midis) {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(peak, start + 0.008);
      env.gain.setTargetAtTime(peak * 0.3, start + 0.01, 0.9);
      env.gain.setTargetAtTime(0, end, 0.07);
      env.connect(this.master);

      const body = ctx.createOscillator();
      body.type = "sine";
      body.frequency.value = freq(midi);
      const bell = ctx.createOscillator();
      bell.type = "triangle";
      bell.frequency.value = freq(midi) * 2;
      const bellGain = ctx.createGain();
      bellGain.gain.setValueAtTime(0.18, start);
      bellGain.gain.setTargetAtTime(0.02, start, 0.25);

      body.connect(env);
      bell.connect(bellGain).connect(env);
      for (const osc of [body, bell]) {
        osc.start(start);
        osc.stop(end + 0.6);
        this.voices.push(osc);
      }
    }
  }

  /**
   * Toca uma sequência de acordes.
   * chords: [{midis, velocity, beats}], bpm; onStep(i) / onEnd() para destacar a tela.
   */
  play(chords, bpm, { onStep, onEnd } = {}) {
    this.stop();
    const ctx = this.#ensure();
    const spb = 60 / bpm;
    let t = ctx.currentTime + 0.06;
    chords.forEach((c, i) => {
      const seconds = c.beats * spb;
      if (c.midis.length) this.#chord(c.midis, c.velocity, t, seconds);
      const delay = Math.max(0, (t - ctx.currentTime) * 1000);
      this.timers.push(setTimeout(() => onStep?.(i), delay));
      t += seconds;
    });
    this.timers.push(setTimeout(() => { this.voices = []; onEnd?.(); }, (t - ctx.currentTime) * 1000 + 50));
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
