// Links que abrem uma progressão (ou só o pedido) no app. Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeData } from "../../harmonalab/web/engine/analysis.js";
import { buildShareHash, canCompress, compactToProject, findLinkInText, parseLinkHash } from "../../harmonalab/web/ai/link.js";
import { DEFAULT_APP_URL, EXAMPLE_LINK_PATH, EXAMPLE_PROJECT, instructions } from "../../harmonalab/web/ai/prompt.js";
import { GOOD_PROJECT } from "./fixtures.mjs";

const pitches = (report) => report.chords.map((c) => c.notes.map((n) => n.midi));

test("o link de exemplo das instruções abre exatamente o projeto de exemplo", async () => {
  const link = await parseLinkHash(EXAMPLE_LINK_PATH);
  assert.equal(link.kind, "project");
  const { project } = link;
  assert.deepEqual([project.title, project.key, project.tempo, project.time_signature], ["B7alt em Em9", "Em", 80, "4/4"]);
  const mine = analyzeData(project);
  const reference = analyzeData(EXAMPLE_PROJECT);
  assert.equal(mine.ok, true);
  assert.deepEqual(mine.issues, []);
  assert.deepEqual(pitches(mine), pitches(reference)); // as mesmas teclas
  assert.deepEqual(mine.chords.map((c) => c.symbol), ["F#m7(b5)", "B7alt", "Em9"]);
  assert.deepEqual(project.chords.map((c) => [c.function, c.scale]), [["iiø7", "Lócrio"], ["V7alt", "C menor melódica a partir de B"], ["i9", "Eólio"]]);
  assert.deepEqual(project.chords.map((c) => c.top_note), ["E4", "C5", "F#4"]); // a ponta é a nota mais aguda
  assert.deepEqual(project.chords.map((c) => c.comment), EXAMPLE_PROJECT.chords.map((c) => c.comment)); // a frase de função de cada acorde
  assert.deepEqual(project.chords.map((c) => c.phrase_scale), EXAMPLE_PROJECT.chords.map((c) => c.phrase_scale)); // e as notas da escala
  assert.equal(compactToProject({ p: "B7alt:B2/D4,Eb4:4:V7::tensão::B_C_D_Eb_F_G_A:Outside" }).chords[0].phrase_color, "outside");
});

test("o link leva a frase de função, a frase melódica, a escala e a levada", async () => {
  const link = await parseLinkHash("#t=X&st=Neo-soul&p=B7alt:B2,A3/D4,Eb4,G4,C5:4:V7alt:C_menor:Dominante_alterado,_resolve_no_Em9.:G5/8_F5/8_Eb5/4*alvo_Fs5/8*aprox_r/8_Gs5/4:B_C_D_Eb_F_G_A");
  const [chord] = link.project.chords;
  assert.equal(link.project.style, "Neo-soul");
  assert.equal(chord.comment, "Dominante alterado, resolve no Em9.");
  assert.equal(chord.phrase, "G5/8 F5/8 Eb5/4*alvo F#5/8*aprox r/8 G#5/4"); // s vira #, _ vira espaço
  assert.equal(chord.phrase_scale, "B C D Eb F G A");
  assert.equal(compactToProject({ p: "X:C4:4:::só_o_comentário" }).chords[0].comment, "só o comentário");
});

test("tolera o que as IAs costumam fazer: símbolos sem codificar, acentos e 3 partes", () => {
  const raw = compactToProject({ p: "F#m7(b5):Fs2,C3/E3,A3,C4,E4:4;Cmaj7/E:E2/G3,B3,E4:2,5;Bb7alt:Bb1/Bb2,F3/D4,Ab4:1.5" });
  assert.equal(raw.chords[0].symbol, "F#m7(b5)");
  assert.equal(raw.chords[0].left_hand[0], "F#2");
  assert.deepEqual(raw.chords[1].left_hand, ["E2"]); // "E2/G3,B3,E4": esquerda/direita
  assert.equal(raw.chords[1].duration_beats, 2.5); // vírgula decimal
  assert.deepEqual([raw.chords[2].bass, raw.chords[2].left_hand, raw.chords[2].right_hand], [["Bb1"], ["Bb2", "F3"], ["D4", "Ab4"]]);
  assert.deepEqual(normalizedHands("A1/A2/E3,G3"), { bass: ["A1"], left_hand: ["A2"], right_hand: ["E3", "G3"] });
  assert.deepEqual(normalizedHands("E3,G3"), { right_hand: ["E3", "G3"] });
  assert.deepEqual(normalizedHands("Fs2,Css3/Gbb4"), { left_hand: ["F#2", "C##3"], right_hand: ["Gbb4"] });
  assert.deepEqual(normalizedHands("F%234,B%E2%99%AD3"), { right_hand: ["F#4", "B♭3"] }); // % e símbolos
});

function normalizedHands(notes) {
  const chord = compactToProject({ p: `X:${notes}` }).chords[0];
  const { symbol, top_note, ...hands } = chord;
  return hands;
}

