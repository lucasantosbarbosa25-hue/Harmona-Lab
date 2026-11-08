// Tela do assistente: pedido em texto ou voz → pedido copiado para a IA da pessoa → resposta (ou link) conferida e aberta.
// Recebe de app.js só o que precisa (api); não importa o app, para não haver dependência circular.

import { CHATS, buildChatPrompt, correctionPrompt, readChatAnswer } from "./chat.js";
import { checkDelivery } from "./check.js";
import { findLinkInText, parseLinkHash } from "./link.js";
import { instructions } from "./prompt.js";
import { createDictation, mergeDictation, speechSupported } from "./speech.js";

const PROMPT_KEY = "harmonalab:ai:prompt";
const EXAMPLES = [
  "8 acordes, 76 BPM, estilo Jesús Molina, ponta descendo de F# até C e baixo em pedal de E",
  "4 acordes resolvendo B7alt em Em9 com ponta fixa em F#, estilo Dirty Loops",
  "6 acordes, 92 BPM, neo-soul à la Domi & JD Beck, com acordes quartais e empréstimo modal",
  "5 acordes, 70 BPM, baixo cromático à Stevie Wonder, com slash chords e resolução enganosa",
  "8 acordes, bossa soul à Ed Motta, com maj7(#11), dominantes alterados e diminutos de passagem",
];

