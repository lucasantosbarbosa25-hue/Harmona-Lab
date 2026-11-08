// Testes do assistente de IA com a API simulada (veja fake_api.mjs). Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";

import Anthropic from "../../harmonalab/web/vendor/anthropic-sdk.js";
import { analyzeData } from "../../harmonalab/web/engine/analysis.js";
import { GenerationError, checkDelivery, generateProgression, testKey } from "../../harmonalab/web/ai/generate.js";
import {
  DELIVERY_TOOL, EXAMPLE_PROJECT, SYSTEM_PROMPT, TOOL_NAME, buildUserMessage, searchTool,
} from "../../harmonalab/web/ai/prompt.js";
import { checkApiBase, estimateCostUsd, normalizeSettings } from "../../harmonalab/web/ai/settings.js";
import {
  GOOD_PROJECT, block, delivery, errorResponse, fakeFetch, jsonMessage, sseResponse,
} from "./fake_api.mjs";

const settings = (extra = {}) => normalizeSettings({ apiKey: "sk-ant-chave-de-teste", ...extra });
const deliver = (input, extra = {}) => sseResponse({ blocks: [block.tool("toolu_1", TOOL_NAME, input)], stop_reason: "tool_use", ...extra });

async function run(steps, { options = {}, ...rest } = {}) {
  const fetch = fakeFetch(steps);
  const events = [];
  const result = await generateProgression({
    request: "3 acordes, 76 BPM, soprano em F#", mode: "new", settings: settings(options), Anthropic,
    clientOptions: { fetch, maxRetries: 0 }, onStatus: (e) => events.push(e), ...rest,
  });
  return { result, fetch, events };
}

const rejects = async (promise, pattern, kind) => {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof GenerationError, `esperava GenerationError, veio ${err}`);
    assert.match(err.message, pattern);
    if (kind) assert.equal(err.kind, kind);
    return true;
  });
};

// ---------------------------------------------------------------- caminho feliz