test("nota inválida passa adiante para o motor apontar, e a ponta não é inventada", () => {
  const chord = compactToProject({ p: "X:C3/E3,H4:4" }).chords[0];
  assert.deepEqual(chord.right_hand, ["E3", "H4"]);
  assert.equal("top_note" in chord, false);
  assert.equal(analyzeData(compactToProject({ p: "X:C3/E3,H4:4" })).ok, false);
});

test("pedido pelo link só preenche o pedido", async () => {
  assert.deepEqual(await parseLinkHash("#pedido=8_acordes,_76_BPM,_estilo_Djavan"), { kind: "request", request: "8 acordes, 76 BPM, estilo Djavan" });
  assert.equal((await parseLinkHash("#pedido=6%20acordes%20%C3%A0%20Stevie%20Wonder")).request, "6 acordes à Stevie Wonder");
});

test("#json= com o projeto ou com a resposta {projeto, explicacao}", async () => {
  const bare = await parseLinkHash(`#json=${encodeURIComponent(JSON.stringify(GOOD_PROJECT))}`);
  assert.equal(bare.kind, "project");
  assert.equal(bare.project.chords.length, 3);
  const wrapped = await parseLinkHash(`#json=${encodeURIComponent(JSON.stringify({ projeto: GOOD_PROJECT, explicacao: "porque sim" }))}`);
  assert.equal(wrapped.explanation, "porque sim");
});

test("#z= (comprimido) faz ida e volta e fica curto", { skip: !canCompress() }, async () => {
  const project = { ...GOOD_PROJECT, key: "Em", references: ["Dirty Loops"], chords: GOOD_PROJECT.chords.map((c) => ({ ...c, velocity: null, comment: "" })) };
  const hash = await buildShareHash(project);
  assert.match(hash, /^#z=[A-Za-z0-9_-]+$/);
  assert.ok(hash.length < 700, `link com ${hash.length} caracteres`);
  const back = await parseLinkHash(hash);
  assert.equal(back.kind, "project");
  assert.deepEqual(back.project, JSON.parse(JSON.stringify(project, (_, v) => (v === null || v === "" ? undefined : v))));
  assert.equal(analyzeData(back.project).ok, true);
});

test("links quebrados dão mensagem clara em vez de erro", async () => {
  assert.deepEqual(await parseLinkHash(""), { kind: "none" });
  assert.deepEqual(await parseLinkHash("#secao-da-pagina"), { kind: "none" });
  assert.deepEqual(await parseLinkHash("#p="), { kind: "none" });
  const hash = await buildShareHash(GOOD_PROJECT);
  for (const broken of [hash.slice(0, hash.length >> 1), "#z=@@@", "#json={cortado", "#json=%7B%22a%22%3A1%7D"]) {
    const result = await parseLinkHash(broken);
    assert.equal(result.kind, "error", broken);
    assert.ok(result.message.length > 10);
  }
  assert.equal((await parseLinkHash(`#p=${"A".repeat(50000)}`)).kind, "error");
});

test("acha o link dentro de uma resposta colada", () => {
  const link = "https://harmona-lab.pages.dev/#t=Teste&bpm=80&p=Em9:E2,B2/G3,Fs4:4";
  assert.equal(findLinkInText(`Aqui está: [▶ Abrir no Harmona Lab](${link})`), link.slice(link.indexOf("#")));
  assert.equal(findLinkInText(`\`\`\`\n${link}\n\`\`\``), link.slice(link.indexOf("#")));
  assert.equal(findLinkInText(`Abra ${link}.`), link.slice(link.indexOf("#")));
  assert.equal(findLinkInText("https://harmona-lab.pages.dev/#secao"), null);
  assert.equal(findLinkInText("sem link nenhum"), null);
  assert.ok(findLinkInText(`ok https://x.app/#z=abc_DEF-123`).startsWith("#z="));
  assert.ok(findLinkInText(`ok https://x.app/#pedido=oito_acordes`).startsWith("#pedido="));
});

test("as instruções usam o endereço de quem está usando o app", () => {
  assert.ok(instructions("https://meu.site/").includes("https://meu.site/?t=B7alt_em_Em9"));
  assert.ok(instructions().includes(DEFAULT_APP_URL));
});

test("o link com a progressão depois do ? é achado num texto colado, como o do #", () => {
  const body = "t=Teste&bpm=80&p=Em9:E2,B2/G3,Fs4:4";
  assert.equal(findLinkInText(`[▶ Abrir](https://harmona-lab.pages.dev/?${body})`), `#${body}`);
  assert.equal(findLinkInText(`veja https://harmona-lab.pages.dev/?cont=B&ret=1&p=Em9:E2,B2/G3,Fs4:4.`), "#cont=B&ret=1&p=Em9:E2,B2/G3,Fs4:4");
  assert.equal(findLinkInText(`https://harmona-lab.pages.dev/#${body}`), `#${body}`);
  assert.equal(findLinkInText("https://exemplo.com/?q=nada"), null);
});
