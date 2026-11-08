// Voicings à mão (fechado, aberto, drop 2, drop 3, ponta pedal). Rodam com: node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";

import { noteName, parseNote, parseNoteList, pitchClass } from "../../harmonalab/web/engine/pitch.js";
import { VOICINGS, applyVoicing, revoiceChord, withPedalTop } from "../../harmonalab/web/engine/voicing.js";

const notes = (text, mc = "C4") => parseNoteList(text, mc).notes;
const names = (list, mc = "C4") => list.map((n) => noteName(n, mc)).join(" ");
const voiced = (text, kind) => names(applyVoicing(notes(text), kind));

test("fechado: uma de cada nota, tudo dentro de uma oitava sob a ponta", () => {
  assert.equal(voiced("E3 G3 B3 D4 F#4", "closed"), "G3 B3 D4 E4 F#4"); // o E sobe para ficar junto da ponta
  assert.equal(voiced("C4 E4 G4 B4", "closed"), "C4 E4 G4 B4");
  assert.equal(voiced("C4 E4 G4 C5", "closed"), "E4 G4 C5"); // a dobra do dó vira uma nota só
});

test("drop 2 e drop 3: a 2ª e a 3ª nota de cima descem uma oitava", () => {
  assert.equal(voiced("C4 E4 G4 B4", "drop2"), "G3 C4 E4 B4");
  assert.equal(voiced("C4 E4 G4 B4", "drop3"), "E3 C4 G4 B4");
  assert.equal(voiced("E3 G3 B3 D4 F#4", "drop2"), "E3 G3 B3 D4 F#4");
  assert.equal(voiced("E3 G3 B3 D4 F#4", "drop3"), "D3 G3 B3 E4 F#4");
});

test("aberto: drop 2 e 4 com 4 notas ou mais; drop 2 em tríades", () => {
  assert.equal(voiced("C4 E4 G4 B4", "open"), "C3 G3 E4 B4");
  assert.equal(voiced("E3 G3 B3 D4 F#4", "open"), "B2 E3 G3 D4 F#4");
  assert.equal(voiced("C4 E4 G4", "open"), "E3 C4 G4");
});

test("a grafia das notas é preservada e só a oitava muda", () => {
  assert.equal(voiced("D4 Eb4 G4 C5", "drop2"), "G3 D4 Eb4 C5");
  assert.equal(voiced("Db4 F4 Ab4 C5", "drop2"), "Ab3 Db4 F4 C5");
  assert.equal(voiced("F#4 A4 C#5 E5", "drop3"), "A3 F#4 C#5 E5");
});

test("com poucas notas, o voicing não se aplica", () => {
  assert.equal(applyVoicing(notes("C4"), "drop2"), null);
  assert.equal(applyVoicing(notes("C4 G4"), "drop3"), null);
  assert.equal(names(applyVoicing(notes("C4 G4"), "drop2")), "C3 G4");
  assert.throws(() => applyVoicing(notes("C4 E4 G4"), "desconhecido"), /desconhecido/);
});

test("ponta pedal: a nota fica no topo e as outras se arrumam sob ela", () => {
  assert.equal(names(withPedalTop(notes("D4 Eb4 G4 C5"), parseNote("F#5"))), "G4 C5 D5 Eb5 F#5");
  assert.equal(names(withPedalTop(notes("D4 Eb4 G4 C5"), parseNote("C5"))), "D4 Eb4 G4 C5"); // a ponta já era essa
});

test("propriedades: ponta preservada, mesmas notas, sem repetir, ordenado, dentro do MIDI", () => {
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let round = 0; round < 400; round++) {
    const count = 2 + Math.floor(random() * 5);
    const midis = new Set();
    while (midis.size < count) midis.add(48 + Math.floor(random() * 36));
    const original = [...midis].map((midi) => parseNoteList(String(midi)).notes[0]);
    const top = Math.max(...midis);
    const pcs = new Set(original.map(pitchClass));
    for (const { id } of VOICINGS) {
      const out = applyVoicing(original, id);
      if (!out) continue; // acordes pequenos demais para o drop
      assert.equal(Math.max(...out.map((n) => n.midi)), top, `${id}: ponta mudou em ${midis}`);
      assert.deepEqual(new Set(out.map(pitchClass)), pcs, `${id}: mudou as notas em ${midis}`);
      assert.deepEqual(out.map((n) => n.midi), [...new Set(out.map((n) => n.midi))].sort((a, b) => a - b), `${id}: repetida ou fora de ordem`);
      assert.ok(out.every((n) => n.midi >= 0 && n.midi <= 127));
    }
  }
});

test("revoiceChord trabalha sobre os campos de texto do app", () => {
  assert.deepEqual(revoiceChord({ right_hand: "C4 E4 G4 B4" }, { kind: "drop2" }), { field: "right_hand", text: "G3 C4 E4 B4", added: false, top: "B4" });
  assert.deepEqual(revoiceChord({ right_hand: "", notes: "C4 E4 G4 B4" }, { kind: "drop3" }), { field: "notes", text: "E3 C4 G4 B4", added: false, top: "B4" });
  assert.deepEqual(revoiceChord({ right_hand: "D4 Eb4 G4 C5" }, { pedal: "F#5" }), { field: "right_hand", text: "G4 C5 D5 Eb5 F#5", added: true, top: "F#5" });
  assert.deepEqual(revoiceChord({ right_hand: "D4 Eb4 G4 C5" }, { pedal: "C5" }), { field: "right_hand", text: "D4 Eb4 G4 C5", added: false, top: "C5" });
  assert.equal(revoiceChord({ right_hand: "D4 Eb4 G4 C5" }, { pedal: "F#5", kind: "drop2" }).text, "Eb4 G4 C5 D5 F#5"); // pedal e depois drop 2
  // convenção C3: as notas mudam de nome, não de tecla
  assert.equal(revoiceChord({ right_hand: "C3 E3 G3 B3" }, { kind: "drop2", middleC: "C3" }).text, "G2 C3 E3 B3");
});

test("revoiceChord avisa quando não dá para aplicar", () => {
  assert.deepEqual(revoiceChord({ right_hand: "", notes: "" }, { kind: "drop2" }), { skipped: "sem notas na mão direita" });
  assert.deepEqual(revoiceChord({ right_hand: "C4 H4" }, { kind: "drop2" }), { skipped: "notas com erro" });
  assert.deepEqual(revoiceChord({ right_hand: "C4" }, { kind: "drop2" }), { skipped: "poucas notas para esse voicing" });
  assert.deepEqual(revoiceChord({ right_hand: "C4 E4" }, {}), { skipped: "nada a fazer" });
});
