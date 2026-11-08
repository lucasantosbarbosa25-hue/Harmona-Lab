// Tela do assistente: pedido em texto ou voz, andamento, resultado e configurações.
// Recebe de app.js só o que precisa (api); não importa o app, para não haver dependência circular.

import { CHATS, buildChatPrompt, correctionPrompt, readChatAnswer } from "./chat.js";
import { GenerationError, generateProgression, testKey } from "./generate.js";
import { DEFAULT_API_BASE, EFFORTS, MODELS, checkApiBase, loadPrompt, loadSettings, modelInfo, normalizeSettings, savePrompt, saveSettings } from "./settings.js";
import { createDictation, mergeDictation, speechSupported } from "./speech.js";

const EXAMPLES = [
  "4 acordes, 80 BPM, resolução de B7alt para Em9 com F# no soprano, no estilo Dirty Loops",
  "8 acordes, 76 BPM, balada neo-soul com maj7(#11) e m(maj7), soprano descendo de F# até C, baixo em pedal",
  "6 acordes, 96 BPM, gospel moderno inspirado em Djavan, dominantes alterados, nota de ponta sempre em movimento",
];

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")} mil` : String(n));
const money = (usd) => (usd < 0.01 ? "menos de US$ 0,01" : `US$ ${usd.toFixed(2).replace(".", ",")}`);

