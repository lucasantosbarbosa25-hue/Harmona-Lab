// Diagramas dos acordes numa imagem (PNG), para guardar ou mandar: o nome, a função e a escala, a frase de função e o
// desenho do teclado de cada acorde, com as teclas pintadas por mão e a ponta marcada. Mesmo desenho do app.

const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
const COLORS = { rh: "#c26a00", lh: "#1f6fd1", bass: "#0d8a55", free: "#7a5cd6", text: "#1b1a17", muted: "#6b665c", line: "#d9d4ca" };
const PART_COLOR = { right_hand: COLORS.rh, left_hand: COLORS.lh, bass: COLORS.bass, notes: COLORS.free };

/** Quebra um texto em linhas que cabem em `width`. */
function wrap(ctx, text, width) {
  const lines = [];
  let line = "";
  for (const word of String(text || "").split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawKeyboard(ctx, x, y, width, height, { low, high, notes, top }) {
  const byMidi = new Map(notes.map((n) => [n.midi, PART_COLOR[n.part] || COLORS.free]));
  const whites = [];
  for (let m = low; m <= high; m++) if (WHITE.has(m % 12)) whites.push(m);
  const w = width / whites.length;
  const blackW = w * 0.6;
  const blackH = height * 0.62;
  whites.forEach((m, i) => {
    ctx.fillStyle = byMidi.get(m) ?? "#ffffff";
    ctx.fillRect(x + i * w, y, w, height);
    ctx.strokeStyle = "#8f897d";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + i * w + 0.5, y + 0.5, w - 1, height - 1);
    if (m % 12 === 0) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`C${Math.floor(m / 12) - 1}`, x + i * w + 3, y + height + 15);
    }
  });
  const centers = new Map(whites.map((m, i) => [m, x + (i + 0.5) * w]));
  for (let m = low; m <= high; m++) {
    if (WHITE.has(m % 12)) continue;
    const i = whites.indexOf(m - 1);
    if (i < 0) continue;
    const left = x + (i + 1) * w - blackW / 2;
    ctx.fillStyle = byMidi.get(m) ?? "#1b1a17";
    ctx.fillRect(left, y, blackW, blackH);
    centers.set(m, left + blackW / 2);
  }
  if (top != null && centers.has(top)) {
    const cx = centers.get(top);
    ctx.fillStyle = COLORS.rh;
    ctx.beginPath();
    ctx.moveTo(cx - 7, y - 12);
    ctx.lineTo(cx + 7, y - 12);
    ctx.lineTo(cx, y - 3);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Desenha os diagramas. chords: [{ symbol, fn (função · escala), note (frase de função), notes: [{midi, part}], top }].
 * Devolve um <canvas>. low/high: a mesma faixa de teclado para todos (como no app).
 */
export function drawDiagrams({ title, subtitle, chords, low, high }) {
  const width = 1100;
  const pad = 36;
  const kbHeight = 120;
  const scratch = document.createElement("canvas").getContext("2d");
  scratch.font = "16px system-ui, sans-serif";
  const rows = chords.map((c) => ({ ...c, lines: wrap(scratch, c.note, width - 2 * pad).slice(0, 3) }));
  const rowHeight = (r) => 40 + (r.fn ? 24 : 0) + r.lines.length * 22 + 26 + kbHeight + 36;
  const height = pad + 70 + rows.reduce((sum, r) => sum + rowHeight(r), 0) + pad;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText(title || "Progressão", pad, pad + 26);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(subtitle || "", pad, pad + 52);

  let y = pad + 70;
  rows.forEach((r, i) => {
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(pad, y + 0.5);
    ctx.lineTo(width - pad, y + 0.5);
    ctx.stroke();
    let at = y + 32;
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText(`${i + 1}. ${r.symbol || "(sem nome)"}`, pad, at);
    if (r.fn) {
      at += 24;
      ctx.fillStyle = COLORS.rh;
      ctx.font = "600 17px system-ui, sans-serif";
      ctx.fillText(r.fn, pad, at);
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px system-ui, sans-serif";
    for (const line of r.lines) { at += 22; ctx.fillText(line, pad, at); }
    at += 26;
    if (r.notes.length) drawKeyboard(ctx, pad, at, width - 2 * pad, kbHeight, { low, high, notes: r.notes, top: r.top });
    else { ctx.fillStyle = COLORS.muted; ctx.fillText("Pausa", pad, at + 20); }
    y += rowHeight(r);
  });

  ctx.fillStyle = COLORS.muted;
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("Harmona Lab · laranja: mão direita · azul: mão esquerda · verde: baixo · ▼ ponta", pad, height - 14);
  return canvas;
}
