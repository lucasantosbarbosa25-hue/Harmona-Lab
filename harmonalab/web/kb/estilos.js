// Base de conhecimento do Harmona Lab: como cada estilo soa no RITMO, para o app escrever a levada dos acordes e as
// frases melódicas sem consultar nenhuma IA. É só um arquivo de dados: para crescer, acrescente estilos, levadas,
// células rítmicas, influências ou fontes aqui. O gerador (engine/groove.js) e a tela leem tudo daqui.
//
// O que está aqui são padrões gerais de cada estilo (vocabulário comum, descrito em aulas e artigos abertos).
// Os artistas entram como influência; não há transcrição de música nenhuma.
//
// Notação
//   levada (comp): PARTE/DURAÇÃO, camadas separadas por ";" soam juntas. Partes: T = todas as notas, E = mão esquerda e baixo,
//                  D = mão direita, B = a nota mais grave, P = a ponta, 1 a 9 = a enésima nota do voicing. "!" = acento, "?" = toque leve, r = pausa.
//                  Ostinatos e riffs (kind: "ostinato") usam também graus da escala do acorde: S1 a S9 sobem a partir do baixo e
//                  M1 a M9 a partir da mão direita, então o desenho se repete e as notas acompanham cada acorde.
//                  Em cada estilo, as levadas vão da mais tradicional para a mais experimental, e os ostinatos vêm depois.
//   bateria (beats): compassos (bars) com camadas separadas por ";"; cada ficha é PEÇA/DURAÇÃO. Peças (General MIDI): K bumbo, S caixa,
//                  X aro, H chimbal fechado, O aberto, P de pé, R condução, E cúpula, C ataque, T/M/F tons, B cowbell, L clave,
//                  A pandeirola (tamborim), Q ganzá, G/N congas. Os beats vão do básico às variações. Viradas (fills): uma camada
//                  de 1 ou 2 tempos que substitui o fim do compasso; depois dela o beat volta no tempo 1, com um ataque de prato.
//                  Os beats têm dois compassos: o segundo varia o chimbal (semicolcheias, notas leves, aberturas "O").
//   percussão (percussion): mesma notação, numa camada própria (congas, bongô, güiro, ganzá, pandeirola, agogô...).
//                  Peças novas: U conga muda (tapa), V/W bongô agudo/grave, Y/Z timbal agudo/grave, J/I güiro curto/longo, D agogô.
//   baixo (bass): linhas de um compasso, GRAU/DURAÇÃO: 1 = a nota de baixo do acorde, 2 a 9 = graus da escala acima dela
//                  (8 = a oitava), _2 a _9 = graus abaixo (_4 = a quinta abaixo), x = aproximação cromática da nota de baixo
//                  do acorde seguinte, r = pausa. A levada pode indicar a sua linha (bass: "id"); a virada de baixo (bassFill)
//                  troca o último tempo do acorde por uma corrida pentatônica que chega ao acorde seguinte por semitom.
//   célula (cells): só o ritmo de um trecho de frase, em tempos inteiros: durações separadas por espaço, "r" na frente = pausa.
//   durações: 4 = semínima, 8 = colcheia, 16 = semicolcheia, 32 = fusa; t = tercina, q = quiáltera de 5, . = ponto, + = ligadura.
//
// Parâmetros da frase (0 a 1): chromatic = chance de aproximação cromática antes de um alvo; enclosure = chance de envolvente
// (duas aproximações); blue = chance de blue note; leap = chance de salto; rest = chance de respirar
// um tempo; motif = chance de repetir o ritmo do acorde anterior. pentatonic: prefere a pentatônica da escala.
// minNotes: mínimo de notas a cada 4 tempos (a frase nunca fica vazia demais).
// duet: chance de a frase sair em dueto, em oitavas (octave) ou em sextas da escala (sixth); as notas de chegada sustentam até a próxima.
// Regra fixa do gerador: dentro de uma frase, nunca a mesma nota duas vezes seguidas (pausa de até um tempo no meio não
// conta como fim de frase). Entre o fim de uma frase e o começo da próxima, pode. Baixo e levadas não seguem essa regra.

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
      { id: "charleston", bass: "dois", label: "Charleston", pattern: "T/4 r/4t T/8t+2" },
      { id: "quatro", bass: "walking", label: "Quatro tempos com antecipações", pattern: "E/4 E?/4 E/4 E?/4 ; r/4t D/8t+4 r/4 r/4t D/8t" },
      { id: "contratempo", label: "Mão direita no contratempo", pattern: "E/1 ; r/4 r/4t D/8t r/4 r/4t D/8t" },
      { id: "doisquatro", label: "Dois e quatro", pattern: "E/2 E/2 ; r/4 D/4 r/4 D/4" },
      { id: "walking", bass: "walking2", kind: "ostinato", label: "Baixo andando", pattern: "S1/4 S3/4 S5/4 S6/4 ; r/4t D/8t+4 r/4 r/4t D/8t" },
      { id: "rifftercina", kind: "ostinato", label: "Riff em tercinas", pattern: "E/1 ; M1/4t M3/8t M5/4t M3/8t M1/4t M2/8t M3/4" },
    ],
    beats: [
      { id: "ride", label: "Condução de jazz", bars: ["R/4 R/4t R?/8t R/4 R/4t R?/8t ; r/4 P/4 r/4 P/4", "R/4 R/4t R?/8t R/4 R/4t R?/8t ; r/4 P/4 r/4 P/4 ; r/2. r/4t X/8t"] },
      { id: "chimbal", label: "Chimbal abrindo e fechando", bars: ["O/4 H!/4t H?/8t O/4 H!/4t H?/8t ; K?/4 K?/4 K?/4 K?/4", "O/4 H!/4t H?/8t O/4 H!/4t O?/8t ; K?/4 K?/4 K?/4 K?/4 ; r/2. r/4t S?/8t"] },
      { id: "comping", label: "Condução com respostas na caixa", bars: ["R/4 R/4t R?/8t R/4 R/4t R?/8t ; r/4 P/4 r/4 P/4 ; r/2. r/4t X/8t", "R/4 R/4t R?/8t R/4 R/4t R?/8t ; r/4 P/4 r/4 P/4 ; r/4 r/4t S?/8t r/2 ; r/2. K?/4"] },
    ],
    percussion: [
      { id: "shaker", label: "Shaker em tercinas", bars: ["Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t"] },
      { id: "pandeirola", label: "Pandeirola no 2 e 4", bars: ["r/4 A!/4 r/4 A!/4"] },
    ],
    fills: ["S/8t S?/8t S/8t S/4t S!/8t", "T/8t T/8t M/8t M/8t F/8t F!/8t", "S/8t S/8t S!/8t", "S/8t S/8t S/8t S/8t S/8t S!/8t"],
    bass: [
      { id: "walking", label: "Walking bass", pattern: "1/4 3/4 5/4 x/4" },
      { id: "dois", label: "Em dois (two-feel)", pattern: "1/2 _4/2" },
      { id: "walking2", label: "Walking com cromatismo", pattern: "1/4 2/4 3/4 x/4" },
    ],
    bassFill: { chance: 0.5, figure: "8t" },
    cells: SWING_CELLS,
    phrase: { chromatic: 0.55, enclosure: 0.3, blue: 0, leap: 0.25, rest: 0.12, motif: 0.4, pentatonic: false, minNotes: 4 , duet: { octave: 0.1, sixth: 0.05 } },
  },
  {
    id: "blues", label: "Blues",
    influences: ["B.B. King", "Ray Charles", "Dr. John"],
    summary: "Shuffle em tercinas, pergunta e resposta, pentatônica com blue notes e frases curtas que respiram.",
    comps: [
      { id: "shuffle", label: "Shuffle", pattern: "E/4t E?/8t E/4t E?/8t E/4t E?/8t E/4t E?/8t ; D/4 r/4 r/4t D/8t+4" },
      { id: "lento", bass: "lento", label: "Blues lento em tercinas", pattern: "E/2 E/2 ; D/8t D?/8t D?/8t D/8t D?/8t D?/8t D/8t D?/8t D?/8t D/8t D?/8t D?/8t" },
      { id: "stabs", label: "Acordes de resposta", pattern: "E/1 ; r/4 D!/8t r/4t r/4 D/4t D/8t" },
      { id: "stoptime", label: "Stop-time", pattern: "T!/4 r/2." },
      { id: "boogie", bass: "shuffle", kind: "ostinato", label: "Boogie-woogie", pattern: "S1/4t S1/8t S5/4t S5/8t S6/4t S6/8t S5/4t S5/8t ; r/4 D/4 r/4 D/8t r/4t" },
      { id: "riffresposta", kind: "ostinato", label: "Riff de resposta", pattern: "E/1 ; r/4t M1/8t M3!/4 M5/8t M4/8t M3/8t M1/4" },
    ],
    beats: [
      { id: "shuffle", label: "Shuffle", bars: ["H/4t H?/8t H/4t H?/8t H/4t H?/8t H/4t H?/8t ; K/4 r/4 K/4 r/4 ; r/4 S!/4 r/4 S!/4", "H/4t H?/8t H/4t H?/8t H/4t H?/8t O/4t H?/8t ; K/4 r/4 K/4 r/4t K/8t ; r/4 S!/4 r/4 S!/4"] },
      { id: "lento", label: "Blues lento (12/8)", bars: ["H/8t H?/8t H?/8t H/8t H?/8t H?/8t H/8t H?/8t H?/8t H/8t H?/8t H?/8t ; K/4 r/4 K/4t K/8t r/4 ; r/4 S!/4 r/4 S!/4", "H/8t H?/8t H?/8t H/8t H?/8t H?/8t H/8t H?/8t H?/8t H/8t H?/8t O/8t ; K/4 r/4 K/4t K/8t r/4 ; r/4 S!/4 r/4 S!/4t S?/8t"] },
      { id: "ride", label: "Shuffle na condução", bars: ["R/4t R?/8t R/4t R?/8t R/4t R?/8t R/4t R?/8t ; K/4 r/4t K/8t K/4 r/4 ; r/4 S!/4 r/4 S!/4 ; r/4 P/4 r/4 P/4", "R/4t R?/8t R/4t R?/8t R/4t R?/8t E/4t R?/8t ; K/4 r/4t K/8t K/4 r/4 ; r/4 S!/4 r/4 S!/4 ; r/4 P/4 r/4 O/4"] },
    ],
    percussion: [
      { id: "pandeirola", label: "Pandeirola no 2 e 4", bars: ["r/4 A!/4 r/4 A!/4"] },
      { id: "shaker", label: "Shaker em tercinas", bars: ["Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t ; r/4 A!/4 r/4 A!/4"] },
    ],
    fills: ["S/8t S?/8t S/8t S/4t S!/8t", "T/8t T/8t M/8t M/8t F/8t F!/8t", "S/8t S/8t S!/8t", "S/8t S/8t S/8t S/8t S/8t S!/8t"],
    bass: [
      { id: "shuffle", label: "Shuffle (1-3-5-6)", pattern: "1/4t 1/8t 3/4t 3/8t 5/4t 5/8t 6/4t 6/8t" },
      { id: "walking", label: "Walking blues", pattern: "1/4 3/4 5/4 6/4" },
      { id: "lento", label: "Lento em tercinas", pattern: "1/4t+4 5/8t 1/4t+4 x/8t" },
    ],
    bassFill: { chance: 0.45, figure: "8t" },
    cells: ["4t 8t 4", "8t 8t 8t 4", "r4t 8t 4", "4t 8t+4", "4 r4", "r4 4t 8t", "8t 8t 8t 8t 8t 8t", "4t 8t 4t 8t", "2", "4+4t 8t", "r4t 8t 8t 8t 8t"],
    phrase: { chromatic: 0.25, enclosure: 0.05, blue: 0.55, leap: 0.2, rest: 0.3, motif: 0.6, pentatonic: true, minNotes: 3 , duet: { octave: 0.15, sixth: 0.25 } },
  },
  {
    id: "fusion", label: "Jazz fusion",
    influences: ["Scott Henderson", "Chick Corea", "Herbie Hancock", "Frank Zappa", "Jesús Molina"],
    summary: "Linhas rápidas de semicolcheias, grupos irregulares (3+3+2), quiálteras e cromatismo; aceita bem o outside.",
    comps: [
      { id: "332", label: "Síncope 3+3+2", pattern: "T/8. T/8. T/8 r/8 T!/8. T/16 r/8" },
      { id: "stabs16", label: "Ataques em semicolcheia", pattern: "T/16 r/8 T/16+8 r/8 r/8 T/8 r/16 T/16+8" },
      { id: "pedal", bass: "pedal", label: "Baixo pulsando, acordes sincopados", pattern: "B/8 B?/8 B/8 B?/8 B/8 B?/8 B/8 B?/8 ; r/8. D/16+8 r/8 r/16 D!/16+8 r/8. D/16" },
      { id: "empurrao", label: "Acordes longos com empurrão", pattern: "T/4. T/8+2" },
      { id: "baixo8", bass: "pedal", kind: "ostinato", label: "Ostinato de baixo", pattern: "S1/8 S5/8 S8/8 S5/8 S7/8 S5/8 S8/8 S5/8 ; r/8. D/16+8 r/8 r/16 D!/16+8 r/8. D/16" },
      { id: "grupo5", kind: "ostinato", label: "Grupo de cinco contra o compasso", pattern: "E/1 ; M1/16 M3/16 M5/16 M4/16 M2/16 M1/16 M3/16 M5/16 M4/16 M2/16 M1/16 M3/16 M5/16 M4/16 M2/16 M1/16" },
    ],
    beats: [
      { id: "dezesseis", label: "Dezesseis avos", bars: ["H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 ; K/8. K/16 r/4 r/8 K/8 r/4 ; r/4 S!/4 r/4 S!/4", "H!/16 H?/16 H/16 H?/16 H/8 O/8 H!/16 H?/16 H/16 H?/16 H/16 H?/16 O/8 ; K/8. K/16 r/4 r/8 K/8 r/8. K/16 ; r/4 S!/4 r/8. S?/16 S!/4"] },
      { id: "sincopado", label: "Bumbo sincopado", bars: ["H/8 O/8 H/8 H?/8 H/8 O/8 H/8 H?/8 ; K/8. K/16 r/8 K/8 r/8. K/16 r/4 ; r/4 S!/4 r/8. S?/16 S!/4", "H/8 H?/8 H/16 H?/16 H?/8 H/8 H?/8 H/8 O/8 ; K/8. K/16 r/8 K/8 r/8. K/16 r/8 K/8 ; r/4 S!/4 r/8. S?/16 S!/8 S?/16 S?/16"] },
      { id: "cupula", label: "Condução com cúpula", bars: ["R/8 E/8 R/8 E/8 R/8 E/8 R/8 E/8 ; K/8. K/16 r/4 r/8 K/8 r/8 K/8 ; r/4 S!/4 r/4 S!/4 ; r/4 P/4 r/4 P/4", "R/8 E/8 R/8 E/8 R/8 E/8 R/8 E/8 ; K/8. K/16 r/4 r/8 K/8 r/8 K/8 ; r/4 S!/4 r/4 S!/4 ; r/4 P/4 r/4 O/4"] },
    ],
    percussion: [
      { id: "shakerconga", label: "Shaker e congas", bars: ["Q!/16 Q?/16 Q/16 Q?/16 Q!/16 Q?/16 Q/16 Q?/16 Q!/16 Q?/16 Q/16 Q?/16 Q!/16 Q?/16 Q/16 Q?/16 ; r/4 G/8 N/8 r/4 G/16 G/16 N/8"] },
      { id: "congas", label: "Congas e bongô", bars: ["G/8 N/8 U!/8 N/8 G/8 G/16 N/16 U!/8 N/8 ; V!/8 W?/8 V/8 W?/8 V!/8 W?/8 V/8 W?/8"] },
    ],
    fills: ["S/16 S/16 T/16 T/16 M/16 M/16 F/16 F!/16", "S/16 S/16 S/16 r/16 K/16 S/16 S/16 F!/16", "S/16 S/16 S/16 S!/16", "S/8 S/8 T/8 F!/8", "S/16q S/16q T/16q M/16q F!/16q"],
    bass: [
      { id: "sincopado", label: "Sincopado", pattern: "1/8. 1/16 r/8 1/8 _4/8 r/8 1/8 x/8" },
      { id: "pedal", label: "Pedal pulsante", pattern: "1/8 1/8 1/8 1/8 1/8 1/8 8/8 1/8" },
      { id: "oitavas", label: "Oitavas em semicolcheia", pattern: "1/16 8/16 r/16 1/16 8/16 r/16 1/16 8/16 r/8 5/8 r/16 1/16 x/8" },
    ],
    bassFill: { chance: 0.5, figure: "16" },
    cells: [
      "16 16 16 16", "16 16 16 16 16 16 16 16", "8 16 16", "16 16 8", "r16 16 16 16", "16 16 r16 16", "8. 16", "16 8 16",
      "16q 16q 16q 16q 16q", "8t 8t 8t", "16t 16t 16t 16t 16t 16t", "8. 16+4", "r8 16 16 8 8", "4", "16 16 16 16 8. 16", "32 32 32 32 16 16 4",
    ],
    phrase: { chromatic: 0.5, enclosure: 0.3, blue: 0, leap: 0.35, rest: 0.1, motif: 0.3, pentatonic: false, minNotes: 8 , duet: { octave: 0.0, sixth: 0.05 } },
  },
  {
    id: "neosoul", label: "Neo-soul",
    influences: ["Robert Glasper", "D'Angelo", "Domi & JD Beck", "Ed Motta", "Joshua Domfeh"],
    summary: "Pouca nota e muito espaço: semicolcheias sincopadas, entradas depois do tempo e notas longas.",
    comps: [
      { id: "espaco", bass: "espaco", label: "Acorde longo e resposta leve", pattern: "T/4. r/8 r/4 r/8 D?/8" },
      { id: "sincope", label: "Antecipação em semicolcheia", pattern: "T/8. D?/16+4 r/4 r/8. D/16" },
      { id: "pulso", label: "Baixo e acorde alternados", pattern: "B/4. B/8+4 r/4 ; r/8 D/8+4 r/8. D?/16+4" },
      { id: "duas", label: "Duas batidas", pattern: "T/2 T?/4. D/8" },
      { id: "quebrado", kind: "ostinato", label: "Arpejo quebrado", pattern: "1/8 3/8 2/8 P/8+2" },
      { id: "atrasada", kind: "ostinato", label: "Motivo que entra depois do tempo", pattern: "E/1 ; r/8. M3/16+8 M2/8 r/8 M1/8+4" },
    ],
    beats: [
      { id: "boombap", label: "Boom-bap lento", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4. K/8 r/8 K/8 r/4 ; r/4 X/4 r/4 X/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O!/8 ; K/4. K/8 r/8 K/8 r/8. K/16 ; r/4 X/4 r/4 X/4"] },
      { id: "fantasma", label: "Com notas fantasma", bars: ["H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 ; K/8. K/16 r/4 r/8. K/16 r/4 ; r/4 S/4 r/8 S?/16 r/16 S/4", "H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 O/8 ; K/8. K/16 r/4 r/8. K/16 r/8 K/8 ; r/4 S/4 r/16 S?/16 S?/16 r/16 S/4"] },
      { id: "espaco", label: "Espaçado", bars: ["H/4 H/4 H/4 H/4 ; K/4 r/2 r/8 K/8 ; r/2 X/2", "H/4 H/4 H/4 O/4 ; K/4 r/2 r/8 K/8 ; r/2 X/4. X?/8"] },
    ],
    percussion: [
      { id: "shaker", label: "Shaker em semicolcheias", bars: ["Q!/16 Q?/16 Q/16 Q?/16 Q!/16 Q?/16 Q/16 Q?/16 Q!/16 Q?/16 Q/16 Q?/16 Q!/16 Q?/16 Q/16 Q?/16"] },
      { id: "pandeirola", label: "Pandeirola e shaker", bars: ["Q/8 Q?/8 Q/8 Q?/8 Q/8 Q?/8 Q/8 Q?/8 ; r/4 A!/4 r/4 A!/4"] },
    ],
    fills: ["r/8 S?/16 S/16 S/8 S!/8", "T/8 M/8 F/4", "S?/16 S/16 S!/8"],
    bass: [
      { id: "arrastado", label: "Arrastado", pattern: "1/4. 1/8+4 r/8 5/8" },
      { id: "espaco", label: "Espaçado", pattern: "1/2. r/8 x/8" },
      { id: "sincope", label: "Sincopado", pattern: "1/8. 1/16+4 r/8. 5/16 r/8 x/8" },
    ],
    bassFill: { chance: 0.4, figure: "16" },
    cells: ["r8 16 16+4", "r16 16 8 4", "8. 16+4", "r8 8 4", "16 16 8+4", "4 r4", "r4 r8 16 16", "8 8 r4", "r16 8 16+4", "2", "8t 8t 8t 4", "r8. 16 4"],
    phrase: { chromatic: 0.3, enclosure: 0.1, blue: 0.15, leap: 0.2, rest: 0.3, motif: 0.6, pentatonic: true, minNotes: 3 , duet: { octave: 0.1, sixth: 0.25 } },
  },
  {
    id: "gospel", label: "Gospel americano",
    influences: ["Cory Henry", "Kirk Franklin", "Jesús Molina", "Joshua Domfeh", "Shaun Martin", "Aaron Lindsey", "Kevin Bond", "Tye Tribbett", "Israel Houghton", "Fred Hammond"],
    summary: "Corridas rápidas que pousam no tempo, pentatônica com blue notes, fills entre os acordes e síncopes marcadas.",
    comps: [
      { id: "pulso", label: "Pulso com antecipações", pattern: "E/4 E/4 E/4 E/4 ; D/4. D/8+4 r/8 D!/8" },
      { id: "128", label: "Balanço em tercinas (12/8)", pattern: "E/4 E/4 E/4 E/4 ; D/4t D/8t D/4t D/8t D/4t D/8t D/4t D/8t" },
      { id: "shout", bass: "shout", label: "Baixo e acorde alternados (rápido)", pattern: "B/8 D/8 B/8 D/8 B/8 D/8 B/8 D!/8" },
      { id: "ataques", label: "Ataques sincopados", pattern: "T!/8. T/16+8 r/8 T/8. T!/16+4" },
      { id: "orgao", kind: "ostinato", label: "Ondulação de órgão", pattern: "E/1 ; M1/8 M3/8 M2/8 M3/8 M1/8 M3/8 M2/8 M3/8" },
      { id: "walkresposta", kind: "ostinato", label: "Baixo andando com resposta", pattern: "S1/4 S3/4 S5/4 S6/8 S7/8 ; r/8 D/8+4 r/8 D!/8+4" },
    ],
    beats: [
      { id: "pulso", label: "Pulso", bars: ["H/8 O/8 H/8 H?/8 H/8 O/8 H/8 H?/8 ; K/4 r/8 K/8 K/4 r/4 ; r/4 S!/4 r/4 S!/4", "H/8 H?/8 H/16 H?/16 H?/8 H/8 H?/8 H/8 O/8 ; K/4 r/8 K/8 K/4 r/8 K/8 ; r/4 S!/4 r/8. S?/16 S!/4"] },
      { id: "128", label: "Balanço em tercinas (12/8)", bars: ["H/8t H?/8t H?/8t H/8t H?/8t H?/8t H/8t H?/8t H?/8t H/8t H?/8t H?/8t ; K/4 r/4t K/8t K/4 r/4 ; r/4 S!/4 r/4 S!/4", "H/8t H?/8t H?/8t H/8t H?/8t H?/8t H/8t H?/8t H?/8t H/8t H?/8t O/8t ; K/4 r/4t K/8t K/4 r/4t K/8t ; r/4 S!/4 r/4 S!/4t S?/8t"] },
      { id: "shout", label: "Shout (dobrado)", bars: ["H!/16 H?/16 H/16 O/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 O/16 H!/16 H?/16 H/16 H?/16 ; K/8 r/8 K/8 r/8 K/8 r/8 K/8 r/8 ; r/8 S!/8 r/8 S!/8 r/8 S!/8 r/8 S!/8", "H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 O/8 ; K/8 r/8 K/8 r/8 K/8 r/8 K/8 r/8 ; r/8 S!/8 r/8 S!/8 r/8 S!/8 S?/16 S?/16 S!/8"] },
    ],
    percussion: [
      { id: "pandeirola", label: "Pandeirola", bars: ["A?/8 A?/8 A!/8 A?/8 A?/8 A?/8 A!/8 A?/8"] },
      { id: "pandeirola16", label: "Pandeirola em semicolcheias", bars: ["A?/16 A?/16 A!/16 A?/16 A?/16 A?/16 A!/16 A?/16 A?/16 A?/16 A!/16 A?/16 A?/16 A?/16 A!/16 A?/16"] },
    ],
    fills: ["S/16 S/16 T/16 T/16 M/16 M/16 F/16 F!/16", "S/16 S/16 S/16 r/16 K/16 S/16 S/16 F!/16", "S/16 S/16 S/16 S!/16", "S/8 S/8 T/8 F!/8", "S/16t S/16t S/16t S/16t S/16t S/16t F!/4"],
    bass: [
      { id: "pulso", label: "Pulso", pattern: "1/4 1/8 8/8 7/4 5/4" },
      { id: "oitavas", label: "Oitavas", pattern: "1/8 8/8 1/8 8/8 1/8 8/8 5/8 x/8" },
      { id: "shout", label: "Shout", pattern: "1/8 r/8 1/8 r/8 1/8 r/8 x/8 r/8" },
    ],
    bassFill: { chance: 0.55, figure: "16" },
    cells: [
      "16 16 16 16 4", "r8 16 16 4", "32 32 32 32 16 16 4", "8 16 16 4", "16t 16t 16t 16t 16t 16t 4", "r4 16 16 16 16", "8. 16+4",
      "4 r4", "r8 8 4", "16 16 8 4", "8t 8t 8t 4", "r16 16 16 16 4", "2",
    ],
    phrase: { chromatic: 0.35, enclosure: 0.1, blue: 0.4, leap: 0.2, rest: 0.2, motif: 0.45, pentatonic: true, minNotes: 4 , duet: { octave: 0.3, sixth: 0.3 } },
  },
  {
    id: "funk", label: "Funk (16 avos)",
    influences: ["Stevie Wonder", "Bernie Worrell", "Jesús Molina", "Ed Motta"],
    summary: "Semicolcheias curtas e secas, pausas marcantes e síncopes no “e” e no “a” do tempo.",
    comps: [
      { id: "clav", label: "Clavinete", pattern: "T/16 r/16 T?/16 T/16 r/16 T?/16 r/16 T/16 r/8 T!/16 r/16 T?/16 T/16 r/8" },
      { id: "baixoacorde", label: "Baixo e acorde", pattern: "B/8 D!/16 r/16 r/16 D?/16 B/8 r/8 D!/8 B/16 D?/16 r/8" },
      { id: "um", bass: "um", label: "No “um”", pattern: "T!/8 r/8 r/8. T?/16 r/8 T/16 r/16 r/8 T/8" },
      { id: "contra8", label: "Contratempos secos", pattern: "r/8 T!/16 r/16 r/8 T/16 r/16 r/8 T!/16 r/16 r/8 T/16 T?/16" },
      { id: "riffbaixo", bass: "dezesseis", kind: "ostinato", label: "Riff de baixo", pattern: "S1/16 r/16 S1/16 S8/16 r/8 S7/16 S8/16 r/16 S5/16 r/16 S7/16 S8/8 r/8 ; r/4 D!/16 r/8. r/4 D!/16 r/8." },
      { id: "clavmelodico", kind: "ostinato", label: "Clavinete melódico", pattern: "E/1 ; M1/16 M1?/16 r/16 M3/16 r/16 M4/16 M5/16 r/16 M5?/16 M4/16 r/16 M3/16 M1/16 r/16 M1?/16 r/16" },
    ],
    beats: [
      { id: "basico", label: "Funk básico", bars: ["H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 ; K/8 r/8 r/8. K/16 r/8 K/8 r/4 ; r/4 S!/4 r/4 S!/4", "H!/16 H?/16 H/16 O/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 O/16 H!/16 H?/16 H/16 H?/16 ; K/8 r/8 r/8. K/16 r/8 K/8 r/8. K/16 ; r/4 S!/4 r/4 S!/4"] },
      { id: "fantasmas", label: "Caixa com fantasmas", bars: ["H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 H!/16 H?/16 H/16 H?/16 ; K/8 r/8 r/8. K/16 r/8 K/8 r/4 ; r/4 S!/8. S?/16 r/8 S?/16 r/16 S!/4", "H!/16 H?/16 H/16 H?/16 H/8 O/8 H!/16 H?/16 H/16 H?/16 H/16 H?/16 O/8 ; K/8 r/8 r/8. K/16 r/8 K/8 r/8. K/16 ; r/4 S!/8. S?/16 r/16 S?/16 S?/16 r/16 S!/4"] },
      { id: "aberto", label: "Chimbal aberto no contratempo", bars: ["H/8 O/8 H/8 O/8 H/8 O/8 H/8 O/8 ; K/8 r/8 r/8. K/16 r/8 K/8 r/4 ; r/4 S!/4 r/4 S!/4", "H/8 O/8 H/8 O/8 H/16 H?/16 O/8 H/8 O!/8 ; K/8 r/8 r/8. K/16 r/8 K/8 r/8 K/8 ; r/4 S!/4 r/4 S!/4"] },
    ],
    percussion: [
      { id: "congas", label: "Congas", bars: ["U?/16 r/16 G/16 r/16 N!/8 r/16 G/16 U?/16 r/16 G/16 G/16 N!/8 r/8"] },
      { id: "pandeirola", label: "Pandeirola em semicolcheias", bars: ["A?/16 A?/16 A!/16 A?/16 A?/16 A?/16 A!/16 A?/16 A?/16 A?/16 A!/16 A?/16 A?/16 A?/16 A!/16 A?/16"] },
    ],
    fills: ["S/16 S/16 T/16 T/16 M/16 M/16 F/16 F!/16", "S/16 S/16 S/16 r/16 K/16 S/16 S/16 F!/16", "S/16 S/16 S/16 S!/16", "S/8 S/8 T/8 F!/8"],
    bass: [
      { id: "dezesseis", label: "Dezesseis avos", pattern: "1/16 r/16 1/16 r/16 r/8 8/16 r/16 r/8 1/16 r/16 7/16 8/16 r/8" },
      { id: "pop", label: "Com oitava", pattern: "1/8 r/8 r/16 1/16 r/8 5/8 r/8 7/8 8/8" },
      { id: "um", label: "No um", pattern: "1/8. r/16 r/2 r/8 7/16 8/16" },
    ],
    bassFill: { chance: 0.5, figure: "16" },
    cells: ["16 r16 16 16", "r16 16 r16 16", "16 16 r8", "r8 16 16", "16 r16 r16 16", "8 r16 16", "16 16 16 r16", "r4", "16 r16 16 r16 r16 16 16 r16", "8 8", "r16 16 16 r16 16 r16 8"],
    phrase: { chromatic: 0.2, enclosure: 0, blue: 0.3, leap: 0.15, rest: 0.2, motif: 0.7, pentatonic: true, minNotes: 4 , duet: { octave: 0.2, sixth: 0.1 } },
  },
  {
    id: "salsa", label: "Salsa",
    influences: ["Eddie Palmieri", "Papo Lucca"],
    summary: "Montuno em colcheias sincopadas sobre a clave 2-3, com antecipações e baixo de tumbao.",
    comps: [
      { id: "montuno", label: "Montuno (clave 2-3)", pattern: "r/4 r/8 B/8+4 B/4 ; D/8 r/8 P/8 D/8 r/8 P/8 r/8 D/8 r/8 P/8 r/8 D/8 r/8 P/8 r/8 D/8" },
      { id: "montuno2", label: "Montuno em bloco", pattern: "r/4 r/8 B/8+4 B/4 ; D!/8 r/8 D/8 D/8 r/8 D/8 r/8 D/8" },
      { id: "tumbao", label: "Só o tumbao e acordes longos", pattern: "r/4 r/8 B/8+4 B/4 ; D/2 r/8 D/8+4" },
      { id: "chacha", label: "Cha-cha-chá", pattern: "B/4 B/4 B/4 B/4 ; r/8 D/8 r/8 D/8 r/8 D/8 D/8 D/8" },
      { id: "guajeo", kind: "ostinato", label: "Guajeo arpejado", pattern: "r/4 r/8 B/8+4 B/4 ; M1/8 r/8 M3/8 M5/8 r/8 M8/8 r/8 M5/8 r/8 M3/8 r/8 M5/8 r/8 M8/8 r/8 M5/8" },
      { id: "bajocantado", kind: "ostinato", label: "Baixo cantado", pattern: "S1/4. S5/8+4 S8/4 ; D/8 r/8 D/8 D/8 r/8 D/8 r/8 D/8" },
    ],
    beats: [
      { id: "cascara", label: "Cáscara, clave e bombo (2-3)", bars: ["R/8 r/8 R/8 r/8 R/8 R/8 r/8 R/8 ; r/4 L/4 L/4 r/4 ; r/4. K/8 r/4 K/4 ; r/2. X/4", "R/8 r/8 R/8 R/8 r/8 R/8 r/8 R/8 ; L/4. L/4. L/4 ; r/4. K/8 r/4 K/4 ; r/2. X/4"] },
      { id: "campana", label: "Campana de mambo", bars: ["B!/4 B?/8 B/8 B!/4 B?/8 B/8 ; r/4 L/4 L/4 r/4 ; r/4. K/8 r/4 K/4 ; r/2. X/4 ; C!/4 r/2.", "B!/4 B?/8 B/8 B!/8 B/8 B?/8 B/8 ; L/4. L/4. L/4 ; r/4. K/8 r/4 K/4 ; r/2. X/4"] },
      { id: "abanico", label: "Cáscara com abanico nos timbales", bars: ["R/8 r/8 R/8 r/8 R/8 R/8 r/8 R/8 ; r/4 L/4 L/4 r/4 ; r/4. K/8 r/4 K/4 ; r/2. Y/4", "R/8 r/8 R/8 R/8 r/8 R/8 r/8 R/8 ; L/4. L/4. L/4 ; r/4. K/8 r/4 K/4 ; r/2 r/8 Y/16 Y/16 Y/16 Y/16 Z!/8"] },
    ],
    percussion: [
      { id: "completa", label: "Congas, bongô e güiro", bars: ["U?/8 U?/8 U!/8 U?/8 U?/8 U?/8 N/8 N/8 ; V!/8 W?/8 V/8 W?/8 V!/8 W?/8 V/8 W?/8 ; I/8 J/16 J/16 I/8 J/16 J/16 I/8 J/16 J/16 I/8 J/16 J/16"] },
      { id: "congas", label: "Congas e güiro", bars: ["U?/8 U?/8 U!/8 U?/8 U?/8 U?/8 N/8 N/8 ; I/8 J/16 J/16 I/8 J/16 J/16 I/8 J/16 J/16 I/8 J/16 J/16"] },
    ],
    fills: ["T/8 T/8 M/8 M!/8", "T/16 T/16 T/8 M/8 F!/8", "T/16 T/16 M!/8"],
    bass: [
      { id: "tumbao", label: "Tumbao", pattern: "r/4 r/8 5/8+4 1/4" },
      { id: "tumbao2", label: "Tumbao com a oitava", pattern: "r/4 r/8 1/8+4 8/4" },
      { id: "antecipado", label: "Antecipando o acorde", pattern: "r/4 r/8 5/8+4 x/4" },
    ],
    bassFill: { chance: 0.3, figure: "8" },
    cells: ["8 8 8 8", "r8 8 8 8", "8 r8 8 8", "8 8 r8 8", "r8 8+8 8", "8 8+4", "4 r8 8", "r8 8 r8 8", "8 8 8 8+4 r4", "4 4", "r8 8 4"],
    phrase: { chromatic: 0.15, enclosure: 0.05, blue: 0, leap: 0.3, rest: 0.15, motif: 0.6, pentatonic: false, minNotes: 4 , duet: { octave: 0.75, sixth: 0.05 } },
  },
  {
    id: "samba", label: "Samba",
    influences: ["Cartola", "César Camargo Mariano", "Salomão Soares", "João Donato", "Ed Motta"],
    summary: "Semicolcheias contínuas com a síncope do tamborim (teleco-teco) e baixo de surdo antecipando o tempo.",
    comps: [
      { id: "teleco", label: "Teleco-teco", pattern: "B/8. B/16 B/4 B/8. B/16 B/4 ; D/16 r/16 D/16 r/16 r/16 D/16 r/16 D/16 r/16 D/16 r/16 D/16 r/16 r/16 D/16 r/16" },
      { id: "partido", bass: "partido", label: "Partido alto", pattern: "B/8. B/16 B/4 B/8. B/16 B/4 ; D/8 r/8 D/8 r/16 D/16 r/8 D/8 r/8 D/8" },
      { id: "contra", label: "Mão direita no contratempo", pattern: "B/8. B/16 B/4 B/8. B/16 B/4 ; r/16 D/16 r/16 D/16 D/16 r/16 D/16 r/16 r/16 D/16 r/16 D/16 D/16 r/16 D/16 r/16" },
      { id: "violao", kind: "ostinato", label: "Dedilhado de violão", pattern: "B/8. B/16 B/4 B/8. B/16 B/4 ; r/16 2/16 3/16 P/16 r/16 3/16 2/16 3/16 r/16 2/16 3/16 P/16 r/16 3/16 P/16 3/16" },
      { id: "baixocantado", kind: "ostinato", label: "Baixo cantado", pattern: "S1/8. S5/16 S8/8 S5/8 S1/8. S5/16 S7/8 S5/8 ; D/16 r/16 D/16 r/16 r/16 D/16 r/16 D/16 r/16 D/16 r/16 D/16 r/16 r/16 D/16 r/16" },
    ],
    beats: [
      { id: "samba", label: "Samba", bars: ["H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 ; K?/8. K/16 K!/4 K?/8. K/16 K!/4 ; X/16 r/16 X/16 r/16 r/16 X/16 r/16 X/16 r/16 X/16 r/16 X/16 r/16 r/16 X/16 r/16", "H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 O/8 ; K?/8. K/16 K!/4 K?/8. K/16 K!/4 ; X/16 r/16 X/16 r/16 r/16 X/16 r/16 X/16 r/16 X/16 r/16 X/16 r/16 r/16 X/16 r/16"] },
      { id: "partido", label: "Partido alto", bars: ["H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 ; K?/8. K/16 K!/4 K?/8. K/16 K!/4 ; X/8 r/8 X/8 r/16 X/16 r/8 X/8 r/8 X/8", "H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 O/8 ; K?/8. K/16 K!/4 K?/8. K/16 K!/4 ; X/8 r/8 X/8 r/16 X/16 r/8 X/8 X/16 X/16 X!/8"] },
      { id: "batucada", label: "Batucada", bars: ["H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 ; K?/8. K/16 K!/4 K?/8. K/16 K!/4 ; r/4 X/4 r/4 X/8 X/8", "H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 H?/16 H?/16 H/16 H!/16 ; K?/8. K/16 K!/4 K?/8. K/16 K!/4 ; r/4 X/4 r/8 X/16 X/16 X/8 X!/8 ; r/2. O/4"] },
    ],
    percussion: [
      { id: "escola", label: "Tamborim, ganzá e agogô", bars: ["A/16 r/16 A/16 r/16 r/16 A/16 r/16 A/16 r/16 A/16 r/16 A/16 r/16 r/16 A/16 r/16 ; Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 ; D/8 r/8 D/8 D/8 r/8 D/8 r/4"] },
      { id: "ganza", label: "Ganzá e tamborim", bars: ["A/16 r/16 A/16 r/16 r/16 A/16 r/16 A/16 r/16 A/16 r/16 A/16 r/16 r/16 A/16 r/16 ; Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16"] },
    ],
    fills: ["S/16 S/16 S/16 S/16 S/16 r/16 S!/8", "T/16 T/16 M/16 M/16 F/8 F!/8", "S/16 S/16 S!/8"],
    bass: [
      { id: "surdo", label: "Surdo", pattern: "1/8. 1/16 _4/4 1/8. 1/16 _4/4" },
      { id: "partido", label: "Partido alto", pattern: "1/8. _4/16 r/8 _4/8 1/8. 1/16 _4/8 x/8" },
      { id: "corrido", label: "Corrido", pattern: "1/16 r/16 1/16 _4/16 _4/4 1/16 r/16 1/16 _4/16 x/4" },
    ],
    bassFill: { chance: 0.35, figure: "16" },
    cells: ["16 8 16", "16 16 16 16", "r16 16 16 16", "16 8 16 16 8 16", "8. 16", "16 16 8", "8 16 16", "r16 8 16+4", "16 8 16+4", "4", "r8 16 16", "16 16 16 16 16 8 16"],
    phrase: { chromatic: 0.2, enclosure: 0.05, blue: 0, leap: 0.25, rest: 0.1, motif: 0.55, pentatonic: false, minNotes: 6 , duet: { octave: 0.15, sixth: 0.35 } },
  },
  {
    id: "bossa", label: "Bossa nova",
    influences: ["Tom Jobim", "João Donato", "César Camargo Mariano", "Salomão Soares", "Ed Motta"],
    summary: "Colcheias suaves e esparsas, antecipando o tempo, com notas longas na chegada e muito espaço.",
    comps: [
      { id: "classica", label: "Batida clássica", pattern: "B/4. B/8+4. B/8 ; D/4 r/8 D/8+8 D/8 r/8 D/8" },
      { id: "contra", bass: "dois", label: "Contratempos", pattern: "B/2 B/2 ; r/8 D/8 r/8 D/8 r/8 D/8 r/8 D/8" },
      { id: "esparsa", label: "Esparsa", pattern: "B/4. B/8+2 ; r/4 D/4. D/8+4" },
      { id: "violao", kind: "ostinato", label: "Dedilhado de violão", pattern: "B/4. B/8+4. B/8 ; r/8 3/8 P/8 2/8 r/8 3/8 P/8 3/8" },
      { id: "descendente", kind: "ostinato", label: "Motivo descendente", pattern: "B/2 B/2 ; M5/4. M4/8+4 M3/8 M2/8" },
    ],
    beats: [
      { id: "bossa", label: "Bossa nova", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4. K/8 K/4. K/8 ; X/4. X/4. X/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O?/8 ; K/4. K/8 K/4. K/8 ; r/4 X/4. X/4."] },
      { id: "ride", label: "Na condução", bars: ["R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/4. K/8 K/4. K/8 ; X/4. X/4. X/4 ; r/4 P/4 r/4 P/4", "R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/4. K/8 K/4. K/8 ; r/4 X/4. X/4. ; r/4 P/4 r/4 P/4"] },
      { id: "vassourinha", label: "Chimbal em semicolcheias leves", bars: ["H?/16 H?/16 H/16 H?/16 H?/16 H?/16 H/16 H?/16 H?/16 H?/16 H/16 H?/16 H?/16 H?/16 H/16 H?/16 ; K/4. K/8 K/4. K/8 ; X/4. X/4. X/4", "H?/16 H?/16 H/16 H?/16 H?/16 H?/16 H/16 H?/16 H?/16 H?/16 H/16 H?/16 H?/16 H?/16 O?/8 ; K/4. K/8 K/4. K/8 ; r/4 X/4. X/4."] },
    ],
    percussion: [
      { id: "ganza", label: "Ganzá suave", bars: ["Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16"] },
      { id: "ganzaclave", label: "Ganzá e clave", bars: ["Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 ; L/4. L/4. L/4", "Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 ; r/4 L/4. L/4."] },
    ],
    fills: ["T/8 M/8 F/4", "X/8 X/8 X/4", "S?/8 S/8"],
    bass: [
      { id: "bossa", label: "Bossa (1 e 5)", pattern: "1/4. _4/8+4. 1/8" },
      { id: "dois", label: "Em dois", pattern: "1/2 _4/2" },
      { id: "caminhando", label: "Caminhando", pattern: "1/4. _4/8+4 3/8 x/8" },
    ],
    bassFill: { chance: 0.3, figure: "8" },
    cells: ["r8 8 4", "8 8+4", "4 r8 8", "r8 8+4", "4. 8", "8 4 8", "2", "r4 8 8", "8 8 8 8", "r8 8 8 8+4 r4", "4 4"],
    phrase: { chromatic: 0.25, enclosure: 0.1, blue: 0, leap: 0.2, rest: 0.25, motif: 0.5, pentatonic: false, minNotes: 3 , duet: { octave: 0.1, sixth: 0.3 } },
  },
  {
    id: "rock", label: "Rock",
    influences: ["Jon Lord", "Ray Manzarek"],
    summary: "Colcheias retas, pentatônica menor com blue note, riffs curtos e repetidos.",
    comps: [
      { id: "colcheias", label: "Colcheias retas", pattern: "T/8 T?/8 T/8 T?/8 T/8 T?/8 T/8 T?/8" },
      { id: "baixo", label: "Baixo pulsando e acordes longos", pattern: "B/8 B?/8 B/8 B?/8 B/8 B?/8 B/8 B?/8 ; D/2 D/4. D/8" },
      { id: "ataques", label: "Ataques", pattern: "T!/4 r/8 T/8+4 T/4" },
      { id: "doisquatro", label: "Dois e quatro", pattern: "E/2 E/2 ; r/4 D/4 r/4 D/4" },
      { id: "riff8", bass: "riff", kind: "ostinato", label: "Riff em colcheias", pattern: "S1/8 S1/8 S8/8 S1/8 S7/8 S1/8 S5/8 S7/8 ; D/1" },
      { id: "riffsincopado", kind: "ostinato", label: "Riff sincopado", pattern: "S1/8. S1/16 r/8 S3/8 S4/8. S5/16+4 ; r/2 D!/2" },
    ],
    beats: [
      { id: "basico", label: "Rock básico", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4 r/4 K/8 K/8 r/4 ; r/4 S!/4 r/4 S!/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O!/8 ; K/4 r/4 K/8 K/8 r/8 K/8 ; r/4 S!/4 r/4 S!/4"] },
      { id: "meio", label: "Meio tempo", bars: ["R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/4 r/8 K/8 r/2 ; r/2 S!/2", "R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/4 r/8 K/8 r/4 r/8 K/8 ; r/2 S!/2 ; r/2. O/4"] },
      { id: "aberto", label: "Chimbal aberto e bumbo nos quatro", bars: ["O/8 H?/8 O/8 H?/8 O/8 H?/8 O/8 H?/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/4", "O/8 H?/8 O/8 H?/8 O/8 H?/8 O/4 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/8 S/8"] },
    ],
    percussion: [
      { id: "pandeirola", label: "Pandeirola em colcheias", bars: ["A?/8 A!/8 A?/8 A!/8 A?/8 A!/8 A?/8 A!/8"] },
      { id: "cowbell", label: "Cowbell", bars: ["B!/4 B/4 B!/4 B/4"] },
    ],
    fills: ["S/16 S/16 T/16 T/16 M/16 M/16 F/16 F!/16", "S/16 S/16 S/16 r/16 K/16 S/16 S/16 F!/16", "S/16 S/16 S/16 S!/16", "S/8 S/8 T/8 F!/8"],
    bass: [
      { id: "colcheias", label: "Colcheias", pattern: "1/8 1/8 1/8 1/8 1/8 1/8 1/8 1/8" },
      { id: "riff", label: "Riff com oitava", pattern: "1/4 1/8 1/8 5/8 5/8 8/8 5/8" },
      { id: "galope", label: "Galope", pattern: "1/8 1/16 1/16 1/8 1/16 1/16 1/8 1/16 1/16 1/8 x/16 x/16" },
    ],
    bassFill: { chance: 0.35, figure: "8" },
    cells: ["8 8 8 8", "8 8 4", "4 8 8", "r8 8 8 8", "4 4", "8 8 r4", "16 16 8 4", "2", "r4 8 8", "8. 16 4"],
    phrase: { chromatic: 0.1, enclosure: 0, blue: 0.5, leap: 0.25, rest: 0.2, motif: 0.75, pentatonic: true, minNotes: 4 , duet: { octave: 0.25, sixth: 0.1 } },
  },
  {
    id: "ska", label: "Ska",
    influences: ["The Skatalites"],
    summary: "Acordes secos no contratempo e frases de naipe, curtas, que também caem no “e” do tempo.",
    comps: [
      { id: "skank", label: "Skank (baixo no tempo, acorde no contratempo)", pattern: "B/8 D!/16 r/16 B/8 D!/16 r/16 B/8 D!/16 r/16 B/8 D!/16 r/16" },
      { id: "soacorde", label: "Só o contratempo", pattern: "r/8 T!/16 r/16 r/8 T!/16 r/16 r/8 T!/16 r/16 r/8 T!/16 r/16" },
      { id: "dobrado", label: "Skank dobrado", pattern: "B/8 D!/16 D?/16 B/8 D!/16 D?/16 B/8 D!/16 D?/16 B/8 D!/16 D?/16" },
      { id: "walking", bass: "caminhando", kind: "ostinato", label: "Baixo andando com skank", pattern: "S1/4 S3/4 S5/4 S3/4 ; r/8 D!/16 r/16 r/8 D!/16 r/16 r/8 D!/16 r/16 r/8 D!/16 r/16" },
      { id: "metais", bass: "metais", kind: "ostinato", label: "Riff de metais", pattern: "B/8 D!/16 r/16 B/8 D!/16 r/16 B/8 D!/16 r/16 B/8 D!/16 r/16 ; r/8 M5/8 M3/8 M1/8 r/8 M3/8 M5/4" },
    ],
    beats: [
      { id: "ska", label: "Ska tradicional", bars: ["r/8 H!/8 r/8 H!/8 r/8 H!/8 r/8 H!/8 ; r/4 K/4 r/4 K/4 ; r/4 X!/4 r/4 X!/4", "r/8 H!/8 r/8 H!/8 r/8 H!/8 r/8 O!/8 ; r/4 K/4 r/4 K/4 ; r/4 X!/4 r/4 X!/4"] },
      { id: "onedrop", label: "One drop", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; r/2 K!/2 ; r/2 X!/2", "H/8 H?/8 H/8 O?/8 H/8 H?/8 H/16 H?/16 O/8 ; r/2 K!/2 ; r/2 X!/2"] },
      { id: "twotone", label: "2 tone (bumbo nos quatro)", bars: ["H/8 O/8 H/8 O/8 H/8 O/8 H/8 O/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/4", "H/8 O/8 H/8 O/8 H/8 O/8 H/16 H/16 O!/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/8 S?/8"] },
    ],
    percussion: [
      { id: "pandeirola", label: "Pandeirola no contratempo", bars: ["r/8 A!/8 r/8 A!/8 r/8 A!/8 r/8 A!/8"] },
      { id: "shaker", label: "Shaker e cowbell", bars: ["Q/8 Q?/8 Q/8 Q?/8 Q/8 Q?/8 Q/8 Q?/8 ; B/4 r/4 B/4 r/4"] },
    ],
    fills: ["S/8 S/8 T/8 F!/8", "S/16 S/16 S/8 S!/4", "S/8 S!/8"],
    bass: [
      { id: "caminhando", label: "Caminhando", pattern: "1/4 3/4 5/4 6/4" },
      { id: "pulo", label: "Pulando", pattern: "1/8 r/8 1/8 r/8 5/8 r/8 5/8 x/8" },
      { id: "metais", label: "Com a oitava", pattern: "1/4 8/4 5/4 x/4" },
    ],
    bassFill: { chance: 0.35, figure: "8" },
    cells: ["r8 8 r8 8", "r8 8 8 8", "8 8 r8 8", "r8 8 4", "4 r8 8", "r8 8 r4", "8 8 8 8", "r8 8+4", "4 4"],
    phrase: { chromatic: 0.05, enclosure: 0, blue: 0.1, leap: 0.3, rest: 0.2, motif: 0.7, pentatonic: false, minNotes: 3 , duet: { octave: 0.3, sixth: 0.2 } },
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
