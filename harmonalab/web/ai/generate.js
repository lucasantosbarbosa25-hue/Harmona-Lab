// Do pedido em texto à progressão pronta.
//
// O app fala direto com a API da Anthropic (SDK oficial, embutido em vendor/), em streaming. A IA tem duas
// ferramentas: a pesquisa na internet (roda nos servidores da Anthropic) e "entregar_progressao" (roda aqui):
// ao receber a entrega, o motor do app confere as notas, o soprano e o que o pedido exigia. Se houver problema,
// a lista volta para a IA, que corrige e entrega de novo. Assim o resultado só entra no app depois de conferido.

import { analyzeData } from "../engine/analysis.js";
import { DELIVERY_TOOL, SYSTEM_PROMPT, TOOL_NAME, buildUserMessage, searchTool } from "./prompt.js";
import { DEFAULT_API_BASE, checkApiBase, estimateCostUsd } from "./settings.js";

const MAX_TURNS = 8; // chamadas à API por pedido (inclui continuações da pesquisa e correções)
const MAX_REJECTIONS = 3; // entregas recusadas pela conferência antes de aceitar o melhor que houver
const MAX_TOKENS = 32000;
const MAX_SOURCES = 12;

/** Erro com mensagem pronta para mostrar. `kind`: "aborted" quando a pessoa cancelou. */
export class GenerationError extends Error {
  constructor(message, { kind = "error", details = "" } = {}) {
    super(message);
    this.name = "GenerationError";
    this.kind = kind;
    this.details = details;
  }
}

