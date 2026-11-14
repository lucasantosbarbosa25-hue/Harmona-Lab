import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BACKDROPS, SILHOUETTES, THEMES, carouselOffset, readLook } from "../../harmonalab/web/aparencia.js";

test("aparência: o padrão é o tema azul com as silhuetas; valores estranhos voltam ao padrão", () => {
  assert.deepEqual(readLook(null), { theme: "azul", backdrop: "silhuetas" });
  assert.deepEqual(readLook("{não é json"), { theme: "azul", backdrop: "silhuetas" });
  assert.deepEqual(readLook('{"theme":"noite","backdrop":"nada"}'), { theme: "noite", backdrop: "nada" });
  assert.deepEqual(readLook({ theme: "rosa", backdrop: "fotos" }), { theme: "azul", backdrop: "fotos" });
  assert.equal(THEMES[0].id, "azul");
  assert.deepEqual(BACKDROPS.map((b) => b.id), ["silhuetas", "fotos", "nada"]);
});

test("aparência: cada tema tem as suas cores no CSS e cada silhueta tem o seu arquivo, guardado para uso sem internet", () => {
  const css = readFileSync(new URL("../../harmonalab/web/styles.css", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../../harmonalab/web/sw.js", import.meta.url), "utf8");
  for (const theme of THEMES) assert.ok(css.includes(`[data-theme="${theme.id}"]`), `o CSS tem o tema ${theme.id}`);
  for (const name of SILHOUETTES) {
    assert.ok(existsSync(new URL(`../../harmonalab/web/fundo/${name}.svg`, import.meta.url)), `fundo/${name}.svg existe`);
    assert.ok(sw.includes(`./fundo/${name}.svg`), `${name}.svg está na lista do modo offline`);
  }
  assert.ok(sw.includes("./aparencia.js") && sw.includes("./tema-inicio.js"));
});

test("carrossel do fundo: anda de lado com a rolagem e dá a volta sem emenda", () => {
  assert.equal(carouselOffset(0, 1000), -0);
  assert.equal(carouselOffset(600, 1000), -210);
  assert.equal(carouselOffset(600, 1000, 0.5), -300);
  assert.ok(Math.abs(carouselOffset(3000, 1000) - -50) < 1e-9); // 1050 px: já deu uma volta
  assert.equal(carouselOffset(100, 0), 0);
  for (const y of [0, 123, 5000, 99999]) { const x = carouselOffset(y, 777); assert.ok(x <= 0 && x > -777, `${y}: ${x}`); }
});
