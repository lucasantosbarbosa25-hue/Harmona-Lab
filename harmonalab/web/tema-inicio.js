// Aplica o tema guardado antes de a tela aparecer (sem piscar com as cores erradas). O resto fica em aparencia.js.
(function () {
  var theme = "azul";
  try {
    var saved = JSON.parse(localStorage.getItem("harmonalab:aparencia") || "null");
    if (saved && typeof saved.theme === "string") theme = saved.theme;
  } catch (e) { /* sem armazenamento: vale o padrão */ }
  document.documentElement.setAttribute("data-theme", theme);
})();
