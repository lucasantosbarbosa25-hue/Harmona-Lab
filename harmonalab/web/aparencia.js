// A aparência do app: o tema de cores e o fundo com músicos, que desliza de lado enquanto a tela rola (carrossel).
//
// Temas (THEMES): cada um é um conjunto de cores em styles.css, escolhido pelo atributo data-theme da página.
// Fundo: as silhuetas do app (fundo/*.svg, pintadas com a cor do tema), as imagens da própria pessoa (ficam só neste
// aparelho, reduzidas para caber) ou nenhum. Tudo fica guardado em localStorage.

const KEY = "harmonalab:aparencia";
const IMAGES_KEY = "harmonalab:aparencia:imagens";
export const THEMES = [
  { id: "azul", label: "Azul", hint: "fundo escuro, cartões claros", bar: "#0b1e3a" },
  { id: "noite", label: "Azul noite", hint: "tudo escuro", bar: "#081426" },
  { id: "claro", label: "Azul claro", hint: "tudo claro", bar: "#e9f1fc" },
  { id: "ambar", label: "Âmbar", hint: "o tema antigo", bar: "#f5f4f0" },
];
export const SILHOUETTES = ["pianista", "guitarrista", "cantora", "saxofonista", "baterista", "baixista"];
export const BACKDROPS = [
  { id: "silhuetas", label: "Silhuetas" },
  { id: "fotos", label: "Minhas imagens" },
  { id: "nada", label: "Sem imagens" },
];
const MAX_IMAGES = 8;
const MAX_SIDE = 1000; // as imagens da pessoa são reduzidas até este lado, em JPEG: cabem no armazenamento do navegador

const $ = (s) => document.querySelector(s);

/** As escolhas guardadas: { theme, backdrop }. Valores desconhecidos voltam ao padrão. */
export function readLook(raw) {
  let saved = null;
  try { saved = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { saved = null; }
  const theme = THEMES.some((t) => t.id === saved?.theme) ? saved.theme : "azul";
  const backdrop = BACKDROPS.some((b) => b.id === saved?.backdrop) ? saved.backdrop : "silhuetas";
  return { theme, backdrop };
}

/** Quanto o fundo anda de lado para uma rolagem `scrollY`, numa faixa de largura `width` que se repete. */
export const carouselOffset = (scrollY, width, speed = 0.35) => (width > 0 ? -(((scrollY * speed) % width) + width) % width : 0);

const loadLook = () => { try { return readLook(localStorage.getItem(KEY)); } catch { return readLook(null); } };
const saveLook = (look) => { try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* sem armazenamento */ } };
const loadImages = () => { try { const list = JSON.parse(localStorage.getItem(IMAGES_KEY) || "[]"); return Array.isArray(list) ? list.filter((x) => typeof x === "string" && x.startsWith("data:image/")) : []; } catch { return []; } };
const saveImages = (list) => { try { localStorage.setItem(IMAGES_KEY, JSON.stringify(list)); return true; } catch { return false; } };

/** Reduz uma imagem escolhida pela pessoa e devolve um data: URL em JPEG. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.72);
}

let look = loadLook();
let images = loadImages();
let strip = null;
let stripWidth = 0;
let toastFn = null;

function applyTheme() {
  document.documentElement.setAttribute("data-theme", look.theme);
  const bar = THEMES.find((t) => t.id === look.theme)?.bar;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.removeAttribute("media"); if (bar) m.setAttribute("content", bar); });
}

/** Monta a faixa do fundo: os itens duas vezes, para o carrossel dar a volta sem emenda. */
function renderBackdrop() {
  const box = $("#backdrop");
  const photos = look.backdrop === "fotos" && images.length > 0;
  const items = look.backdrop === "nada" ? [] : photos ? images : look.backdrop === "silhuetas" || look.backdrop === "fotos" ? SILHOUETTES : [];
  box.hidden = !items.length;
  box.classList.toggle("photos", photos);
  strip = box.querySelector(".backdrop-strip");
  const make = (item) => {
    const el = document.createElement("div");
    el.className = "backdrop-item";
    if (photos) el.style.backgroundImage = `url("${item}")`;
    else { el.style.webkitMaskImage = `url("fundo/${item}.svg")`; el.style.maskImage = `url("fundo/${item}.svg")`; }
    return el;
  };
  // repete até encher bem a tela larga, e então duplica tudo (a segunda metade é a emenda do laço)
  const once = [];
  while (items.length && once.length < Math.max(items.length, 6)) once.push(...items);
  strip.replaceChildren(...once.map(make), ...once.map(make));
  measure();
}

