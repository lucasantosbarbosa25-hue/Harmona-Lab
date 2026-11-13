// As partes da música (A, B, C...): blocos de acordes que dá para mover, repetir, renomear e apagar.
//
// No projeto, uma parte começa no acorde que tem o campo "section" (o nome dela) e vai até a próxima marca. O primeiro
// acorde sem marca começa a parte "A". A Voz é uma melodia só, da música inteira: quando um bloco muda de lugar (ou é
// repetido, ou apagado), o trecho da Voz que está em cima dele vai junto.
//
// Tudo aqui é lógica pura (sem tela), para poder ser testado sozinho. Trabalha com o projeto editável do app:
// { chords: [{ section, duration_beats, ... }], voice (texto), middle_c }.

import { ticksText } from "./engine/groove.js";
import { TICKS_PER_BEAT, parsePhrase } from "./engine/phrase.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const beatsOf = (chord) => { const n = Number(String(chord.duration_beats).replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
const ticksOf = (beats) => Math.round(beats * TICKS_PER_BEAT);

/** Os blocos da música: [{ name, from, to (índices dos acordes; `to` fica de fora), beats, startBeat }]. */
export function sectionBlocks(chords) {
  const blocks = [];
  let beat = 0;
  chords.forEach((chord, i) => {
    const mark = String(chord.section || "").trim();
    if (i === 0 || mark) blocks.push({ name: mark || "A", from: i, to: i, beats: 0, startBeat: beat });
    const block = blocks.at(-1);
    block.to = i + 1;
    block.beats += beatsOf(chord);
    beat += beatsOf(chord);
  });
  return blocks;
}

/** O próximo nome livre: a primeira letra que ainda não é o nome de nenhuma parte. */
export function nextSectionName(chords) {
  const used = new Set(sectionBlocks(chords).map((b) => b.name.toUpperCase()));
  return [...LETTERS].find((l) => !used.has(l)) ?? `Parte ${used.size + 1}`;
}

/** As notas da Voz com o tempo em ticks: [{ name (como escrita), start, length, midi }]. Texto com erro devolve null. */
export function voiceNotes(text, middleC = "C4") {
  if (!text || !String(text).trim()) return [];
  const { events, errors } = parsePhrase(text, middleC);
  if (errors.length) return null;
  return events.filter((e) => e.voice === 0).map((e) => ({ name: e.token.split("*")[0].split("/")[0].split("&")[0], start: e.start, length: e.length, midi: e.note.midi }));
}

/** Notas (em ticks) → texto da Voz, com as pausas. */
export function voiceTextOf(notes) {
  const tokens = [];
  let at = 0;
  for (const n of notes.slice().sort((a, b) => a.start - b.start)) {
    const start = Math.max(n.start, at); // nota que entra antes de a anterior acabar: começa onde a outra termina
    const length = n.start + n.length - start;
    if (length <= 0) continue;
    if (start > at) tokens.push(`r/${ticksText(start - at)}`);
    tokens.push(`${n.name}/${ticksText(length)}`);
    at = start + length;
  }
  return tokens.join(" ");
}

/**
 * Desmonta o projeto em partes independentes: [{ name, chords, ticks, voice: [notas com início relativo à parte] }].
 * Nota da Voz que atravessa a divisa fica na parte onde começa, cortada no fim dela. O que passar do fim da música fica
 * na última parte.
 */
export function takeApart(project) {
  const blocks = sectionBlocks(project.chords);
  const notes = voiceNotes(project.voice, project.middle_c);
  if (notes === null) return null;
  return blocks.map((b, i) => {
    const from = ticksOf(b.startBeat);
    const ticks = ticksOf(b.beats);
    const last = i === blocks.length - 1;
    const voice = notes.filter((n) => n.start >= from && (last || n.start < from + ticks))
      .map((n) => ({ name: n.name, start: n.start - from, length: last ? n.length : Math.min(n.length, from + ticks - n.start) }));
    return { name: b.name, chords: project.chords.slice(b.from, b.to), ticks, voice };
  });
}

/** Monta de volta: devolve { chords, voice } com a marca de cada parte no primeiro acorde dela. */
export function putTogether(parts) {
  const chords = [];
  const notes = [];
  let at = 0;
  parts.forEach((part, i) => {
    part.chords.forEach((chord, k) => {
      const section = k === 0 ? (i === 0 && parts.length === 1 && part.name === "A" ? chord.section || "" : part.name) : "";
      chords.push({ ...chord, section });
    });
    for (const n of part.voice) notes.push({ name: n.name, start: at + n.start, length: n.length });
    at += part.ticks;
  });
  return { chords, voice: voiceTextOf(notes) };
}

const apply = (project, change) => {
  const parts = takeApart(project);
  if (!parts) return null; // a Voz tem erro de escrita: não dá para mover com segurança
  const next = change(parts);
  return next ? putTogether(next) : null;
};

