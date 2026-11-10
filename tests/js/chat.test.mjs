// Modo grátis (pedido para colar no chat e leitura da resposta). Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";

import { CHATS, buildChatPrompt, correctionPrompt, extractJson, readChatAnswer } from "../../harmonalab/web/ai/chat.js";
import { CHAT_INSTRUCTIONS } from "../../harmonalab/web/ai/prompt.js";
import { GOOD_PROJECT, delivery } from "./fixtures.mjs";

const fenced = (obj, before = "Aqui está:", after = "Bom estudo!") => `${before}\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n${after}`;

test("instruções para a IA: pedem um bloco JSON e não falam de ferramentas da API", () => {
  assert.ok(!CHAT_INSTRUCTIONS.includes("entregar_progressao"));
  assert.ok(!CHAT_INSTRUCTIONS.includes("web_search"));
  assert.match(CHAT_INSTRUCTIONS, /bloco de código JSON/);
  assert.match(CHAT_INSTRUCTIONS, /"explicacao"/);
  for (const chat of CHATS) assert.match(chat.url, /^https:\/\//);
});

test("pedido para colar: instruções + pedido + preferências + progressão atual", () => {
  const text = buildChatPrompt({ request: "8 acordes, 76 BPM", mode: "adjust", currentProject: { tempo: 70, chords: [] } });
  assert.ok(text.startsWith(CHAT_INSTRUCTIONS));
  assert.match(text, /PEDIDO[^]*8 acordes, 76 BPM/);
  assert.match(text, /PROGRESSÃO ATUAL[^]*"tempo":70/);
  assert.match(buildChatPrompt({ request: "x", mode: "new" }), /Crie uma progressão nova/);
});

test("lê a resposta com texto em volta, só o JSON, ou só o projeto", () => {
  const full = readChatAnswer(fenced(delivery()));
  assert.equal(full.ok, true);
  assert.equal(full.project.title, GOOD_PROJECT.title);
  assert.match(full.explanation, /B7alt/);
  assert.equal(readChatAnswer(JSON.stringify(delivery())).ok, true);
  const bare = readChatAnswer(fenced(GOOD_PROJECT));
  assert.equal(bare.ok, true); // sem explicação também vale
  assert.equal(bare.project.chords.length, 3);
  // dois blocos: vale o maior que for JSON válido
  assert.equal(readChatAnswer(`\`\`\`json\n{"a": 1}\n\`\`\`\n${fenced(delivery())}`).project.title, GOOD_PROJECT.title);
});

test("problemas da conferência e texto de correção", () => {
  const bad = delivery({ projeto: { ...GOOD_PROJECT, chords: [{ ...GOOD_PROJECT.chords[0], right_hand: ["E3", "H4"] }] }, pedido_extraido: { acordes: 3 } });
  const read = readChatAnswer(fenced(bad));
  assert.equal(read.ok, false);
  assert.ok(read.project); // dá para carregar mesmo assim
  const text = correctionPrompt(read.problems);
  assert.match(text, /1\. Acorde 1 \(Fmaj7\(#11\)\), campo right_hand: Não entendi "H4"/);
  assert.match(text, /pedia 3 acordes, mas o projeto tem 1/);
  assert.match(text, /bloco ```json completo/);
});

test("respostas sem JSON legível dão mensagens claras", () => {
  assert.throws(() => extractJson("Desculpe, não entendi."), /Não encontrei o JSON/);
  assert.throws(() => extractJson("```json\n{\"projeto\": {\"tempo\": 80, \n```"), /incompleto ou com erro/);
  assert.equal(readChatAnswer('{"a": 1}').ok, false);
});

test("a IA só faz harmonia: o pedido não fala de escrever frases e o interruptor de pesquisa muda uma linha", () => {
  const fast = buildChatPrompt({ request: "x", mode: "new" });
  assert.match(fast, /Não pesquise na internet: a pessoa quer a resposta rápida/);
  assert.match(fast, /Você entrega só a HARMONIA/);
  assert.match(fast, /phrase_scale \(obrigatório em TODOS os acordes/);
  assert.match(fast, /phrase_color \(só quando o pedido falar do caráter das frases/);
  assert.ok(!fast.includes("FRASES MELÓDICAS") && !fast.includes("LEVADA"));
  const researched = buildChatPrompt({ request: "x", mode: "new", research: true });
  assert.match(researched, /Pesquise na internet o vocabulário harmônico/);
  assert.ok(!researched.includes("Não pesquise na internet"));
  assert.ok(Math.abs(researched.length - fast.length) < 200); // é só uma linha de diferença
});
