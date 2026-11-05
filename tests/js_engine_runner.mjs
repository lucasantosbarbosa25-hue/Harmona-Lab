// Roda o motor do navegador (harmonylab/web/engine) no Node para o teste de paridade.
// Entrada (stdin): lista de projetos JSON. Saída: análise, MIDI (base64) e troca de convenção.
import { readFileSync } from "node:fs";
import { analyzeData } from "../harmonylab/web/engine/analysis.js";
import { midiBytes } from "../harmonylab/web/engine/midi.js";
import { loadProject, renameProjectNotes } from "../harmonylab/web/engine/model.js";

const cases = JSON.parse(readFileSync(0, "utf8"));
const out = cases.map((data) => {
  const report = analyzeData(data);
  const midi = report.ok ? Buffer.from(midiBytes(loadProject(data).project)).toString("base64") : null;
  const renamed = data && typeof data === "object" && !Array.isArray(data) ? renameProjectNotes(data, "C3") : null;
  return { report, midi, renamed };
});
process.stdout.write(JSON.stringify(out));
