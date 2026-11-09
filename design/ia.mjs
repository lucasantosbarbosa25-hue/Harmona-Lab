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
import { STYLES } from "../harmonalab/web/ai/styles.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const iaMarkdown = () => `# Harmona Lab: instruções para IAs

Cole o texto abaixo nas instruções permanentes da sua IA (no Claude, num Projeto; no ChatGPT, em Personalizar ou num GPT; no Gemini, num Gem) ou envie junto do pedido. Depois é só pedir, por exemplo: "8 acordes, 76 BPM, estilo Jesús Molina, ponta descendo de F# até C".

Quem usa uma IA com navegação pode mandar: "leia ${DEFAULT_APP_URL}ia.md e monte uma progressão de 6 acordes no estilo Domi & JD Beck".

---

${PERMANENT_INSTRUCTIONS(DEFAULT_APP_URL)}
`;

export const skillMarkdown = () => `---
name: harmona-harmonia
description: Cria progressões de harmonia rebuscada para teclado (jazz/fusion, neo-soul, gospel, soul e MPB) com voicings nota por nota, explica a função de cada acorde (escalas, empréstimos modais, cromatismos, substituições), escreve frases melódicas por acorde em levadas como salsa, samba, neo-soul, fusion, gospel, rock e ska, e gera um link que abre a progressão no Harmona Lab. Use quando a pessoa pedir progressões de acordes, reharmonização ou voicings, citar artistas como Jesús Molina, Dirty Loops, Domi & JD Beck, Stevie Wonder ou Ed Motta, ou mencionar o Harmona Lab.
---

# Harmona Lab: harmonia rebuscada para teclado

Esta skill monta progressões sofisticadas com os voicings escritos nota por nota, explica a função de cada acorde e entrega um link que abre tudo no Harmona Lab (${DEFAULT_APP_URL}).

## Com código à mão, use os scripts (sempre que puder rodar Python)
1. Escreva o projeto em JSON num arquivo, no formato descrito mais abaixo (por exemplo, \`projeto.json\`).
2. Rode \`python scripts/validar.py projeto.json\` e corrija até aparecer OK. O resumo traz a linha da ponta e a do baixo: use-as na resposta.
3. Rode \`python scripts/gerar_link.py projeto.json\` e use o "link curto" na resposta. Se o chat quebrar o link, use o "legível".
4. Escreva a resposta no formato descrito mais abaixo, no nível de detalhe de \`references/exemplo.md\`.
Sem poder rodar código, siga as instruções abaixo e monte o link à mão.

## Referências (consulte quando precisar)
- \`references/vocabulario.md\`: modos da menor melódica, tensões, substituições, upper structures, voicings.
- \`references/artistas.md\`: pistas por artista e como pesquisar (com a ressalva de confirmar).
- \`references/exemplo.md\`: uma resposta completa, para servir de régua.
- \`references/levadas.md\`: as levadas (ritmos) que a pessoa pode pedir para as frases melódicas.

---

${PERMANENT_INSTRUCTIONS(DEFAULT_APP_URL)}
`;

/** As levadas das frases, para a skill consultar (a única fonte é ai/styles.js). */
export const levadasMarkdown = () => `# Levadas para as frases melódicas

A pessoa escolhe uma levada (ou deixa a IA escolher pelo pedido). A levada manda no ritmo da frase; os artistas e as músicas citados mandam no vocabulário. São generalizações para guiar o ritmo, não regras rígidas: diga o que você aproveitou de cada uma.

${STYLES.map((s) => `## ${s.label}\n\n${s.rhythm}`).join("\n\n")}
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, "harmonalab", "web", "ia.md"), iaMarkdown());
  writeFileSync(join(ROOT, "skill", "harmona-harmonia", "SKILL.md"), skillMarkdown());
  writeFileSync(join(ROOT, "skill", "harmona-harmonia", "references", "levadas.md"), levadasMarkdown());
  console.log("harmonalab/web/ia.md\nskill/harmona-harmonia/SKILL.md\nskill/harmona-harmonia/references/levadas.md");
}
