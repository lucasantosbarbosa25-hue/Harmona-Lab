// Base de conhecimento do Harmona Lab: como cada estilo soa no RITMO, para o app escrever a levada dos acordes e as
// frases melódicas sem consultar nenhuma IA. É só um arquivo de dados: para crescer, acrescente estilos, levadas,
// células rítmicas, influências ou fontes aqui. O gerador (engine/groove.js) e a tela leem tudo daqui.
//
// O que está aqui são padrões gerais de cada estilo (vocabulário comum, descrito em aulas e artigos abertos).
// Os artistas entram como influência; não há transcrição de música nenhuma.
//
// Notação
//   levada (comp): PARTE/DURAÇÃO, camadas separadas por ";" soam juntas. Partes: T = todas as notas, E = mão esquerda e baixo,
//                  D = mão direita, B = a nota mais grave, P = a ponta. "!" = acento, "?" = toque leve, r = pausa.
//   célula (cells): só o ritmo de um trecho de frase, em tempos inteiros: durações separadas por espaço, "r" na frente = pausa.
//   durações: 4 = semínima, 8 = colcheia, 16 = semicolcheia, 32 = fusa; t = tercina, q = quiáltera de 5, . = ponto, + = ligadura.
//
// Parâmetros da frase (0 a 1): chromatic = chance de aproximação cromática antes de um alvo; enclosure = chance de envolvente
// (duas aproximações); blue = chance de blue note; leap = chance de salto; repeat = chance de repetir a nota; rest = chance de respirar
// um tempo; motif = chance de repetir o ritmo do acorde anterior. pentatonic: prefere a pentatônica da escala.
// minNotes: mínimo de notas a cada 4 tempos (a frase nunca fica vazia demais).

export const KB_VERSION = 1;

/** As três cores de frase que o pedido pode marcar em cada acorde (campo phrase_color). */
export const COLORS = ["dentro", "cromatico", "outside"];

const SWING_CELLS = [
  "4t 8t 4t 8t", "4t 8t 4", "4 4t 8t", "8t 8t 8t 4", "r4t 8t 4t 8t", "4t 8t r4t 8t", "4t 8t 8t 8t 8t",
  "r4t 8t 4", "4t 8t+4", "4 4", "8t 8t 8t 4t 8t", "r4 4t 8t", "4+4t 8t", "2",
];

