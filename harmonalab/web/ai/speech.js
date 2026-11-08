// Ditado por voz com o reconhecimento de fala do próprio navegador (Chrome, Edge, Safari recentes).
// O áudio é processado pelo serviço do navegador (precisa de internet); o Harmona Lab não recebe áudio nenhum.
//
// Uma frase por toque: o reconhecimento termina sozinho quando você faz uma pausa. É o modo mais previsível,
// sem texto repetido nem vários "bips" no Android. Para ditar mais, toque no microfone de novo.

const ERRORS = {
  "not-allowed": "O navegador não deixou usar o microfone. Libere a permissão no cadeado da barra de endereço.",
  "service-not-allowed": "O navegador não deixou usar o microfone. Libere a permissão no cadeado da barra de endereço.",
  "no-speech": "Não ouvi nada. Toque no microfone e fale de novo.",
  "audio-capture": "Não encontrei um microfone neste aparelho.",
  network: "O ditado precisa de internet. Tente de novo ou use o microfone do teclado.",
  "language-not-supported": "O ditado em português não está disponível neste navegador.",
};

export const speechSupported = (win = globalThis) => Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);

/**
 * @param {object} o
 * @param {(t: {finalText: string, interimText: string}) => void} o.onUpdate  texto reconhecido até agora
 * @param {(state: "listening" | "idle") => void} [o.onState]
 * @param {(message: string, code?: string) => void} [o.onError]
 * @returns controle { start, stop, toggle, listening } ou null se o navegador não suporta
 */
export function createDictation({ onUpdate, onState, onError, lang = "pt-BR", win = globalThis }) {
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!Recognition) return null;
  let recognition = null;

  const start = () => {
    if (recognition) return;
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => onState?.("listening");
    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      onUpdate?.({ finalText: finalText.trim(), interimText: interimText.trim() });
    };
    rec.onerror = (event) => {
      if (event.error !== "aborted") onError?.(ERRORS[event.error] || `Erro no ditado (${event.error}).`, event.error);
    };
    rec.onend = () => {
      recognition = null;
      onState?.("idle");
    };
    recognition = rec;
    try {
      rec.start();
    } catch {
      recognition = null;
      onError?.("Não consegui iniciar o ditado. Tente de novo.");
      onState?.("idle");
    }
  };

  const stop = () => {
    try { recognition?.stop(); } catch { /* já parado */ }
  };

  return {
    start,
    stop,
    toggle: () => (recognition ? stop() : start()),
    get listening() { return recognition !== null; },
  };
}

/** Junta o texto que já estava na caixa com o que foi ditado, com um espaço no meio. */
export function mergeDictation(base, { finalText, interimText }) {
  const said = [finalText, interimText].filter(Boolean).join(" ").trim();
  if (!said) return base;
  return base && !/\s$/.test(base) ? `${base} ${said}` : `${base}${said}`;
}
