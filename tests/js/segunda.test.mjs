import assert from "node:assert/strict";
import { test } from "node:test";
import { loadProject } from "../../harmonalab/web/engine/model.js";
import { SECOND_VOICE_STYLES, generateSecondVoice } from "../../harmonalab/web/engine/segunda.js";
import { STYLES } from "../../harmonalab/web/kb/estilos.js";

const song = (voice = "E5/4 G5/4 A5/2 G5/8 F5/8 E5/4 D5/2 r/4 C5/4 D5/4 E5/4 E5/1") => ({
  tempo: 80, time_signature: "4/4", voice,
  chords: [
    { symbol: "Cmaj7", duration_beats: 4, left_hand: ["C3"], right_hand: ["E4", "G4", "B4"], phrase_scale: "C D E F G A B" },
    { symbol: "Dm7", duration_beats: 4, left_hand: ["D3"], right_hand: ["F4", "A4", "C5"], phrase_scale: "D E F G A B C" },
    { symbol: "G7", duration_beats: 4, left_hand: ["G2"], right_hand: ["F4", "B4", "D5"], phrase_scale: "G A B C D E F" },
    { symbol: "Cmaj7", duration_beats: 4, left_hand: ["C3"], right_hand: ["E4", "G4", "B4"], phrase_scale: "C D E F G A B" },
  ],
});
const events = (data, text) => loadProject({ ...data, voice2: text });

test("dueto: mesma rítmica da Voz, uma sexta da escala abaixo", () => {
  const { text } = generateSecondVoice(song(), { mode: "dueto", style: { id: "gospel" } });
  assert.equal(text, "G4/4 B4/4 C5/2 B4/8 A4/8 G4/4 F4/2 r/4 E4/4 F4/4 G4/4 G4/1");
  const { project, issues } = events(song(), text);
  assert.deepEqual(issues.filter((i) => i.level === "error"), []);
  project.voice_events.forEach((v, i) => {
    const below = v.note.midi - project.voice2_events[i].note.midi;
    assert.ok(below === 8 || below === 9, `nota ${i}: ${below} semitons`);
    assert.equal(project.voice2_events[i].start, v.start);
  });
});

test("dueto: nota longa fora do acorde procura uma nota do acorde; no estilo 'apoio', as notas rápidas não são articuladas", () => {
  // Lá longo sobre G7: a sexta abaixo (Dó) não é do acorde; fica a quinta (Ré) ou a sétima (Si) abaixo
  const data = { ...song("A5/1"), chords: [song().chords[2]] };
  const { project } = events(data, generateSecondVoice(data, { mode: "dueto", style: { id: "gospel" } }).text);
  assert.ok([2, 11, 5].includes(project.voice2_events[0].note.midi % 12), "é nota do G7");
  const fast = song("E5/16 F5/16 G5/8 A5/2+4");
  const swing = generateSecondVoice(fast, { mode: "dueto", style: { id: "swing" } }).text;
  assert.equal(swing.split(" ").filter((t) => !t.startsWith("r/")).length, 2, swing);
  assert.equal(generateSecondVoice(fast, { mode: "dueto", style: { id: "gospel" } }).text.split(" ").length, 4);
});

test("contracanto: cabe na música, fica abaixo da Voz, e não repete a rítmica dela", () => {
  for (const style of STYLES) {
    assert.ok(SECOND_VOICE_STYLES[style.id], `o estilo ${style.id} tem o seu jeito de segunda voz`);
    if (SECOND_VOICE_STYLES[style.id].counter === "gemeas") continue; // rock e metal: guitarras gêmeas (teste próprio, abaixo)
    for (const variation of [0, 1, 2]) {
      const { text } = generateSecondVoice(song(), { mode: "contracanto", style, variation });
      const { project, issues } = events(song(), text);
      assert.deepEqual(issues.filter((i) => i.level === "error").map((i) => i.message), [], `${style.id}: ${text}`);
      assert.ok(project.voice2_events.length >= 2, `${style.id}: ${text}`);
      for (const e of project.voice2_events) {
        assert.ok(e.note.midi >= 43 && e.note.midi <= 79, `${style.id}: fora da região (${e.note.midi})`);
        const over = project.voice_events.filter((v) => v.start < e.start + e.length && v.start + v.length > e.start);
        for (const v of over) assert.ok(e.note.midi < v.note.midi, `${style.id} v${variation}: cruzou a Voz em ${e.start} (${text})`);
      }
      const onsets = (list) => list.map((e) => e.start).join();
      assert.notEqual(onsets(project.voice2_events), onsets(project.voice_events));
    }
  }
});

