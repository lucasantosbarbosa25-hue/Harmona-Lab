// Frases melódicas no prompt: o bloco de instruções que só entra quando a pessoa pede frases.
//
// Para o app crescer (arpejos, outros tipos de frase, outros papéis de nota), cada recurso é uma "feature" com o seu
// bloco de instruções, o que ele acrescenta ao link e a linha que entra no pedido. prompt.js só junta as features ativas.

import { STYLES, findStyle, styleLabel, AUTO_STYLE, NO_PHRASES } from "./styles.js";

/** Um acorde do exemplo de frase: o B7alt do projeto de exemplo, com a escala alterada descendo até o 3º grau e a fundamental. */
export const EXAMPLE_PHRASE_CHORD = {
  symbol: "B7alt", function: "V7alt", scale: "C menor melódica a partir de B", duration_beats: 4, left_hand: ["B2", "A3"],
  right_hand: ["D4", "Eb4", "G4", "C5"], top_note: "C5",
  comment: "Dominante alterado, tensão máxima antes de resolver no Em9.",
  phrase: "G5/8 F5/8 Eb5/4*alvo D5/8 C5/8 B4/4*alvo", phrase_scale: "B C D Eb F G A",
};

/** Mesma frase no formato do link (campos 7 e 8 do acorde). */
export const EXAMPLE_PHRASE_LINK_FIELDS = "G5/8_F5/8_Eb5/4*alvo_D5/8_C5/8_B4/4*alvo:B_C_D_Eb_F_G_A";

const bullet = (s) => `- ${s.label}: ${s.rhythm}`;

function styleSection(phrases) {
  if (phrases === AUTO_STYLE || phrases === "any") {
    return `LEVADAS (o ritmo das frases)\n${phrases === "any"
      ? "Se o pedido trouxer “Levada das frases: X”, use essa levada; senão escolha pela descrição do pedido e pelas referências citadas. "
      : "Escolha a levada pela descrição do pedido e pelas referências citadas. "}`
      + "Cada frase usa uma levada só. São generalizações para guiar o ritmo, não regras rígidas.\n"
      + STYLES.map(bullet).join("\n");
  }
  const style = findStyle(phrases);
  if (!style) return "";
  return `LEVADA ESCOLHIDA: ${style.label}\n${style.rhythm}\n`
    + "A levada manda no ritmo das frases; os artistas e as músicas citados no pedido continuam mandando no vocabulário (notas, aproximações, gosto). "
    + "É uma aproximação do estilo, não uma regra rígida: diga, na explicação, o que você tirou da levada.";
}

/** Instruções das frases. `phrases`: "any" (instruções permanentes), "auto" ou o id de uma levada. */
export function phrasesBlock(phrases) {
  const when = phrases === "any"
    ? "(só quando o pedido pedir frases, linhas, licks, aproximações ou arpejos, ou trouxer “Frases melódicas” ou “Levada das frases”)"
    : "(este pedido traz frases)";
  return `FRASES MELÓDICAS ${when}
Além dos acordes, escreva uma frase curta para cada acorde (ou só para os que o pedido indicar): uma linha melódica dentro daquela harmonia, para a pessoa sentir o gosto do acorde. \
A pessoa descreve em linguagem natural o que quer (aproximação cromática, só notas da escala, pentatônica, notas-alvo caindo nos tempos certos, um ritmo, um artista...): \
siga a descrição dela com criatividade. Os tipos citados aqui são exemplos, não uma lista fechada. Sem descrição, escolha o que melhor mostra cada acorde.
Cada acorde ganha dois campos:
- "phrase": as notas em ordem, como numa partitura, separadas por espaço, cada uma NOTA/DURAÇÃO. A duração é o valor da figura: 4 = semínima (1 tempo), 8 = colcheia, 16 = semicolcheia, \
32 = fusa; t = tercina (4t, 8t), q = quiáltera de cinco (16q), . = ponto (4. = 1,5 tempo). Pausa: r/DURAÇÃO. Você não calcula onde cada nota começa: o app soma as durações a partir do início do acorde. \
A soma não pode passar de duration_beats; pode ser menor (o resto fica em silêncio). As notas levam oitava, com C4 = dó central, como no resto do projeto. Tessitura confortável: C3 a C7.
- Papéis, depois de *, são opcionais. Marque com *alvo a nota de chegada (cai num tempo e é nota do acorde) e com *aprox a nota de aproximação, que resolve a um semitom na nota seguinte \
(numa sequência de aproximações só a última precisa resolver; se for a última nota da frase, resolve no próximo acorde). Use outros papéis (*passagem, *blue, *tensao ou o que quiser explicar) à vontade: \
são livres e o app não os confere. Nota sem marca = nota da escala.
- "phrase_scale": as notas da escala em que a frase foi pensada, sem oitava (“B C D Eb F G A”). Ela precisa conter as notas do acorde, e as notas sem marca precisam estar nela; \
as marcadas *aprox, *passagem e *blue podem ser cromáticas.
Exemplo (um acorde, em 4 tempos; a frase desce a escala alterada até o 3º grau e a fundamental):
${"```"}json
${JSON.stringify(EXAMPLE_PHRASE_CHORD)}
${"```"}
Confira antes de responder: (1) a soma das durações de cada frase não passa do acorde; (2) cada *alvo começa num tempo (soma das durações anteriores inteira, em semínimas) e é nota do acorde que você escreveu; \
(3) cada *aprox fica a um semitom da nota seguinte; (4) as notas sem marca pertencem à phrase_scale; (5) a frase é o que a pessoa pediu (tipo, levada, artista).
Na resposta, depois da tabela, escreva uma linha por frase: o que ela faz sobre o acorde e por quê (por exemplo, “aproximação cromática por baixo ao 3º grau”). No projeto, preencha "style" com o nome da levada usada.
${styleSection(phrases)}`;
}

/** O que as frases acrescentam à descrição do link. */
export const phrasesLinkSpec = `- Com frases, cada acorde ganha mais dois campos no fim: cifra:notas:duração:função:escala:comentário:frase:escala_da_frase. Na frase, separe as notas por _ , escreva o sustenido como s (F#5 vira Fs5) e mantenha / e * como estão; \
na escala da frase, separe as notas por _ . Acrescente st=Levada (por exemplo, st=Neo-soul).
- Exemplo dos campos de frase do acorde B7alt: ${EXAMPLE_PHRASE_LINK_FIELDS}`;

/** Recursos de prompt ativos para um pedido. `phrases` vale "off" (padrão), "any", "auto" ou o id de uma levada. */
export const FEATURES = [
  {
    id: "phrases",
    active: (opts) => Boolean(opts.phrases) && opts.phrases !== "off" && opts.phrases !== NO_PHRASES,
    block: (opts) => phrasesBlock(opts.phrases),
    linkSpec: () => phrasesLinkSpec,
    requestLine: (opts) => (opts.phrases === "any" ? null
      : opts.phrases === AUTO_STYLE ? "FRASES MELÓDICAS: sim, com levada automática (escolha pelo pedido e pelas referências)."
        : `FRASES MELÓDICAS: sim. Levada das frases: ${styleLabel(opts.phrases)}.`),
  },
];
