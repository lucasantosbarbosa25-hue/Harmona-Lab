// Levadas (ritmo das frases) que a pessoa escolhe no menu. É só um catálogo de dados: para acrescentar um ritmo
// novo basta uma entrada aqui; o menu, o prompt, o ia.md e a skill passam a usá-lo sozinhos.
//
// As descrições são generalizações para guiar a IA, não regras rígidas: o prompt diz isso a ela.
// O menu manda no ritmo da frase; os artistas citados no pedido continuam mandando no vocabulário.

export const NO_PHRASES = "none";
export const AUTO_STYLE = "auto";

export const STYLES = [
  {
    id: "salsa", label: "Salsa",
    rhythm: "Colcheias e semicolcheias com síncopes e antecipações (notas no “e” do tempo puxando o tempo seguinte), alinhadas à clave (3-2 ou 2-3). "
      + "Frases em pergunta e resposta, notas repetidas e pausas curtas fazem parte do gosto.",
  },
  {
    id: "samba", label: "Samba",
    rhythm: "Semicolcheias contínuas com acentos deslocados (a síncope típica do samba) e pequenas pausas. A frase corre sobre a pulsação, "
      + "com notas curtas e articuladas e antecipação do tempo forte.",
  },
  {
    id: "bossa", label: "Bossa nova",
    rhythm: "Colcheias suaves e esparsas, com a síncope característica da bossa (a nota antecipa o tempo seguinte), notas mais longas na chegada "
      + "e bastante espaço. Frases curtas e cantáveis, com cromatismo discreto.",
  },
  {
    id: "neosoul", label: "Neo-soul",
    rhythm: "Semicolcheias e tercinas com balanço leve, notas repetidas e pausas: a frase respira e entra um pouco depois do tempo. "
      + "Aproximações curtas por baixo, pouca densidade e notas que se arrastam no fim da frase.",
  },
  {
    id: "fusion", label: "Jazz fusion",
    rhythm: "Linhas rápidas em semicolcheias, com fusas e quiálteras (16q), agrupamentos irregulares (3+3+2, cinco sobre quatro), envolventes cromáticas e saltos. "
      + "A nota-alvo chega num tempo forte, depois de uma corrida.",
  },
  {
    id: "gospel", label: "Gospel americano",
    rhythm: "Corridas rápidas de 3 a 6 notas (16 avos e 32 avos) que pousam no tempo, pentatônica com blue notes, fills curtos entre as frases "
      + "(pergunta e resposta com o acorde), motivos repetidos, terças em paralelo e chegada firme ao alvo.",
  },
  {
    id: "funk", label: "Funk (16 avos)",
    rhythm: "Levada de semicolcheias com notas curtas e secas, pausas marcantes, síncopes no “e” e no “a” do tempo e notas repetidas. "
      + "Poucas notas por frase e muito ritmo.",
  },
  {
    id: "swing", label: "Jazz swing",
    rhythm: "Colcheias com balanço de tercina: escreva cada par balançado como 4t + 8t (ou 8t em grupos de três). Linhas de bebop com aproximações cromáticas "
      + "e alvos (3ª e 7ª) nos tempos fortes, e frases que respiram em pausas de semínima.",
  },
  {
    id: "rock", label: "Rock",
    rhythm: "Colcheias retas, pentatônica menor com blue note (b5), riffs curtos e repetidos, saltos de quarta e de quinta, pausas que seguram o tempo. "
      + "Pouco cromatismo; repetição com variação no fim.",
  },
  {
    id: "ska", label: "Ska",
    rhythm: "Frases nos contratempos (o “e” de cada tempo, com pausa no tempo), colcheias retas e secas, notas curtas, ao estilo de um naipe de metais "
      + "em pergunta e resposta. Pulsação firme em 4/4.",
  },
];

/** O que o menu mostra, na ordem. */
export const STYLE_OPTIONS = [
  { id: NO_PHRASES, label: "Sem frases" },
  { id: AUTO_STYLE, label: "Automática (pelo que eu escrever)" },
  ...STYLES.map(({ id, label }) => ({ id, label })),
];

export const findStyle = (id) => STYLES.find((s) => s.id === id) ?? null;
export const styleLabel = (id) => STYLE_OPTIONS.find((s) => s.id === id)?.label ?? "";
export const isStyleId = (id) => STYLE_OPTIONS.some((s) => s.id === id);