export const STYLES = [
  {
    id: "swing", label: "Jazz swing",
    influences: ["Charlie Parker", "Oscar Peterson", "Bill Evans", "Barry Harris", "Jesús Molina"],
    summary: "Colcheias balançadas (tercina), alvos nos tempos, aproximações cromáticas e envolventes do bebop.",
    comps: [
      { id: "charleston", label: "Charleston", pattern: "T/4 r/4t T/8t+2" },
      { id: "quatro", label: "Quatro tempos com antecipações", pattern: "E/4 E?/4 E/4 E?/4 ; r/4t D/8t+4 r/4 r/4t D/8t" },
      { id: "contratempo", label: "Mão direita no contratempo", pattern: "E/1 ; r/4 r/4t D/8t r/4 r/4t D/8t" },
    ],
    cells: SWING_CELLS,
    phrase: { chromatic: 0.55, enclosure: 0.3, blue: 0, leap: 0.25, repeat: 0.05, rest: 0.12, motif: 0.4, pentatonic: false, minNotes: 4 },
  },
  {
    id: "blues", label: "Blues",
    influences: ["B.B. King", "Ray Charles", "Dr. John"],
    summary: "Shuffle em tercinas, pergunta e resposta, pentatônica com blue notes e frases curtas que respiram.",
    comps: [
      { id: "shuffle", label: "Shuffle", pattern: "E/4t E?/8t E/4t E?/8t E/4t E?/8t E/4t E?/8t ; D/4 r/4 r/4t D/8t+4" },
      { id: "lento", label: "Blues lento em tercinas", pattern: "E/2 E/2 ; D/8t D?/8t D?/8t D/8t D?/8t D?/8t D/8t D?/8t D?/8t D/8t D?/8t D?/8t" },
      { id: "stabs", label: "Acordes de resposta", pattern: "E/1 ; r/4 D!/8t r/4t r/4 D/4t D/8t" },
    ],
    cells: ["4t 8t 4", "8t 8t 8t 4", "r4t 8t 4", "4t 8t+4", "4 r4", "r4 4t 8t", "8t 8t 8t 8t 8t 8t", "4t 8t 4t 8t", "2", "4+4t 8t", "r4t 8t 8t 8t 8t"],
    phrase: { chromatic: 0.25, enclosure: 0.05, blue: 0.55, leap: 0.2, repeat: 0.2, rest: 0.3, motif: 0.6, pentatonic: true, minNotes: 3 },
  },
  {
    id: "fusion", label: "Jazz fusion",
    influences: ["Scott Henderson", "Chick Corea", "Herbie Hancock", "Frank Zappa", "Jesús Molina"],
    summary: "Linhas rápidas de semicolcheias, grupos irregulares (3+3+2), quiálteras e cromatismo; aceita bem o outside.",
    comps: [
      { id: "332", label: "Síncope 3+3+2", pattern: "T/8. T/8. T/8 r/8 T!/8. T/16 r/8" },
      { id: "stabs16", label: "Ataques em semicolcheia", pattern: "T/16 r/8 T/16+8 r/8 r/8 T/8 r/16 T/16+8" },
      { id: "pedal", label: "Baixo pulsando, acordes sincopados", pattern: "B/8 B?/8 B/8 B?/8 B/8 B?/8 B/8 B?/8 ; r/8. D/16+8 r/8 r/16 D!/16+8 r/8. D/16" },
    ],
    cells: [
      "16 16 16 16", "16 16 16 16 16 16 16 16", "8 16 16", "16 16 8", "r16 16 16 16", "16 16 r16 16", "8. 16", "16 8 16",
      "16q 16q 16q 16q 16q", "8t 8t 8t", "16t 16t 16t 16t 16t 16t", "8. 16+4", "r8 16 16 8 8", "4", "16 16 16 16 8. 16", "32 32 32 32 16 16 4",
    ],
    phrase: { chromatic: 0.5, enclosure: 0.3, blue: 0, leap: 0.35, repeat: 0.05, rest: 0.1, motif: 0.3, pentatonic: false, minNotes: 8 },
  },
  {
    id: "neosoul", label: "Neo-soul",
    influences: ["Robert Glasper", "D'Angelo", "Domi & JD Beck", "Ed Motta"],
    summary: "Pouca nota e muito espaço: semicolcheias sincopadas, notas repetidas, entradas depois do tempo e notas longas.",
    comps: [
      { id: "espaco", label: "Acorde longo e resposta leve", pattern: "T/4. r/8 r/4 r/8 D?/8" },
      { id: "sincope", label: "Antecipação em semicolcheia", pattern: "T/8. D?/16+4 r/4 r/8. D/16" },
      { id: "pulso", label: "Baixo e acorde alternados", pattern: "B/4. B/8+4 r/4 ; r/8 D/8+4 r/8. D?/16+4" },
    ],
    cells: ["r8 16 16+4", "r16 16 8 4", "8. 16+4", "r8 8 4", "16 16 8+4", "4 r4", "r4 r8 16 16", "8 8 r4", "r16 8 16+4", "2", "8t 8t 8t 4", "r8. 16 4"],
    phrase: { chromatic: 0.3, enclosure: 0.1, blue: 0.15, leap: 0.2, repeat: 0.3, rest: 0.3, motif: 0.6, pentatonic: true, minNotes: 3 },
  },
  {
    id: "gospel", label: "Gospel americano",
    influences: ["Cory Henry", "Kirk Franklin", "Jesús Molina", "Shaun Martin", "Aaron Lindsey", "Kevin Bond", "Tye Tribbett", "Israel Houghton", "Fred Hammond"],
    summary: "Corridas rápidas que pousam no tempo, pentatônica com blue notes, fills entre os acordes e síncopes marcadas.",
    comps: [
      { id: "pulso", label: "Pulso com antecipações", pattern: "E/4 E/4 E/4 E/4 ; D/4. D/8+4 r/8 D!/8" },
      { id: "128", label: "Balanço em tercinas (12/8)", pattern: "E/4 E/4 E/4 E/4 ; D/4t D/8t D/4t D/8t D/4t D/8t D/4t D/8t" },
      { id: "shout", label: "Baixo e acorde alternados (rápido)", pattern: "B/8 D/8 B/8 D/8 B/8 D/8 B/8 D!/8" },
    ],
    cells: [
      "16 16 16 16 4", "r8 16 16 4", "32 32 32 32 16 16 4", "8 16 16 4", "16t 16t 16t 16t 16t 16t 4", "r4 16 16 16 16", "8. 16+4",
      "4 r4", "r8 8 4", "16 16 8 4", "8t 8t 8t 4", "r16 16 16 16 4", "2",
    ],
    phrase: { chromatic: 0.35, enclosure: 0.1, blue: 0.4, leap: 0.2, repeat: 0.1, rest: 0.2, motif: 0.45, pentatonic: true, minNotes: 4 },
  },
  {
    id: "funk", label: "Funk (16 avos)",
    influences: ["Stevie Wonder", "Bernie Worrell", "Jesús Molina", "Ed Motta"],
    summary: "Semicolcheias curtas e secas, pausas marcantes, notas repetidas e síncopes no “e” e no “a” do tempo.",
    comps: [
      { id: "clav", label: "Clavinete", pattern: "T/16 r/16 T?/16 T/16 r/16 T?/16 r/16 T/16 r/8 T!/16 r/16 T?/16 T/16 r/8" },
      { id: "baixoacorde", label: "Baixo e acorde", pattern: "B/8 D!/16 r/16 r/16 D?/16 B/8 r/8 D!/8 B/16 D?/16 r/8" },
      { id: "um", label: "No “um”", pattern: "T!/8 r/8 r/8. T?/16 r/8 T/16 r/16 r/8 T/8" },
    ],
    cells: ["16 r16 16 16", "r16 16 r16 16", "16 16 r8", "r8 16 16", "16 r16 r16 16", "8 r16 16", "16 16 16 r16", "r4", "16 r16 16 r16 r16 16 16 r16", "8 8", "r16 16 16 r16 16 r16 8"],
    phrase: { chromatic: 0.2, enclosure: 0, blue: 0.3, leap: 0.15, repeat: 0.45, rest: 0.2, motif: 0.7, pentatonic: true, minNotes: 4 },
  },
  {
    id: "salsa", label: "Salsa",
    influences: ["Eddie Palmieri", "Papo Lucca"],
    summary: "Montuno em colcheias sincopadas sobre a clave 2-3, com antecipações e baixo de tumbao.",
    comps: [
      { id: "montuno", label: "Montuno (clave 2-3)", pattern: "r/4 r/8 B/8+4 B/4 ; D/8 r/8 P/8 D/8 r/8 P/8 r/8 D/8 r/8 P/8 r/8 D/8 r/8 P/8 r/8 D/8" },
      { id: "montuno2", label: "Montuno em bloco", pattern: "r/4 r/8 B/8+4 B/4 ; D!/8 r/8 D/8 D/8 r/8 D/8 r/8 D/8" },
      { id: "tumbao", label: "Só o tumbao e acordes longos", pattern: "r/4 r/8 B/8+4 B/4 ; D/2 r/8 D/8+4" },
    ],
    cells: ["8 8 8 8", "r8 8 8 8", "8 r8 8 8", "8 8 r8 8", "r8 8+8 8", "8 8+4", "4 r8 8", "r8 8 r8 8", "8 8 8 8+4 r4", "4 4", "r8 8 4"],
    phrase: { chromatic: 0.15, enclosure: 0.05, blue: 0, leap: 0.3, repeat: 0.3, rest: 0.15, motif: 0.6, pentatonic: false, minNotes: 4 },
  },
  {
    id: "samba", label: "Samba",
    influences: ["Cartola", "César Camargo Mariano", "Salomão Soares", "João Donato", "Ed Motta"],
    summary: "Semicolcheias contínuas com a síncope do tamborim (teleco-teco) e baixo de surdo antecipando o tempo.",
    comps: [
      { id: "teleco", label: "Teleco-teco", pattern: "B/8. B/16 B/4 B/8. B/16 B/4 ; D/16 r/16 D/16 r/16 r/16 D/16 r/16 D/16 r/16 D/16 r/16 D/16 r/16 r/16 D/16 r/16" },
      { id: "partido", label: "Partido alto", pattern: "B/8. B/16 B/4 B/8. B/16 B/4 ; D/8 r/8 D/8 r/16 D/16 r/8 D/8 r/8 D/8" },
      { id: "contra", label: "Mão direita no contratempo", pattern: "B/8. B/16 B/4 B/8. B/16 B/4 ; r/16 D/16 r/16 D/16 D/16 r/16 D/16 r/16 r/16 D/16 r/16 D/16 D/16 r/16 D/16 r/16" },
    ],
    cells: ["16 8 16", "16 16 16 16", "r16 16 16 16", "16 8 16 16 8 16", "8. 16", "16 16 8", "8 16 16", "r16 8 16+4", "16 8 16+4", "4", "r8 16 16", "16 16 16 16 16 8 16"],
    phrase: { chromatic: 0.2, enclosure: 0.05, blue: 0, leap: 0.25, repeat: 0.15, rest: 0.1, motif: 0.55, pentatonic: false, minNotes: 6 },
  },
  {
    id: "bossa", label: "Bossa nova",
    influences: ["Tom Jobim", "João Donato", "César Camargo Mariano", "Salomão Soares", "Ed Motta"],
    summary: "Colcheias suaves e esparsas, antecipando o tempo, com notas longas na chegada e muito espaço.",
    comps: [
      { id: "classica", label: "Batida clássica", pattern: "B/4. B/8+4. B/8 ; D/4 r/8 D/8+8 D/8 r/8 D/8" },
      { id: "contra", label: "Contratempos", pattern: "B/2 B/2 ; r/8 D/8 r/8 D/8 r/8 D/8 r/8 D/8" },
      { id: "esparsa", label: "Esparsa", pattern: "B/4. B/8+2 ; r/4 D/4. D/8+4" },
    ],
    cells: ["r8 8 4", "8 8+4", "4 r8 8", "r8 8+4", "4. 8", "8 4 8", "2", "r4 8 8", "8 8 8 8", "r8 8 8 8+4 r4", "4 4"],
    phrase: { chromatic: 0.25, enclosure: 0.1, blue: 0, leap: 0.2, repeat: 0.15, rest: 0.25, motif: 0.5, pentatonic: false, minNotes: 3 },
  },
  {
    id: "rock", label: "Rock",
    influences: ["Jon Lord", "Ray Manzarek"],
    summary: "Colcheias retas, pentatônica menor com blue note, riffs curtos e repetidos.",
    comps: [
      { id: "colcheias", label: "Colcheias retas", pattern: "T/8 T?/8 T/8 T?/8 T/8 T?/8 T/8 T?/8" },
      { id: "baixo", label: "Baixo pulsando e acordes longos", pattern: "B/8 B?/8 B/8 B?/8 B/8 B?/8 B/8 B?/8 ; D/2 D/4. D/8" },
      { id: "ataques", label: "Ataques", pattern: "T!/4 r/8 T/8+4 T/4" },
    ],
    cells: ["8 8 8 8", "8 8 4", "4 8 8", "r8 8 8 8", "4 4", "8 8 r4", "16 16 8 4", "2", "r4 8 8", "8. 16 4"],
    phrase: { chromatic: 0.1, enclosure: 0, blue: 0.5, leap: 0.25, repeat: 0.3, rest: 0.2, motif: 0.75, pentatonic: true, minNotes: 4 },
  },
  {
    id: "ska", label: "Ska",
    influences: ["The Skatalites"],
    summary: "Acordes secos no contratempo e frases de naipe, curtas, que também caem no “e” do tempo.",
    comps: [
      { id: "skank", label: "Skank (baixo no tempo, acorde no contratempo)", pattern: "B/8 D!/16 r/16 B/8 D!/16 r/16 B/8 D!/16 r/16 B/8 D!/16 r/16" },
      { id: "soacorde", label: "Só o contratempo", pattern: "r/8 T!/16 r/16 r/8 T!/16 r/16 r/8 T!/16 r/16 r/8 T!/16 r/16" },
    ],
    cells: ["r8 8 r8 8", "r8 8 8 8", "8 8 r8 8", "r8 8 4", "4 r8 8", "r8 8 r4", "8 8 8 8", "r8 8+4", "4 4"],
    phrase: { chromatic: 0.05, enclosure: 0, blue: 0.1, leap: 0.3, repeat: 0.35, rest: 0.2, motif: 0.7, pentatonic: false, minNotes: 3 },
  },
];