export async function loadSdk() {
  return (await import("../vendor/anthropic-sdk.js")).default;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// ---------------------------------------------------------------- conferência da entrega

/**
 * Confere o que a IA entregou. Devolve { ok, problems, report, explanation }.
 * Bloqueia: erros do motor (nota inexistente, BPM inválido...), soprano travado que não é a nota mais aguda
 * e o que não bate com o que o pedido disse (número de acordes, BPM).
 */
export function checkDelivery(input, { requireExplanation = true } = {}) {
  const problems = [];
  const data = isObject(input) ? input : {};
  const project = data.projeto;
  const explanation = typeof data.explicacao === "string" ? data.explicacao.trim() : "";
  if (!isObject(project)) problems.push('Falta o campo "projeto" (o objeto com tempo e chords).');
  if (!explanation && requireExplanation) problems.push('Falta a "explicacao" (texto simples, em português).');

  let report = null;
  if (isObject(project)) {
    report = analyzeData(project);
    for (const issue of report.issues) {
      const blocking = issue.level === "error" || (issue.level === "warning" && issue.field === "top_note");
      if (!blocking) continue;
      let where = "";
      if (issue.chord != null) {
        const symbol = report.chords[issue.chord]?.symbol;
        where = `Acorde ${issue.chord + 1}${symbol ? ` (${symbol})` : ""}${issue.field ? `, campo ${issue.field}` : ""}: `;
      } else if (issue.field) {
        where = `Projeto, campo ${issue.field}: `;
      }
      problems.push(where + issue.message);
    }
    const asked = isObject(data.pedido_extraido) ? data.pedido_extraido : {};
    if (Number.isInteger(asked.acordes) && asked.acordes > 0 && report.chords.length !== asked.acordes) {
      problems.push(`O pedido pedia ${asked.acordes} acordes, mas o projeto tem ${report.chords.length}.`);
    }
    if (typeof asked.bpm === "number" && asked.bpm > 0 && Number(project.tempo) !== asked.bpm) {
      problems.push(`O pedido pedia ${asked.bpm} BPM, mas o projeto está com tempo ${project.tempo}.`);
    }
  }
  return { ok: problems.length === 0, problems, report, explanation };
}

const problemsText = (problems) =>
  `A conferência encontrou ${problems.length} problema(s). Corrija todos e chame ${TOOL_NAME} de novo, `
  + `com o projeto completo:\n${problems.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;

// ---------------------------------------------------------------- erros

const apiMessage = (err) => err?.error?.error?.message || err?.error?.message || "";

/** Traduz um erro do SDK para uma mensagem que a pessoa entenda. */
export function explainError(err, Anthropic) {
  if (err instanceof GenerationError) return err;
  const details = apiMessage(err) || (err instanceof Error ? err.message : String(err));
  if (err instanceof Anthropic.APIUserAbortError) return new GenerationError("Pedido cancelado.", { kind: "aborted" });
  if (err instanceof Anthropic.AuthenticationError) {
    return new GenerationError("A API recusou a chave (inválida, revogada ou apagada). Confira em Configurar a IA.", { details });
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new GenerationError("Esta chave não tem permissão para esse modelo ou recurso.", { details });
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new GenerationError("A API não encontrou o modelo ou o endereço configurado.", { details });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new GenerationError("Limite de uso da API atingido. Espere um minuto e tente de novo.", { details });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new GenerationError(`A API recusou o pedido: ${details}`, { details });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new GenerationError(
      "Não consegui falar com a API. Confira a internet (e, se usa um endereço de API próprio, se ele libera CORS).",
      { details },
    );
  }
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) {
    return new GenerationError("Os servidores da Anthropic estão sobrecarregados ou fora do ar. Tente de novo em instantes.", { details });
  }
  return new GenerationError(`Erro inesperado: ${details}`, { details });
}

// ---------------------------------------------------------------- uma rodada em streaming

/** Executa uma chamada à API em streaming, avisando o que está acontecendo. Devolve a mensagem final. */
async function streamTurn({ client, params, signal, emit }) {
  const stream = client.messages.stream(params, { signal });
  const searches = new Map(); // índice do bloco → JSON (parcial) da busca
  let written = 0;
  let announced = 0;
  // Com "eager input streaming" um JSON impossível de ler derruba a leitura aqui (veja o laço em generateProgression).
  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "thinking") emit({ kind: "thinking" });
      else if (block.type === "server_tool_use") searches.set(event.index, "");
      else if (block.type === "tool_use" && block.name === TOOL_NAME) emit({ kind: "writing", chars: 0 });
    } else if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
      if (searches.has(event.index)) {
        searches.set(event.index, searches.get(event.index) + event.delta.partial_json);
      } else {
        written += event.delta.partial_json.length;
        if (written - announced >= 400) {
          announced = written;
          emit({ kind: "writing", chars: written });
        }
      }
    } else if (event.type === "content_block_stop" && searches.has(event.index)) {
      let query = "";
      try { query = String(JSON.parse(searches.get(event.index)).query || ""); } catch { /* consulta ilegível: segue sem texto */ }
      searches.delete(event.index);
      emit({ kind: "searching", query });
    }
  }
  return stream.finalMessage();
}

function collectSources(content, sources) {
  for (const block of content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const item of block.content) {
      if (item?.type !== "web_search_result" || typeof item.url !== "string") continue;
      if (!/^https?:\/\//i.test(item.url) || sources.size >= MAX_SOURCES) continue;
      if (!sources.has(item.url)) sources.set(item.url, { url: item.url, title: String(item.title || item.url) });
    }
  }
}

function addUsage(total, usage = {}) {
  total.input += usage.input_tokens || 0;
  total.output += usage.output_tokens || 0;
  total.cacheRead += usage.cache_read_input_tokens || 0;
  total.cacheWrite += usage.cache_creation_input_tokens || 0;
  total.searches += usage.server_tool_use?.web_search_requests || 0;
}

function makeClient(settings, Anthropic, clientOptions) {
  const base = checkApiBase(settings.apiBase);
  if (!base.ok) throw new GenerationError(base.error);
  if (!settings.apiKey) throw new GenerationError("Falta a chave da API. Adicione em Configurar a IA.");
  return new Anthropic({
    apiKey: settings.apiKey,
    baseURL: base.value || DEFAULT_API_BASE,
    dangerouslyAllowBrowser: true, // a chave é da própria pessoa e fica só neste aparelho
    ...clientOptions,
  });
}

// ---------------------------------------------------------------- o pedido inteiro

/**
 * Gera uma progressão a partir de um pedido em texto livre.
 *
 * @param {object} o
 * @param {string} o.request       o que a pessoa escreveu ou ditou
 * @param {"new"|"adjust"} o.mode  nova progressão, ou ajuste da atual
 * @param {object} [o.currentProject]  projeto atual (JSON), usado no ajuste
 * @param {object} o.settings      configurações normalizadas (chave, modelo, esforço, pesquisa, preferências...)
 * @param {AbortSignal} [o.signal] para cancelar
 * @param {(e: object) => void} [o.onStatus]  { kind: "thinking" | "searching" | "writing" | "checking" | "retry" | ... }
 * @param {object} [o.Anthropic]   injeção para testes; o padrão é o SDK embutido
 * @param {object} [o.clientOptions] opções extras do cliente (testes: fetch, maxRetries)
 * @returns {Promise<{project, title, explanation, sources, usage, costUsd, warnings, partial, searchSkipped, turns, model}>}
 */
export async function generateProgression(o) {
  const Anthropic = o.Anthropic || (await loadSdk());
  const emit = (event) => o.onStatus?.(event);
  const { settings } = o;
  const client = makeClient(settings, Anthropic, o.clientOptions);

  const messages = [{
    role: "user",
    content: buildUserMessage({
      request: o.request, preferences: settings.preferences, mode: o.mode, currentProject: o.currentProject,
    }),
  }];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };
  const sources = new Map();
  let useSearch = settings.webSearch;
  let searchSkipped = false;
  let rejections = 0;
  let jsonRetries = 0;
  let nudged = false;
  let lastDelivery = null; // a última entrega, mesmo recusada, para o caso de esgotar as correções
  let turns = 0;

  const finish = (delivery, check, partial) => ({
    project: delivery.projeto,
    title: String(delivery.projeto?.title || "Progressão"),
    explanation: check.explanation,
    sources: [...sources.values()],
    usage,
    costUsd: estimateCostUsd(settings.model, usage),
    warnings: partial ? check.problems : [],
    partial,
    searchSkipped,
    turns,
    model: settings.model,
  });

  while (turns < MAX_TURNS) {
    if (o.signal?.aborted) throw new GenerationError("Pedido cancelado.", { kind: "aborted" });
    turns += 1;

    const params = {
      model: settings.model,
      max_tokens: MAX_TOKENS,
      cache_control: { type: "ephemeral" }, // guarda em cache o que se repete entre as rodadas
      output_config: { effort: settings.effort },
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      tools: [...(useSearch ? [searchTool(settings.maxSearches)] : []), DELIVERY_TOOL],
      messages,
    };

    let message;
    try {
      message = await streamTurn({ client, params, signal: o.signal, emit });
      jsonRetries = 0;
    } catch (err) {
      if (o.signal?.aborted || err instanceof Anthropic.APIUserAbortError) {
        throw new GenerationError("Pedido cancelado.", { kind: "aborted" });
      }
      // A API pode recusar a pesquisa (desligada pelo administrador da conta): tenta de novo sem ela.
      if (useSearch && turns === 1 && err instanceof Anthropic.BadRequestError) {
        useSearch = false;
        searchSkipped = true;
        turns -= 1;
        emit({ kind: "search-skipped" });
        continue;
      }
      // JSON de ferramenta impossível de ler (não é erro da API): refaz a rodada, no máximo duas vezes seguidas.
      if (err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError) && jsonRetries < 2) {
        jsonRetries += 1;
        continue;
      }
      throw explainError(err, Anthropic);
    }

    addUsage(usage, message.usage);
    collectSources(message.content, sources);

    if (message.stop_reason === "refusal") {
      throw new GenerationError(
        `O modelo se recusou a responder a este pedido.${message.stop_details?.explanation ? ` ${message.stop_details.explanation}` : ""}`,
      );
    }
    if (message.stop_reason === "max_tokens") {
      throw new GenerationError("A resposta passou do limite de tamanho. Tente um pedido mais curto ou com menos acordes.");
    }
    if (message.stop_reason === "pause_turn") {
      // A pesquisa demorou: devolve a mensagem como veio e a API continua de onde parou.
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const calls = message.content.filter((b) => b.type === "tool_use");
    const deliveries = calls.filter((b) => b.name === TOOL_NAME);
    if (!deliveries.length) {
      if (nudged) throw new GenerationError("A IA respondeu sem entregar uma progressão. Tente reescrever o pedido.");
      nudged = true; // uma única cutucada: pede para chamar a ferramenta
      messages.push({ role: "assistant", content: message.content });
      messages.push({ role: "user", content: `Entregue o resultado chamando a ferramenta ${TOOL_NAME}.` });
      continue;
    }

    emit({ kind: "checking" });
    messages.push({ role: "assistant", content: message.content });
    const results = [];
    for (const call of calls) {
      if (call.name !== TOOL_NAME) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Ferramenta desconhecida: ${call.name}.` });
        continue;
      }
      const check = checkDelivery(call.input);
      if (check.ok) return finish(call.input, check, false);
      lastDelivery = { delivery: call.input, check };
      results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: problemsText(check.problems) });
    }

    rejections += 1;
    if (rejections > MAX_REJECTIONS) break;
    emit({ kind: "retry", problems: lastDelivery.check.problems.length, attempt: rejections });
    messages.push({ role: "user", content: results });
  }

  // Esgotou as correções (ou as rodadas): entrega o melhor que houver, com os problemas à vista.
  if (lastDelivery && isObject(lastDelivery.delivery?.projeto)) {
    return finish(lastDelivery.delivery, lastDelivery.check, true);
  }
  throw new GenerationError("Não consegui montar uma progressão válida. Tente reescrever o pedido.");
}

// ---------------------------------------------------------------- teste da chave

/** Faz uma chamada mínima para saber se a chave e o modelo funcionam. Devolve { ok: true, model } ou lança GenerationError. */
export async function testKey(settings, { Anthropic: Injected, clientOptions } = {}) {
  const Anthropic = Injected || (await loadSdk());
  const client = makeClient(settings, Anthropic, clientOptions);
  try {
    await client.messages.create({
      model: settings.model,
      max_tokens: 200,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Responda apenas: ok" }],
    });
    return { ok: true, model: settings.model };
  } catch (err) {
    throw explainError(err, Anthropic);
  }
}