/** Endereço do app (sem o arquivo e sem #), para as instruções apontarem para onde a pessoa está. */
const appUrl = () => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}`;
const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const loadPrompt = () => { try { return localStorage.getItem(PROMPT_KEY) || ""; } catch { return ""; } };
const savePrompt = (text) => { try { localStorage.setItem(PROMPT_KEY, text); } catch { /* sem armazenamento */ } };

export function initAssistant(api) {
  const { $, h, icon, toast, getProjectJson, hasProgression, applyGenerated } = api;
  const els = {
    prompt: $("#ai-prompt"), generate: $("#ai-generate"), status: $("#ai-status"), result: $("#ai-result"),
    mic: $("#ai-mic"), mode: $("#ai-mode"), examples: $("#ai-examples"), chatStep: $("#ai-chat-step"),
    chatPrompt: $("#ai-chat-prompt"), answer: $("#ai-answer"), fixActions: $("#ai-fix-actions"),
  };
  let mode = "new";
  let chatRequest = ""; // o pedido que foi copiado (vai para as notas do projeto)
  let pending = null; // resposta recusada pela conferência: { project, explanation, problems }
  let dictation = null;

  // ------------------------------------------------------------ pedido
  els.prompt.value = loadPrompt();
  els.prompt.addEventListener("input", () => savePrompt(els.prompt.value));
  els.examples.replaceChildren(...EXAMPLES.map((text) => h("button", {
    type: "button", class: "chip-button", onclick: () => { els.prompt.value = text; savePrompt(text); els.prompt.focus(); },
  }, truncate(text, 56))));
  $("#ai-chat-links").replaceChildren(...CHATS.map((c) => h("a", { class: "btn secondary small", href: c.url, target: "_blank", rel: "noopener noreferrer" }, c.name)));
  els.generate.replaceChildren(icon("paste"), "1. Copiar pedido para a IA");
  els.generate.addEventListener("click", copyForChat);
  $("#ai-load-answer").addEventListener("click", loadAnswer);
  els.mode.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; refresh(); }));

  function refresh() {
    const canAdjust = hasProgression();
    els.mode.hidden = !canAdjust;
    if (!canAdjust) mode = "new";
    els.mode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  }

  function setStatus(kind, text) {
    els.status.hidden = !text;
    els.status.className = `ai-status ${kind}`;
    els.status.replaceChildren(h("span", null, text || ""));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      els.chatPrompt.value = text; // sem acesso à área de transferência: mostra o texto para copiar à mão
      els.chatPrompt.hidden = false;
      els.chatPrompt.select();
      return false;
    }
  }

  // ------------------------------------------------------------ copiar o pedido
  async function copyForChat() {
    const request = els.prompt.value.trim();
    if (!request) {
      setStatus("error", "Escreva ou dite o que você quer, por exemplo: “6 acordes, 72 BPM, estilo Jesús Molina”.");
      els.prompt.focus();
      return;
    }
    dictation?.stop();
    savePrompt(request);
    const adjust = mode === "adjust" && hasProgression();
    const text = buildChatPrompt({ request, mode: adjust ? "adjust" : "new", currentProject: adjust ? getProjectJson() : null, appUrl: appUrl() });
    chatRequest = request;
    els.chatPrompt.hidden = true;
    els.chatStep.hidden = false;
    els.result.hidden = true;
    const copied = await copyText(text);
    setStatus("info", copied ? "Pedido copiado! Abra a sua IA, cole e envie. Depois toque no link que ela mandar ou cole a resposta no passo 3." : "Não consegui copiar sozinho: toque e segure no texto do pedido, copie e cole na sua IA.");
  }

  $("#ai-copy-instructions").addEventListener("click", async () => {
    const copied = await copyText(instructions(appUrl()));
    toast(copied ? "Instruções copiadas. Cole nas instruções permanentes da sua IA." : "Não consegui copiar sozinho: copie o texto que apareceu na tela.", { error: !copied });
  });

  // ------------------------------------------------------------ ler a resposta
  function buildComment(request, explanation) {
    return [explanation, request ? `Pedido: ${request}` : ""].filter(Boolean).join("\n\n");
  }

  function showResult(title, explanation, warnings) {
    els.result.replaceChildren(
      h("p", { class: "ai-result-title" }, icon("check"), `Pronta: ${title}`),
      ...(explanation || "").split(/\n{2,}/).filter(Boolean).map((p) => h("p", { class: "ai-explanation" }, p)),
      warnings.length ? h("ul", { class: "issues" }, ...warnings.map((w) => h("li", { class: "issue warning" }, icon("warning"), h("span", null, w)))) : null,
    );
    els.result.hidden = false;
  }

  function accept(project, explanation, problems, message, request = chatRequest || els.prompt.value.trim()) {
    const title = String(project.title || "Progressão");
    applyGenerated(project, { comment: buildComment(request, explanation), message: message || `Progressão carregada: ${title}` });
    showResult(title, explanation, problems);
    pending = null;
    els.fixActions.hidden = true;
    els.answer.value = "";
    setStatus("", "");
  }

  /** Projeto vindo de um link: confere e abre; se houver problema, oferece copiar as correções para a IA. */
  function receiveProject(project, explanation) {
    const check = checkDelivery({ projeto: project, explicacao: explanation }, { requireExplanation: false });
    // Link de outra pessoa abre sempre que não houver erro de verdade; avisos (ex.: ponta) aparecem no resultado.
    const errors = (check.report?.issues || []).filter((i) => i.level === "error");
    if (!errors.length) { accept(project, explanation, check.problems, undefined, ""); return; }
    pending = { project, explanation, problems: check.problems };
    els.fixActions.hidden = false;
    $("#ai-load-anyway").hidden = false;
    els.chatStep.hidden = false;
    setStatus("error", `O link tem ${check.problems.length} problema(s): ${check.problems.slice(0, 3).join(" · ")}${check.problems.length > 3 ? " …" : ""}`);
  }

  /**
   * Abre um link do Harmona Lab (o que vem depois do #). Devolve true se tratou o link.
   * `askBeforeReplacing`: pergunta antes de trocar uma progressão que a pessoa já tinha.
   */
  async function openLink(hash, { askBeforeReplacing = false } = {}) {
    const link = await parseLinkHash(hash);
    if (link.kind === "none") return false;
    if (link.kind === "error") { setStatus("error", link.message); return true; }
    if (link.kind === "request") {
      els.prompt.value = link.request;
      savePrompt(link.request);
      setStatus("info", "Pedido do link carregado. Toque em “Copiar pedido para a IA” quando quiser.");
      els.prompt.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }
    if (askBeforeReplacing && !window.confirm("Abrir a progressão deste link? Ela substitui a atual (dá para desfazer logo em seguida).")) return true;
    receiveProject(link.project, link.explanation);
    return true;
  }

  async function loadAnswer() {
    const text = els.answer.value.trim();
    if (!text) { setStatus("error", "Cole a resposta da IA (ou o link dela) na caixa do passo 3."); els.answer.focus(); return; }
    const hash = findLinkInText(text);
    if (hash && (await openLink(hash))) { if (!pending) els.answer.value = ""; return; }
    let read;
    try {
      read = readChatAnswer(text);
    } catch (err) {
      setStatus("error", err.message);
      return;
    }
    if (read.ok) { accept(read.project, read.explanation, []); return; }
    const loadable = read.project && typeof read.project === "object";
    pending = loadable ? read : { problems: read.problems };
    els.fixActions.hidden = false;
    $("#ai-load-anyway").hidden = !loadable;
    setStatus("error", `A conferência achou ${read.problems.length} problema(s): ${read.problems.slice(0, 3).join(" · ")}${read.problems.length > 3 ? " …" : ""}`);
  }

  $("#ai-copy-fix").addEventListener("click", async () => {
    if (!pending) return;
    const copied = await copyText(correctionPrompt(pending.problems));
    setStatus("info", copied ? "Correções copiadas: cole na mesma conversa, envie e cole a nova resposta aqui." : "Não consegui copiar sozinho: copie o texto da caixa acima.");
  });
  $("#ai-load-anyway").addEventListener("click", () => {
    if (pending?.project) accept(pending.project, pending.explanation, pending.problems, "Progressão carregada com problemas a corrigir.");
  });

  // ------------------------------------------------------------ ditado
  if (speechSupported()) {
    let base = "";
    dictation = createDictation({
      onUpdate: (said) => { els.prompt.value = mergeDictation(base, said); },
      onState: (state) => {
        els.mic.setAttribute("aria-pressed", String(state === "listening"));
        els.mic.classList.toggle("listening", state === "listening");
        if (state === "listening") setStatus("info", "Ouvindo… fale o pedido e faça uma pausa quando terminar.");
        else { if (els.status.classList.contains("info")) setStatus("", ""); savePrompt(els.prompt.value); }
      },
      onError: (message) => setStatus("error", message),
    });
    els.mic.addEventListener("click", () => {
      if (!dictation.listening) base = els.prompt.value;
      dictation.toggle();
    });
  } else {
    els.mic.hidden = true;
    $("#ai-mic-tip").hidden = false; // sem reconhecimento de voz no navegador: o microfone do teclado serve
  }
  els.mic.append(icon("mic"));

  refresh();
  return { refresh, openLink };
}
