// Conferência da progressão devolvida pela IA: o mesmo motor do app aponta o que está errado.

import { analyzeData } from "../engine/analysis.js";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const BLOCKING_WARNING_FIELDS = ["top_note", "phrase", "phrase_scale"];
const list = (numbers) => numbers.join(", ");

/**
 * Confere o que a IA entregou. Devolve { ok, problems, report, explanation }.
 * Bloqueia: erros do motor (nota inexistente, BPM inválido...), ponta travada que não é a nota mais aguda,
 * avisos da frase (alvo fora do tempo, aproximação que não resolve, nota fora da escala...) e o que não bate com o que
 * o pedido disse (número de acordes, BPM). `requireFunctionNotes`: cobra de cada acorde a frase de função (comment) e as
 * notas da escala (phrase_scale), o que vale para respostas de IA e não para links de compartilhamento.
 */
export function checkDelivery(input, { requireExplanation = true, requireFunctionNotes = false } = {}) {
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
      const blocking = issue.level === "error" || (issue.level === "warning" && BLOCKING_WARNING_FIELDS.includes(issue.field));
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
    const rawChords = Array.isArray(project.chords) ? project.chords : [];
    const filled = (c, key) => isObject(c) && typeof c[key] === "string" ? c[key].trim() !== "" : isObject(c) && Array.isArray(c[key]) && c[key].length > 0;
    const noScale = rawChords.flatMap((c, i) => (filled(c, "phrase") && !filled(c, "phrase_scale") ? [i + 1] : []));
    if (noScale.length && !requireFunctionNotes) problems.push(`Acorde(s) ${list(noScale)}: a frase precisa vir com "phrase_scale" (as notas da escala, sem oitava).`);
    if (requireFunctionNotes) {
      const scaleless = report.chords.flatMap((c, i) => (!c.is_rest && !filled(rawChords[i], "phrase_scale") ? [i + 1] : []));
      if (scaleless.length) {
        problems.push(`Faltam as notas da escala (campo "phrase_scale", sem oitava, como "B C D Eb F G A") no(s) acorde(s) ${list(scaleless)}.`);
      }
      const silent = report.chords.flatMap((c, i) => (!c.is_rest && !filled(rawChords[i], "comment") ? [i + 1] : []));
      if (silent.length) {
        problems.push(`Falta a frase de função (campo "comment": o que o acorde faz ali e por quê) no(s) acorde(s) ${list(silent)}.`);
      }
    }
  }
  return { ok: problems.length === 0, problems, report, explanation };
}