function measure() {
  stripWidth = strip ? strip.scrollWidth / 2 : 0;
  move();
}

let waiting = false;
function move() {
  waiting = false;
  if (!strip || !stripWidth) return;
  strip.style.transform = `translate3d(${carouselOffset(window.scrollY, stripWidth)}px, 0, 0)`;
}

// ---------------------------------------------------------------- a janela "Aparência"
function renderDialog() {
  $("#look-themes").replaceChildren(...THEMES.map((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "look-theme";
    b.dataset.theme = t.id;
    b.setAttribute("aria-pressed", String(t.id === look.theme));
    b.innerHTML = '<span class="look-swatch" aria-hidden="true"><i></i><i></i><i></i></span>';
    const name = document.createElement("strong"); name.textContent = t.label;
    const hint = document.createElement("small"); hint.textContent = t.hint;
    b.append(name, hint);
    b.addEventListener("click", () => { look = { ...look, theme: t.id }; saveLook(look); applyTheme(); renderDialog(); });
    return b;
  }));
  $("#look-backdrops").replaceChildren(...BACKDROPS.map((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = d.label;
    b.setAttribute("aria-pressed", String(d.id === look.backdrop));
    b.addEventListener("click", () => { look = { ...look, backdrop: d.id }; saveLook(look); renderBackdrop(); renderDialog(); });
    return b;
  }));
  const mine = look.backdrop === "fotos";
  $("#look-images-box").hidden = !mine;
  $("#look-hint").textContent = look.backdrop === "silhuetas" ? "Silhuetas de músicos, pintadas com a cor do tema. Elas deslizam de lado enquanto a tela rola."
    : mine ? (images.length ? `${images.length} de ${MAX_IMAGES} imagens. Elas ficam só neste aparelho e deslizam de lado enquanto a tela rola.` : "Escolha fotos suas (de músicos tocando, por exemplo). Enquanto não houver nenhuma, valem as silhuetas.")
      : "O fundo fica liso, só com a cor do tema.";
  $("#look-images").replaceChildren(...images.map((src, i) => {
    const item = document.createElement("div");
    item.className = "look-image";
    item.style.backgroundImage = `url("${src}")`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Tirar a imagem ${i + 1}`);
    remove.addEventListener("click", () => { images = images.filter((_, k) => k !== i); saveImages(images); renderBackdrop(); renderDialog(); });
    item.append(remove);
    return item;
  }));
  $("#look-add").disabled = images.length >= MAX_IMAGES;
  $("#look-clear").hidden = !images.length;
}

export function openLook() {
  renderDialog();
  $("#look-dialog").showModal();
}

/** Liga a aparência: aplica o tema, monta o fundo e a janela. options: { toast(texto, opções) }. */
export function setupLook({ toast } = {}) {
  toastFn = toast;
  applyTheme();
  renderBackdrop();
  const schedule = () => { if (!waiting) { waiting = true; requestAnimationFrame(move); } };
  // quem pediu menos movimento ao sistema vê o fundo parado
  if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => measure());
  $("#look-add").addEventListener("click", () => $("#look-file").click());
  $("#look-file").addEventListener("change", async (event) => {
    const files = [...(event.target.files || [])].filter((f) => f.type.startsWith("image/")).slice(0, MAX_IMAGES - images.length);
    event.target.value = "";
    if (!files.length) return;
    const added = [];
    for (const file of files) {
      try { added.push(await shrink(file)); } catch { /* arquivo que o navegador não lê: fica de fora */ }
    }
    if (!added.length) { toastFn?.("Não consegui ler essas imagens. Tente JPG ou PNG.", { error: true }); return; }
    const next = [...images, ...added];
    if (!saveImages(next)) { toastFn?.("Não coube: o aparelho não tem espaço para guardar mais imagens. Tire alguma e tente de novo.", { error: true }); return; }
    images = next;
    look = { ...look, backdrop: "fotos" };
    saveLook(look);
    renderBackdrop();
    renderDialog();
  });
  $("#look-clear").addEventListener("click", () => { images = []; saveImages(images); renderBackdrop(); renderDialog(); });
}
