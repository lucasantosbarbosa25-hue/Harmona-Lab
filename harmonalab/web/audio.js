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
  #chord(midis, velocity, start, seconds, offsets, gain = 1) {
    const ctx = this.ctx;
    const peak = (((velocity / 127) ** 1.6 * 0.42) / Math.sqrt(Math.max(1, midis.length))) * gain;
    const end = start + Math.max(0.08, seconds - 0.03);
    for (const [i, midi] of midis.entries()) {
      const t0 = start + (offsets?.[i] ?? 0); // strum: cada nota entra no seu momento
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
  }

  /**
   * Toca uma sequência de acordes.
   * chords: [{midis, offsets (s, opcional: strum), velocity, beats, phrase (opcional: [{midi, start, length}] em segundos)}], bpm;
   * onStep(i) / onEnd() para destacar a tela.
   */
  play(chords, bpm, { onStep, onEnd } = {}) {
    this.stop();
    const ctx = this.#ensure();
    const spb = 60 / bpm;
    let t = ctx.currentTime + 0.06;
    chords.forEach((c, i) => {
      const seconds = c.beats * spb;
      if (c.midis.length) this.#chord(c.midis, c.velocity, t, seconds, c.offsets);
      for (const note of c.phrase ?? []) this.#chord([note.midi], c.velocity, t + note.start, note.length, null, 0.8); // a frase: uma nota de cada vez
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
