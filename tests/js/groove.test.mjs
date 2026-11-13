// Ritmo e frases escritos pelo app (engine/groove.js) a partir da base de conhecimento (kb/estilos.js).
// Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { analyzeData } from "../../harmonalab/web/engine/analysis.js";
import { INTENSITIES, SOURCE_SCALES, percussionFor, percussionOptions, bassForComp, bassOptions, beatOptions, compFor, compOptions, drumsFor, generateGroove, makeRng, ticksText } from "../../harmonalab/web/engine/groove.js";
import { DRUM_CHANNEL, MAX_PERCUSSION_TRACKS, PERCUSSION_INSTRUMENTS, chordNotes, drumNotes, midiBytes, noteEvents, percussionPresent, percussionTracks } from "../../harmonalab/web/engine/midi.js";
import { loadProject, sounding } from "../../harmonalab/web/engine/model.js";
import { DRUM_PIECES, durationTicks, parseComp, parseDrums, parsePhrase as parsePhraseText } from "../../harmonalab/web/engine/phrase.js";
import { COLORS, SOURCES, STYLES, findStyle, styleByLabel } from "../../harmonalab/web/kb/estilos.js";
import { PERFIL_ATIVO, PERFIL_POR_ESTILO, PERFIS, perfilDoEstilo } from "../../harmonalab/web/kb/fraseado.js";

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
  const plain = (text) => text.replace(/([HRE])(!!|\?\?|[!?])?\//g, "$1/"); // sem a dinâmica que o app dá ao chimbal
  assert.equal(plain(bars[0]), plain(style.beats[0].bars[0]));
  const { project } = loadProject({ ...data, drums: text });
  const notes = drumNotes(project, 8 * 1920);
  const inBar = (i) => notes.filter((n) => n[0] >= i * 1920 && n[0] < (i + 1) * 1920);
  const sameBeat = (i) => JSON.stringify(inBar(i).map((n) => [n[0] - i * 1920, n[2]]));
  assert.equal(sameBeat(2), sameBeat(0)); // compassos comuns: o beat inteiro (dois compassos: o segundo varia o chimbal)
  assert.equal(plain(bars[1]), plain(style.beats[0].bars[1]));
  for (const fillBar of [3, 7]) {
    assert.notEqual(sameBeat(fillBar), sameBeat(0), `compasso ${fillBar + 1} tem virada`);
    const tail = inBar(fillBar).filter((n) => n[0] - fillBar * 1920 >= 1440); // o último tempo é sempre da virada
    assert.ok(tail.every((n) => [38, 50, 47, 43, 36].includes(n[2])) && tail.length >= 2, "no fim do compasso só soa a virada (caixa, tons, bumbo)");
  }
  assert.ok(inBar(4).some((n) => n[0] === 4 * 1920 && n[2] === 49), "ataque de prato no tempo 1 depois da virada");
  assert.ok(inBar(4).some((n) => n[0] === 4 * 1920 && n[2] === 36), "e o beat volta no tempo 1");
  assert.notEqual(generateGroove(data, { style, drums: "basico", drumVariation: 5 }).drums, text); // outra virada
  assert.equal(generateGroove(data, { style, drums: "basico", drumVariation: 2 }).drums, text);
  assert.equal(drumsFor(style, "basico", loadProject({ chords: [{ notes: "C4" }] }).project).split(" | ").map(plain).join(" | "), plain(style.beats[0].bars.join(" | "))); // um compasso só: sem virada
  assert.equal(drumsFor(style, "nao-existe", project), "");
  assert.deepEqual(beatOptions(style).map((o) => o.id), ["basico", "meio", "aberto", "duplo", "rajada", "galope", "tons", "prog"]);
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
        for (const e of events) assert.ok(e.note.midi >= 28 && e.note.midi <= 67, `${style.id}: baixo de 4 cordas, do E1 ao G4 (${e.note.midi})`);
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
  assert.ok(fills >= 30, `${fills} chegadas por semitom`);
  // o baixo do gospel brinca: corridas que vão ao agudo (perto de C4), pops de oitava, e nunca a mesma nota seguida na corrida
  let high = 0;
  let runs = 0;
  for (let variation = 0; variation < 12; variation++) {
    const made = generateGroove(bare(), { style: findStyle("gospel"), bass: ["pulso", "oitavas", "shout"][variation % 3], drumVariation: variation }).chords;
    const { project } = loadProject(apply(bare(), { chords: made }));
    for (const chord of project.chords) {
      const ev = chord.bass_events;
      if (ev.some((e) => e.note.midi >= 55)) high += 1;
      const fast = ev.filter((e) => e.length <= 120);
      if (fast.length >= 4) runs += 1;
      for (let k = 1; k < fast.length; k++) if (fast[k].start === fast[k - 1].start + fast[k - 1].length) assert.notEqual(fast[k].note.midi, fast[k - 1].note.midi, `corrida sem nota repetida: ${chord.bass_line}`);
    }
  }
  assert.ok(high >= 8 && runs >= 15, `gospel: ${high} acordes chegam ao agudo, ${runs} corridas`);
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

test("notas de repouso duram até a próxima nota: depois de um alvo ou da última nota não sobra pausa", () => {
  let checked = 0;
  for (const style of STYLES) {
    for (let variation = 0; variation < 6; variation++) {
      const data = apply(bare(), generateGroove(bare(), { style, phrases: true, variation }));
      for (const chord of loadProject(data).project.chords) {
        const tokens = chord.phrase.split(" ");
        tokens.forEach((t, i) => {
          if (i && t.startsWith("r/")) assert.ok(!/\*alvo$/.test(tokens[i - 1]), `${style.id}: pausa depois de alvo em ${chord.phrase}`);
        });
        assert.ok(!tokens.at(-1).startsWith("r/"), `${style.id}: a frase termina soando (${chord.phrase})`);
        const ev = chord.phrase_events;
        assert.equal(ev.at(-1).start + ev.at(-1).length, Math.round(chord.duration_beats * 480), "a última nota vai até o fim do acorde");
        checked += 1;
      }
    }
  }
  assert.ok(checked > 100);
});

const solo = (id, { tempo = 80, variation = 0, intensity, repeat = 1 } = {}) => {
  const data = bare();
  data.tempo = tempo;
  data.chords = Array.from({ length: repeat }, () => data.chords).flat().map((c) => structuredClone(c));
  return loadProject(apply(data, generateGroove(data, { style: findStyle(id), phrases: true, variation, intensity }))).project;
};
const groups = (chord) => {
  // notas que soam juntas (melodia e vozes abaixo), por início
  const map = new Map();
  for (const e of [...chord.phrase_events, ...chord.phrase_extra]) map.set(e.start, [...(map.get(e.start) ?? []), e]);
  return [...map.values()];
};

test("vozes na frase: oitavas, sextas da escala ou tríades do acorde, só em notas que dá para tocar assim", () => {
  const seen = { 1: 0, 2: 0, 3: 0 };
  for (const style of STYLES) {
    for (let variation = 0; variation < 8; variation++) {
      for (const tempo of [70, 120]) {
        const project = solo(style.id, { tempo, variation, repeat: 2 });
        const seconds = (ticks) => (ticks * 60) / tempo / 480;
        for (const chord of project.chords) {
          const chordPcs = new Set(sounding(chord).map((v) => ((v.note.midi % 12) + 12) % 12));
          const scale = new Set(chord.phrase_pcs.map((x) => x.pc));
          for (const group of groups(chord)) {
            if (group.length === 1) continue;
            seen[group.length - 1] += 1;
            const top = group.find((e) => chord.phrase_events.includes(e));
            assert.ok(group.every((e) => e === top || e.note.midi < top.note.midi), "as vozes ficam abaixo da melodia");
            assert.ok(group.length <= 3, "no máximo tríade");
            assert.ok(seconds(top.length) >= (group.length === 3 ? 0.36 : 0.25) - 1e-9, `${style.id} ${tempo}: nota rápida demais para ${group.length} vozes: ${chord.phrase}`);
            if (group.length === 3) {
              const [a, b, c] = group.map((e) => e.note.midi).sort((x, y) => y - x);
              const quartal = a - b === 5 && b - c === 5;
              assert.ok(quartal || (a - b >= 3 && b - c >= 3), `tríade quartal ou em terças, sem cluster: ${chord.phrase}`);
              if (!quartal && top.role === "alvo") assert.ok(group.every((e) => chordPcs.has(((e.note.midi % 12) + 12) % 12)), `tríade do acorde: ${chord.phrase}`);
              if (quartal) assert.ok(group.every((e) => scale.has(((e.note.midi % 12) + 12) % 12)), `quartal com notas da escala: ${chord.phrase}`);
            }
          }
        }
      }
    }
  }
  assert.ok(seen[1] > 50 && seen[2] > 20, `duetos e tríades aparecem: ${JSON.stringify(seen)}`);
  const octaves = [0, 1, 2, 3, 4, 5].map((variation) => solo("salsa", { variation, repeat: 2 })).flatMap((p) => p.chords).flatMap(groups).filter((g) => g.length === 2);
  assert.ok(octaves.filter((g) => Math.abs(g[0].note.midi - g[1].note.midi) === 12).length > octaves.length * 0.6, "salsa: duetos quase sempre em oitavas");
});

test("motivos: o ritmo do motivo volta em seguida com outras notas", () => {
  let solos = 0;
  let withMotif = 0;
  for (const style of STYLES) {
    for (let variation = 0; variation < 6; variation++) {
      const project = solo(style.id, { variation, repeat: 2 });
      const events = project.chords.flatMap((c, i) => c.phrase_events.map((e) => ({ ...e, start: e.start + i * 1920 })));
      const iois = events.slice(1).map((e, i) => e.start - events[i].start);
      // procura uma figura de 2 a 4 intervalos repetida logo em seguida, com notas diferentes
      let found = false;
      for (let size = 2; size <= 4 && !found; size++) {
        for (let i = 0; i + 2 * size <= iois.length && !found; i++) {
          const a = iois.slice(i, i + size).join();
          const b = iois.slice(i + size, i + 2 * size).join();
          const notesA = events.slice(i, i + size).map((e) => e.note.midi).join();
          const notesB = events.slice(i + size, i + 2 * size).map((e) => e.note.midi).join();
          if (a === b && notesA !== notesB) found = true;
        }
      }
      solos += 1;
      if (found) withMotif += 1;
    }
  }
  assert.ok(withMotif >= solos * 0.8, `${withMotif} de ${solos} solos com motivo repetido`);
});

test("intensidade: virtuoso tem mais notas por segundo que contido; a 80 BPM há trechos rápidos; o andamento entra na conta", () => {
  const rate = (intensity, tempo) => {
    let notes = 0;
    let seconds = 0;
    for (let variation = 0; variation < 10; variation++) {
      for (const style of STYLES) {
        const project = solo(style.id, { tempo, variation, intensity, repeat: 2 });
        notes += project.chords.reduce((n, c) => n + c.phrase_events.length, 0);
        seconds += (project.chords.reduce((n, c) => n + c.duration_beats, 0) * 60) / tempo;
      }
    }
    return notes / seconds;
  };
  const contido = rate("contido", 80);
  const equilibrado = rate("equilibrado", 80);
  const virtuoso = rate("virtuoso", 80);
  assert.ok(contido < equilibrado && equilibrado < virtuoso, `${contido} < ${equilibrado} < ${virtuoso}`);
  const fast = rate("equilibrado", 160);
  assert.ok(Math.abs(Math.log(fast / equilibrado)) < Math.log(1.6), `notas por segundo parecidas a 80 e a 160 BPM: ${equilibrado} e ${fast}`);
  let quick = 0;
  for (let variation = 0; variation < 10; variation++) {
    for (const chord of solo("bossa", { tempo: 80, variation, repeat: 2 }).chords) quick += chord.phrase_events.filter((e) => e.length <= 120).length;
  }
  assert.ok(quick > 10, `bossa a 80 BPM tem semicolcheias ou mais rápidas: ${quick}`);
  assert.deepEqual(INTENSITIES.map((i) => i.id), ["contido", "equilibrado", "virtuoso"]);
  for (const intensity of ["contido", "virtuoso"]) {
    for (const style of STYLES) {
      const data = apply(bare(), generateGroove(bare(), { style, phrases: true, intensity, variation: 3 }));
      assert.deepEqual(problems(data), [], `${style.id}/${intensity}`);
    }
  }
});

test("percussão: cada estilo tem opções de compassos inteiros, e ela sai numa faixa própria no canal 10", () => {
  for (const style of STYLES) {
    assert.ok(percussionOptions(style).length >= 2, style.id);
    for (const option of style.percussion) {
      for (const bar of option.bars) {
        const { bars, errors } = parseDrums(bar);
        assert.deepEqual(errors, [], `${style.id}/${option.id}`);
        for (const layer of bars[0]) assert.equal(layer.ticks % 1920, 0, `${style.id}/${option.id}`);
      }
    }
    for (const beat of style.beats) assert.equal(beat.bars.length, 2, `${style.id}/${beat.id}: dois compassos`);
  }
  const style = findStyle("salsa");
  const result = generateGroove(bare(), { style, drums: "cascara", percussion: "completa" });
  assert.equal(result.percussion, percussionFor(style, "completa"));
  assert.equal(generateGroove(bare(), { style }).percussion, undefined);
  const data = { ...bare(), drums: result.drums, percussion: result.percussion };
  const { notes } = noteEvents(loadProject(data).project);
  const perc = notes.filter((n) => n.percussion);
  assert.ok(perc.length > 20 && perc.every((n) => n.channel === DRUM_CHANNEL));
  assert.ok(perc.some((n) => n.pitch === 62) && perc.some((n) => n.pitch === 60) && perc.some((n) => n.pitch === 73));
  // salsa completa: as peças do kit ficam na Bateria e cada instrumento de percussão sai na faixa dele, com o nome
  const text = (bytes) => Buffer.from(bytes).toString("latin1");
  const project = loadProject(data).project;
  const names = (bytes) => [...text(bytes).matchAll(/Perc [A-Za-z\u00c0-\u00ff]+|Percuss\u00e3o|Bateria/g)].map((m) => m[0]);
  assert.deepEqual(names(midiBytes(project)), ["Bateria", "Perc Clave", "Perc Congas", "Perc Bong\u00f4s", "Perc Timbales", "Perc G\u00fciro"]);
  assert.deepEqual(names(midiBytes(project, { percussionSingle: true })), ["Bateria", "Percuss\u00e3o"]);
  assert.deepEqual(names(midiBytes(project, { parts: ["percussao"], percussionOnly: ["congas"] })), ["Perc Congas"]);
  assert.deepEqual(percussionPresent(project), ["clave", "congas", "bongos", "timbales", "guiro"]);
  const kit = notes.filter((n) => n.channel === DRUM_CHANNEL && !n.percussion).map((n) => n.pitch);
  assert.ok(kit.length > 0 && kit.every((p) => !PERCUSSION_INSTRUMENTS.some((i) => i.pitches.includes(p))), "a Bateria só tem peças do kit");
});

test("no máximo 6 faixas de percussão em qualquer combinação de bateria e percussão dos estilos", () => {
  for (const style of STYLES) {
    for (const beat of style.beats) {
      for (const option of style.percussion) {
        const made = generateGroove(bare(), { style, drums: beat.id, percussion: option.id });
        const project = loadProject({ ...bare(), drums: made.drums, percussion: made.percussion }).project;
        const present = percussionPresent(project);
        assert.ok(present.length <= MAX_PERCUSSION_TRACKS, `${style.id}/${beat.id}/${option.id}: ${present.join()}`);
      }
    }
  }
  // um projeto escrito à mão com todos os instrumentos: os que passam do limite dividem a última faixa
  const everything = new Set(PERCUSSION_INSTRUMENTS.map((i) => i.id));
  const tracks = percussionTracks(everything);
  assert.equal(tracks.length, MAX_PERCUSSION_TRACKS);
  assert.equal(tracks.at(-1).name, "Perc outras");
  assert.equal(tracks.flatMap((t) => t.ids).length, PERCUSSION_INSTRUMENTS.length);
});

// progressão variada, com escalas: ii-V-I, dominante alterado, meio-diminuto, frígio dominante, dórico, lídio
const VARIED = {
  title: "teste", tempo: 80, time_signature: "4/4", chords: [
    { symbol: "Dm9", left_hand: "D3 A3", right_hand: "F4 C5 E5", duration_beats: 4, phrase_scale: "D E F G A B C" },
    { symbol: "G13", left_hand: "G2 F3", right_hand: "B3 E4 A4", duration_beats: 4, phrase_scale: "G A B C D E F" },
    { symbol: "Cmaj9", left_hand: "C3 G3", right_hand: "E4 B4 D5", duration_beats: 4, phrase_scale: "C D E F G A B" },
    { symbol: "A7alt", left_hand: "A2 G3", right_hand: "C#4 F4 Bb4", duration_beats: 4, phrase_scale: "A Bb C C# Eb F G" },
    { symbol: "Bm7b5", left_hand: "B2 A3", right_hand: "D4 F4 A4", duration_beats: 4, phrase_scale: "B C D E F G A" },
    { symbol: "E7b9", left_hand: "E3 D4", right_hand: "G#4 B4 F5", duration_beats: 4, phrase_scale: "E F G# A B C D" },
    { symbol: "Am9", left_hand: "A2 G3", right_hand: "C4 E4 B4", duration_beats: 4, phrase_scale: "A B C D E F# G" },
    { symbol: "Fmaj7#11", left_hand: "F2 E3", right_hand: "A3 B3 C4", duration_beats: 4, phrase_scale: "F G A B C D E" },
  ],
};

test("melodia com sentido: aproximação resolve no acorde seguinte, sem nota evitada exposta, nota do acorde ou tensão no tempo", () => {
  const mod = (n) => ((n % 12) + 12) % 12;
  const avoidOf = { Cmaj9: [5], E7b9: [9], G13: [0], Bm7b5: [0], Fmaj7: [] }; // 4ª sobre terça maior; b9 fora dos dominantes
  let beats = 0, onChord = 0, crossings = 0;
  const scaleOf = (chord) => new Set(chord.phrase_pcs.map((x) => x.pc));
  for (const style of STYLES) {
    for (let variation = 0; variation < 6; variation++) {
      const data = apply(structuredClone(VARIED), generateGroove(structuredClone(VARIED), { style, phrases: true, variation }));
      assert.deepEqual(problems(data), [], style.id);
      const { project } = loadProject(data);
      project.chords.forEach((chord, ci) => {
        const tones = new Set(sounding(chord).map((v) => mod(v.note.midi)));
        for (const e of chord.phrase_events) {
          // no tempo: nota do acorde ou tensão da escala (9ª, 11ª, 13ª...), nunca nota evitada nem cromática
          if (e.start % 480 === 0) { beats += 1; if (tones.has(mod(e.note.midi)) || (scaleOf(chord).has(mod(e.note.midi)) && !(avoidOf[chord.symbol] ?? []).includes(mod(e.note.midi)))) onChord += 1; }
          const exposed = e.start % 480 === 0 || e.length >= 240;
          if (exposed && e.role === "" && e.length >= 480) {
            assert.ok(!(avoidOf[chord.symbol] ?? []).includes(mod(e.note.midi)), `${style.id}: nota evitada longa em ${chord.symbol}: ${chord.phrase}`);
          }
        }
        const last = chord.phrase_events.at(-1);
        const first = project.chords[ci + 1]?.phrase_events[0];
        if (last?.role === "aprox" && first?.start === 0) {
          crossings += 1;
          assert.ok(Math.abs(first.note.midi - last.note.midi) <= 2, `${style.id}: a aproximação de ${chord.symbol} resolve em ${project.chords[ci + 1].symbol}`);
        }
      });
    }
  }
  assert.ok(onChord / beats >= 0.98, `nota do acorde ou tensão no tempo: ${((100 * onChord) / beats).toFixed(0)}%`);
  assert.ok(crossings >= 10, `${crossings} aproximações entre acordes`);
});

test("chegadas pelo tipo de acorde: nos menores, 9ª e 11ª (e 3ª e 5ª no tempo 1); cromatismo menor em acorde sem tensão", () => {
  const mod = (n) => ((n % 12) + 12) % 12;
  const roots = { Dm9: 2, Am9: 9, Cmaj9: 0, Fmaj7: 5, G13: 7, A7alt: 9, E7b9: 4 };
  const minorDegrees = {};
  const minorDownbeats = {};
  const chromatic = { calm: 0, calmNotes: 0, tense: 0, tenseNotes: 0 };
  for (const style of STYLES) {
    for (let variation = 0; variation < 6; variation++) {
      const data = apply(structuredClone(VARIED), generateGroove(structuredClone(VARIED), { style, phrases: true, variation }));
      for (const chord of loadProject(data).project.chords) {
        const root = roots[chord.symbol.replace("#11", "")];
        const scale = new Set(chord.phrase_pcs.map((x) => x.pc));
        const kind = /^[A-G][b#]?m9/.test(chord.symbol) ? "menor" : /maj/.test(chord.symbol) ? "calmo" : /7|13/.test(chord.symbol) && !/m7b5/.test(chord.symbol) ? "tenso" : "";
        for (const e of chord.phrase_events) {
          const degree = mod(e.note.midi - root);
          if (kind === "menor" && e.start % 960 === 0) {
            const bucket = e.start === 0 ? minorDownbeats : minorDegrees;
            bucket[degree] = (bucket[degree] ?? 0) + 1;
          }
          const out = !scale.has(mod(e.note.midi));
          if (kind === "calmo" || kind === "menor") { chromatic.calmNotes += 1; if (out) chromatic.calm += 1; }
          if (kind === "tenso") { chromatic.tenseNotes += 1; if (out) chromatic.tense += 1; }
        }
      }
    }
  }
  const share = (bucket, degrees) => degrees.reduce((n, d) => n + (bucket[d] ?? 0), 0) / Object.values(bucket).reduce((n, v) => n + v, 0);
  assert.ok(share(minorDegrees, [2, 5]) >= 0.3, `9ª e 11ª no meio do compasso dos menores: ${JSON.stringify(minorDegrees)}`);
  assert.ok(share(minorDownbeats, [3, 7]) >= 0.25, `3ª e 5ª no tempo 1 dos menores: ${JSON.stringify(minorDownbeats)}`);
  assert.ok(chromatic.calm / chromatic.calmNotes < chromatic.tense / chromatic.tenseNotes, `menos cromatismo sem tensão: ${JSON.stringify(chromatic)}`);
});

test("outside: a tensão sempre volta no tempo, perto da última nota de fora; o ritmo usa só figuras do estilo", () => {
  let episodes = 0;
  for (const style of STYLES) {
    for (let variation = 0; variation < 6; variation++) {
      const data = apply(structuredClone(VARIED), generateGroove(structuredClone(VARIED), { style, phrases: true, variation, color: "outside" }));
      assert.deepEqual(problems(data), [], style.id);
      const { project } = loadProject(data);
      const line = project.chords.flatMap((c, ci) => c.phrase_events.map((e) => ({ e, ci, abs: ci * 1920 + e.start })));
      line.forEach(({ e }, k) => {
        const next = line[k + 1];
        if (e.role !== "outside" || next?.e.role === "outside") return;
        episodes += 1;
        assert.ok(next, `${style.id}: o outside não termina a música`);
        assert.equal(next.abs % 480, 0, `${style.id}: a resolução do outside cai no tempo`);
        assert.ok(Math.abs(next.e.note.midi - e.note.midi) <= 3, `${style.id}: resolve perto (${e.token} -> ${next.e.token})`);
      });
    }
  }
  assert.ok(episodes > 100, `${episodes} trechos outside`);
  // ritmo: só figuras do estilo (bossa, samba e salsa nunca em fusas). No virtuoso, as corridas seguem o andamento
  // (teste próprio, mais abaixo).
  for (const id of ["bossa", "samba", "salsa"]) {
    for (const intensity of ["contido", "equilibrado"]) {
      for (let variation = 0; variation < 6; variation++) {
        for (const chord of generateGroove(structuredClone(VARIED), { style: findStyle(id), phrases: true, variation, intensity }).chords) {
          assert.ok(!/\/32/.test(chord.phrase), `${id}/${intensity}: sem fusas: ${chord.phrase}`);
        }
      }
    }
  }
});


test("bateria rica: chimbal com vários níveis de velocity, viradas cheias (de dois tempos no fim), em todos os estilos", () => {
  const data = { ...bare(), chords: [...bare().chords, ...bare().chords] }; // 8 compassos
  for (const style of STYLES) {
    for (const beat of style.beats) {
      for (const drumVariation of [0, 1, 2, 3]) {
      const text = generateGroove(data, { style, drums: beat.id, drumVariation }).drums;
      assert.deepEqual(parseDrums(text).errors, [], `${style.id}/${beat.id}`);
      const { project } = loadProject({ ...data, drums: text });
      const notes = drumNotes(project, 8 * 1920);
      const hats = notes.filter((n) => [42, 46, 51, 53].includes(n[2]));
      if (hats.length >= 16) assert.ok(new Set(hats.map((n) => n[3])).size >= 3, `${style.id}/${beat.id}: chimbal com pelo menos 3 velocities`);
      // a virada do último compasso: pelo menos 4 toques e duas peças
      const tail = notes.filter((n) => n[0] >= 7 * 1920 + 960 && ![42, 44, 46, 51, 53, 49].includes(n[2]));
      assert.ok(tail.length >= 4 && new Set(tail.map((n) => n[2])).size >= 2, `${style.id}/${beat.id}: virada cheia no fim (${tail.length} toques)`);
      }
    }
    assert.ok(style.fills.some((f) => parseDrums(f).bars[0][0].ticks === 960), `${style.id}: tem virada de dois tempos`);
  }
});

// Perfis de fraseado (kb/fraseado.js): "anterior" = antes do Weimar (para o rollback); "weimar" = o perfil em uso.
const degreeShares = (perfil, { chords, kinds, degreesOf, rest = false }) => {
  const mod = (n) => ((n % 12) + 12) % 12;
  const out = {};
  for (const style of STYLES) {
    for (let variation = 0; variation < 8; variation++) {
      for (const tempo of [80, 140]) {
        const data = structuredClone({ ...VARIED, tempo, chords: VARIED.chords.concat(chords) });
        const made = generateGroove(data, { style, phrases: true, variation, perfil }).chords;
        data.chords.forEach((c, i) => Object.assign(c, made[i]));
        for (const chord of loadProject(data).project.chords) {
          const kind = kinds[chord.symbol];
          if (!kind) continue;
          const root = degreesOf[chord.symbol];
          for (const e of chord.phrase_events) {
            if (rest ? e.length < 480 : e.start % 960 !== 0) continue; // repouso: nota de 1 tempo ou mais; senão, tempos 1 e 3
            const bucket = (out[kind] ??= { total: 0 });
            bucket.total += 1;
            const degree = mod(e.note.midi - root);
            bucket[degree] = (bucket[degree] ?? 0) + 1;
          }
        }
      }
    }
  }
  return (kind, degrees) => degrees.reduce((n, d) => n + (out[kind][d] ?? 0), 0) / out[kind].total;
};
const EXTRA = [
  { symbol: "Dmaj9", left_hand: "D3 A3", right_hand: "F#4 C#5 E5", duration_beats: 4, phrase_scale: "D E F# G A B C#" },
  { symbol: "G7", left_hand: "G2 F3", right_hand: "B3 E4 A4", duration_beats: 4, phrase_scale: "G A B C D E F" },
];
const ROOTS = { Dm9: 2, Am9: 9, Cmaj9: 0, "Fmaj7#11": 5, Dmaj9: 2, G13: 7, G7: 7, A7alt: 9, E7b9: 4 };
const KINDS = { Dm9: "menor", Am9: "menor", Cmaj9: "maior", "Fmaj7#11": "maior", Dmaj9: "maior", G13: "dominante", G7: "dominante", A7alt: "alterado", E7b9: "alterado" };

test("perfil weimar: menores mantêm 9ª e 11ª no tempo forte; maiores não dominantes gostam da 7ª maior; dominantes ganham 9ª e 13ª", () => {
  const share = degreeShares("weimar", { chords: EXTRA, kinds: KINDS, degreesOf: ROOTS });
  assert.ok(share("menor", [2, 5]) >= 0.4, `menores em 9ª ou 11ª: ${share("menor", [2, 5])}`); // a frequência que o dono gosta
  assert.ok(share("maior", [11]) >= 0.2, `7ª maior nos maiores: ${share("maior", [11])}`);
  assert.ok(share("maior", [11]) > share("maior", [2]), "nos maiores, a 7ª maior vem antes da 9ª");
  assert.ok(share("dominante", [2, 9]) >= 0.1, `9ª e 13ª nos dominantes: ${share("dominante", [2, 9])}`);
  const anterior = degreeShares("anterior", { chords: EXTRA, kinds: KINDS, degreesOf: ROOTS });
  assert.ok(share("dominante", [2, 9]) > 3 * anterior("dominante", [2, 9]), "os dominantes usam bem mais 9ª e 13ª que antes");
});

test("perfil weimar: nos dominantes alterados o solo repousa nas tensões características (b9, #9, #11, b13)", () => {
  const weimar = degreeShares("weimar", { chords: EXTRA, kinds: KINDS, degreesOf: ROOTS, rest: true });
  const anterior = degreeShares("anterior", { chords: EXTRA, kinds: KINDS, degreesOf: ROOTS, rest: true });
  const alt = [1, 3, 6, 8];
  assert.ok(weimar("alterado", alt) >= 0.4, `repouso em tensão alterada: ${weimar("alterado", alt)}`);
  assert.ok(weimar("alterado", alt) > 2 * anterior("alterado", alt), "bem mais que no perfil anterior");
});

test("rollback: o perfil anterior guarda os pesos de antes do Weimar, e o perfil ativo é um dos dois", () => {
  assert.ok(["anterior", "weimar"].includes(PERFIL_ATIVO));
  assert.deepEqual(Object.keys(PERFIS).sort(), ["anterior", "lofi", "pop", "rock", "weimar"]);
  const a = PERFIS.anterior;
  assert.equal(a.tensoes.alterada, 1);
  assert.equal(a.repousoNaTensao, 1);
  assert.equal(a.tercaBlue, false);
  assert.deepEqual(a.pesos.menor.forte, PERFIS.weimar.pesos.menor.forte, "os menores são iguais nos dois perfis");
  // o mesmo pedido, com o perfil anterior, nunca muda quando se escolhe o perfil ativo explicitamente
  const again = (perfil) => generateGroove(bare(), { style: findStyle("bossa"), phrases: true, variation: 3, perfil }).chords.map((c) => c.phrase).join("|");
  assert.equal(again("anterior"), again("anterior"));
  assert.equal(again(PERFIL_ATIVO), again(undefined));
});

test("lo-fi: estilo calmo, com duetos, motivos rítmicos e bateria atrasada que não perde o chimbal", () => {
  const lofi = findStyle("lofi");
  assert.equal(lofi.label, "Lo-fi");
  assert.ok(lofi.influences.includes("Nujabes") && lofi.influences.includes("J Dilla"));
  // calmo: menos notas por segundo que os outros estilos (a 80 BPM), com duetos em boa parte das notas
  const profile = (style) => {
    let notes = 0, duets = 0, seconds = 0;
    for (let variation = 0; variation < 8; variation++) {
      const data = structuredClone({ ...VARIED, tempo: 80 });
      const made = generateGroove(data, { style, phrases: true, variation }).chords;
      data.chords.forEach((c, i) => Object.assign(c, made[i]));
      for (const chord of loadProject(data).project.chords) {
        notes += chord.phrase_events.length;
        duets += new Set(chord.phrase_extra.map((e) => e.start)).size;
        seconds += (chord.duration_beats * 60) / 80;
      }
    }
    return { perSecond: notes / seconds, duets: duets / notes };
  };
  const calm = profile(lofi);
  // (a balada também é calma de propósito: fica fora da comparação)
  for (const other of STYLES.filter((s) => s.id !== "lofi" && !s.phrase.shift)) assert.ok(calm.perSecond < profile(other).perSecond, `lo-fi mais calmo que ${other.id}`);
  assert.ok(calm.duets >= 0.4, `duetos em ${(calm.duets * 100).toFixed(0)}% das notas`);
  // motivos rítmicos: o ritmo de um trecho volta logo em seguida (mais que na média dos outros estilos)
  const returns = (style) => {
    let hits = 0, total = 0;
    for (let variation = 0; variation < 8; variation++) {
      const data = structuredClone({ ...VARIED, tempo: 80 });
      const made = generateGroove(data, { style, phrases: true, variation }).chords;
      data.chords.forEach((c, i) => Object.assign(c, made[i]));
      const ev = loadProject(data).project.chords.flatMap((c, ci) => c.phrase_events.map((e) => ({ ...e, start: e.start + ci * 1920 })));
      const iois = ev.slice(1).map((e, i) => e.start - ev[i].start);
      for (let i = 0; i + 4 <= iois.length; i++) {
        total += 1;
        const w = iois.slice(i, i + 2).join();
        for (let j = i + 2; j < Math.min(iois.length - 1, i + 8); j++) if (iois.slice(j, j + 2).join() === w) { hits += 1; break; }
      }
    }
    return hits / total;
  };
  assert.ok(returns(lofi) >= 0.5, `ritmo que volta: ${returns(lofi)}`);
  // bateria: toques atrasados (fora da grade) e chimbal com várias velocidades, em todos os beats
  const data = { ...bare(), chords: [...bare().chords, ...bare().chords] };
  for (const beat of lofi.beats) {
    const text = generateGroove(data, { style: lofi, drums: beat.id, drumVariation: 1 }).drums;
    assert.deepEqual(parseDrums(text).errors, [], beat.id);
    const notes = drumNotes(loadProject({ ...data, drums: text }).project, 8 * 1920);
    // na grade da bateria todos os toques caem em múltiplos de 40 ticks; os atrasados saem 12 (">") ou 24 (">>") depois
    const delayed = notes.filter((n) => n[0] % 40 !== 0);
    assert.ok(delayed.every((n) => [12, 24].includes(n[0] % 40)), `${beat.id}: atrasos só de 12 ou 24 ticks`);
    assert.ok(delayed.length >= 20, `${beat.id}: ${delayed.length} toques um pouquinho atrasados`);
    const hats = notes.filter((n) => [42, 46, 51, 53].includes(n[2]));
    assert.ok(new Set(hats.map((n) => n[3])).size >= 3, `${beat.id}: chimbal com dinâmica`);
    assert.ok(hats.length >= 16, `${beat.id}: chimbal presente`);
  }
});

test("lo-fi e o rollback do Weimar: o lo-fi tem perfil próprio e não muda com o PERFIL_ATIVO", () => {
  assert.equal(PERFIL_POR_ESTILO.lofi, "lofi");
  assert.equal(perfilDoEstilo("lofi"), PERFIS.lofi);
  assert.equal(perfilDoEstilo("lofi", undefined), PERFIS.lofi);
  // os outros estilos seguem o perfil ativo (e podem ser forçados, para testes)
  // rock, metal, worship, balada e disco também têm perfil próprio (guitarra e pop): nada do Weimar entra neles
  assert.deepEqual(PERFIL_POR_ESTILO, { lofi: "lofi", rock: "rock", metal: "rock", worship: "pop", balada: "pop", disco: "pop" });
  for (const [id, perfil] of Object.entries(PERFIL_POR_ESTILO)) assert.equal(perfilDoEstilo(id), PERFIS[perfil]);
  for (const style of STYLES.filter((s) => !PERFIL_POR_ESTILO[s.id])) {
    assert.equal(perfilDoEstilo(style.id), PERFIS[PERFIL_ATIVO]);
    assert.equal(perfilDoEstilo(style.id, "anterior"), PERFIS.anterior);
  }
  // simula o rollback: forçando "anterior" nos outros estilos, o lo-fi fica igual; nos outros, muda
  const phrases = (style, perfil) => generateGroove(structuredClone(VARIED), { style, phrases: true, variation: 2, perfil }).chords.map((c) => c.phrase).join("|");
  const lofi = findStyle("lofi");
  assert.equal(phrases(lofi, undefined), phrases(lofi, "lofi"));
  const jazz = findStyle("swing");
  assert.notEqual(phrases(jazz, "anterior"), phrases(jazz, "weimar"));
  // o perfil do lo-fi é uma dose pequena do Weimar: sem blue notes, tensões de dominante só como cor
  assert.equal(PERFIS.lofi.tercaBlue, false);
  assert.ok(PERFIS.lofi.tensoes.alterada > PERFIS.anterior.tensoes.alterada && PERFIS.lofi.tensoes.alterada < PERFIS.weimar.tensoes.alterada);
  assert.ok(PERFIS.lofi.repousoNaTensao > 1 && PERFIS.lofi.repousoNaTensao < PERFIS.weimar.repousoNaTensao);
});

test("controles das viradas: a frequência e a liberdade mudam a bateria e o baixo; o padrão não muda nada", async () => {
  const { generateGroove: gen } = await import("../../harmonalab/web/engine/groove.js");
  const { STYLES: all } = await import("../../harmonalab/web/kb/estilos.js");
  const style = all.find((s) => s.id === "gospel");
  const chords = Array.from({ length: 16 }, (_, i) => ({ symbol: i % 2 ? "F" : "C", duration_beats: 4, left_hand: [i % 2 ? "F2" : "C3"], right_hand: i % 2 ? ["A3", "C4", "E4"] : ["E4", "G4", "B4"], phrase_scale: i % 2 ? "F G A Bb C D E" : "C D E F G A B" }));
  const data = { tempo: 90, time_signature: "4/4", chords };
  const run = (bassFill, drumFill) => gen(data, { style, drums: style.beats[0].id, bass: style.bass[0].id, bassFill, drumFill });
  const base = run({}, {});
  assert.deepEqual(run({ frequency: "normal", freedom: "normal" }, { frequency: "normal", freedom: "normal" }), base, "normal = como sempre foi");
  const beat = (r) => r.drums.split("|").map((b) => b.trim());
  const fillBars = (r) => { const plain = beat(run({}, { frequency: "sem" })); return beat(r).filter((b, i) => b.replace(/ ; C!\/4 r\/\S+$/, "") !== plain[i]).length; };
  assert.equal(fillBars(run({}, { frequency: "sem" })), 0);
  assert.ok(fillBars(run({}, { frequency: "poucas" })) < fillBars(base), "poucas < normal");
  assert.ok(fillBars(run({}, { frequency: "muitas" })) > fillBars(base), "muitas > normal");
  assert.notEqual(run({}, { freedom: "contido" }).drums, run({}, { freedom: "solto" }).drums);
  const notes = (r) => r.chords.reduce((n, c) => n + c.bass_line.split(" ").length, 0);
  const top = (r) => Math.max(...r.chords.flatMap((c) => c.bass_line.split(" ").filter((t) => !t.startsWith("r/")).map((t) => Number(t.match(/-?\d+(?=\/)/)[0]))));
  assert.ok(notes(run({ frequency: "sem" }, {})) < notes(base), "sem viradas, o baixo tem menos notas");
  assert.ok(notes(run({ frequency: "muitas" }, {})) >= notes(base));
  assert.ok(top(run({ frequency: "muitas", freedom: "solto" }, {})) >= top(run({ frequency: "muitas", freedom: "contido" }, {})), "solto chega mais agudo que contido");
  // baixo de 4 cordas: nada abaixo do Mi 1, mesmo com as viradas soltas
  const { loadProject } = await import("../../harmonalab/web/engine/model.js");
  const wild = run({ frequency: "muitas", freedom: "solto" }, {});
  const { project } = loadProject({ ...data, chords: chords.map((c, i) => ({ ...c, bass_line: wild.chords[i].bass_line })) });
  assert.ok(project.chords.every((c) => c.bass_events.every((e) => e.note.midi >= 28)), "nenhuma nota abaixo do E1");
});

test("virtuoso: as corridas seguem o andamento (fusas a 60 BPM, semicolcheias a 160), sem passar do que a mão toca", () => {
  const song = { ...structuredClone(VARIED), chords: [...structuredClone(VARIED).chords, ...structuredClone(VARIED).chords] };
  const measure = (style, tempo, intensity, variation) => {
    const out = generateGroove({ ...structuredClone(song), tempo }, { style, phrases: true, variation, intensity });
    const beat = 60 / tempo;
    const onsets = [];
    let at = 0;
    let shortest = 9;
    let jumps = 0;
    let fast = 0;
    let previous = null;
    out.chords.forEach((made, i) => {
      for (const e of parsePhraseText(made.phrase || "", "C4").events) {
        if (e.voice !== 0) continue;
        const seconds = (e.length / 480) * beat;
        onsets.push(at + (e.start / 480) * beat);
        shortest = Math.min(shortest, seconds);
        if (seconds <= 0.14 && previous?.quick) { fast += 1; if (Math.abs(e.note.midi - previous.midi) > 7) jumps += 1; }
        previous = { midi: e.note.midi, quick: seconds <= 0.14 };
        assert.ok(e.note.midi >= 52 && e.note.midi <= 96, `${style.id} ${tempo}: nota fora do alcance (${e.token})`);
      }
      at += song.chords[i].duration_beats * beat;
    });
    let peak = 0;
    for (let t = 0; t + 1 <= at; t += 0.25) peak = Math.max(peak, onsets.filter((o) => o >= t && o < t + 1).length);
    return { mean: onsets.length / at, peak, shortest, jumps, fast, text: out.chords.map((c) => c.phrase).join(" ") };
  };
  for (const style of STYLES) {
    if (style.phrase.shift) continue; // o lo-fi é calmo de propósito
    for (const tempo of [60, 80, 100, 130, 170]) {
      const runs = [0, 1, 2].map((variation) => measure(style, tempo, "virtuoso", variation));
      const calm = [0, 1, 2].map((variation) => measure(style, tempo, "equilibrado", variation));
      const mean = (list) => list.reduce((n, r) => n + r.mean, 0) / list.length;
      const peak = Math.max(...runs.map((r) => r.peak));
      assert.ok(peak >= 8, `${style.id} a ${tempo} BPM: o pico do virtuoso é de ${peak} notas por segundo`);
      // em andamento lento a diferença é grande; no rápido, o equilibrado já é denso e ela encolhe
      assert.ok(mean(runs) > mean(calm) * (tempo <= 100 ? 1.25 : 1.08), `${style.id} a ${tempo} BPM: virtuoso ${mean(runs).toFixed(1)} x equilibrado ${mean(calm).toFixed(1)} notas por segundo`);
      // o teto: nenhuma nota mais curta que ~1/13 de segundo (acima disso ninguém toca com clareza)
      for (const r of runs) assert.ok(r.shortest >= 1 / 13.5, `${style.id} a ${tempo} BPM: nota de ${(r.shortest * 1000).toFixed(0)} ms`);
      const jumps = runs.reduce((n, r) => n + r.jumps, 0);
      const fast = runs.reduce((n, r) => n + r.fast, 0);
      assert.ok(jumps <= fast * 0.02, `${style.id} a ${tempo} BPM: ${jumps} saltos grandes em ${fast} notas de corrida`);
    }
  }
  // varreduras: de vez em quando uma corrida corre duas oitavas (24 semitons) de uma vez; a maioria fica em torno de uma
  const spans = [];
  for (const style of STYLES) {
    if (style.phrase.shift) continue;
    for (const tempo of [70, 120]) {
      for (let variation = 0; variation < 4; variation++) {
        const out = generateGroove({ ...structuredClone(song), tempo }, { style, phrases: true, variation, intensity: "virtuoso" });
        const beat = 60 / tempo;
        let at = 0;
        let run = [];
        let last = -9;
        const close = () => { if (run.length >= 6) spans.push(Math.max(...run) - Math.min(...run)); run = []; };
        out.chords.forEach((made, i) => {
          for (const e of parsePhraseText(made.phrase || "", "C4").events) {
            if (e.voice !== 0) continue;
            const t = at + (e.start / 480) * beat;
            if (t - last >= 0.2) close();
            run.push(e.note.midi);
            last = t;
          }
          at += song.chords[i].duration_beats * beat;
        });
        close();
      }
    }
  }
  const share = (k) => spans.filter((x) => x >= k).length / spans.length;
  assert.ok(share(24) >= 0.05 && share(24) <= 0.3, `corridas de duas oitavas: ${(100 * share(24)).toFixed(0)}%`);
  assert.ok(share(12) >= 0.5, `corridas de uma oitava ou mais: ${(100 * share(12)).toFixed(0)}%`);
  const slow = measure(findStyle("gospel"), 60, "virtuoso", 0).text;
  const quick = measure(findStyle("gospel"), 170, "virtuoso", 0).text;
  assert.ok(/\/32/.test(slow), "a 60 BPM o virtuoso usa fusas");
  assert.ok(!/\/32/.test(quick) && !/\/16t/.test(quick), "a 170 BPM, nada de fusas nem sextinas");
});

test("rock e metal: o dobro de baterias dos outros estilos, várias com bumbo duplo", () => {
  const data = { ...bare(), chords: [...bare().chords, ...bare().chords] };
  const most = Math.max(...STYLES.filter((s) => !["rock", "metal"].includes(s.id)).map((s) => s.beats.length));
  for (const id of ["rock", "metal"]) {
    const style = findStyle(id);
    assert.ok(style.beats.length >= 8 && style.beats.length >= 2 * (most - 1), `${id}: ${style.beats.length} baterias`);
    assert.equal(new Set(style.beats.map((b) => b.id)).size, style.beats.length, `${id}: ids repetidos`);
    let double = 0;
    for (const beat of style.beats) {
      const text = generateGroove(data, { style, drums: beat.id }).drums;
      assert.deepEqual(parseDrums(text).errors, [], `${id}/${beat.id}`);
      const { project } = loadProject({ ...data, drums: text });
      const kicks = drumNotes(project, 8 * 1920).filter((n) => n[2] === 36 && n[0] < 2 * 1920).map((n) => n[0]).sort((a, b) => a - b);
      // bumbo duplo: pelo menos 4 bumbos seguidos a uma semicolcheia (ou menos) um do outro
      let run = 1;
      let best = 1;
      for (let i = 1; i < kicks.length; i++) { run = kicks[i] - kicks[i - 1] <= 120 ? run + 1 : 1; best = Math.max(best, run); }
      if (best >= 4) double += 1;
    }
    assert.ok(double >= 3, `${id}: ${double} baterias com bumbo duplo`);
  }
});
