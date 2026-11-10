// O ia.md publicado tem de estar em dia com as instruções do app. Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { iaMarkdown, skillMarkdown } from "../../design/ia.mjs";
import { instructions, PERMANENT_INSTRUCTIONS } from "../../harmonalab/web/ai/prompt.js";

test("ia.md é exatamente o que o gerador produz (rode: node design/ia.mjs)", () => {
  const file = readFileSync(new URL("../../harmonalab/web/ia.md", import.meta.url), "utf8");
  assert.equal(file, iaMarkdown());
});

test("SKILL.md é exatamente o que o gerador produz e tem o cabeçalho de skill", () => {
  const file = readFileSync(new URL("../../skill/harmona-harmonia/SKILL.md", import.meta.url), "utf8");
  assert.equal(file, skillMarkdown());
  const header = file.match(/^---\nname: ([a-z-]+)\ndescription: (.+)\n---\n/);
  assert.ok(header, "cabeçalho com name e description");
  assert.equal(header[1], "harmona-harmonia");
  assert.ok(header[2].length <= 1024);
  assert.ok(file.includes("Você é professora e arranjadora"), "as instruções precisam estar dentro da skill");
  assert.doesNotMatch(file, /\$\{/, "sobrou uma interpolação sem resolver");
});

test("instruções permanentes pesquisam se puderem; as do pedido rápido mandam não pesquisar", () => {
  assert.match(PERMANENT_INSTRUCTIONS(), /Se você puder pesquisar na internet/);
  assert.match(instructions(), /Não pesquise na internet/);
  assert.match(instructions(undefined, { research: true }), /Pesquise na internet o vocabulário harmônico/);
});

test("a instrução exige a frase de função e as notas da escala em todos os acordes, e deixa o ritmo com o app", () => {
  assert.match(instructions(), /comment \(obrigatório em TODOS os acordes/);
  assert.match(instructions(), /phrase_scale \(obrigatório em TODOS os acordes/);
  assert.match(instructions(), /não escreva frases, levadas nem ritmo/);
});
