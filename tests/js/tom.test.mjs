import test from "node:test";
import assert from "node:assert/strict";
import { bestShift, describeShift, makeKey, parseKey, readShift, shiftKey, transposeChord, transposeNames, transposeNotes, transposeSymbol } from "../../harmonalab/web/tom.js";

test("lê tons escritos de vários jeitos", () => {
  assert.equal(parseKey("Am").name, "Am");
  assert.equal(parseKey("Bb").name, "Bb");
  assert.equal(parseKey("F# menor").name, "F#m");
  assert.equal(parseKey("Lá menor").name, "Am");
  assert.equal(parseKey("Si bemol maior").name, "Bb");
  assert.equal(parseKey("C major").name, "C");
  assert.equal(parseKey("Cmaj").name, "C");
  assert.equal(parseKey("Ebm").name, "Ebm");
  assert.equal(parseKey("D#m").name, "Ebm");
  assert.equal(parseKey("Bm").long, "Si menor");
  assert.equal(parseKey("Bb").long, "Si bemol maior");
  assert.equal(parseKey(""), null);
  assert.equal(parseKey("livre"), null);
});

test("modulação: o nome por extenso é do app e o número aceita menos", () => {
  const am = parseKey("Am");
  assert.equal(shiftKey(am, 2).name, "Bm");
  assert.equal(shiftKey(am, -3).name, "F#m");
  assert.equal(describeShift(am, 0), "Lá menor (o tom da música)");
  assert.equal(describeShift(am, 2), "Lá menor → Si menor (2 semitons acima)");
  assert.equal(describeShift(am, -1), "Lá menor → Sol sustenido menor (1 semitom abaixo)");
  assert.equal(readShift("-3"), -3);
  assert.equal(readShift("+2"), 2);
  assert.equal(readShift(""), 0);
  assert.equal(readShift("abc"), 0);
  assert.equal(readShift("40"), 11);
  assert.equal(readShift("2,4"), 2);
});

test("a escala do tom menor inclui a sensível", () => {
  assert.deepEqual([...makeKey(9, "menor").scale].sort((a, b) => a - b), [0, 2, 4, 5, 7, 8, 9, 11]);
});

test("descobre a modulação pelas notas", () => {
  const am = parseKey("Am");
  const weights = (pcs) => { const w = new Array(12).fill(0); for (const pc of pcs) w[pc] += 1; return w; };
  assert.equal(bestShift(am, weights([9, 11, 0, 2, 4, 5, 7, 9, 9])), 0);
  assert.equal(bestShift(am, weights([11, 1, 2, 4, 6, 7, 9, 11, 11])), 2);
  assert.equal(bestShift(am, weights([7, 9, 10, 0, 2, 3, 5, 7, 7])), -2);
});

test("transpõe notas, nomes e cifras", () => {
  assert.equal(transposeNotes("A2 G3", 2), "B2 A3");
  assert.equal(transposeNotes("B3 C4", 1), "C4 C#4");
  assert.equal(transposeNotes("C4 Db4", -1, true), "B3 C4");
  assert.equal(transposeNotes("E2&B2&E3/8 r/4 C5/4*alvo D5/2+4", 3, true), "G2&D3&G3/8 r/4 Eb5/4*alvo F5/2+4");
  assert.equal(transposeNames("B C D Eb F G A", 2), "C# D E F G A B");
  assert.equal(transposeNames("Alterada: C menor melódica a partir de B", 2), "Alterada: D menor melódica a partir de C#");
  assert.equal(transposeSymbol("Dbmaj7/Ab", 2, true), "Ebmaj7/Bb");
  assert.equal(transposeSymbol("C6/9", 2), "D6/9");
  assert.equal(transposeSymbol("B7alt", 1), "C7alt");
  assert.equal(transposeSymbol("Am7", -2), "Gm7");
  const chord = transposeChord({ symbol: "Am7", bass: "", left_hand: "A2 G3", right_hand: "C4 E4", phrase: "A4/4 r/4 C5/2", phrase_scale: "A B C D E F G", comp: "x-x-", function: "i7", duration_beats: 4 }, 2);
  assert.deepEqual(chord, { symbol: "Bm7", bass: "", left_hand: "B2 A3", right_hand: "D4 F#4", phrase: "B4/4 r/4 D5/2", phrase_scale: "B C# D E F# G A", comp: "x-x-", function: "i7", duration_beats: 4 });
  assert.equal(transposeChord({ symbol: "Pausa", left_hand: "" }, 3).symbol, "Pausa");
  // ida e volta devolve as mesmas alturas
  assert.equal(transposeNotes(transposeNotes("F#3 A#3 C#4", 5), -5), "F#3 A#3 C#4");
});
