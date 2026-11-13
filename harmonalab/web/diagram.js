// Diagramas dos acordes num PDF (páginas A4), para guardar, imprimir ou mandar: o nome, a função e a escala, a frase de função e o
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

// ---------------------------------------------------------------- páginas (A4) e PDF

const PAGE = { width: 1100, height: 1556, pad: 36, gap: 28, kb: 104, scale: 2 }; // proporção do A4 (1 : 1,414)
const COLUMN = (PAGE.width - 2 * PAGE.pad - PAGE.gap) / 2;

/**
 * Desenha os diagramas em páginas A4, em duas colunas. items: a música em ordem, com
 *   { section: "B" }                                  começo de uma parte
 *   { symbol, fn, note, notes: [{midi, part}], top, number }   um acorde
 *   { rests: 4 }                                      acordes vazios seguidos (resumidos numa linha)
 * Devolve uma lista de <canvas>, um por página. Uma imagem só, com muitos acordes, passava do tamanho que o navegador
 * aguenta (e saía deformada); em páginas, cada uma tem tamanho fixo.
 */
export function drawDiagramPages({ title, subtitle, items, low, high }) {
  const scratch = document.createElement("canvas").getContext("2d");
  scratch.font = "15px system-ui, sans-serif";
  const blocks = items.map((item) => {
    if (item.section !== undefined) return { ...item, kind: "section", height: 46 };
    if (item.rests) return { ...item, kind: "rests", height: 40 };
    const lines = wrap(scratch, item.note, COLUMN).slice(0, 3);
    return { ...item, kind: "chord", lines, height: 34 + (item.fn ? 22 : 0) + lines.length * 20 + 22 + PAGE.kb + 34 };
  });
  // distribui pelos espaços: página 1 começa depois do título; cada página tem duas colunas
  const top = (page) => PAGE.pad + (page === 0 ? 74 : 0);
  const bottom = PAGE.height - PAGE.pad - 26;
  const placed = [];
  let page = 0;
  let column = 0;
  let y = top(0);
  blocks.forEach((block, i) => {
    // o título de uma parte não fica sozinho no fim da coluna: leva o próximo bloco junto
    const needed = block.kind === "section" && blocks[i + 1] ? block.height + blocks[i + 1].height : block.height;
    if (y + needed > bottom && y > top(page)) {
      if (column === 0) column = 1; else { column = 0; page += 1; }
      y = top(page);
    }
    placed.push({ block, page, x: PAGE.pad + column * (COLUMN + PAGE.gap), y });
    y += block.height;
  });
  const pages = page + 1;
  return Array.from({ length: pages }, (_, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE.width * PAGE.scale;
    canvas.height = PAGE.height * PAGE.scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(PAGE.scale, PAGE.scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE.width, PAGE.height);
    if (index === 0) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.fillText(title || "Progressão", PAGE.pad, PAGE.pad + 26);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(subtitle || "", PAGE.pad, PAGE.pad + 52);
    }
    for (const { block, page: where, x, y: from } of placed) {
      if (where !== index) continue;
      if (block.kind === "section") {
        ctx.fillStyle = "#f1ede4";
        ctx.fillRect(x, from + 8, COLUMN, 30);
        ctx.fillStyle = COLORS.rh;
        ctx.fillRect(x, from + 8, 5, 30);
        ctx.fillStyle = COLORS.text;
        ctx.font = "bold 18px system-ui, sans-serif";
        ctx.fillText(`Parte ${block.section}`, x + 14, from + 29);
        continue;
      }
      ctx.strokeStyle = COLORS.line;
      ctx.beginPath();
      ctx.moveTo(x, from + 0.5);
      ctx.lineTo(x + COLUMN, from + 0.5);
      ctx.stroke();
      if (block.kind === "rests") {
        ctx.fillStyle = COLORS.muted;
        ctx.font = "15px system-ui, sans-serif";
        ctx.fillText(block.rests === 1 ? "1 acorde vazio (pausa)" : `${block.rests} acordes vazios (pausa)`, x, from + 26);
        continue;
      }
      let at = from + 28;
      ctx.fillStyle = COLORS.text;
      ctx.font = "bold 21px system-ui, sans-serif";
      ctx.fillText(`${block.number}. ${block.symbol || "(sem nome)"}`, x, at);
      if (block.fn) {
        at += 22;
        ctx.fillStyle = COLORS.rh;
        ctx.font = "600 15px system-ui, sans-serif";
        ctx.fillText(wrap(ctx, block.fn, COLUMN)[0] ?? "", x, at);
      }
      ctx.fillStyle = COLORS.text;
      ctx.font = "15px system-ui, sans-serif";
      for (const line of block.lines) { at += 20; ctx.fillText(line, x, at); }
      at += 22;
      drawKeyboard(ctx, x, at, COLUMN, PAGE.kb, { low, high, notes: block.notes, top: block.top });
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Harmona Lab · laranja: mão direita · azul: mão esquerda · verde: baixo · ▼ ponta", PAGE.pad, PAGE.height - 16);
    const label = `página ${index + 1} de ${pages}`;
    ctx.fillText(label, PAGE.width - PAGE.pad - ctx.measureText(label).width, PAGE.height - 16);
    return canvas;
  });
}

/**
 * Um PDF com uma imagem JPEG por página (A4 em pé). images: [{ bytes (Uint8Array do JPEG), width, height }].
 * Escrito à mão, sem biblioteca: catálogo, lista de páginas e, por página, a página, o desenho e a imagem.
 */
export function buildPdf(images) {
  const A4 = [595.28, 841.89];
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let size = 0;
  const push = (data) => { const bytes = typeof data === "string" ? encoder.encode(data) : data; chunks.push(bytes); size += bytes.length; };
  const object = (id, body, stream = null) => {
    offsets[id] = size;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); }
    push("endobj\n");
  };
  push("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  const count = images.length;
  const pageId = (i) => 3 + i * 3;
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${count} /Kids [${images.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`);
  images.forEach((image, i) => {
    const id = pageId(i);
    const content = encoder.encode(`q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Im0 Do Q`);
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, `<< /Length ${content.length} >>`, content);
    object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`, image.bytes);
  });
  const total = 3 + count * 3;
  const xref = size;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
