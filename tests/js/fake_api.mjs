// API da Anthropic simulada, no formato oficial de streaming (SSE), para testar o assistente sem chave e sem rede.
// Os eventos seguem a documentação: message_start, content_block_start/delta/stop, message_delta, message_stop.

const encoder = new TextEncoder();

// ---------------------------------------------------------------- blocos de conteúdo
const chunks = (text, parts = 3) => {
  const size = Math.max(1, Math.ceil(text.length / parts));
  return Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, (i + 1) * size));
};

export const block = {
  /** Raciocínio: a API devolve o texto vazio por padrão, mas sempre uma assinatura. */
  thinking: (text = "", signature = "assinatura-do-raciocinio") => ({ kind: "thinking", text, signature }),
  text: (text) => ({ kind: "text", text }),
  /** Pesquisa na internet: server_tool_use + web_search_tool_result (resultados com encrypted_content). */
  search: (id, query, results = []) => ({ kind: "search", id, query, results }),
  /** Chamada de ferramenta do cliente (a entrega). */
  tool: (id, name, input) => ({ kind: "tool", id, name, input }),
};

function blockEvents(b, index) {
  const start = (content_block) => ({ type: "content_block_start", index, content_block });
  const delta = (d) => ({ type: "content_block_delta", index, delta: d });
  const stop = { type: "content_block_stop", index };
  switch (b.kind) {
    case "thinking":
      return [
        start({ type: "thinking", thinking: "", signature: "" }),
        ...(b.text ? chunks(b.text, 2).map((t) => delta({ type: "thinking_delta", thinking: t })) : []),
        delta({ type: "signature_delta", signature: b.signature }),
        stop,
      ];
    case "text":
      return [start({ type: "text", text: "" }), ...chunks(b.text).map((t) => delta({ type: "text_delta", text: t })), stop];
    case "search": {
      const results = b.results.map((r) => ({
        type: "web_search_result", url: r.url, title: r.title, encrypted_content: `enc-${r.url}`, page_age: null,
      }));
      return [
        start({ type: "server_tool_use", id: b.id, name: "web_search", input: {} }),
        ...chunks(JSON.stringify({ query: b.query }), 2).map((p) => delta({ type: "input_json_delta", partial_json: p })),
        stop,
        { type: "content_block_start", index: index + 1, content_block: { type: "web_search_tool_result", tool_use_id: b.id, content: results } },
        { type: "content_block_stop", index: index + 1 },
      ];
    }
    case "tool":
      return [
        start({ type: "tool_use", id: b.id, name: b.name, input: {} }),
        ...chunks(typeof b.input === "string" ? b.input : JSON.stringify(b.input), 4).map((p) => delta({ type: "input_json_delta", partial_json: p })),
        stop,
      ];
    default:
      throw new Error(`bloco desconhecido: ${b.kind}`);
  }
}

/** Lista de eventos de uma resposta completa. Os índices dos blocos são renumerados em sequência. */
export function messageEvents({ blocks = [], stop_reason = "end_turn", usage = {}, model = "claude-opus-5-5", id = "msg_teste", stop_details = null }) {
  const events = [{
    type: "message_start",
    message: {
      id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: usage.input ?? 1000, output_tokens: 1, cache_creation_input_tokens: usage.cacheWrite ?? 0, cache_read_input_tokens: usage.cacheRead ?? 0 },
    },
  }, { type: "ping" }];
  let index = 0;
  for (const b of blocks) {
    events.push(...blockEvents(b, index));
    index += b.kind === "search" ? 2 : 1; // a pesquisa ocupa dois blocos: a chamada e o resultado
  }
  events.push({
    type: "message_delta",
    delta: { stop_reason, stop_sequence: null, ...(stop_details ? { stop_details } : {}) },
    usage: { output_tokens: usage.output ?? 400, ...(usage.searches ? { server_tool_use: { web_search_requests: usage.searches } } : {}) },
  });
  events.push({ type: "message_stop" });
  return events;
}

export const sseText = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");

/** Resposta 200 em streaming, entregue evento a evento (como a API de verdade). */
export function sseResponse(spec, { delayMs = 0 } = {}) {
  const events = messageEvents(spec);
  const body = new ReadableStream({
    async start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(sseText([e])));
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_teste" } });
}

/** Resposta de erro no formato da API. */
export function errorResponse(status, type, message) {
  return new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status, headers: { "content-type": "application/json", "request-id": "req_erro" },
  });
}

/** Resposta JSON simples (chamada sem streaming, usada no teste da chave). */
export function jsonMessage({ text = "ok", model = "claude-opus-5-5" } = {}) {
  return new Response(JSON.stringify({
    id: "msg_json", type: "message", role: "assistant", model, stop_reason: "end_turn", stop_sequence: null,
    content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 3 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

/**
 * fetch simulado: cada chamada consome o próximo passo (função que recebe o corpo já lido e devolve uma Response).
 * `fake.calls` guarda { url, headers, body } de cada chamada, para conferir o que o app enviou.
 */
export function fakeFetch(steps) {
  const queue = [...steps];
  const fake = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const body = init.body ? JSON.parse(init.body) : null;
    const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
    fake.calls.push({ url, headers, body });
    const step = queue.shift();
    if (!step) throw new Error("fetch simulado: acabaram os passos");
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return typeof step === "function" ? step(body, fake.calls.length) : step;
  };
  fake.calls = [];
  fake.remaining = () => queue.length;
  return fake;
}

// ---------------------------------------------------------------- exemplos prontos
export const GOOD_PROJECT = {
  title: "Resolução em Em com F# no soprano",
  tempo: 76,
  time_signature: "4/4",
  middle_c: "C4",
  chords: [
    { symbol: "Fmaj7(#11)", duration_beats: 4, bass: ["F2"], left_hand: ["C3"], right_hand: ["E3", "A3", "B3", "F#4"], top_note: "F#4", comment: "lídio" },
    { symbol: "B7alt", duration_beats: 4, left_hand: ["B2", "A3"], right_hand: ["D4", "Eb4", "G4", "C5"], top_note: "C5" },
    { symbol: "Em9", duration_beats: 8, left_hand: ["E2", "B2", "D3"], right_hand: ["G3", "F#4"], top_note: "F#4" },
  ],
};

export const delivery = (overrides = {}) => ({
  pedido_extraido: { acordes: 3, bpm: 76 },
  explicacao: "Fmaj7(#11) empurra para B7alt, que resolve em Em9 com o F# no topo.",
  projeto: GOOD_PROJECT,
  ...overrides,
});
