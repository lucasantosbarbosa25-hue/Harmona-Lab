// Ritmo e frases escritos pelo app (engine/groove.js) a partir da base de conhecimento (kb/estilos.js).
// Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { analyzeData } from "../../harmonalab/web/engine/analysis.js";
import { SOURCE_SCALES, bassForComp, bassOptions, beatOptions, compFor, compOptions, drumsFor, generateGroove, makeRng, ticksText } from "../../harmonalab/web/engine/groove.js";
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

test("outside em motivo: a mesma figura, meio tom acima ou abaixo, logo depois do original, e resolve no alvo", () => {
  let checked = 0;
  for (let variation = 0; variation < 30; variation++) {
    for (const chord of generateGroove(bare("outside"), { style: findStyle("fusion"), phrases: true, variation }).chords) {
      const tokens = chord.phrase.split(" ");
      const first = tokens.findIndex((t) => t.endsWith("*outside"));
      if (first <= 0) continue;
      let count = 0;
      while (tokens[first + count]?.endsWith("*outside") || tokens[first + count]?.startsWith("r/")) count += 1;
      while (tokens[first + count - 1].startsWith("r/")) count -= 1; // pausas depois do trecho de fora não fazem parte dele
      const outside = tokens.slice(first, first + count);
      const original = tokens.slice(first - count, first);
      const durs = (list) => list.map((t) => t.split("/")[1].split("*")[0]);
      assert.deepEqual(durs(outside), durs(original), `mesmo ritmo: ${chord.phrase}`);
      const midi = (t) => loadProject({ chords: [{ notes: "C4", phrase: t.split("*")[0] }] }).project.chords[0].phrase_events[0]?.note.midi;
      const shifts = new Set(outside.map((t, i) => (t.startsWith("r/") ? null : midi(t) - midi(original[i]))).filter((d) => d !== null));
      assert.equal(shifts.size, 1, `deslocamento único: ${chord.phrase}`);
      assert.ok([1, -1].includes([...shifts][0]), `meio tom: ${chord.phrase}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 30, `${checked} frases outside em motivo`);
});

test("tags: estilos combinados, escalas de origem e cor geral (a cor do acorde manda)", () => {
  assert.deepEqual(SOURCE_SCALES.map((s) => s.id), ["acorde", "penta", "blues", "arpejo"]);
  const roles = (options) => {
    const all = [];
    for (let variation = 0; variation < 15; variation++) for (const c of generateGroove(bare(), { style: findStyle("swing"), phrases: true, variation, ...options }).chords) all.push(...c.phrase.split(" "));
    return all;
  };
  assert.ok(roles({ scales: ["blues"] }).some((t) => t.endsWith("*blue")));
  const arpeggio = generateGroove(bare(), { style: findStyle("bossa"), phrases: true, scales: ["arpejo"], color: "dentro" });
  const data = apply(bare(), arpeggio);
  const { project } = loadProject(data);
  for (const chord of project.chords) {
    const pcs = new Set(chord.left_hand.concat(chord.right_hand, chord.bass).map((n) => n.midi % 12));
    for (const e of chord.phrase_events) assert.ok(pcs.has(e.note.midi % 12), `arpejo usa só notas do acorde (${chord.symbol})`);
  }
  assert.ok(roles({ color: "outside" }).some((t) => t.endsWith("*outside")));
  const marked = bare();
  marked.chords[2].phrase_color = "dentro";
  for (let variation = 0; variation < 10; variation++) {
    const made = generateGroove(marked, { style: findStyle("fusion"), phrases: true, variation, color: "outside" }).chords;
    assert.ok(!made[2].phrase.includes("*outside"), "a cor do acorde vence a geral");
  }
  const mixed = new Set();
  for (let variation = 0; variation < 10; variation++) {
    for (const c of generateGroove(bare(), { style: findStyle("bossa"), phrases: true, variation, phraseStyles: [findStyle("bossa"), findStyle("fusion")] }).chords) {
      if (c.phrase.includes("/16")) mixed.add(variation);
    }
  }
  assert.ok(mixed.size >= 3, "com fusion marcado junto, a bossa ganha semicolcheias");
});

test("baixo: linhas por estilo, a levada escolhe a sua, viradas que chegam ao próximo acorde por semitom", () => {
  for (const style of STYLES) {
    assert.ok(style.bass.length >= 3, `${style.id}: pelo menos três linhas de baixo`);
    for (const line of style.bass) {
      const ticks = line.pattern.split(" ").reduce((n, t) => n + durationTicks(t.split("/")[1]), 0);
      assert.equal(ticks, 1920, `${style.id}/${line.id}`);
    }
    for (const comp of style.comps) if (comp.bass) assert.ok(style.bass.some((b) => b.id === comp.bass), `${style.id}/${comp.id}`);
  }
  assert.equal(bassForComp(findStyle("blues"), "lento"), "lento");
  assert.equal(bassForComp(findStyle("blues"), "shuffle"), "shuffle"); // sem indicação: a primeira
  assert.deepEqual(bassOptions(findStyle("salsa")).map((o) => o.id), ["tumbao", "tumbao2", "antecipado"]);
  let fills = 0;
  for (const style of STYLES) {
    for (let variation = 0; variation < 8; variation++) {
      const made = generateGroove(bare(), { style, bass: style.bass[variation % 3].id, drumVariation: variation }).chords;
      const data = apply(bare(), { chords: made });
      const report = analyzeData(data);
      assert.equal(report.ok, true, `${style.id} variação ${variation}`);
      const { project } = loadProject(data);
      project.chords.forEach((chord, i) => {
        const events = chord.bass_events;
        assert.ok(events.length, `${style.id}: todo acorde tem baixo`);
        for (const e of events) assert.ok(e.note.midi >= 23 && e.note.midi <= 52, `${style.id}: registro de baixo (${e.note.midi})`);
        const lowest = Math.min(...chord.left_hand.concat(chord.right_hand, chord.bass).map((n) => n.midi));
        const first = events.find((e) => e.start === 0);
        if (first) assert.equal(first.note.midi % 12, lowest % 12, `${style.id}: o baixo começa na nota de baixo do acorde`);
        const last = events.at(-1);
        const next = project.chords[i + 1];
        if (next && last.role === "aprox" && last.start + last.length === Math.round(chord.duration_beats * 480)) {
          const nextLow = Math.min(...next.left_hand.concat(next.right_hand, next.bass).map((n) => n.midi)) % 12;
          assert.ok([1, 11].includes((((last.note.midi - nextLow) % 12) + 12) % 12), `${style.id}: a virada chega por semitom`);
          fills += 1;
        }
      });
    }
  }
  assert.ok(fills >= 40, `${fills} chegadas por semitom`);
  const bytes = midiBytes(loadProject(apply(bare(), generateGroove(bare(), { style: findStyle("funk"), bass: "pop" }))).project);
  assert.ok(Buffer.from(bytes).toString("latin1").includes("Baixo"));
  assert.ok(noteEvents(loadProject(apply(bare(), generateGroove(bare(), { style: findStyle("funk"), bass: "pop" }))).project).notes.some((n) => n.channel === 2));
});

test("fraseado sem nota repetida: dentro da frase nunca a mesma nota duas vezes seguidas (entre frases, pode)", () => {
  let phrases = 0;
  for (const style of STYLES) {
    for (const color of ["", ...COLORS]) {
      for (const scales of [[], ["penta"], ["blues"], ["arpejo"]]) {
        for (let variation = 0; variation < 4; variation++) {
          const data = apply(bare(), generateGroove(bare(), { style, phrases: true, variation, color, scales }));
          for (const chord of loadProject(data).project.chords) {
            const ev = chord.phrase_events;
            for (let i = 1; i < ev.length; i++) {
              const gap = ev[i].start - (ev[i - 1].start + ev[i - 1].length);
              assert.ok(!(ev[i].note.midi === ev[i - 1].note.midi && gap <= 480), `${style.id}/${color || "padrão"}: ${chord.phrase}`);
            }
            phrases += 1;
          }
          assert.equal(analyzeData(data).issues.filter((i) => i.level !== "info").length, 0);
        }
      }
    }
  }
  assert.ok(phrases > 2000);
  for (const style of STYLES) assert.equal("repeat" in style.phrase, false, `${style.id}: a base não tem mais chance de repetir nota`);
});