test("contracanto: muda com a variação e com o estilo; quem 'segura' fica nas notas-guia do acorde", () => {
  const a = generateSecondVoice(song(), { mode: "contracanto", style: { id: "gospel" }, variation: 0 }).text;
  const b = generateSecondVoice(song(), { mode: "contracanto", style: { id: "gospel" }, variation: 1 }).text;
  const funk = generateSecondVoice(song(), { mode: "contracanto", style: { id: "funk" }, variation: 0 }).text;
  assert.notEqual(a, b);
  assert.notEqual(a, funk);
  assert.ok(a.startsWith("E4/"), `começa na 3ª do Cmaj7: ${a}`);
  assert.ok(funk.startsWith("r/"), `no funk, cala enquanto a Voz canta: ${funk}`);
});

test("sem a Voz não há segunda voz; em compassos sem acorde, o contracanto respira e o dueto segue a escala vizinha", () => {
  assert.equal(generateSecondVoice({ ...song(), voice: "" }, { mode: "dueto" }).text, "");
  const data = { ...song("E5/1 G5/1"), chords: [song().chords[0], { duration_beats: 4 }] };
  assert.equal(generateSecondVoice(data, { mode: "dueto", style: { id: "bossa" } }).text, "G4/1 B4/1");
  const contra = generateSecondVoice(data, { mode: "contracanto", style: { id: "bossa" } });
  const { project } = events(data, contra.text);
  assert.ok(project.voice2_events.every((e) => e.start < 1920), contra.text);
});

test("guitarras gêmeas (rock e metal): dobra a Voz nota por nota, em terças da escala", () => {
  const scale = new Set([0, 2, 4, 5, 7, 9, 11]);
  for (const id of ["rock", "metal"]) {
    const data = song();
    const expected = [[3, 4, 5], [-3, -4, -5], [7, 8, 9, -3, -4, -5]]; // terça acima (ou quarta, no apoio), terça abaixo, sexta acima (ou quinta, no apoio; ou uma oitava abaixo)
    [0, 1, 2].forEach((variation) => {
      const { text } = generateSecondVoice(data, { mode: "contracanto", style: { id }, variation });
      const { project, issues } = events(data, text);
      assert.deepEqual(issues.filter((i) => i.level === "error").map((i) => i.message), [], `${id}: ${text}`);
      const voice = project.voice_events;
      const second = project.voice2_events;
      assert.equal(second.length, voice.length, `${id} v${variation}: uma nota para cada nota da Voz (${text})`);
      second.forEach((e, i) => {
        assert.equal(e.start, voice[i].start, `${id} v${variation}: mesma rítmica`);
        assert.equal(e.length, voice[i].length, `${id} v${variation}: mesma duração`);
        assert.ok(scale.has(((e.note.midi % 12) + 12) % 12), `${id} v${variation}: nota fora da escala (${e.token})`);
        assert.ok(expected[variation].includes(e.note.midi - voice[i].note.midi), `${id} v${variation}: intervalo de ${e.note.midi - voice[i].note.midi} semitons em ${e.token} (${text})`);
      });
    });
    // a variação seguinte volta ao começo
    assert.equal(generateSecondVoice(data, { mode: "contracanto", style: { id }, variation: 3 }).text, generateSecondVoice(data, { mode: "contracanto", style: { id }, variation: 0 }).text);
  }
});
