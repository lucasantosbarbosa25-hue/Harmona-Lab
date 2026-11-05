// Pequenas funções numéricas que reproduzem o comportamento do Python,
// para que o motor do navegador gere exatamente o mesmo resultado.

/** round() do Python: empates (x,5) vão para o par mais próximo. */
export function roundHalfEven(x) {
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5) return r % 2 === 0 ? r : r - 1;
  return r;
}

/** Formatação "{x:g}" do Python (6 algarismos significativos, sem zeros à direita). */
export function fmtG(x) {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf";
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(6)))));
  if (exp < -4 || exp >= 6) {
    const [mantissa, e] = x.toExponential(5).split("e");
    const digits = e.replace(/^[+-]/, "").padStart(2, "0");
    return `${mantissa.replace(/\.?0+$/, "")}e${e[0] === "-" ? "-" : "+"}${digits}`;
  }
  return String(Number(x.toPrecision(6)));
}

const FLOAT_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const SPECIAL_RE = /^[+-]?(?:inf|infinity|nan)$/i;

/** float() do Python para textos ("92,5" também vale); null quando não é número. */
export function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const text = value.trim().replaceAll(",", ".");
  if (FLOAT_RE.test(text)) return Number(text);
  if (SPECIAL_RE.test(text)) return /nan/i.test(text) ? NaN : text.startsWith("-") ? -Infinity : Infinity;
  return null;
}

/** _clean_number do Python: 4.0 → 4. Em JS os dois já são o mesmo número. */
export const cleanNumber = (x) => x;