export function initAssistant(api) {
  const { $, h, icon, toast, getProjectJson, hasProgression, applyGenerated } = api;
  let settings = loadSettings();
  let controller = null; // AbortController do pedido em andamento
  let timer = null;

  const els = {
    prompt: $("#ai-prompt"), generate: $("#ai-generate"), cancel: $("#ai-cancel"), status: $("#ai-status"),
    result: $("#ai-result"), setup: $("#ai-setup"), mic: $("#ai-mic"), mode: $("#ai-mode"), examples: $("#ai-examples"),
    dialog: $("#ai-settings"), note: $("#ai-settings-note"), engine: $("#ai-engine"), engineHint: $("#ai-engine-hint"),
    chatStep: $("#ai-chat-step"), chatPrompt: $("#ai-chat-prompt"), answer: $("#ai-answer"), fixActions: $("#ai-fix-actions"),
  };
  let chatRequest = ""; // o pedido que foi copiado para o chat (vai para as notas do projeto)
  let pending = null; // resposta do chat recusada pela conferência: { project, explanation, problems }

  // ------------------------------------------------------------ pedido
  els.prompt.value = loadPrompt();
  els.prompt.addEventListener("input", () => savePrompt(els.prompt.value));
  els.prompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); }
  });
  els.examples.replaceChildren(...EXAMPLES.map((text) => h("button", {
    type: "button", class: "chip-button", onclick: () => { els.prompt.value = text; savePrompt(text); els.prompt.focus(); },
  }, truncate(text, 56))));

  $("#ai-settings-button").append(icon("gear"));
  els.cancel.addEventListener("click", () => controller?.abort());
  els.generate.addEventListener("click", () => (settings.engine === "chat" ? copyForChat() : generate()));
  els.engine.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    settings = { ...settings, engine: b.dataset.engine };
    saveSettings(settings);
    setStatus("", "");
    refresh();
  }));
  $("#ai-chat-links").replaceChildren(...CHATS.map((c) => h("a", { class: "btn secondary small", href: c.url, target: "_blank", rel: "noopener noreferrer" }, c.name)));
  $("#ai-load-answer").addEventListener("click", loadAnswer);
  $("#ai-copy-fix").addEventListener("click", async () => {
    if (!pending) return;
    const copied = await copyText(correctionPrompt(pending.problems));
    setStatus("info", copied ? "Correções copiadas: cole no mesmo chat, envie e cole a nova resposta aqui." : "Não consegui copiar sozinho: copie o texto da caixa acima.");
  });
  $("#ai-load-anyway").addEventListener("click", () => {
    if (!pending) return;
    const { project, explanation, problems } = pending;
    applyGenerated(project, { comment: buildComment(chatRequest || els.prompt.value.trim(), { explanation, sources: [] }), message: "Progressão carregada com problemas a corrigir." });
    showResult({ title: String(project.title || "Progressão"), explanation, warnings: problems, sources: [] });
    pending = null;
    els.fixActions.hidden = true;
    setStatus("", "");
  });
  $("#ai-setup-button").addEventListener("click", () => openSettings());

  let mode = "new";
  els.mode.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; refresh(); }));

  function refresh() {
    const chat = settings.engine === "chat";
    els.engine.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.engine === settings.engine)));
    els.engineHint.textContent = chat
      ? "Grátis: o app monta o pedido, você cola no ChatGPT, Claude ou Gemini e cola a resposta de volta. O app confere cada nota."
      : "Automático: a IA da Anthropic monta e confere sozinha, pesquisando na internet se precisar. Pago por uso, com a sua chave da API.";
    if (!controller) els.generate.replaceChildren(icon(chat ? "paste" : "sparkle"), chat ? "Copiar pedido para o chat" : "Gerar progressão");
    if (!chat) els.chatStep.hidden = true;
    const canAdjust = hasProgression();
    els.mode.hidden = !canAdjust;
    if (!canAdjust) mode = "new";
    els.mode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    els.setup.hidden = chat || Boolean(settings.apiKey);
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

  // ------------------------------------------------------------ modo grátis (chat)
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
    const text = buildChatPrompt({ request, preferences: settings.preferences, mode: adjust ? "adjust" : "new", currentProject: adjust ? getProjectJson() : null });
    chatRequest = request;
    els.chatPrompt.hidden = true;
    els.chatStep.hidden = false;
    els.result.hidden = true;
    const copied = await copyText(text);
    setStatus("info", copied ? "Pedido copiado! Abra o chat, cole e envie. Depois copie a resposta e cole no passo 3." : "Não consegui copiar sozinho: toque e segure no texto do pedido, copie e cole no chat.");
  }

  function loadAnswer() {
    const text = els.answer.value.trim();
    if (!text) { setStatus("error", "Cole a resposta do chat na caixa do passo 3."); els.answer.focus(); return; }
    let read;
    try {
      read = readChatAnswer(text);
    } catch (err) {
      setStatus("error", err.message);
      return;
    }
    if (!read.ok) {
      pending = read.project && typeof read.project === "object" ? read : null;
      els.fixActions.hidden = false;
      $("#ai-load-anyway").hidden = !pending;
      pending = pending || { problems: read.problems };
      setStatus("error", `A conferência achou ${read.problems.length} problema(s): ${read.problems.slice(0, 3).join(" · ")}${read.problems.length > 3 ? " …" : ""}`);
      return;
    }
    const title = String(read.project.title || "Progressão");
    applyGenerated(read.project, { comment: buildComment(chatRequest || els.prompt.value.trim(), { explanation: read.explanation, sources: [] }), message: `Progressão carregada: ${title}` });
    showResult({ title, explanation: read.explanation, warnings: [], sources: [] });
    pending = null;
    els.fixActions.hidden = true;
    els.answer.value = "";
    setStatus("", "");
  }

  // ------------------------------------------------------------ andamento
  function setStatus(kind, text) {
    els.status.hidden = !text;
    els.status.className = `ai-status ${kind}`;
    els.status.replaceChildren(
      ...(kind === "busy" ? [h("span", { class: "spinner", "aria-hidden": "true" })] : []),
      h("span", null, text || ""),
    );
  }

  function describe(event) {
    switch (event.kind) {
      case "thinking": return "Pensando na harmonia…";
      case "searching": return event.query ? `Pesquisando na internet: “${truncate(event.query, 70)}”` : "Pesquisando na internet…";
      case "writing": return "Montando os voicings…";
      case "checking": return "Conferindo as notas e o soprano…";
      case "retry": return `Corrigindo ${event.problems} problema(s) apontado(s) na conferência (tentativa ${event.attempt}/3)…`;
      case "search-skipped": return "A pesquisa na internet não está disponível nesta conta; seguindo sem pesquisar…";
      default: return "Preparando o pedido…";
    }
  }

  /** Trava a tela enquanto a IA trabalha e mostra o andamento, com os segundos corridos. Devolve { set(texto) }. */
  function startBusy() {
    els.generate.disabled = true;
    els.prompt.readOnly = true;
    els.cancel.hidden = false;
    els.mic.disabled = true;
    const started = Date.now();
    let text = describe({});
    const paint = () => setStatus("busy", `${text} (${Math.round((Date.now() - started) / 1000)} s)`);
    paint();
    clearInterval(timer);
    timer = setInterval(paint, 1000);
    return { set: (next) => { text = next; paint(); } };
  }

  function stopBusy() {
    clearInterval(timer);
    els.generate.disabled = false;
    els.prompt.readOnly = false;
    els.cancel.hidden = true;
    els.mic.disabled = false;
  }

  // ------------------------------------------------------------ gerar
  async function generate() {
    if (controller) return;
    const request = els.prompt.value.trim();
    if (!request) {
      setStatus("error", "Escreva ou dite o que você quer, por exemplo: “6 acordes, 72 BPM, estilo Jesús Molina”.");
      els.prompt.focus();
      return;
    }
    if (!settings.apiKey) { openSettings("Para gerar com IA, cole aqui a sua chave da API da Anthropic."); return; }
    dictation?.stop();
    savePrompt(request);
    const adjust = mode === "adjust" && hasProgression();
    controller = new AbortController();
    els.result.hidden = true;
    const progress = startBusy();
    try {
      const result = await generateProgression({
        request, mode: adjust ? "adjust" : "new", currentProject: adjust ? getProjectJson() : null, settings,
        signal: controller.signal, onStatus: (event) => progress.set(describe(event)),
      });
      applyGenerated(result.project, { comment: buildComment(request, result), message: `Progressão gerada: ${result.title}` });
      showResult(result);
      setStatus("", "");
    } catch (err) {
      if (err instanceof GenerationError && err.kind === "aborted") {
        setStatus("info", "Pedido cancelado.");
      } else {
        const text = err instanceof GenerationError ? err.message : `Erro inesperado: ${err?.message || err}`;
        setStatus("error", text);
        console.error(err);
      }
    } finally {
      controller = null;
      stopBusy();
      refresh();
    }
  }

  /** Comentário guardado no projeto: explicação, pedido original e páginas consultadas. */
  function buildComment(request, result) {
    const parts = [result.explanation, `Pedido: ${request}`];
    if (result.sources.length) parts.push(`Páginas consultadas:\n${result.sources.map((s) => `- ${s.title} — ${s.url}`).join("\n")}`);
    return parts.join("\n\n");
  }

  function usageLine(result) {
    const usage = result.usage;
    const read = usage.input + usage.cacheRead + usage.cacheWrite;
    return [
      modelInfo(result.model).label.split(" · ")[0],
      `${result.turns} ${result.turns === 1 ? "rodada" : "rodadas"}`,
      ...(usage.searches ? [`${usage.searches} ${usage.searches === 1 ? "pesquisa" : "pesquisas"}`] : []),
      `${fmtK(read)} tokens lidos, ${fmtK(usage.output)} escritos`,
      `custo estimado: ${money(result.costUsd)}`,
    ].join(" · ");
  }

  function showResult(result) {
    els.result.replaceChildren(
      h("p", { class: "ai-result-title" }, icon("check"), `Pronta: ${result.title}`),
      ...(result.explanation || "").split(/\n{2,}/).filter(Boolean).map((p) => h("p", { class: "ai-explanation" }, p)),
      result.searchSkipped ? h("p", { class: "ai-note" }, "A pesquisa na internet não está ativa nesta conta da API; a progressão foi feita sem pesquisar.") : null,
      result.warnings.length ? h("ul", { class: "issues" }, ...result.warnings.map((w) => h("li", { class: "issue warning" }, icon("warning"), h("span", null, w)))) : null,
      result.sources.length
        ? h("details", { class: "more" },
          h("summary", null, `Páginas consultadas na pesquisa (${result.sources.length})`),
          h("ul", { class: "sources" }, ...result.sources.map((s) => h("li", null,
            h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, truncate(s.title, 90))))))
        : null,
      result.usage ? h("p", { class: "ai-usage" }, usageLine(result)) : null,
    );
    els.result.hidden = false;
  }

  // ------------------------------------------------------------ ditado
  let dictation = null;
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

  // ------------------------------------------------------------ configurações
  const f = {
    key: $("#ai-key"), show: $("#ai-key-show"), test: $("#ai-test"), testResult: $("#ai-test-result"),
    model: $("#ai-model"), effort: $("#ai-effort"), search: $("#ai-search"), max: $("#ai-max-searches"),
    prefs: $("#ai-preferences"), base: $("#ai-base"), clear: $("#ai-clear-key"), error: $("#ai-settings-error"),
    save: $("#ai-settings-save"),
  };
  f.model.replaceChildren(...MODELS.map((m) => h("option", { value: m.id }, m.label)));
  f.effort.replaceChildren(...EFFORTS.map((e) => h("option", { value: e.id }, e.label)));

  function openSettings(message = "") {
    f.key.value = settings.apiKey;
    f.key.type = "password";
    f.show.textContent = "Mostrar";
    f.model.value = settings.model;
    f.effort.value = settings.effort;
    f.search.checked = settings.webSearch;
    f.max.value = settings.maxSearches;
    f.prefs.value = settings.preferences;
    f.base.value = settings.apiBase;
    f.base.placeholder = DEFAULT_API_BASE;
    f.testResult.textContent = "";
    f.error.textContent = "";
    els.note.textContent = message;
    els.note.hidden = !message;
    els.dialog.showModal();
  }

  const formSettings = () => normalizeSettings({
    engine: settings.engine, apiKey: f.key.value, model: f.model.value, effort: f.effort.value, webSearch: f.search.checked,
    maxSearches: f.max.value, preferences: f.prefs.value, apiBase: f.base.value,
  });

  $("#ai-settings-button").addEventListener("click", () => openSettings());
  f.show.addEventListener("click", () => {
    const hidden = f.key.type === "password";
    f.key.type = hidden ? "text" : "password";
    f.show.textContent = hidden ? "Ocultar" : "Mostrar";
  });
  f.clear.addEventListener("click", () => { f.key.value = ""; f.testResult.textContent = ""; });
  f.test.addEventListener("click", async () => {
    const draft = formSettings();
    f.testResult.className = "field-msg";
    f.testResult.textContent = "Testando…";
    f.test.disabled = true;
    try {
      await testKey(draft);
      f.testResult.className = "field-msg ok";
      f.testResult.textContent = "Funcionando: a chave e o modelo responderam.";
    } catch (err) {
      f.testResult.className = "field-msg";
      f.testResult.textContent = err instanceof GenerationError ? err.message : `Erro: ${err?.message || err}`;
    } finally {
      f.test.disabled = false;
    }
  });
  f.save.addEventListener("click", (e) => {
    const base = checkApiBase(f.base.value);
    if (!base.ok) { e.preventDefault(); f.error.textContent = base.error; return; }
    const saved = saveSettings(formSettings());
    settings = loadSettings();
    if (!saved) toast("Não consegui guardar as configurações neste navegador (armazenamento bloqueado). Valem só até fechar a página.", { error: true });
    refresh();
  });
  els.dialog.addEventListener("click", (e) => { if (e.target === els.dialog) els.dialog.close(); });

  refresh();
  return { refresh, openSettings };
}
