// Configurações do assistente de IA, guardadas só neste aparelho (localStorage).
// A chave da API nunca sai do aparelho, exceto nas chamadas diretas para a Anthropic.

const KEY = "harmonalab:ai:v1";
const PROMPT_KEY = "harmonalab:ai:prompt";

/** Modelos oferecidos. O primeiro é o padrão. Preços em US$ por 1 milhão de tokens (referência; podem mudar). */
export const MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5 · melhor qualidade", price: { input: 4, output: 20 } },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 · equilibrado, mais barato", price: { input: 2, output: 10 } },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 · rápido e bem barato", price: { input: 0.1, output: 0.5 } },
];

/** Quanto a IA raciocina antes de responder (mais fundo = mais lento e mais caro). */
export const EFFORTS = [
  { id: "low", label: "Rápida" },
  { id: "medium", label: "Equilibrada" },
  { id: "high", label: "Profunda" },
];

export const DEFAULT_API_BASE = "https://api.anthropic.com";
export const SEARCH_COST_USD = 0.01; // US$ 10 por mil buscas

export const DEFAULTS = Object.freeze({
  engine: "chat", // "chat" = grátis, pelo chat de IA da pessoa; "api" = automático, pago por uso
  apiKey: "",
  model: MODELS[0].id,
  effort: "medium",
  webSearch: true,
  maxSearches: 3,
  preferences: "",
  apiBase: "",
});

/** Garante valores válidos (o que veio do armazenamento pode estar velho, vazio ou adulterado). */
export function normalizeSettings(raw) {
  const s = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  s.engine = s.engine === "api" ? "api" : "chat";
  s.apiKey = typeof s.apiKey === "string" ? s.apiKey.trim() : "";
  if (!MODELS.some((m) => m.id === s.model)) s.model = DEFAULTS.model;
  if (!EFFORTS.some((e) => e.id === s.effort)) s.effort = DEFAULTS.effort;
  s.webSearch = s.webSearch !== false;
  const n = Math.round(Number(s.maxSearches));
  s.maxSearches = Number.isFinite(n) ? Math.min(8, Math.max(1, n)) : DEFAULTS.maxSearches;
  s.preferences = typeof s.preferences === "string" ? s.preferences.slice(0, 2000) : "";
  s.apiBase = typeof s.apiBase === "string" ? s.apiBase.trim() : "";
  return s;
}

/**
 * Endereço da API aceito: https em qualquer lugar, ou http só no próprio aparelho (testes).
 * Vazio = endereço oficial. Devolve { ok, value, error }.
 */
export function checkApiBase(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) return { ok: true, value: "" };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "Endereço inválido. Exemplo: https://api.anthropic.com" };
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return { ok: false, error: "Use um endereço https:// (http só vale em localhost)." };
  }
  return { ok: true, value: text };
}

export function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return normalizeSettings({});
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false; // armazenamento bloqueado (navegação privada): vale só até fechar a página
  }
}

export function loadPrompt() {
  try { return localStorage.getItem(PROMPT_KEY) || ""; } catch { return ""; }
}

export function savePrompt(text) {
  try { localStorage.setItem(PROMPT_KEY, text); } catch { /* sem armazenamento */ }
}

export const modelInfo = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

/** Custo aproximado de um pedido, em US$, a partir do uso devolvido pela API. */
export function estimateCostUsd(modelId, usage) {
  const { price } = modelInfo(modelId);
  const input = (usage.input || 0) + (usage.cacheWrite || 0) * 1.25 + (usage.cacheRead || 0) * 0.1;
  return (input * price.input + (usage.output || 0) * price.output) / 1e6 + (usage.searches || 0) * SEARCH_COST_USD;
}
