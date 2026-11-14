// Gera, a partir de harmonalab/web/ai/prompt.js (a única fonte do texto):
//   harmonalab/web/ia.md                    instruções para IAs, publicadas junto do app (https://harmona-lab.pages.dev/ia.md)
//   skill/harmona-harmonia/SKILL.md         a skill para o Claude (o mesmo texto + o uso dos scripts)
// Um teste confere que os dois arquivos estão em dia.
//
// Uso:  node design/ia.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_APP_URL, PERMANENT_INSTRUCTIONS } from "../harmonalab/web/ai/prompt.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const iaMarkdown = () => `# Harmona Lab: instruções para IAs

Cole o texto abaixo nas instruções permanentes da sua IA (no Claude, num Projeto; no ChatGPT, em Personalizar ou num GPT; no Gemini, num Gem) ou envie junto do pedido. Depois é só pedir, por exemplo: "8 acordes, 76 BPM, estilo Jesús Molina, ponta descendo de F# até C".

Quem usa uma IA com navegação pode mandar: "leia ${DEFAULT_APP_URL}ia.md e monte uma progressão de 6 acordes no estilo Domi & JD Beck".

---

${PERMANENT_INSTRUCTIONS(DEFAULT_APP_URL)}
`;

export const skillMarkdown = () => `---
name: harmona-harmonia
description: Cria progressões de harmonia para teclado com voicings nota por nota (rebuscada em jazz/fusion, neo-soul, gospel, soul e MPB; diatônica e simples em rock, metal, worship, balada e pop), harmoniza melodias cantadas e cria ou ajusta uma parte (A, B, C) de uma música que já existe, explica a função de cada acorde (escalas, empréstimos modais, cromatismos, substituições), informa a escala de cada acorde (o Harmona Lab escreve o ritmo e as frases a partir dela) e gera um link que abre a progressão no Harmona Lab. Use quando a pessoa pedir progressões de acordes, reharmonização ou voicings, citar artistas como Jesús Molina, Dirty Loops, Domi & JD Beck, Stevie Wonder ou Ed Motta, ou mencionar o Harmona Lab.
---

# Harmona Lab: harmonia rebuscada para teclado

Esta skill monta progressões sofisticadas com os voicings escritos nota por nota, explica a função de cada acorde e entrega um link que abre tudo no Harmona Lab (${DEFAULT_APP_URL}).

## Com código à mão, use os scripts (sempre que puder rodar Python)
1. Escreva o projeto em JSON num arquivo, no formato descrito mais abaixo (por exemplo, \`projeto.json\`).
2. Rode \`python scripts/validar.py projeto.json\` e corrija até aparecer OK. O resumo traz a linha da ponta e a do baixo: use-as na resposta.
3. Rode \`python scripts/gerar_link.py projeto.json\` e use o "link curto" na resposta. Se o chat quebrar o link, use o "legível".
4. Escreva a resposta no formato descrito mais abaixo, no nível de detalhe de \`references/exemplo.md\`.

Pedido de UMA PARTE (o pedido traz "PARTE NOVA", "CONTINUAÇÃO DA MÚSICA" ou "AJUSTE DA PARTE", com o mapa da música e a harmonia atual): siga a tarefa do pedido e devolva SÓ os acordes novos.
1. Escreva em \`parte.json\` só esses acordes, em \`{"chords": [...]}\`: primeiro os reescritos do fim da parte anterior (se o pedido permitir e você reescrever), depois os da parte.
2. Rode \`python scripts/validar.py parte.json\` e corrija até aparecer OK.
3. Rode \`python scripts/gerar_link.py parte.json --parte B --retocados K --explicacao "..."\` (K = quantos acordes do começo do JSON reescrevem o fim da parte anterior: 0, 1 ou 2). Se o pedido disser que a parte deve somar EXATAMENTE N tempos, acrescente \`--tempos N\`: o script confere a soma.
4. Entregue esse link (ele começa com \`#cont=\`). Não gere o link da música inteira: o app encaixa a parte e mantém o resto.
Sem poder rodar código, siga as instruções abaixo e monte o link à mão.

## Referências (consulte quando precisar)
- \`references/vocabulario.md\`: modos da menor melódica, tensões, substituições, upper structures, voicings.
- \`references/artistas.md\`: pistas por artista e como pesquisar (com a ressalva de confirmar).
- \`references/exemplo.md\`: uma resposta completa, para servir de régua.

---

${PERMANENT_INSTRUCTIONS(DEFAULT_APP_URL)}
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, "harmonalab", "web", "ia.md"), iaMarkdown());
  writeFileSync(join(ROOT, "skill", "harmona-harmonia", "SKILL.md"), skillMarkdown());
  console.log("harmonalab/web/ia.md\nskill/harmona-harmonia/SKILL.md");
}
