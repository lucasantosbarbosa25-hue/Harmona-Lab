// Ritmo e frases escritos pelo app (engine/groove.js) a partir da base de conhecimento (kb/estilos.js).
// Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { analyzeData } from "../../harmonalab/web/engine/analysis.js";
import { ARPEGGIOS, compFor, compOptions, generateGroove, makeRng } from "../../harmonalab/web/engine/groove.js";
import { chordNotes, noteEvents } from "../../harmonalab/web/engine/midi.js";
import { loadProject } from "../../harmonalab/web/engine/model.js";
import { durationTicks, parseComp } from "../../harmonalab/web/engine/phrase.js";
import { COLORS, SOURCES, STYLES, findStyle, styleByLabel } from "../../harmonalab/web/kb/estilos.js";

const EXAMPLE = JSON.parse(readFileSync(new URL("../../examples/resolucao_em_fsharp_ponta.json", import.meta.url), "utf8"));
const bare = (color = "") => {
  const data = structuredClone(EXAMPLE);
  data.chords.forEach((c) => { delete c.phrase; if (color) c.phrase_color = color; });
  return data;
};
const apply = (data, result) => { data.chords.forEach((c, i) => Object.assign(c, result.chords[i])); return data; };
const problems = (data) => analyzeData(data).issues.filter((i) => i.level !== "info").map((i) => `${i.chord}: ${i.message}`);

