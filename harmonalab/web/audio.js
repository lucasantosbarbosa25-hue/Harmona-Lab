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

  /**
   * Toca uma lista de notas (a mesma de onde sai o arquivo MIDI).
   * notes: [{midi, start, length, velocity}] em segundos; steps: [{time, index}] para destacar o acorde que soa;
   * total: duração em segundos; onStep(index) / onEnd().
   */
  play(notes, { steps = [], total = 0, onStep, onEnd } = {}) {
    this.stop();
    const ctx = this.#ensure();
    const t0 = ctx.currentTime + 0.06;
    const together = new Map(); // quantas notas entram juntas (para o volume não estourar nos acordes cheios)
    const bucket = (n) => Math.round(n.start * 25);
    for (const n of notes) together.set(bucket(n), (together.get(bucket(n)) || 0) + 1);
    for (const n of notes) this.#voice(n.midi, n.velocity, t0 + n.start, n.length, together.get(bucket(n)));
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
