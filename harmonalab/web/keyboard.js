// Mini teclado: mostra exatamente quais teclas o voicing usa, colorindo por mão.

const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
const PART_CLASS = { right_hand: "rh", left_hand: "lh", bass: "bass", notes: "free" };
const OCTAVE_OFFSET = { C4: -1, C3: -2 };

export const isWhite = (midi) => WHITE.has(midi % 12);

export function cName(midi, middleC) {
  return `C${Math.floor(midi / 12) + OCTAVE_OFFSET[middleC]}`;
}

/** Faixa do teclado: de um dó até um si, cobrindo todas as notas (mín. 2 oitavas). */
export function keyboardRange(midis) {
  if (!midis.length) return [48, 71];
  let low = Math.min(...midis);
  let high = Math.max(...midis);
  low -= low % 12;
  high += 11 - (high % 12);
  if (high - low + 1 < 24) high += 12;
  return [Math.max(0, low), Math.min(127, high)];
}

/**
 * Desenha o teclado dentro de `el`.
 * notes: [{midi, part}], top: midi da ponta (ou null).
 */
export function renderKeyboard(el, { low, high, notes, top, middleC }) {
  const byMidi = new Map(notes.map((n) => [n.midi, PART_CLASS[n.part] || "free"]));
  const whites = [];
  for (let m = low; m <= high; m++) if (isWhite(m)) whites.push(m);
  const count = whites.length;
  el.style.setProperty("--whites", count);

  const keys = document.createElement("div");
  keys.className = "kb-keys";
  const labels = document.createElement("div");
  labels.className = "kb-labels";
  const pct = (x) => `${(x / count) * 100}%`;
  const centerOf = new Map();

  whites.forEach((m, i) => {
    const key = document.createElement("div");
    key.className = "kb-white";
    if (byMidi.has(m)) key.classList.add("on", byMidi.get(m));
    keys.append(key);
    centerOf.set(m, `${((i + 0.5) / count) * 100}%`);
    if (m % 12 === 0) {
      const label = document.createElement("span");
      label.textContent = cName(m, middleC);
      label.style.left = pct(i);
      labels.append(label);
    }
  });

  for (let m = low; m <= high; m++) {
    if (isWhite(m)) continue;
    const i = whites.indexOf(m - 1);
    if (i < 0) continue;
    const key = document.createElement("div");
    key.className = "kb-black";
    if (byMidi.has(m)) key.classList.add("on", byMidi.get(m));
    key.style.left = `calc(${pct(i + 1)} - var(--bw) / 2)`;
    keys.append(key);
    centerOf.set(m, pct(i + 1));
  }

  const parts = [keys, labels];
  if (top != null && centerOf.has(top)) {
    const marker = document.createElement("div");
    marker.className = "kb-marker";
    marker.style.left = centerOf.get(top);
    marker.title = "Ponta";
    parts.unshift(marker);
  }
  el.replaceChildren(...parts);
}