test("entrega direta: pedido enviado como esperado e resultado conferido", async () => {
  const { result, fetch, events } = await run([deliver(delivery(), { usage: { input: 1000, output: 400 } })]);
  assert.equal(result.title, GOOD_PROJECT.title);
  assert.equal(result.partial, false);
  assert.deepEqual(result.warnings, []);
  assert.match(result.explanation, /B7alt/);
  assert.equal(result.turns, 1);
  assert.deepEqual(result.usage, { input: 1000, output: 400, cacheRead: 0, cacheWrite: 0, searches: 0 });
  assert.ok(Math.abs(result.costUsd - 0.012) < 1e-9); // Opus: 1000 × 4 + 400 × 20 por milhão

  assert.equal(fetch.calls.length, 1);
  const { url, headers, body } = fetch.calls[0];
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(headers.authorization, "Bearer sk-ant-chave-de-teste"); // o SDK 1.x envia a chave assim
  assert.equal(headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.stream, true);
  assert.deepEqual(body.output_config, { effort: "medium" });
  assert.deepEqual(body.cache_control, { type: "ephemeral" });
  assert.equal(body.system[0].text, SYSTEM_PROMPT);
  assert.deepEqual(body.tools.map((t) => t.name), ["web_search", TOOL_NAME]);
  assert.deepEqual(body.tools[0], { type: "web_search_20250305", name: "web_search", max_uses: 3 });
  assert.equal(body.tools[1].eager_input_streaming, true);
  assert.equal(body.tool_choice, undefined); // forçar ferramenta não é aceito nos modelos novos
  assert.equal(body.thinking, undefined); // o raciocínio é adaptativo por padrão
  assert.equal(body.messages.length, 1);
  assert.match(body.messages[0].content, /3 acordes, 76 BPM, soprano em F#/);
  assert.match(body.messages[0].content, /Crie uma progressão nova/);
  assert.ok(events.some((e) => e.kind === "writing") && events.some((e) => e.kind === "checking"));
});

test("modelo, esforço e pesquisa vêm das configurações", async () => {
  const { fetch } = await run([deliver(delivery())], { options: { model: "claude-haiku-5-5", effort: "low", webSearch: false } });
  const { body } = fetch.calls[0];
  assert.equal(body.model, "claude-haiku-5-5");
  assert.deepEqual(body.output_config, { effort: "low" });
  assert.deepEqual(body.tools.map((t) => t.name), [TOOL_NAME]);
});

test("preferências e ajuste da progressão atual entram na mensagem", async () => {
  const current = { tempo: 90, chords: [{ symbol: "Am7", right_hand: ["C4", "E4", "G4"] }] };
  const { fetch } = await run([deliver(delivery())], {
    mode: "adjust", currentProject: current, options: { preferences: "Gosto de maj7(#11) e pedais." },
  });
  const text = fetch.calls[0].body.messages[0].content;
  assert.match(text, /PREFERÊNCIAS PERMANENTES/);
  assert.match(text, /maj7\(#11\) e pedais/);
  assert.match(text, /PROGRESSÃO ATUAL/);
  assert.ok(text.includes(JSON.stringify(current)));
  assert.doesNotMatch(text, /Crie uma progressão nova/);
});

// ---------------------------------------------------------------- pesquisa na internet

test("pesquisa + pause_turn: a mensagem volta intacta e as fontes são coletadas", async () => {
  const results = [
    { url: "https://exemplo.com/analise-dirty-loops", title: "Análise harmônica" },
    { url: "https://exemplo.com/voicings", title: "Voicings de maj7#11" },
    { url: "javascript:alert(1)", title: "Link perigoso" },
  ];
  const paused = sseResponse({
    blocks: [block.thinking("", "assinatura-1"), block.text("Vou pesquisar."), block.search("srvtoolu_1", "Dirty Loops harmonia", results)],
    stop_reason: "pause_turn", usage: { input: 3000, output: 200, searches: 1 },
  });
  const { result, fetch, events } = await run([paused, deliver(delivery(), { usage: { input: 9000, output: 900 } })]);

  assert.equal(fetch.calls.length, 2);
  const second = fetch.calls[1].body.messages;
  assert.equal(second.length, 2); // pedido + mensagem pausada: sem "continue" extra
  assert.equal(second[1].role, "assistant");
  const types = second[1].content.map((b) => b.type);
  assert.deepEqual(types, ["thinking", "text", "server_tool_use", "web_search_tool_result"]);
  assert.equal(second[1].content[0].signature, "assinatura-1"); // raciocínio devolvido sem alteração
  assert.equal(second[1].content[2].input.query, "Dirty Loops harmonia");
  assert.equal(second[1].content[3].content[0].encrypted_content, "enc-https://exemplo.com/analise-dirty-loops");

  assert.deepEqual(result.sources.map((s) => s.url), ["https://exemplo.com/analise-dirty-loops", "https://exemplo.com/voicings"]); // sem javascript:
  assert.equal(result.usage.searches, 1);
  assert.equal(result.usage.input, 12000);
  assert.ok(events.some((e) => e.kind === "searching" && e.query === "Dirty Loops harmonia"));
  assert.ok(events.some((e) => e.kind === "thinking"));
});

test("pesquisa recusada pela conta (400): refaz sem pesquisar", async () => {
  const { result, fetch, events } = await run([
    errorResponse(400, "invalid_request_error", "web search is not enabled for this organization"),
    deliver(delivery()),
  ]);
  assert.equal(result.searchSkipped, true);
  assert.deepEqual(fetch.calls[0].body.tools.map((t) => t.name), ["web_search", TOOL_NAME]);
  assert.deepEqual(fetch.calls[1].body.tools.map((t) => t.name), [TOOL_NAME]);
  assert.ok(events.some((e) => e.kind === "search-skipped"));
});

test("400 que não é da pesquisa aparece com o motivo da API", async () => {
  await rejects(
    run([errorResponse(400, "invalid_request_error", "Your credit balance is too low"), errorResponse(400, "invalid_request_error", "Your credit balance is too low")]),
    /A API recusou o pedido: Your credit balance is too low/,
  );
});

// ---------------------------------------------------------------- conferência e correção

test("entrega com problemas volta para a IA, que corrige", async () => {
  const bad = delivery({
    projeto: { ...GOOD_PROJECT, chords: [{ ...GOOD_PROJECT.chords[0], right_hand: ["E3", "H4"], top_note: "F#4" }, ...GOOD_PROJECT.chords.slice(1)] },
  });
  const { result, fetch, events } = await run([deliver(bad), deliver(delivery())]);
  assert.equal(result.partial, false);
  assert.equal(fetch.calls.length, 2);
  const messages = fetch.calls[1].body.messages;
  assert.equal(messages.length, 3);
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].content[0].type, "tool_use");
  assert.equal(messages[2].role, "user");
  const feedback = messages[2].content[0];
  assert.equal(feedback.type, "tool_result");
  assert.equal(feedback.tool_use_id, "toolu_1");
  assert.equal(feedback.is_error, true);
  assert.match(feedback.content, /Acorde 1 \(Fmaj7\(#11\)\), campo right_hand: Não entendi "H4"/);
  assert.ok(events.some((e) => e.kind === "retry" && e.problems >= 1));
});

test("soprano travado que não é a nota mais aguda é recusado", async () => {
  const wrong = delivery({ projeto: { ...GOOD_PROJECT, chords: [{ ...GOOD_PROJECT.chords[0], top_note: "A3" }, ...GOOD_PROJECT.chords.slice(1)] } });
  const { fetch } = await run([deliver(wrong), deliver(delivery())]);
  assert.match(fetch.calls[1].body.messages[2].content[0].content, /soprano travado é A3, mas .* acima/);
});

test("número de acordes e BPM têm de bater com o pedido", async () => {
  const off = delivery({ pedido_extraido: { acordes: 4, bpm: 90 } });
  const { fetch } = await run([deliver(off), deliver(delivery())]);
  const text = fetch.calls[1].body.messages[2].content[0].content;
  assert.match(text, /pedia 4 acordes, mas o projeto tem 3/);
  assert.match(text, /pedia 90 BPM, mas o projeto está com tempo 76/);
});

test("esgotadas as correções, entrega o melhor com os problemas à vista", async () => {
  const bad = delivery({ pedido_extraido: { acordes: 5 } });
  const { result, fetch } = await run([deliver(bad), deliver(bad), deliver(bad), deliver(bad)]);
  assert.equal(fetch.calls.length, 4);
  assert.equal(result.partial, true);
  assert.match(result.warnings[0], /pedia 5 acordes/);
  assert.equal(result.project.chords.length, 3);
});

test("sem chamar a ferramenta: uma cutucada e depois erro", async () => {
  const onlyText = () => sseResponse({ blocks: [block.text("Aqui vai uma ideia...")], stop_reason: "end_turn" });
  const { result, fetch } = await run([onlyText(), deliver(delivery())]);
  assert.equal(result.partial, false);
  const messages = fetch.calls[1].body.messages;
  assert.equal(messages.at(-1).role, "user");
  assert.match(messages.at(-1).content, new RegExp(TOOL_NAME));
  await rejects(run([onlyText(), onlyText()]), /respondeu sem entregar/);
});

test("JSON de ferramenta impossível de ler: refaz a rodada", async () => {
  const garbled = sseResponse({ blocks: [block.tool("toolu_x", TOOL_NAME, '{"explicacao": nonsense ]]')], stop_reason: "tool_use" });
  const { result, fetch } = await run([garbled, deliver(delivery())]);
  assert.equal(fetch.calls.length, 2);
  assert.equal(result.partial, false);
});

// ---------------------------------------------------------------- erros e cancelamento

test("erros da API viram mensagens claras", async () => {
  await rejects(run([errorResponse(401, "authentication_error", "invalid x-api-key")]), /recusou a chave/);
  await rejects(run([errorResponse(403, "permission_error", "nope")]), /não tem permissão/);
  await rejects(run([errorResponse(404, "not_found_error", "model: x")]), /não encontrou o modelo/);
  await rejects(run([errorResponse(429, "rate_limit_error", "slow down")]), /Limite de uso/);
  await rejects(run([errorResponse(529, "overloaded_error", "Overloaded")]), /sobrecarregados/);
  await rejects(run([() => { throw new TypeError("Failed to fetch"); }]), /Não consegui falar com a API/);
  await rejects(run([sseResponse({ blocks: [block.text("...")], stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: "Fora do escopo." } })]), /se recusou.*Fora do escopo/);
  await rejects(run([sseResponse({ blocks: [block.text("...")], stop_reason: "max_tokens" })]), /passou do limite/);
});

test("cancelar interrompe o pedido", async () => {
  const controller = new AbortController();
  const slow = () => sseResponse({ blocks: [block.thinking("x"), block.tool("t", TOOL_NAME, delivery())], stop_reason: "tool_use" }, { delayMs: 15 });
  const pending = run([slow], { signal: controller.signal, onStatus: (e) => { if (e.kind === "thinking") controller.abort(); } });
  await rejects(pending, /cancelado/, "aborted");
  await rejects(run([deliver(delivery())], { signal: AbortSignal.abort() }), /cancelado/, "aborted");
});

test("chave ausente ou endereço inválido param antes de chamar a API", async () => {
  const fetch = fakeFetch([]);
  await rejects(generateProgression({ request: "x", mode: "new", settings: normalizeSettings({}), Anthropic, clientOptions: { fetch } }), /Falta a chave/);
  await rejects(generateProgression({ request: "x", mode: "new", settings: settings({ apiBase: "http://servidor.com" }), Anthropic, clientOptions: { fetch } }), /https/);
  assert.equal(fetch.calls.length, 0);
});

test("endereço de API próprio é usado e o corpo continua igual", async () => {
  const { fetch } = await run([deliver(delivery())], { options: { apiBase: "http://127.0.0.1:9999/" } });
  assert.equal(fetch.calls[0].url, "http://127.0.0.1:9999/v1/messages");
});

test("teste da chave", async () => {
  const ok = fakeFetch([jsonMessage()]);
  assert.deepEqual(await testKey(settings(), { Anthropic, clientOptions: { fetch: ok, maxRetries: 0 } }), { ok: true, model: "claude-opus-5-5" });
  assert.equal(ok.calls[0].body.max_tokens, 200);
  await rejects(testKey(settings(), { Anthropic, clientOptions: { fetch: fakeFetch([errorResponse(401, "authentication_error", "invalid x-api-key")]), maxRetries: 0 } }), /recusou a chave/);
});

// ---------------------------------------------------------------- conferência isolada, prompt e configurações

test("checkDelivery", () => {
  assert.equal(checkDelivery(delivery()).ok, true);
  assert.equal(checkDelivery(delivery({ pedido_extraido: null })).ok, true);
  assert.equal(checkDelivery(delivery({ pedido_extraido: { acordes: null, bpm: null } })).ok, true);
  for (const bad of [undefined, null, "texto", {}, { explicacao: "x" }, { projeto: GOOD_PROJECT }, { explicacao: "x", projeto: [] }]) {
    assert.equal(checkDelivery(bad).ok, false, JSON.stringify(bad));
  }
  const empty = checkDelivery(delivery({ projeto: { tempo: 80, chords: [] } }));
  assert.match(empty.problems.join("\n"), /vazia/);
  const bpm = checkDelivery(delivery({ projeto: { ...GOOD_PROJECT, tempo: 5 } }));
  assert.match(bpm.problems.join("\n"), /Projeto, campo tempo: BPM/);
});

test("o exemplo do prompt é um projeto válido, sem avisos", () => {
  const report = analyzeData(EXAMPLE_PROJECT);
  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
  assert.ok(SYSTEM_PROMPT.includes(JSON.stringify(EXAMPLE_PROJECT)));
  assert.ok(SYSTEM_PROMPT.includes(TOOL_NAME));
  assert.doesNotMatch(SYSTEM_PROMPT, /undefined|\[object/); // nada variável nem quebrado: o texto precisa ser estável para o cache
});

test("ferramentas e mensagem do usuário", () => {
  assert.equal(DELIVERY_TOOL.name, TOOL_NAME);
  assert.deepEqual(DELIVERY_TOOL.input_schema.required, ["explicacao", "projeto"]);
  assert.equal(DELIVERY_TOOL.strict, undefined);
  assert.deepEqual(searchTool(5), { type: "web_search_20250305", name: "web_search", max_uses: 5 });
  assert.equal(buildUserMessage({ request: "  oi  ", mode: "new" }).startsWith('PEDIDO (pode ter sido ditado por voz):\n"""\noi\n"""'), true);
});

test("configurações: valores inválidos voltam ao padrão", () => {
  const s = normalizeSettings({ model: "gpt-9", effort: "turbo", maxSearches: 99, apiKey: "  sk-ant-x  ", webSearch: 0, preferences: 5 });
  assert.equal(s.model, "claude-opus-5-5");
  assert.equal(s.effort, "medium");
  assert.equal(s.maxSearches, 8);
  assert.equal(s.apiKey, "sk-ant-x");
  assert.equal(s.webSearch, true);
  assert.equal(s.preferences, "");
  assert.equal(normalizeSettings({ maxSearches: 0 }).maxSearches, 1);
  assert.equal(normalizeSettings(null).apiKey, "");
  assert.deepEqual(checkApiBase(""), { ok: true, value: "" });
  assert.deepEqual(checkApiBase("https://meu.servidor.com/"), { ok: true, value: "https://meu.servidor.com" });
  assert.equal(checkApiBase("http://localhost:8787").ok, true);
  assert.equal(checkApiBase("http://servidor.com").ok, false);
  assert.equal(checkApiBase("ftp://x").ok, false);
  assert.equal(checkApiBase("não é url").ok, false);
});

test("custo estimado: tokens, cache e pesquisas", () => {
  const usage = { input: 10000, output: 5000, cacheRead: 20000, cacheWrite: 4000, searches: 2 };
  const input = 10000 + 4000 * 1.25 + 20000 * 0.1;
  assert.ok(Math.abs(estimateCostUsd("claude-sonnet-5-5", usage) - ((input * 2 + 5000 * 10) / 1e6 + 0.02)) < 1e-12);
  assert.ok(estimateCostUsd("claude-haiku-5-5", usage) < estimateCostUsd("claude-opus-5-5", usage));
});
