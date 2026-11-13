import assert from "node:assert/strict";
import { test } from "node:test";
import { generateGroove } from "../../harmonalab/web/engine/groove.js";
import { midiBytes, partsPresent } from "../../harmonalab/web/engine/midi.js";
import { loadProject } from "../../harmonalab/web/engine/model.js";
import { RIFF_FAMILIES, riffOptions, riffSound } from "../../harmonalab/web/engine/riff.js";
import { BUILTIN_BANKS } from "../../harmonalab/web/kb/sons.js";
import { STYLES } from "../../harmonalab/web/kb/estilos.js";

const song = () => ({
  tempo: 110, time_signature: "4/4",
  chords: [
    { symbol: "Em", duration_beats: 4, left_hand: ["E3"], right_hand: ["G4", "B4", "E5"], phrase_scale: "E F# G A B C D" },
    { symbol: "Cmaj7", duration_beats: 8, left_hand: ["C3"], right_hand: ["E4", "G4", "B4"], phrase_scale: "C D E F# G A B" },
    { symbol: "G/B", duration_beats: 2, left_hand: ["B2"], right_hand: ["D4", "G4"], phrase_scale: "G A B C D E F#" },
    { symbol: "Pausa", duration_beats: 2 },
    { symbol: "D7sus4", duration_beats: 4, left_hand: ["D3"], right_hand: ["G4", "A4", "C5"], phrase_scale: "D E F# G A B C" },
    { symbol: "Am", duration_beats: 12, left_hand: ["A2"], right_hand: ["C4", "E4", "A4"], phrase_scale: "A B C D E F# G" },
  ],
});
const make = (style, family, variation = 0, data = song()) => generateGroove(data, { style, riff: family, riffVariation: variation }).chords.map((c) => c.riff);

test("todos os estilos têm riffs, e cada família sai certa: cabe no acorde, é diatônica e não sai da região", () => {
  for (const style of STYLES) {
    const options = riffOptions(style);
    assert.ok(options.length >= 2, `${style.id}: pelo menos duas famílias de riff`);
    for (const { id, label } of options) {
      assert.ok(RIFF_FAMILIES[id] && label, `${style.id}/${id}`);
      const sound = riffSound(style, id);
      assert.ok(BUILTIN_BANKS.some((b) => b.id === sound), `${style.id}/${id}: o som sugerido (${sound}) existe`);
      for (const variation of [0, 1, 2, 3]) {
        const data = song();
        const riffs = make(style, id, variation, data);
        data.chords.forEach((c, i) => { c.riff = riffs[i]; });
        const { project, issues } = loadProject(data);
        assert.deepEqual(issues.filter((i) => i.level === "error").map((i) => i.message), [], `${style.id}/${id}/${variation}`);
        assert.equal(riffs[3], "", "acorde sem notas: sem riff");
        project.chords.forEach((chord, i) => {
          if (i === 3) return;
          assert.ok(chord.riff_events.length >= 1, `${style.id}/${id}: o acorde ${i + 1} tem riff`);
          const allowed = new Set([...chord.phrase_pcs.map((x) => x.pc), ...[...chord.left_hand, ...chord.right_hand].map((n) => n.midi % 12)]);
          for (const e of chord.riff_events) {
            assert.ok(allowed.has(e.note.midi % 12), `${style.id}/${id}: nota fora do acorde e da escala no acorde ${i + 1} (${e.token})`);
            assert.ok(e.note.midi >= 28 && e.note.midi <= 96, `${style.id}/${id}: nota fora da região (${e.token})`);
          }
        });
      }
    }
  }
});