/** Muda uma parte de lugar (de `from` para `to`, posições entre os blocos). */
export function moveSection(project, from, to) {
  return apply(project, (parts) => {
    if (from === to || from < 0 || to < 0 || from >= parts.length || to >= parts.length) return null;
    const [part] = parts.splice(from, 1);
    parts.splice(to, 0, part);
    return parts;
  });
}

/** Repete uma parte logo depois dela (os acordes e a melodia são copiados; os acordes novos vêm sem `id`). */
export function repeatSection(project, index) {
  return apply(project, (parts) => {
    const part = parts[index];
    if (!part) return null;
    const copy = { ...part, chords: part.chords.map(({ id, ...chord }) => ({ ...chord })), voice: part.voice.map((n) => ({ ...n })) };
    parts.splice(index + 1, 0, copy);
    return parts;
  });
}

/** Apaga uma parte (os acordes e a melodia dela). A última que sobra não pode ser apagada. */
export function removeSection(project, index) {
  return apply(project, (parts) => {
    if (parts.length < 2 || !parts[index]) return null;
    parts.splice(index, 1);
    return parts;
  });
}

/** Troca o nome de uma parte. Devolve os acordes novos (a Voz não muda). */
export function renameSection(chords, index, name) {
  const blocks = sectionBlocks(chords);
  const block = blocks[index];
  const clean = String(name || "").trim().slice(0, 24);
  if (!block || !clean) return null;
  return chords.map((chord, i) => (i === block.from ? { ...chord, section: clean } : chord));
}

/** Começa uma parte nova no acorde `chordIndex` (com o próximo nome livre, ou o nome dado). */
export function splitSection(chords, chordIndex, name = null) {
  if (chordIndex <= 0 || chordIndex >= chords.length || String(chords[chordIndex].section || "").trim()) return null;
  const mark = name || nextSectionName(chords);
  const first = String(chords[0].section || "").trim() || "A";
  return chords.map((chord, i) => (i === chordIndex ? { ...chord, section: mark } : i === 0 ? { ...chord, section: first } : chord));
}

/** Junta uma parte com a anterior (some a marca). */
export function joinSection(chords, index) {
  const blocks = sectionBlocks(chords);
  if (index <= 0 || !blocks[index]) return null;
  const out = chords.map((chord, i) => (i === blocks[index].from ? { ...chord, section: "" } : chord));
  if (sectionBlocks(out).length === 1) out[0] = { ...out[0], section: "" }; // sobrou uma parte só: sem marcas
  return out;
}

/**
 * Acrescenta uma melodia como parte nova, no fim: `events` = [{ beat, beats, midi }] (como saem do canto), `pickup` =
 * quantos tempos do começo são anacruse (entram por cima do fim da parte anterior), `name(midi)` = nome da nota.
 * Devolve { chords (com os compassos vazios da parte nova, marcada), voice, section, bars }.
 */
export function appendSection(project, { events, pickup = 0, beatsPerBar = 4, spell, blankChord, section = null }) {
  const old = voiceNotes(project.voice, project.middle_c);
  if (old === null) return null;
  const total = project.chords.reduce((sum, c) => sum + beatsOf(c), 0);
  const lead = Math.min(pickup, total); // a anacruse não pode começar antes do começo da música
  const offset = ticksOf(total - lead);
  const fresh = events.filter((e) => e.beat >= pickup - lead - 1e-9)
    .map((e) => ({ name: spell(e.midi), start: offset + ticksOf(e.beat - (pickup - lead)), length: ticksOf(e.beats) }));
  if (!fresh.length) return null;
  const first = fresh[0].start;
  // a melodia de antes cede lugar à anacruse da parte nova
  const kept = old.filter((n) => n.start < first).map((n) => ({ ...n, length: Math.min(n.length, first - n.start) }));
  const lastBeat = Math.max(...events.map((e) => e.beat + e.beats)) - pickup;
  const bars = Math.max(1, Math.ceil(lastBeat / beatsPerBar - 1e-9));
  const mark = section || nextSectionName(project.chords);
  const chords = project.chords.map((c, i) => (i === 0 && !String(c.section || "").trim() ? { ...c, section: "A" } : c));
  for (let i = 0; i < bars; i++) chords.push(blankChord({ duration_beats: beatsPerBar, section: i === 0 ? mark : "" }));
  return { chords, voice: voiceTextOf([...kept, ...fresh]), section: mark, bars };
}

/** A última parte está vazia (só pausas)? É a que a IA vai harmonizar na continuação. Devolve o bloco ou null. */
export function emptyLastSection(chords, isRest) {
  const blocks = sectionBlocks(chords);
  if (blocks.length < 2) return null;
  const last = blocks.at(-1);
  return chords.slice(last.from, last.to).every(isRest) ? { ...last, index: blocks.length - 1 } : null;
}
