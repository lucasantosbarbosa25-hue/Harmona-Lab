// Ritmo e frases escritos pelo app (engine/groove.js) a partir da base de conhecimento (kb/estilos.js).
// Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { analyzeData } from "../../harmonalab/web/engine/analysis.js";
import { beatOptions, compFor, compOptions, drumsFor, generateGroove, makeRng, ticksText } from "../../harmonalab/web/engine/groove.js";
import { DRUM_CHANNEL, chordNotes, drumNotes, midiBytes, noteEvents } from "../../harmonalab/web/engine/midi.js";
import { loadProject } from "../../harmonalab/web/engine/model.js";
import { DRUM_PIECES, durationTicks, parseComp, parseDrums } from "../../harmonalab/web/engine/phrase.js";
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
    assert.ok(style.comps.filter((c) => !c.kind).length >= 3, `${style.id}: pelo menos três levadas`);
    assert.ok(style.comps.filter((c) => c.kind === "ostinato").length >= 2, `${style.id}: pelo menos dois ostinatos ou riffs`);
    const kinds = style.comps.map((c) => c.kind ?? "levada");
    assert.deepEqual(kinds, [...kinds].sort(), `${style.id}: levadas primeiro, ostinatos depois`);
    assert.equal(new Set(style.comps.map((c) => c.id)).size, style.comps.length);
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
  for (const name of ["Jesús Molina", "Ed Motta", "Salomão Soares", "Cartola", "B.B. King", "Scott Henderson", "Joshua Domfeh"]) {
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

test("ostinatos e riffs: o desenho se repete e as notas seguem a escala de cada acorde", () => {
  const style = findStyle("blues");
  assert.deepEqual(compOptions(style).map((o) => `${o.kind}:${o.id}`), ["levada:shuffle", "levada:lento", "levada:stabs", "levada:stoptime", "ostinato:boogie", "ostinato:riffresposta"]);
  assert.equal(compFor(style, "nao-existe"), "");
  const made = generateGroove(bare(), { style, comp: "boogie" }).chords;
  assert.equal(new Set(made.map((c) => c.comp)).size, 1); // o mesmo desenho em todos os acordes
  const { project } = loadProject(apply(bare(), { chords: made }));
  const low = (i) => chordNotes(project, project.chords[i], 1920).filter((n) => n[2] < 58).map((n) => n[2]);
  assert.deepEqual(low(1), [47, 47, 53, 53, 55, 55, 53, 53]); // B7alt: B, depois o 5º e o 6º graus da escala alterada (F e G)
  assert.deepEqual(low(3).filter((p) => p < 50).slice(0, 3), [40, 40, 47]); // Em9: E e a quinta do eólio (B)
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

test("bateria na base: cada estilo tem beat básico, variações e viradas de 1 ou 2 tempos", () => {
  for (const style of STYLES) {
    assert.ok(style.beats.length >= 3, `${style.id}: beat básico e pelo menos duas variações`);
    assert.ok(style.fills.length >= 3, `${style.id}: pelo menos três viradas`);
    for (const beat of style.beats) {
      const { bars, errors } = parseDrums(beat.bars.join(" | "));
      assert.deepEqual(errors, [], `${style.id}/${beat.id}`);
      assert.equal(bars.length, beat.bars.length);
      for (const bar of bars) for (const layer of bar) assert.equal(layer.ticks, 1920, `${style.id}/${beat.id}`);
    }
    for (const fill of style.fills) {
      const { bars, errors } = parseDrums(fill);
      assert.deepEqual(errors, [], `${style.id}: ${fill}`);
      assert.ok([480, 960].includes(bars[0][0].ticks), `${style.id}: virada "${fill}"`);
    }
  }
  assert.deepEqual([DRUM_PIECES.K, DRUM_PIECES.S, DRUM_PIECES.H], [36, 38, 42]); // General MIDI
  assert.equal(ticksText(1440), "2+4");
  assert.equal(ticksText(800), "4+4t");
});

test("a virada interrompe o beat no fim do compasso, o beat volta no tempo 1 e entra um ataque de prato", () => {
  const style = findStyle("rock");
  const data = { ...bare(), chords: [...bare().chords, ...bare().chords] }; // 8 compassos
  const text = generateGroove(data, { style, drums: "basico", drumVariation: 2 }).drums;
  const bars = text.split(" | ");
  assert.equal(bars.length, 8);
  assert.equal(bars[0], style.beats[0].bars[0]);
  const { project } = loadProject({ ...data, drums: text });
  const notes = drumNotes(project, 8 * 1920);
  const inBar = (i) => notes.filter((n) => n[0] >= i * 1920 && n[0] < (i + 1) * 1920);
  const sameBeat = (i) => JSON.stringify(inBar(i).map((n) => [n[0] - i * 1920, n[2]]));
  assert.equal(sameBeat(1), sameBeat(0)); // compassos comuns: o beat inteiro
  for (const fillBar of [3, 7]) {
    assert.notEqual(sameBeat(fillBar), sameBeat(0), `compasso ${fillBar + 1} tem virada`);
    const tail = inBar(fillBar).filter((n) => n[0] - fillBar * 1920 >= 960);
    assert.ok(tail.every((n) => [38, 50, 47, 43, 36].includes(n[2])) && tail.length >= 2, "no fim do compasso só soa a virada (caixa, tons, bumbo)");
  }
  assert.ok(inBar(4).some((n) => n[0] === 4 * 1920 && n[2] === 49), "ataque de prato no tempo 1 depois da virada");
  assert.ok(inBar(4).some((n) => n[0] === 4 * 1920 && n[2] === 36), "e o beat volta no tempo 1");
  assert.notEqual(generateGroove(data, { style, drums: "basico", drumVariation: 5 }).drums, text); // outra virada
  assert.equal(generateGroove(data, { style, drums: "basico", drumVariation: 2 }).drums, text);
  assert.equal(drumsFor(style, "basico", loadProject({ chords: [{ notes: "C4" }] }).project), style.beats[0].bars[0]); // um compasso só: sem virada
  assert.equal(drumsFor(style, "nao-existe", project), "");
  assert.deepEqual(beatOptions(style).map((o) => o.id), ["basico", "meio", "aberto"]);
});

test("a bateria gerada é válida em todos os estilos e compassos, e sai numa faixa própria no canal 10", () => {
  for (const style of STYLES) {
    for (const beat of style.beats) {
      for (const signature of ["4/4", "3/4", "6/8", "5/4", "7/8"]) {
        const data = { ...bare(), time_signature: signature, chords: [...bare().chords, ...bare().chords, ...bare().chords] };
        const drums = generateGroove(data, { style, drums: beat.id, drumVariation: 1 }).drums;
        const report = analyzeData({ ...data, drums });
        assert.equal(report.ok, true, `${style.id}/${beat.id} em ${signature}`);
        assert.equal(report.drums, drums);
      }
    }
  }
  const data = apply(bare(), generateGroove(bare(), { style: findStyle("funk"), comp: "clav", phrases: true, drums: "basico" }));
  data.drums = generateGroove(bare(), { style: findStyle("funk"), drums: "basico" }).drums;
  const { project } = loadProject(data);
  const events = noteEvents(project);
  assert.ok(events.notes.filter((n) => n.channel === DRUM_CHANNEL).length > 80);
  assert.equal(noteEvents(project, { drums: false }).notes.filter((n) => n.channel === DRUM_CHANNEL).length, 0);
  const bytes = midiBytes(project);
  const text = Buffer.from(bytes).toString("latin1");
  assert.deepEqual([bytes[9], bytes[11]], [1, 3]); // tipo 1, três faixas
  assert.ok(text.includes("Frase") && text.includes("Bateria"));
  const plain = midiBytes(loadProject({ chords: [{ notes: "C4 E4" }] }).project);
  assert.deepEqual([plain[9], plain[11]], [0, 1]); // só acordes: continua tipo 0, uma faixa
});
