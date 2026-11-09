// Banco de sons (.sf2): as partes que não dependem do áudio do navegador. Rodam com: node --test tests/js
// O tocador em si (SpessaSynth no AudioWorklet) é conferido no navegador, com o SF2 gerado em sf2_fixture.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";

import { SAME, SIMPLE, formatSize, parsePatchValue, patchValue, soundBankProblem, suggestedPreset } from "../../harmonalab/web/sound.js";
import { buildSf2 } from "./sf2_fixture.mjs";

test("instrumento escolhido vira texto e volta", () => {
  const patch = { name: "Rhodes", program: 4, bankMSB: 0, bankLSB: 0 };
  assert.equal(patchValue(patch), "sf:0:0:4");
  assert.deepEqual(parsePatchValue("sf:0:0:4"), { bankMSB: 0, bankLSB: 0, program: 4 });
  assert.deepEqual(parsePatchValue("sf:8:1:127"), { bankMSB: 8, bankLSB: 1, program: 127 });
  for (const other of [SIMPLE, SAME, "", null, "sf:x:0:1", "sf:0:0"]) assert.equal(parsePatchValue(other), null, String(other));
});

test("ao carregar um banco, sugere um piano elétrico se houver", () => {
  const presets = (names) => names.map((name, program) => ({ name, program, bankMSB: 0, bankLSB: 0, isDrum: name === "Drums" }));
  assert.equal(suggestedPreset(presets(["Drums", "Grand Piano", "Suitcase Rhodes MkI"])).name, "Suitcase Rhodes MkI");
  assert.equal(suggestedPreset(presets(["Grand Piano", "E.Piano 1"])).name, "E.Piano 1");
  assert.equal(suggestedPreset(presets(["Drums", "Grand Piano"])).name, "Grand Piano"); // sem piano elétrico: o primeiro que não é bateria
  assert.equal(suggestedPreset([]), null);
});

test("tamanhos legíveis", () => {
  assert.equal(formatSize(10 * 1024 * 1024), "10.0 MB");
  assert.equal(formatSize(512 * 1024 * 1024), "512 MB");
  assert.equal(formatSize(2000), "2 KB");
});

test("o SF2 de teste tem a estrutura do formato (RIFF sfbk com INFO, sdta e pdta)", () => {
  const bytes = buildSf2();
  const text = Buffer.from(bytes).toString("latin1");
  assert.equal(text.slice(0, 4), "RIFF");
  assert.equal(text.slice(8, 12), "sfbk");
  assert.equal(new DataView(bytes.buffer).getUint32(4, true), bytes.length - 8);
  for (const id of ["INFO", "sdta", "pdta", "phdr", "pbag", "pgen", "inst", "ibag", "igen", "shdr", "Rhodes Teste"]) assert.ok(text.includes(id), id);
});

test("arquivo estragado é recusado antes de chegar ao tocador (que travaria esperando)", () => {
  const bytes = buildSf2();
  const buffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  assert.equal(soundBankProblem(buffer(bytes)), "");
  for (const cut of [0.3, 0.5, 0.9, 0.99]) {
    assert.match(soundBankProblem(buffer(bytes.slice(0, Math.floor(bytes.length * cut)))), /incompleto/, `cortado em ${cut}`);
  }
  assert.match(soundBankProblem(new TextEncoder().encode("isto não é um soundfont, só texto").buffer), /não é um banco de sons/);
  assert.match(soundBankProblem(new ArrayBuffer(4)), /não é um banco de sons/);
  const dls = new Uint8Array(12);
  dls.set([...Buffer.from("RIFF")], 0);
  new DataView(dls.buffer).setUint32(4, 4, true);
  dls.set([...Buffer.from("DLS ")], 8);
  assert.equal(soundBankProblem(dls.buffer), ""); // DLS: só o cabeçalho é conferido
});
