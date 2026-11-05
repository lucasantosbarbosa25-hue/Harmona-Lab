// Logotipo do Harmona Lab: smiley debochado, de óculos aviador, sorrindo com um teclado no lugar dos dentes.
//
// Gera o ícone principal e todas as versões usadas pelo app:
//   harmonalab/web/icon.svg               logo do cabeçalho e ícone da aba do navegador
//   harmonalab/web/icons/icon-192.png     ícone do app instalado (computador / Android)
//   harmonalab/web/icons/icon-512.png
//   harmonalab/web/icons/maskable-512.png Android recorta no formato do aparelho (fundo escuro, rosto na área segura)
//   harmonalab/web/icons/apple-touch-icon.png  iPhone (180 px, sem transparência)
//
// Uso:  node design/logo.mjs
// O SVG sai só com Node. Os PNGs usam o Playwright (Chromium); sem ele, o script avisa e gera só o SVG.

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "harmonalab", "web");

// ------------------------------------------------------------------ paleta
const INK = "#1a1c23"; // contornos, lentes, teclas pretas e fundo do ícone
const FACE = "#ffb81f"; // âmbar vibrante
const WHITE = "#fffdf7"; // teclas brancas e reflexo das lentes

// ------------------------------------------------------------------ geometria
const f = (n) => +n.toFixed(2);
const cubic = (p0, p1, p2, p3) => Array.from({ length: 241 }, (_, i) => {
  const t = i / 240;
  const m = 1 - t;
  return [0, 1].map((k) => m ** 3 * p0[k] + 3 * m * m * t * p1[k] + 3 * m * t * t * p2[k] + t ** 3 * p3[k]);
});

/** y de uma curva amostrada na posição x (interpolação linear). */
function yAt(points, x) {
  const s = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (s[i][0] >= x) {
      const [x0, y0] = s[i - 1];
      const [x1, y1] = s[i];
      return y0 + ((y1 - y0) * (x - x0)) / ((x1 - x0) || 1);
    }
  }
  return s.at(-1)[1];
}

const line = (d, w = 3.2) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/**
 * Boca-teclado: lábio de cima (L → R) e de baixo (R → L) como curvas cúbicas.
 * As teclas brancas preenchem a boca; as pretas seguem o padrão do piano (sem preta entre E–F e B–C).
 */
function keyboardMouth({ L, t1, t2, R, b1, b2 }, { id, whites = 7, blackDepth = 0.55, stroke = 2.8 }) {
  const top = cubic(L, t1, t2, R);
  const bottom = cubic(R, b1, b2, L);
  const d = `M${L} C${t1} ${t2} ${R} C${b1} ${b2} ${L} Z`;
  const [x0, x1] = [L[0], R[0]];
  const kw = (x1 - x0) / whites;
  let g = `<path d="${d}" fill="${WHITE}"/>`;
  for (let k = 1; k < whites; k++) {
    const x = x0 + k * kw;
    g += `<line x1="${f(x)}" y1="${f(yAt(top, x) - 3)}" x2="${f(x)}" y2="${f(yAt(bottom, x) + 3)}" stroke="${INK}" stroke-width="1.5"/>`;
  }
  const notes = ["C", "D", "E", "F", "G", "A", "B"];
  for (let k = 1; k < whites; k++) {
    if (["E", "B"].includes(notes[(k - 1) % 7])) continue;
    const x = x0 + k * kw;
    const bw = kw * 0.6;
    const y = yAt(top, x);
    const h = Math.max(2.2, (yAt(bottom, x) - y) * blackDepth);
    g += `<rect x="${f(x - bw / 2)}" y="${f(y - 3)}" width="${f(bw)}" height="${f(h + 3)}" rx="${f(bw * 0.2)}" fill="${INK}"/>`;
  }
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${g}</g>`
    + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round"/>`;
}

const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(64 - x)} ${y}`);
const glint = (x, y) =>
  `<path d="M${x} ${y + 5} L${f(x + 4.2)} ${y}" stroke="${WHITE}" stroke-width="1.7" stroke-linecap="round" opacity=".9"/>`
  + `<path d="M${f(x + 3)} ${f(y + 6.5)} L${f(x + 5.2)} ${f(y + 3.9)}" stroke="${WHITE}" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>`;

// ------------------------------------------------------------------ o rosto (viewBox 64 × 64)
const LENS = "M11 18.2 Q11 16 14 16 H27.2 Q30.2 16 29.7 19.2 Q28.8 26.8 22.8 29.4 Q16.4 31.6 12.6 26.6 Q10.6 23.6 11 18.2 Z";
const lens = (d) => `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;

const FACE_ART = [
  `<circle cx="32" cy="32" r="29.5" fill="${FACE}" stroke="${INK}" stroke-width="3"/>`,
  // sorriso torto de deboche, subindo para a direita, com covinha no canto
  keyboardMouth({ L: [12, 41], t1: [24, 42], t2: [42, 38], R: [54, 29.5], b1: [55, 50], b2: [30, 61] }, { id: "hl-boca" }),
  line("M54.5 25 Q58.5 28.5 56.5 33.5", 2.4),
  // sobrancelha arqueada por cima dos óculos
  line("M36.5 11.5 Q43.5 5.8 50.5 10.5", 3),
  // óculos aviador: lentes em gota, ponte dupla e hastes
  lens(LENS), lens(mirror(LENS)),
  line("M27 16.3 H37", 2), line("M29.7 19.8 Q32 18.3 34.3 19.8", 2),
  line("M11 17.6 L5.8 17.2", 2.4), line("M53 17.6 L58.2 17.2", 2.4),
  glint(14, 18.8), glint(37.8, 18.8),
].join("");

const svg = (body, title = "Harmona Lab") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>${title}</title>${body}</svg>\n`;

/** Rosto sobre um quadrado escuro de canto a canto (ícones que o sistema recorta). */
const onTile = (scale) =>
  svg(`<rect width="64" height="64" fill="${INK}"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${FACE_ART}</g>`);

const OUTPUTS = [
  // [arquivo, svg, tamanho em px]
  ["icons/icon-192.png", svg(FACE_ART), 192],
  ["icons/icon-512.png", svg(FACE_ART), 512],
  ["icons/maskable-512.png", onTile(0.8), 512], // rosto dentro da área segura (círculo de 80%)
  ["icons/apple-touch-icon.png", onTile(0.84), 180],
];

writeFileSync(join(WEB, "icon.svg"), svg(FACE_ART));
console.log("harmonalab/web/icon.svg");

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.log("Playwright não encontrado: só o SVG foi atualizado. Para os PNGs: npm i -D playwright && npx playwright install chromium");
  process.exit(0);
}
mkdirSync(join(WEB, "icons"), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, source, size] of OUTPUTS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${source.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(WEB, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`harmonalab/web/${file}`);
}
await browser.close();