/** De onde vieram os padrões (leituras abertas; servem também para quem quiser estudar). */
export const SOURCES = [
  { title: "Guajeo (montuno) e clave", url: "https://en.wikipedia.org/wiki/Guajeo" },
  { title: "Tumbao", url: "https://en.wikipedia.org/wiki/Tumbao" },
  { title: "Piano Montunos: The Complete Guide", url: "https://pianowithjonny.com/piano-lessons/piano-montunos-the-complete-guide/" },
  { title: "Bossa Nova Bass Line Rhythm & Groove", url: "https://pianogroove.com/bossa-nova-lessons/basslines-rhythm-grooves/" },
  { title: "How to play samba piano", url: "https://www.musicradar.com/how-to/how-to-play-samba-piano" },
  { title: "Brazilian comping rhythms: telecoteco", url: "https://thatdrumblog.blogspot.com/2019/09/brasilian-comping-rhythms-telecoteco.html" },
  { title: "How To Play A Blues Shuffle", url: "https://pianowithjonny.com/piano-lessons/ultimate-advanced-blues-shuffle/" },
  { title: "15 Essential Blues Piano Left Hand Patterns", url: "https://pianowithjonny.com/piano-lessons/15-essential-blues-piano-left-hand-patterns/" },
  { title: "Approach notes and enclosures (fórum Jazz Guitar Online)", url: "https://www.jazzguitar.be/forum/improvisation/24578-approach-notes-enclosures-anyone-2.html" },
  { title: "Outside (jazz): side-slipping", url: "https://en.wikipedia.org/wiki/Outside_(jazz)" },
  { title: "4 Steps to Play Neo Soul Chords on Piano", url: "https://pianowithjonny.com/piano-lessons/4-steps-to-play-neo-soul-chords-on-piano/" },
];

export const findStyle = (id) => STYLES.find((s) => s.id === id) ?? null;
export const styleByLabel = (label) => STYLES.find((s) => s.label.toLowerCase() === String(label || "").trim().toLowerCase()) ?? null;
