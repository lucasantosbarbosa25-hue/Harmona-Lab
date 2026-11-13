import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendSection, emptyLastSection, joinSection, moveSection, nextSectionName, removeSection, renameSection, repeatSection,
  sectionBlocks, splitSection, voiceNotes, voiceTextOf,
} from "../../harmonalab/web/partes.js";

const chord = (symbol, extra = {}) => ({ id: symbol, symbol, duration_beats: 4, section: "", ...extra });
const song = () => ({
  middle_c: "C4",
  chords: [chord("C", { section: "A" }), chord("F"), chord("G", { section: "B" }), chord("Am"), chord("Dm", { section: "C", duration_beats: 2 })],
  voice: "C4/1 F4/2 A4/2 G4/1 A4/2+4 C5/4 D4/2",
});
const names = (chords) => sectionBlocks(chords).map((b) => `${b.name}:${chords.slice(b.from, b.to).map((c) => c.symbol).join("-")}`).join(" ");

test("blocos: cada marca começa uma parte; sem marca nenhuma, é tudo a parte A", () => {
  assert.equal(names(song().chords), "A:C-F B:G-Am C:Dm");
  assert.deepEqual(sectionBlocks(song().chords).map((b) => [b.beats, b.startBeat]), [[8, 0], [8, 8], [2, 16]]);
  assert.equal(names([chord("C"), chord("F")]), "A:C-F");
  assert.equal(nextSectionName(song().chords), "D");
  assert.equal(nextSectionName([chord("C")]), "B");
});

test("o texto da Voz vai e volta sem mudar", () => {
  const text = "r/4 A4/4 C5/8 D5/8 E5/2 Bb4/4+8 r/8 F#4/2";
  assert.equal(voiceTextOf(voiceNotes(text)), text);
  assert.equal(voiceNotes("A4/4 Hx/4"), null);
});

test("mover uma parte leva os acordes e a melodia dela junto", () => {
  const moved = moveSection(song(), 1, 0);
  assert.equal(names(moved.chords), "B:G-Am A:C-F C:Dm");
  assert.equal(moved.voice, "G4/1 A4/2+4 C5/4 C4/1 F4/2 A4/2 D4/2");
  assert.equal(moveSection(song(), 0, 0), null);
  const back = moveSection({ ...song(), ...moved }, 0, 1);
  assert.equal(back.voice, song().voice);
  assert.equal(names(back.chords), names(song().chords));
});

test("repetir copia a parte logo depois, com a melodia; apagar tira os dois", () => {
  const twice = repeatSection(song(), 0);
  assert.equal(names(twice.chords), "A:C-F A:C-F B:G-Am C:Dm");
  assert.equal(twice.voice, "C4/1 F4/2 A4/2 C4/1 F4/2 A4/2 G4/1 A4/2+4 C5/4 D4/2");
  assert.ok(twice.chords.slice(2, 4).every((c) => c.id === undefined), "as cópias vêm sem id");
  const less = removeSection(song(), 1);
  assert.equal(names(less.chords), "A:C-F C:Dm");
  assert.equal(less.voice, "C4/1 F4/2 A4/2 D4/2");
  assert.equal(removeSection({ middle_c: "C4", chords: [chord("C")], voice: "" }, 0), null);
});

test("nota que atravessa a divisa fica na parte onde começa, cortada no fim dela", () => {
  const project = { middle_c: "C4", chords: [chord("C", { section: "A" }), chord("G", { section: "B" })], voice: "r/2 E4/1 G4/2" };
  const moved = moveSection(project, 0, 1);
  assert.equal(moved.voice, "r/2 G4/2 r/2 E4/2");
});

test("renomear, dividir e juntar só mexem nas marcas", () => {
  assert.equal(names(renameSection(song().chords, 1, "Refrão")), "A:C-F Refrão:G-Am C:Dm");
  assert.equal(names(splitSection(song().chords, 1)), "A:C D:F B:G-Am C:Dm");
  assert.equal(splitSection(song().chords, 2), null, "já começa uma parte ali");
  assert.equal(names(splitSection([chord("C"), chord("F")], 1)), "A:C B:F");
  assert.equal(names(joinSection(song().chords, 1)), "A:C-F-G-Am C:Dm");
  const one = joinSection([chord("C", { section: "A" }), chord("F", { section: "B" })], 1);
  assert.deepEqual(one.map((c) => c.section), ["", ""]);
});

test("parte nova no fim: compassos vazios marcados e a melodia depois da que já existe", () => {
  const project = { middle_c: "C4", chords: [chord("C"), chord("F")], voice: "C4/1 F4/2" };
  const spell = (midi) => ({ 67: "G4", 69: "A4", 72: "C5" })[midi];
  const blank = (extra) => ({ symbol: "", ...extra });
  const out = appendSection(project, { events: [{ beat: 0, beats: 2, midi: 67 }, { beat: 2, beats: 4, midi: 69 }], beatsPerBar: 4, spell, blankChord: blank });
  assert.equal(names(out.chords), "A:C-F B:-");
  assert.equal(out.voice, "C4/1 F4/2 r/2 G4/2 A4/1");
  assert.equal(out.bars, 2);
  assert.equal(emptyLastSection(out.chords, (c) => !c.symbol).name, "B");
  assert.equal(emptyLastSection(project.chords, (c) => !c.symbol), null);
});

test("parte nova com anacruse: as notas de antes do tempo 1 entram no fim da parte anterior, e a voz antiga cede lugar", () => {
  const project = { middle_c: "C4", chords: [chord("C"), chord("F")], voice: "C4/1 F4/1" };
  const spell = (midi) => ({ 67: "G4", 69: "A4" })[midi];
  // o canto veio com 1 compasso de anacruse (4 tempos): G4 no tempo 4 da contagem, A4 no tempo 1 da parte nova
  const out = appendSection(project, {
    events: [{ beat: 3, beats: 1, midi: 67 }, { beat: 4, beats: 4, midi: 69 }], pickup: 4, beatsPerBar: 4, spell, blankChord: (extra) => ({ symbol: "", ...extra }),
  });
  assert.equal(out.voice, "C4/1 F4/2+4 G4/4 A4/1");
  assert.equal(out.bars, 1);
  assert.equal(names(out.chords), "A:C-F B:");
});
