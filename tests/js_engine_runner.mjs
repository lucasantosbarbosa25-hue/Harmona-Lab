// Roda o motor do navegador (harmonalab/web/engine) no Node para o teste de paridade.
// Entrada (stdin): lista de projetos JSON. Saída: análise, MIDI (base64) e troca de convenção.
import { readFileSync } from "node:fs";
import { analyzeData } from "../harmonalab/web/engine/analysis.js";
import { midiBytes } from "../harmonalab/web/engine/midi.js";
import { loadProject, renameProjectNotes } from "../harmonalab/web/engine/model.js";

const cases = JSON.parse(readFileSync(0, "utf8"));
const out = cases.map((data) => {
  const report = analyzeData(data);
  const bytes = (mode) => Buffer.from(midiBytes(loadProject(data).project, { phraseMode: mode })).toString("base64");
  const midi = report.ok ? bytes("both") : null;
  const midi_modes = report.ok ? { chords: bytes("chords"), line: bytes("line") } : null;
  const renamed = data && typeof data === "object" && !Array.isArray(data) ? renameProjectNotes(data, "C3") : null;
  return { report, midi, midi_modes, renamed };
});
process.stdout.write(JSON.stringify(out));
