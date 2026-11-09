// Modo grátis: o app monta o pedido completo para colar no chat de IA que a pessoa já usa
// (ChatGPT, Claude, Gemini...), lê a resposta colada de volta e confere tudo com o mesmo motor do modo automático.
// Nada é enviado a lugar nenhum pelo app e não há custo de API.

import { checkDelivery } from "./check.js";
import { buildUserMessage, instructions } from "./prompt.js";

export const CHATS = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/new" },
  { name: "Gemini", url: "https://gemini.google.com/app" },
];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Texto completo para colar no chat: instruções + pedido (+ progressão atual, no ajuste). `phrases`: id da levada, "auto" ou "none". */
export function buildChatPrompt({ request, mode, currentProject, appUrl, phrases = "none" }) {
  return `${instructions(appUrl, { phrases })}\n\n---\n\n${buildUserMessage({ request, mode, currentProject, phrases })}`;
}

/** Acha o JSON na resposta do chat: bloco ```json``` (o maior que for válido) ou o trecho entre a primeira { e a última }. */
export function extractJson(text) {
  const source = String(text || "");
  const blocks = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]).sort((a, b) => b.length - a.length);
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  const candidates = [...blocks, ...(start >= 0 && end > start ? [source.slice(start, end + 1)] : [])];
  if (!candidates.length) throw new Error("Não encontrei o JSON na resposta. Copie a resposta inteira do chat (com o bloco de código).");
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim());
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`O JSON da resposta está incompleto ou com erro (${lastError.message}). Peça ao chat para repetir só o bloco JSON completo.`);
}

/**
 * Lê e confere a resposta colada. Aceita {explicacao, pedido_extraido, projeto} ou só o projeto.
 * Devolve { ok, problems, project, explanation }. Lança Error com mensagem pronta se não houver JSON legível.
 */
export function readChatAnswer(text) {
  const data = extractJson(text);
  let input = data;
  if (isObject(data) && !("projeto" in data) && Array.isArray(data.chords)) {
    input = { projeto: data, explicacao: typeof data.comment === "string" ? data.comment : "" };
  }
  const check = checkDelivery(input, { requireExplanation: false, requireFunctionNotes: true });
  return { ok: check.ok, problems: check.problems, project: isObject(input) ? input.projeto : undefined, explanation: check.explanation };
}

/** Texto para colar no mesmo chat quando a conferência acha problemas. */
export function correctionPrompt(problems) {
  return "O Harmona Lab conferiu a sua resposta e encontrou estes problemas:\n"
    + problems.map((p, i) => `${i + 1}. ${p}`).join("\n")
    + "\n\nCorrija todos e responda de novo apenas com o bloco ```json completo, no mesmo formato.";
}
