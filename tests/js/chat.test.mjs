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

test("a melodia cantada entra no pedido, com compasso, tempo e duração de cada nota", () => {
  const voice = { text: "r/4 A4/4 C5/8 D5/8 E5/2 A4/4", tempo: 80, timeSignature: "4/4" };
  const text = buildChatPrompt({ request: "x", mode: "new", voice });
  assert.match(text, /MELODIA CANTADA/);
  assert.match(text, /compasso 1, tempo 2: A4 \(dura 1 tempos\)/);
  assert.match(text, /compasso 1, tempo 3: C5 \(dura 0\.5 tempos\)/);
  assert.match(text, /compasso 1, tempo 4: E5 \(dura 2 tempos\)/);
  assert.match(text, /dura 6 tempos \(2 compassos\)/);
  assert.match(text, /80 BPM, compasso 4\/4/);
  assert.doesNotMatch(buildChatPrompt({ request: "x", mode: "new" }), /MELODIA CANTADA/);
  assert.match(buildChatPrompt({ request: "x", mode: "adjust", currentProject: { chords: [] }, voice }), /MELODIA CANTADA[\s\S]*PROGRESSÃO ATUAL/);
});

test("continuação: o pedido leva só a harmonia e pede só os acordes novos; a resposta é reconhecida no JSON e no link", async () => {
  const { harmonyOnly } = await import("../../harmonalab/web/ai/prompt.js");
  const { compactToProject } = await import("../../harmonalab/web/ai/link.js");
  const project = {
    title: "S", tempo: 90, time_signature: "4/4", drums: "K/4 S/4", voice: "A4/1 C5/1", voice2: "C4/1", pad: true, groove: { bass: "x" },
    chords: [
      { symbol: "Am7", section: "A", duration_beats: 4, left_hand: ["A2"], right_hand: ["C4", "E4"], top_note: "E4", velocity: null, phrase: "C5/4", comp: "T/4", bass_line: "A1/1", phrase_scale: "A B C D E F G", comment: "Tônica." },
      { symbol: "", section: "B", duration_beats: 8, left_hand: [], right_hand: [] },
    ],
  };
  const slim = harmonyOnly(project);
  assert.deepEqual(Object.keys(slim), ["title", "tempo", "time_signature", "chords"]);
  assert.deepEqual(Object.keys(slim.chords[0]), ["symbol", "duration_beats", "left_hand", "right_hand", "top_note", "comment", "phrase_scale", "section"]);
  assert.deepEqual(slim.chords[1], { duration_beats: 8, section: "B" });
  const continuation = { section: "B", previous: "A", fromBar: 2, toBar: 3, beats: 8 };
  const text = buildChatPrompt({ request: "", mode: "continue", currentProject: project, voice: { text: project.voice, tempo: 90, timeSignature: "4/4" }, continuation, appUrl: "https://x.test/" });
  const tail = text.slice(text.lastIndexOf("PEDIDO (pode"));
  assert.match(tail, /Harmonize a parte nova da música/);
  assert.match(tail, /somar EXATAMENTE 8 tempos/);
  assert.match(tail, /devolva SÓ os acordes novos/);
  assert.match(tail, /https:\/\/x\.test\/\?cont=B&ret=K/);
  assert.match(tail, /compasso 2, tempo 1: C5 \(dura 4 tempos\) {2}<- parte B/);
  assert.doesNotMatch(tail.slice(tail.indexOf("HARMONIA ATUAL")), /bass_line|"phrase"|"voice|"drums"|"comp"/);
  assert.doesNotMatch(buildChatPrompt({ request: "x", mode: "adjust", currentProject: project }), /bass_line|"drums"/);
  // a resposta
  const answer = '```json\n{"explicacao": "ok", "continuacao": {"parte": "B", "retocados": 1}, "projeto": {"chords": [{"symbol": "E7", "duration_beats": 4, "right_hand": ["G#3", "D4", "E4"], "top_note": "E4", "comment": "Dominante.", "phrase_scale": "E F# G# A B C# D"}]}}\n```';
  assert.deepEqual(readChatAnswer(answer).project.continuation, { section: "B", retouched: 1 });
  const fromLink = compactToProject({ cont: "B", ret: "2", p: "E7:Gs3,D4,E4:4:V7::Dominante.::E_Fs_Gs_A_B_Cs_D" });
  assert.deepEqual(fromLink.continuation, { section: "B", retouched: 2 });
  assert.equal(fromLink.chords.length, 1);
});

test("pedido por parte: ajustar mantém o tamanho; parte criada por texto tem tamanho livre", () => {
  const project = { title: "T", tempo: 90, time_signature: "4/4", chords: [
    { symbol: "Am7", duration_beats: 4, left_hand: ["A2"], right_hand: ["C4", "E4"], section: "A", comp: "x", bass_line: "A2/1" },
    { symbol: "", duration_beats: 16, section: "B" },
  ] };
  const base = { fromBar: 1, toBar: 1, beats: 4, hasNext: true };
  const adjust = buildChatPrompt({ request: "mais tenso", mode: "continue", currentProject: project, continuation: { ...base, kind: "adjust", section: "A", previous: null, fixed: true }, appUrl: "https://x.test/" });
  assert.match(adjust, /AJUSTE DA PARTE "A"/);
  assert.match(adjust, /EXATAMENTE 4 tempos/);
  assert.match(adjust, /\?cont=A&ret=K/);
  assert.match(adjust, /mais tenso/);
  assert.doesNotMatch(adjust, /bass_line|Crie uma progressão nova/);
  const create = buildChatPrompt({ request: "refrão aberto", mode: "continue", currentProject: project, continuation: { kind: "create", section: "B", previous: "A", fromBar: 2, toBar: 5, beats: 16, fixed: false, hasNext: false }, appUrl: "https://x.test/" });
  assert.match(create, /PARTE NOVA: a parte "B"/);
  assert.match(create, /O tamanho é você quem decide/);
  assert.doesNotMatch(create, /EXATAMENTE 16 tempos/);
  assert.match(create, /reescrever o último ou os 2 últimos acordes da parte "A"/);
  const empty = buildChatPrompt({ request: "", mode: "continue", currentProject: project, continuation: { kind: "create", section: "B", previous: "A", fromBar: 2, toBar: 5, beats: 16, fixed: false, hasNext: false }, appUrl: "https://x.test/" });
  assert.match(empty, /Crie a parte nova da música\./);
});

test("pedido por parte: mapa da música, ponto de ligação, tom e a frase de autoridade", () => {
  const project = { title: "T", tempo: 90, time_signature: "4/4", chords: [
    { symbol: "Am7", duration_beats: 4, left_hand: ["A2"], right_hand: ["C4", "E4"], section: "A" },
    { symbol: "E7", duration_beats: 4, left_hand: ["E2"], right_hand: ["D4", "G#4"] },
    { symbol: "", duration_beats: 16, section: "B" },
    { symbol: "Fmaj7", duration_beats: 4, left_hand: ["F2"], right_hand: ["A3", "E4"], section: "C" },
  ] };
  const continuation = {
    kind: "create", section: "B", previous: "A", fromBar: 3, toBar: 6, beats: 16, fixed: false, hasNext: true,
    songKey: "Lá menor", key: "Si menor", shift: 2, auto: false,
    map: [
      { name: "A", bars: 2, key: "Lá menor", empty: false, melody: true, request: "balada   triste\nem lá menor" },
      { name: "B", bars: 4, key: "Si menor", empty: true, melody: false, request: "" },
      { name: "C", bars: 1, key: "Lá menor", empty: false, melody: false, request: "" },
    ],
    link: { before: ["Am7", "E7"], beforeName: "A", after: "Fmaj7", afterName: "C" },
  };
  const text = buildChatPrompt({ request: "refrão", mode: "continue", currentProject: project, continuation, appUrl: "https://x.test/" });
  assert.match(text, /MAPA DA MÚSICA \(as partes na ordem atual; tom da música: Lá menor\):/);
  assert.match(text, /- Parte "A": 2 compassos, Lá menor, harmonia pronta\. Pedido que a criou: "balada triste em lá menor"\./);
  assert.match(text, /- Parte "B": Si menor, É A PARTE DESTE PEDIDO \(criar; o tamanho é você quem decide\)\./);
  assert.match(text, /PONTO DE LIGAÇÃO: a parte "A" termina em Am7 \| E7, e a parte "B" começa logo depois; depois da parte "B" vem a parte "C", que começa em Fmaj7\./);
  assert.match(text, /TOM DA PARTE "B": Si menor \(2 semitons acima do tom da música, Lá menor\)\. Use predominantemente a escala desse tom/);
  assert.match(text, /Prepare a modulação nos últimos acordes da parte "A"/);
  assert.match(text, /vale mais do que qualquer coisa dita antes nesta conversa/);
  assert.ok(text.indexOf("MAPA DA MÚSICA") < text.indexOf("HARMONIA ATUAL"), "o mapa vem antes do JSON");
  const auto = buildChatPrompt({ request: "", mode: "continue", currentProject: project, continuation: { ...continuation, key: null, shift: 0, auto: true }, appUrl: "https://x.test/" });
  assert.match(auto, /TOM DA PARTE "B": você decide/);
  const same = buildChatPrompt({ request: "x", mode: "continue", currentProject: project, continuation: { ...continuation, kind: "adjust", fixed: true, key: "Lá menor", shift: 0 }, appUrl: "https://x.test/" });
  assert.match(same, /TOM DA PARTE "B": Lá menor \(o tom da música\)/);
  assert.doesNotMatch(same, /Prepare a modulação/);
});

test("link que passou por um redirecionador (Gemini): o endereço codificado é lido", async () => {
  const { findLinkInText } = await import("../../harmonalab/web/ai/link.js");
  const inner = "https://harmona-lab.pages.dev/#t=Teste&k=Am&bpm=60&p=Am7:A2,G3/C4,E4:4:i7:Eólio:Tônica.::A_B_C_D_E_F_G";
  const wrapped = `https://www.google.com/url?sa=E&q=${encodeURIComponent(inner)}&source=gmail`;
  assert.equal(findLinkInText(`Abra: ${wrapped}`), inner.slice(inner.indexOf("#")));
  assert.equal(findLinkInText("https://www.google.com/url?q=https%3A%2F%2Fharmona-lab.pages.dev%2F"), null); // o link cortado: sem a progressão
  assert.equal(findLinkInText(`[▶ Abrir](${inner})`), inner.slice(inner.indexOf("#")));
});
