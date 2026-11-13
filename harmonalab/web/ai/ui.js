// Tela do assistente: pedido em texto ou voz → pedido copiado para a IA da pessoa → resposta (ou link) conferida e aberta.
// Recebe de app.js só o que precisa (api); não importa o app, para não haver dependência circular.

import { CHATS, buildChatPrompt, correctionPrompt, readChatAnswer } from "./chat.js";
import { checkDelivery } from "./check.js";
import { findLinkInText, parseLinkHash } from "./link.js";
import { PERMANENT_INSTRUCTIONS } from "./prompt.js";
import { createDictation, mergeDictation, speechSupported } from "./speech.js";

const PROMPT_KEY = "harmonalab:ai:prompt";
const RESEARCH_KEY = "harmonalab:ai:research";
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
const loadResearch = () => { try { return localStorage.getItem(RESEARCH_KEY) === "1"; } catch { return false; } };
const saveResearch = (on) => { try { localStorage.setItem(RESEARCH_KEY, on ? "1" : "0"); } catch { /* sem armazenamento */ } };

export function initAssistant(api) {
  const { $, h, icon, toast, getProjectJson, getVoice, getParts, getTarget, selectPart, setPartRequest, describeNewSection, hasProgression, applyGenerated, applyContinuation } = api;
  const els = {
    prompt: $("#ai-prompt"), generate: $("#ai-generate"), status: $("#ai-status"), result: $("#ai-result"),
    mic: $("#ai-mic"), parts: $("#ai-parts"), partsList: $("#ai-parts-list"), task: $("#ai-task"), examples: $("#ai-examples"), chatStep: $("#ai-chat-step"),
    chatPrompt: $("#ai-chat-prompt"), answer: $("#ai-answer"), fixActions: $("#ai-fix-actions"),
    research: $("#ai-research"),
  };
  const basePlaceholder = els.prompt.placeholder;
  let shown = ""; // a parte cujo pedido está na caixa (para não trocar o texto enquanto a pessoa escreve)
  let asked = -1; // a parte para a qual o último pedido foi copiado (a resposta entra nela)
  let chatRequest = ""; // o pedido que foi copiado (vai para as notas do projeto)
  let pending = null; // resposta recusada pela conferência: { project, explanation, problems }
  let dictation = null;

  // ------------------------------------------------------------ pedido
  // cada parte tem o seu pedido; o da música nova (antes de existir harmonia) fica guardado no aparelho
  const keep = (text) => { const t = getTarget(); if (!t || t.kind === "new") savePrompt(text); else setPartRequest(t.index, text); };
  els.prompt.addEventListener("input", () => keep(els.prompt.value));
  els.research.checked = loadResearch();
  els.research.addEventListener("change", () => saveResearch(els.research.checked));
  els.examples.replaceChildren(...EXAMPLES.map((text) => h("button", {
    type: "button", class: "chip-button", onclick: () => { els.prompt.value = text; keep(text); els.prompt.focus(); },
  }, truncate(text, 56))));
  $("#ai-chat-links").replaceChildren(...CHATS.map((c) => h("a", { class: "btn secondary small", href: c.url, target: "_blank", rel: "noopener noreferrer" }, c.name)));
  els.generate.addEventListener("click", copyForChat);
  $("#ai-load-answer").addEventListener("click", loadAnswer);

  const bars = (t) => { const n = t.toBar - t.fromBar + 1; return `${n} compasso${n === 1 ? "" : "s"}`; };
  /** O que o assistente vai fazer na parte escolhida, em uma frase. */
  function taskText(t) {
    if (t.kind === "adjust") return `Parte ${t.name}: já tem harmonia (${bars(t)}). Diga o que mudar; ela continua com o mesmo tamanho e o resto da música não muda.`;
    if (t.melody) return `Parte ${t.name}: tem a melodia (${bars(t)}) e falta a harmonia. O pedido é opcional: vazio, a IA harmoniza do jeito dela.`;
    return `Parte ${t.name}: nova e vazia. Escreva como você quer essa parte; a IA decide o tamanho. O resto da música não muda.`;
  }

  function refresh() {
    const parts = getParts();
    const t = getTarget();
    const fresh = !t || t.kind === "new"; // música ainda sem harmonia: o pedido cria a música
    els.parts.hidden = fresh;
    els.task.hidden = fresh && !t?.example;
    if (fresh && t?.example) els.task.textContent = "O que está na tela é um exemplo. O seu pedido cria a sua música no lugar dele.";
    els.examples.hidden = !fresh;
    if (!fresh) {
      els.partsList.replaceChildren(
        ...parts.map((p) => h("button", {
          type: "button", class: "ai-part", style: `--hue:${p.hue}`, "aria-pressed": String(p.index === t.index),
          "aria-label": `Parte ${p.name}${p.empty ? ", sem harmonia" : ""}`, onclick: () => selectPart(p.index),
        }, h("strong", null, p.name), p.empty ? h("small", null, "vazia") : null)),
        h("button", { type: "button", class: "ai-part add", "aria-label": "Criar uma parte nova pelo pedido", onclick: () => describeNewSection() }, h("strong", null, "+"), h("small", null, "nova")),
      );
      els.task.textContent = taskText(t);
    }
    // o texto da caixa só troca quando a parte muda
    const key = fresh ? "new" : `${t.index}:${t.name}`;
    if (key !== shown) { shown = key; els.prompt.value = fresh ? loadPrompt() : t.request; }
    els.prompt.placeholder = fresh ? basePlaceholder
      : t.kind === "adjust" ? `O que mudar na parte ${t.name}? Ex.: "troque o último acorde por um dominante alterado" ou "deixe mais tensa".`
        : t.melody ? `Opcional: como você quer a harmonia da parte ${t.name}? Ex.: "refrão mais aberto". Vazio = a IA decide.`
          : `Como você quer a parte ${t.name}? Ex.: "refrão de 8 compassos, mais aberto, subindo um tom".`;
    els.generate.replaceChildren(icon("paste"), fresh ? "1. Copiar pedido para a IA" : `1. ${t.kind === "adjust" ? "Ajustar" : "Criar"} a parte ${t.name}: copiar pedido`);
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
    const t = getTarget();
    const part = t && t.kind !== "new" ? t : null;
    if (!request && (!part || part.kind === "adjust")) {
      setStatus("error", part ? `Escreva o que você quer mudar na parte ${part.name}.` : "Escreva ou dite o que você quer, por exemplo: “6 acordes, 72 BPM, estilo Jesús Molina”.");
      els.prompt.focus();
      return;
    }
    dictation?.stop();
    keep(els.prompt.value);
    const continuation = part ? {
      kind: part.kind, section: part.name, previous: part.kind === "create" ? part.previous : null, fromBar: part.fromBar, toBar: part.toBar,
      beats: part.beats, fixed: part.fixed, hasNext: part.hasNext,
    } : null;
    const text = buildChatPrompt({
      request, mode: part ? "continue" : "new", currentProject: part ? getProjectJson() : null,
      appUrl: appUrl(), research: els.research.checked, voice: getVoice?.() ?? null, continuation,
    });
    chatRequest = request;
    asked = part ? part.index : -1;
    els.chatPrompt.hidden = true;
    els.chatStep.hidden = false;
    els.result.hidden = true;
    const copied = await copyText(text);
    const what = part ? `Pedido da parte ${part.name} copiado!` : "Pedido copiado!";
    setStatus("info", copied ? `${what} Abra a sua IA, cole e envie. Depois toque no link que ela mandar ou cole a resposta no passo 3.` : "Não consegui copiar sozinho: toque e segure no texto do pedido, copie e cole na sua IA.");
  }

  $("#ai-copy-instructions").addEventListener("click", async () => {
    const copied = await copyText(PERMANENT_INSTRUCTIONS(appUrl()));
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

  /** Resposta de continuação (só os acordes novos): o app encaixa na parte nova. Devolve true se era uma continuação. */
  let fromBox = false; // a resposta veio da caixa do passo 3 (e não de um link aberto de fora)
  let replaceConfirmed = false; // a pessoa já confirmou a troca da música toda (ao abrir um link)
  function acceptContinuation(project, explanation, problems) {
    if (!project?.continuation) return false;
    const result = applyContinuation(project, { explanation, request: chatRequest, index: asked });
    if (result.problems.length) {
      pending = { problems: result.problems };
      els.fixActions.hidden = false;
      $("#ai-load-anyway").hidden = true;
      els.chatStep.hidden = false;
      setStatus("error", `A parte não encaixou: ${result.problems.join(" · ")}`);
      return true;
    }
    asked = -1;
    showResult(result.title, explanation, problems);
    pending = null;
    els.fixActions.hidden = true;
    els.answer.value = "";
    setStatus("", "");
    return true;
  }

  function accept(project, explanation, problems, message, request = chatRequest || els.prompt.value.trim()) {
    if (acceptContinuation(project, explanation, problems)) return;
    // a música já existe e a resposta traz uma música inteira: só troca tudo se a pessoa confirmar
    if (hasProgression() && getTarget()?.kind !== "new" && !replaceConfirmed
      && !window.confirm("Esta resposta traz uma música inteira, não uma parte. Trocar a música atual por ela? (Dá para desfazer logo em seguida.)")) {
      setStatus("info", "Nada foi trocado. Para mexer só em uma parte, escolha a parte e copie o pedido dela.");
      return;
    }
    replaceConfirmed = false;
    const title = String(project.title || "Progressão");
    // o pedido que criou a música fica guardado na primeira parte dela (é o pedido da parte A)
    const own = request || (fromBox ? chatRequest : ""); // link colado na caixa da resposta: é a resposta ao pedido copiado
    if (own && Array.isArray(project.chords) && project.chords[0] && typeof project.chords[0] === "object") project.chords[0] = { ...project.chords[0], request: own };
    shown = "";
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
      keep(link.request);
      setStatus("info", "Pedido do link carregado. Toque em “Copiar pedido para a IA” quando quiser.");
      els.prompt.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }
    if (!link.project?.continuation && askBeforeReplacing) {
      if (!window.confirm("Abrir a progressão deste link? Ela substitui a atual (dá para desfazer logo em seguida).")) return true;
      replaceConfirmed = true;
    }
    receiveProject(link.project, link.explanation);
    return true;
  }

  async function loadAnswer() {
    const text = els.answer.value.trim();
    if (!text) { setStatus("error", "Cole a resposta da IA (ou o link dela) na caixa do passo 3."); els.answer.focus(); return; }
    const hash = findLinkInText(text);
    fromBox = true;
    try {
      if (hash && (await openLink(hash))) { if (!pending) els.answer.value = ""; return; }
    } finally { fromBox = false; }
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
        else { if (els.status.classList.contains("info")) setStatus("", ""); keep(els.prompt.value); }
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
