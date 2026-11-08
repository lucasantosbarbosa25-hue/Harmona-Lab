// Conferência da progressão devolvida pela IA: o mesmo motor do app aponta o que está errado.

import { analyzeData } from "../engine/analysis.js";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Confere o que a IA entregou. Devolve { ok, problems, report, explanation }.
 * Bloqueia: erros do motor (nota inexistente, BPM inválido...), ponta travada que não é a nota mais aguda
 * e o que não bate com o que o pedido disse (número de acordes, BPM).
 */
export function checkDelivery(input, { requireExplanation = true } = {}) {
  const problems = [];
  const data = isObject(input) ? input : {};
  const project = data.projeto;
  const explanation = typeof data.explicacao === "string" ? data.explicacao.trim() : "";
  if (!isObject(project)) problems.push('Falta o campo "projeto" (o objeto com tempo e chords).');
  if (!explanation && requireExplanation) problems.push('Falta a "explicacao" (texto simples, em português).');

  let report = null;
  if (isObject(project)) {
    report = analyzeData(project);
    for (const issue of report.issues) {
      const blocking = issue.level === "error" || (issue.level === "warning" && issue.field === "top_note");
      if (!blocking) continue;
      let where = "";
      if (issue.chord != null) {
        const symbol = report.chords[issue.chord]?.symbol;
        where = `Acorde ${issue.chord + 1}${symbol ? ` (${symbol})` : ""}${issue.field ? `, campo ${issue.field}` : ""}: `;
      } else if (issue.field) {
        where = `Projeto, campo ${issue.field}: `;
      }
      problems.push(where + issue.message);
    }
    const asked = isObject(data.pedido_extraido) ? data.pedido_extraido : {};
    if (Number.isInteger(asked.acordes) && asked.acordes > 0 && report.chords.length !== asked.acordes) {
      problems.push(`O pedido pedia ${asked.acordes} acordes, mas o projeto tem ${report.chords.length}.`);
    }
    if (typeof asked.bpm === "number" && asked.bpm > 0 && Number(project.tempo) !== asked.bpm) {
      problems.push(`O pedido pedia ${asked.bpm} BPM, mas o projeto está com tempo ${project.tempo}.`);
    }
  }
  return { ok: problems.length === 0, problems, report, explanation };
}