test("é um riff: o mesmo ritmo em todos os acordes, o mesmo resultado a cada vez, e outro sorteio dá outro riff", () => {
  const style = STYLES.find((s) => s.id === "rock");
  for (const { id } of riffOptions(style)) {
    const data = song();
    const riffs = make(style, id, 0, data);
    assert.deepEqual(make(style, id, 0), riffs, "o mesmo sorteio dá o mesmo riff");
    const rhythm = (text) => text.split(" ").map((t) => (t.startsWith("r/") ? "r" : "n") + t.slice(t.indexOf("/"))).join(" ");
    // o Em (1 compasso) e o primeiro compasso do Cmaj7 e do Am têm o mesmo ritmo
    const bar = rhythm(riffs[0]);
    assert.ok(rhythm(riffs[1]).startsWith(bar), `${id}: o ritmo se repete no acorde seguinte`);
    assert.ok(rhythm(riffs[5]).startsWith(bar), `${id}: e no último`);
    const others = [1, 2, 3, 4, 5].map((v) => make(style, id, v).join("|"));
    assert.ok(new Set([riffs.join("|"), ...others]).size >= 2, `${id}: as variações mudam o riff`);
  }
  // muita combinação possível: em 30 sorteios do ostinato, pelo menos 12 riffs diferentes
  const many = new Set(Array.from({ length: 30 }, (_, v) => make(style, "ostinato", v).join("|")));
  assert.ok(many.size >= 12, `ostinato: ${many.size} riffs diferentes em 30 sorteios`);
});

test("o riff acompanha cada acorde, tem faixa própria no MIDI e a cada 4 compassos o fim varia", () => {
  const style = STYLES.find((s) => s.id === "metal");
  const riffs = make(style, "galope");
  assert.ok(riffs[0].startsWith("E2&B2&E3/") || riffs[0].startsWith("E2/"), `power chord de Mi: ${riffs[0]}`);
  assert.ok(/^C3/.test(riffs[1]) && /^A2/.test(riffs[5]), "e o de cada acorde na sua fundamental");
  const data = song();
  data.chords.forEach((c, i) => { c.riff = riffs[i]; });
  const { project } = loadProject(data);
  assert.ok(partsPresent(project).includes("riff"));
  const text = Buffer.from(midiBytes(project)).toString("latin1");
  assert.ok(text.includes("Riff"));
  assert.ok(!Buffer.from(midiBytes(project, { parts: ["acordes"] })).toString("latin1").includes("Riff"));
  // dedilhado sobre um acorde de 4 compassos: o 4º compasso termina diferente dos três primeiros
  const long = { tempo: 100, time_signature: "4/4", chords: [{ symbol: "Am", duration_beats: 16, left_hand: ["A2"], right_hand: ["C4", "E4", "A4"], phrase_scale: "A B C D E F G" }] };
  const balada = STYLES.find((s) => s.id === "balada");
  let varied = 0;
  for (let v = 0; v < 6; v++) {
    const { project: p } = loadProject({ ...long, chords: [{ ...long.chords[0], riff: make(balada, "dedilhado", v, structuredClone(long))[0] }] });
    const bars = [0, 1, 2, 3].map((b) => p.chords[0].riff_events.filter((e) => e.start >= b * 1920 && e.start < (b + 1) * 1920).map((e) => e.note.midi).join());
    assert.equal(bars[0], bars[1]);
    assert.equal(bars[1], bars[2]);
    if (bars[3] !== bars[0]) varied += 1;
  }
  assert.ok(varied >= 4, `o fim varia no 4º compasso (${varied} de 6)`);
});

test("compasso 3/4 e 6/8: o riff se ajusta ao tamanho do compasso", () => {
  for (const [signature, beats] of [["3/4", 3], ["6/8", 3], ["2/4", 2]]) {
    for (const style of STYLES) {
      const data = { tempo: 100, time_signature: signature, chords: [{ symbol: "Am", duration_beats: beats * 2, left_hand: ["A2"], right_hand: ["C4", "E4", "A4"], phrase_scale: "A B C D E F G" }] };
      for (const { id } of riffOptions(style)) {
        data.chords[0].riff = make(style, id, 0, structuredClone(data))[0];
        const { issues } = loadProject(data);
        assert.deepEqual(issues.filter((i) => i.level === "error").map((i) => i.message), [], `${signature} ${style.id}/${id}`);
      }
    }
  }
});
