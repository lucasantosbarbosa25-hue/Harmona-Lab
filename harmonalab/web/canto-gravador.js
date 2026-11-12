// Gravador da voz: roda dentro do motor de áudio do navegador (AudioWorklet), no MESMO relógio dos cliques do metrônomo.
// Assim o app sabe, amostra por amostra, onde caiu cada clique na gravação. Junta blocos de ~85 ms e os manda para a página
// com o número do primeiro quadro (currentFrame). Nada sai do aparelho.
class CantoGravador extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.filled = 0;
    this.firstFrame = null;
    this.port.onmessage = (event) => { if (event.data === "flush") this.flush(); };
  }

  flush() {
    if (!this.filled) return;
    this.port.postMessage({ frame: this.firstFrame, samples: this.buffer.slice(0, this.filled) });
    this.filled = 0;
    this.firstFrame = null;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        if (this.firstFrame === null) this.firstFrame = currentFrame + i; // quadro exato da 1ª amostra do bloco
        this.buffer[this.filled++] = channel[i];
        if (this.filled === this.buffer.length) this.flush();
      }
    }
    return true;
  }
}

registerProcessor("canto-gravador", CantoGravador);