test("a base de conhecimento é coerente: estilos pedidos, influências, levadas de compassos inteiros e células de tempos inteiros", () => {
  for (const label of ["Jazz swing", "Blues", "Jazz fusion", "Neo-soul", "Gospel americano", "Funk (16 avos)", "Salsa", "Samba", "Bossa nova", "Rock", "Ska"]) {
    assert.ok(styleByLabel(label), label);
  }
  assert.equal(new Set(STYLES.map((s) => s.id)).size, STYLES.length);
  for (const style of STYLES) {
    assert.ok(style.influences.length && style.summary.length > 30, style.id);
    assert.ok(style.comps.length >= 2, `${style.id}: pelo menos duas levadas`);
    assert.ok(style.cells.length >= 8, `${style.id}: variedade rítmica`);
    for (const comp of style.comps) {
      const { layers, errors } = parseComp(comp.pattern);
      assert.deepEqual(errors, [], `${style.id}/${comp.id}`);
      for (const layer of layers) assert.equal(layer.ticks % 1920, 0, `${style.id}/${comp.id}: camada de ${layer.ticks} ticks`);
    }
    for (const cell of style.cells) {
      const ticks = cell.split(" ").reduce((n, tok) => n + durationTicks(tok.replace(/^r/, "")), 0);
      assert.ok(ticks % 480 === 0 && ticks <= 1920, `${style.id}: célula "${cell}" com ${ticks} ticks`);
    }
  }
  for (const name of ["Jesús Molina", "Ed Motta", "Salomão Soares", "Cartola", "B.B. King", "Scott Henderson"]) {
    assert.ok(STYLES.some((s) => s.influences.includes(name)), name);
  }
  assert.ok(findStyle("gospel").influences.length >= 6);
  assert.deepEqual(COLORS, ["dentro", "cromatico", "outside"]);
  for (const source of SOURCES) assert.match(source.url, /^https:\/\//);
});

test("em todos os estilos, cores e variações, o que o app escreve passa na conferência do próprio motor", () => {
  for (const style of STYLES) {
    for (const color of ["", ...COLORS]) {
      for (let variation = 0; variation < 12; variation++) {
        const comp = compOptions(style)[variation % compOptions(style).length].id;
        const data = apply(bare(color), generateGroove(bare(color), { style, comp, phrases: true, variation }));
        assert.deepEqual(problems(data), [], `${style.id} / ${color || "padrão"} / variação ${variation}`);
        assert.equal(analyzeData(data).ok, true);
        assert.ok(data.chords.every((c) => c.phrase && c.comp), "todo acorde ganha frase e levada");
      }
    }
  }
});

test("a mesma variação dá sempre a mesma frase; outra variação muda; há variedade rítmica", () => {
  const style = findStyle("fusion");
  const first = generateGroove(bare(), { style, phrases: true, variation: 3 });
  assert.deepEqual(generateGroove(bare(), { style, phrases: true, variation: 3 }), first);
  assert.notDeepEqual(generateGroove(bare(), { style, phrases: true, variation: 4 }), first);
  for (const s of STYLES) {
    const rhythms = new Set();
    for (let v = 0; v < 10; v++) {
      for (const chord of generateGroove(bare(), { style: s, phrases: true, variation: v }).chords) {
        rhythms.add(chord.phrase.split(" ").map((t) => t.split("/")[1].split("*")[0]).join(" "));
      }
    }
    assert.ok(rhythms.size >= 12, `${s.id}: ${rhythms.size} ritmos diferentes em 40 frases`);
  }
  assert.equal(makeRng("x").next(), makeRng("x").next());
});

test("a cor pedida no acorde manda: dentro fica na escala, cromatico traz aproximações, outside sai e resolve", () => {
  const roles = (color, styleId) => {
    const all = [];
    for (let v = 0; v < 20; v++) {
      for (const chord of generateGroove(bare(color), { style: findStyle(styleId), phrases: true, variation: v }).chords) {
        all.push(...chord.phrase.split(" ").map((t) => t.split("*")[1] ?? ""));
      }
    }
    return all;
  };
  for (const id of ["swing", "blues", "fusion", "gospel"]) {
    assert.ok(roles("dentro", id).every((r) => r === "" || r === "alvo"), `${id}: dentro não usa nota de fora`);
    assert.ok(roles("cromatico", id).filter((r) => r === "aprox").length >= 10, `${id}: cromatico traz aproximações`);
    assert.ok(roles("outside", id).filter((r) => r === "outside").length >= 10, `${id}: outside sai da escala`);
  }
  // só os acordes marcados mudam de cor (o pedido é soberano)
  const data = bare();
  data.chords[1].phrase_color = "outside";
  let marked = 0;
  for (let v = 0; v < 20; v++) {
    const made = generateGroove(data, { style: findStyle("ska"), phrases: true, variation: v }).chords;
    marked += made[1].phrase.includes("*outside") ? 1 : 0;
    for (const i of [0, 2, 3]) assert.ok(!made[i].phrase.includes("*outside"));
  }
  assert.ok(marked >= 10);
  assert.ok(roles("", "blues").includes("blue"), "blues usa blue notes por costume do estilo");
});

test("sem a escala, a frase usa só as notas do acorde e o app avisa", () => {
  const data = bare();
  data.chords.forEach((c) => delete c.phrase_scale);
  const result = generateGroove(data, { style: findStyle("bossa"), phrases: true });
  assert.match(result.notes.join(" "), /4 acorde\(s\) sem escala declarada/);
  assert.equal(result.chords[0].phrase_scale, "F# C E A");
  assert.deepEqual(problems(apply(data, result)), []);
  assert.deepEqual(generateGroove({ chords: [{ symbol: "Pausa" }] }, { style: findStyle("rock"), comp: "colcheias", phrases: true }).chords, [{ comp: "", phrase: "" }]);
});

test("levadas: do estilo e arpejos que se adaptam ao número de notas", () => {
  const style = findStyle("ska");
  assert.deepEqual(compOptions(style).map((o) => o.id), ["skank", "soacorde", ...ARPEGGIOS.map((a) => a.id)]);
  assert.equal(compFor(style, "arp-up", 4), "1/16 2/16 3/16 4/16");
  assert.equal(compFor(style, "arp-down", 3), "3/16 2/16 1/16");
  assert.equal(compFor(style, "arp-updown", 4), "1/16 2/16 3/16 4/16 3/16 2/16");
  assert.equal(compFor(style, "nao-existe", 4), "");
});

test("a levada vira notas: camadas ao mesmo tempo, repetição até o fim do acorde, acentos e a mesma tecla sem sobrepor", () => {
  const { project } = loadProject({ chords: [{ bass: "C2", left_hand: "G2 E3", right_hand: "B3 D4 G4", duration_beats: 4, comp: "B/4. B/8+2 ; r/8 D!/8 r/4 D?/4. D/8" }] });
  const notes = chordNotes(project, project.chords[0], 1920);
  assert.deepEqual(notes.filter((n) => n[2] === 36), [[0, 720, 36, 80], [720, 1920, 36, 80]]); // o baixo: duas notas, ligadura somada
  assert.deepEqual(notes.filter((n) => n[2] === 67).map((n) => [n[0], n[1], n[3]]), [[240, 480, 96], [960, 1680, 56], [1680, 1920, 80]]); // acento e toque leve
  const looped = loadProject({ chords: [{ notes: "C4 E4", duration_beats: 3, comp: "T/4 r/4" }] }).project;
  assert.deepEqual(chordNotes(looped, looped.chords[0], 1440).map((n) => n[0]), [0, 0, 960, 960]); // repete e é cortada no fim
  const overlap = loadProject({ chords: [{ notes: "C4", duration_beats: 2, comp: "T/2 ; r/4 T/4" }] }).project;
  assert.deepEqual(chordNotes(overlap, overlap.chords[0], 960), [[0, 480, 60, 80], [480, 960, 60, 80]]); // o toque novo corta o anterior
  const events = noteEvents(loadProject(apply(bare(), generateGroove(bare(), { style: findStyle("samba"), comp: "teleco", phrases: true }))).project);
  assert.deepEqual(events.starts, [0, 1920, 3840, 5760]);
  assert.ok(events.notes.some((n) => n.channel === 1) && events.notes.filter((n) => n.channel === 0).length > 60);
});
