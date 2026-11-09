// O ia.md publicado tem de estar em dia com as instruções do app. Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { iaMarkdown, levadasMarkdown, skillMarkdown } from "../../design/ia.mjs";
import { instructions, PERMANENT_INSTRUCTIONS } from "../../harmonalab/web/ai/prompt.js";
import { STYLES, STYLE_OPTIONS } from "../../harmonalab/web/ai/styles.js";

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

test("levadas.md da skill é o que o gerador produz e traz todas as levadas", () => {
  const file = readFileSync(new URL("../../skill/harmona-harmonia/references/levadas.md", import.meta.url), "utf8");
  assert.equal(file, levadasMarkdown());
  for (const style of STYLES) assert.ok(file.includes(`## ${style.label}`), style.label);
});

test("instruções permanentes valem para pedidos com frases; as do pedido sem frases ficam enxutas", () => {
  const permanent = PERMANENT_INSTRUCTIONS();
  assert.match(permanent, /só quando o pedido pedir frases/);
  assert.match(permanent, /Se o pedido trouxer “Levada das frases: X”/);
  assert.ok(!instructions().includes("FRASES MELÓDICAS"));
  assert.ok(permanent.length > instructions().length);
});

test("o catálogo de levadas é dado: cada entrada tem id único, nome e descrição, e o menu começa sem frases", () => {
  assert.equal(new Set(STYLES.map((s) => s.id)).size, STYLES.length);
  for (const s of STYLES) assert.ok(s.label && s.rhythm.length > 40, s.id);
  assert.deepEqual(STYLE_OPTIONS.slice(0, 2).map((o) => o.id), ["none", "auto"]);
  for (const name of ["Salsa", "Samba", "Bossa nova", "Neo-soul", "Jazz fusion", "Gospel americano", "Funk (16 avos)", "Jazz swing", "Rock", "Ska"]) {
    assert.ok(STYLE_OPTIONS.some((o) => o.label === name), name);
  }
});

test("todo comentário do exemplo vira frase de função e a instrução exige comment em todos os acordes", () => {
  assert.match(instructions(), /comment \(obrigatório em TODOS os acordes/);
});
