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
//                  A pandeirola (tamborim), Q ganzá, G/N congas. Os beats vão do básico às variações. Viradas (fills): 1 ou 2 tempos
//                  que substituem o fim do compasso, com uma ou mais camadas (";", ex.: bumbo por baixo); depois dela o beat
//                  volta no tempo 1, com um ataque de prato. Dinâmica: "!!" forte, "!" acento, "?" leve, "??" fantasma; o app
//                  dá dinâmica sozinho ao chimbal e à condução que não tiverem marca. Atraso fino: ">" (≈ 19 ms a 80 BPM) e
//                  ">>" (≈ 38 ms) tocam o toque um pouquinho depois do tempo (ex.: S!>/4), a bateria "arrastada" do lo-fi.
//                  Os beats têm dois compassos: o segundo varia o chimbal (semicolcheias, notas leves, aberturas "O").
//   percussão (percussion): mesma notação, numa camada própria (congas, bongô, güiro, ganzá, pandeirola, agogô...).
//                  Peças novas: U conga muda (tapa), V/W bongô agudo/grave, Y/Z timbal agudo/grave, J/I güiro curto/longo, D agogô.
//   baixo (bass): linhas de um compasso, GRAU/DURAÇÃO: 1 = a nota de baixo do acorde, 2 a 9 = graus da escala acima dela
//                  (8 = a oitava), _2 a _9 = graus abaixo (_4 = a quinta abaixo), x = aproximação cromática da nota de baixo
//                  do acorde seguinte, r = pausa. A levada pode indicar a sua linha (bass: "id"); a virada de baixo (bassFill)
//                  troca o fim do acorde (beats: até 1 ou 2 tempos) por uma corrida pentatônica em `figure`, que sobe até
//                  `high` semitons acima de E2, num dos desenhos de `shapes`: chegada (anda até o próximo acorde e chega por
//                  semitom), descida (salta para o agudo e desce correndo), subida (sobe até uma nota aguda do próximo acorde,
//                  que cai no grave) ou arco (sobe e desce). pop: chance de a fundamental fora do tempo 1 saltar uma oitava; long: chance de a
//                  virada usar todos os `beats` (senão, 1 tempo).
//   célula (cells): só o ritmo de um trecho de frase, em tempos inteiros: durações separadas por espaço, "r" na frente = pausa.
//   figuras rápidas (fast): células idiomáticas do estilo para os trechos intensos (tercinas no swing, fusas no gospel...).
//   durações: 4 = semínima, 8 = colcheia, 16 = semicolcheia, 32 = fusa; t = tercina, q = quiáltera de 5, . = ponto, + = ligadura.
//
// Parâmetros da frase (0 a 1): chromatic = chance de aproximação cromática logo antes de uma chegada (em acorde diatônico
// sem tensão vale só um terço disso); enclosure = chance de envolvente (nota de cima + aproximação de baixo); blue = chance
// de blue note (a b3 antes da 3ª maior); rest = chance de respirar no fim de cada trecho. pentatonic: prefere a pentatônica
// da escala. (leap e minNotes ficaram da versão anterior e não são mais usados.)
// duet: chance de cada trecho ganhar vozes abaixo da melodia nas notas longas: oitavas (octave), sextas da escala (sixth)
// ou tríades quartais (triad). Passagens e notas curtas ficam numa voz só. As chegadas sustentam até a próxima nota.
// motif: chance de o motivo do trecho ser repetido duas vezes (com outras notas) antes da variação.
// shift (opcional): níveis a somar à intensidade do solo; -1 deixa o estilo mais calmo (lo-fi).
// Regra fixa do gerador: dentro de uma frase, nunca a mesma nota duas vezes seguidas (pausa de até um tempo no meio não
// conta como fim de frase). Entre o fim de uma frase e o começo da próxima, pode. Baixo e levadas não seguem essa regra.

import { MORE_BEATS, expandBeat } from "./baterias.js";

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
    riffs: ["guia", "ostinato", "dedilhado"],
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
      { id: "chimbal", label: "Chimbal abrindo e fechando", bars: ["O/4 H!/4t H??/8t O/4 H!!/4t H?/8t ; K??/4 K?/4 K??/4 K?/4", "O/4 H!/4t H?/8t O/4 H!!/4t O??/8t ; K??/4 K?/4 K??/4 K?/4 ; r/2. r/4t S?/8t"] },
      { id: "comping", label: "Condução com respostas na caixa", bars: ["R/4 R/4t R?/8t R/4 R/4t R?/8t ; r/4 P/4 r/4 P/4 ; r/2. r/4t X/8t", "R/4 R/4t R?/8t R/4 R/4t R?/8t ; r/4 P/4 r/4 P/4 ; r/4 r/4t S?/8t r/2 ; r/2. K?/4"] },
    ],
    percussion: [
      { id: "shaker", label: "Shaker em tercinas", bars: ["Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t Q!/8t Q?/8t Q?/8t"] },
      { id: "pandeirola", label: "Pandeirola no 2 e 4", bars: ["r/4 A!/4 r/4 A!/4"] },
    ],
    fills: ["S??/8t S?/8t S!/8t", "S!/8t S??/8t S?/8t T!/8t M/8t F!/8t ; K/4 K/4", "S/16t S??/16t S?/16t S/16t S??/16t S!/16t T/8t M/8t F!/8t ; r/4 K/4", "S!/8t S??/8t S??/8t S!/8t S??/8t S!!/8t ; K/4 r/4", "T!/8t T?/8t M/8t M?/8t F/8t F!!/8t ; K/2"],
    bass: [
      { id: "walking", label: "Walking bass", pattern: "1/4 3/4 5/4 x/4" },
      { id: "dois", label: "Em dois (two-feel)", pattern: "1/2 _4/2" },
      { id: "walking2", label: "Walking com cromatismo", pattern: "1/4 2/4 3/4 x/4" },
    ],
    bassFill: { chance: 0.5, figure: "8t", beats: 1, high: 12, shapes: ["chegada", "descida"] },
    cells: SWING_CELLS,
    fast: ["8t 8t 8t 8t 8t 8t", "16t 16t 16t 16t 16t 16t 4", "8t 8t 8t 16t 16t 16t 16t 16t 16t"],
    phrase: { chromatic: 0.55, enclosure: 0.3, blue: 0, leap: 0.25, rest: 0.12, motif: 0.4, pentatonic: false, minNotes: 4 , duet: { octave: 0.1, sixth: 0.05, triad: 0.1 } },
  },
  {
    id: "blues", label: "Blues",
    riffs: ["ostinato", "guia", "power"],
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
    fills: ["S??/8t S?/8t S!/8t", "S!/8t S??/8t S?/8t T!/8t M/8t F!/8t ; K/4 K/4", "S/16t S??/16t S?/16t S/16t S??/16t S!/16t T/8t M/8t F!/8t ; r/4 K/4", "S!/8t S??/8t S??/8t S!/8t S??/8t S!!/8t ; K/4 r/4", "T!/8t T?/8t M/8t M?/8t F/8t F!!/8t ; K/2"],
    bass: [
      { id: "shuffle", label: "Shuffle (1-3-5-6)", pattern: "1/4t 1/8t 3/4t 3/8t 5/4t 5/8t 6/4t 6/8t" },
      { id: "walking", label: "Walking blues", pattern: "1/4 3/4 5/4 6/4" },
      { id: "lento", label: "Lento em tercinas", pattern: "1/4t+4 5/8t 1/4t+4 x/8t" },
    ],
    bassFill: { chance: 0.55, figure: "8t", beats: 2, high: 14, shapes: ["chegada", "descida", "subida"] },
    cells: ["4t 8t 4", "8t 8t 8t 4", "r4t 8t 4", "4t 8t+4", "4 r4", "r4 4t 8t", "8t 8t 8t 8t 8t 8t", "4t 8t 4t 8t", "2", "4+4t 8t", "r4t 8t 8t 8t 8t"],
    fast: ["8t 8t 8t 8t 8t 8t", "16t 16t 16t 16t 16t 16t 4", "16 16 16 16 4"],
    phrase: { chromatic: 0.25, enclosure: 0.05, blue: 0.55, leap: 0.2, rest: 0.3, motif: 0.6, pentatonic: true, minNotes: 3 , duet: { octave: 0.15, sixth: 0.25, triad: 0.15 } },
  },
  {
    id: "fusion", label: "Jazz fusion",
    riffs: ["ostinato", "arpejador", "ataques"],
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
    fills: ["S??/16 S?/16 S/16 S!/16 ; K/8 r/8", "S/16 T?/16 M/16 F!/16 ; K/8 K/8", "S!/16 S??/16 S?/16 S!/16 T!/16 T?/16 M!/16 M?/16 ; K/8 r/8 K/8 r/8", "S/32 S/32 S??/16 S/16 S!/16 T/16 M/16 F/16 F!!/16 ; K/8 r/8 K/16 K/16 r/8", "T!/16 T?/16 T/16 M!/16 M?/16 M/16 F!/16 F/16 ; K/4 K/4", "S!/16 S??/16 S??/16 S!/16 S??/16 S??/16 S!/16 S!!/16 ; K/16 r/16 r/8 K/16 r/16 r/8", "S/16q S?/16q T/16q M/16q F!/16q ; K/4", "S/16q S??/16q S?/16q S/16q S!/16q T/16q M/16q M?/16q F/16q F!!/16q ; K/8 r/8 K/8 r/8"],
    bass: [
      { id: "sincopado", label: "Sincopado", pattern: "1/8. 1/16 r/8 1/8 _4/8 r/8 1/8 x/8" },
      { id: "pedal", label: "Pedal pulsante", pattern: "1/8 1/8 1/8 1/8 1/8 1/8 8/8 1/8" },
      { id: "oitavas", label: "Oitavas em semicolcheia", pattern: "1/16 8/16 r/16 1/16 8/16 r/16 1/16 8/16 r/8 5/8 r/16 1/16 x/8" },
    ],
    bassFill: { chance: 0.6, figure: "16", beats: 2, high: 19, shapes: ["subida", "descida", "arco", "chegada"], pop: 0.15, long: 0.75 },
    cells: [
      "16 16 16 16", "16 16 16 16 16 16 16 16", "8 16 16", "16 16 8", "r16 16 16 16", "16 16 r16 16", "8. 16", "16 8 16",
      "16q 16q 16q 16q 16q", "8t 8t 8t", "16t 16t 16t 16t 16t 16t", "8. 16+4", "r8 16 16 8 8", "4", "16 16 16 16 8. 16", "32 32 32 32 16 16 4",
    ],
    fast: ["16 16 16 16 16 16 16 16", "16q 16q 16q 16q 16q 4", "16t 16t 16t 16t 16t 16t 16 16 16 16"],
    phrase: { chromatic: 0.5, enclosure: 0.3, blue: 0, leap: 0.35, rest: 0.1, motif: 0.3, pentatonic: false, minNotes: 8 , duet: { octave: 0, sixth: 0.05, triad: 0.05 } },
  },
  {
    id: "neosoul", label: "Neo-soul",
    riffs: ["dedilhado", "ostinato", "ataques"],
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
    fills: ["r/8 S??/16 S?/16 S/8 S!/8 ; K/4 r/4", "S??/16 S/16 S!/8", "T/16 T??/16 T/8 M/16 M??/16 F!/8 ; K/4 K/4", "S?/16 S??/16 S/16 S??/16 S!/16 r/16 S??/16 S!!/16 ; K/8 r/8 K/16 r/8."],
    bass: [
      { id: "arrastado", label: "Arrastado", pattern: "1/4. 1/8+4 r/8 5/8" },
      { id: "espaco", label: "Espaçado", pattern: "1/2. r/8 x/8" },
      { id: "sincope", label: "Sincopado", pattern: "1/8. 1/16+4 r/8. 5/16 r/8 x/8" },
    ],
    bassFill: { chance: 0.55, figure: "16", beats: 2, high: 19, shapes: ["subida", "descida", "arco"], pop: 0.2, long: 0.75 },
    cells: ["r8 16 16+4", "r16 16 8 4", "8. 16+4", "r8 8 4", "16 16 8+4", "4 r4", "r4 r8 16 16", "8 8 r4", "r16 8 16+4", "2", "8t 8t 8t 4", "r8. 16 4"],
    fast: ["16 16 16 16 4", "32 32 32 32 32 32 32 32 4", "16t 16t 16t 16t 16t 16t 4"],
    phrase: { chromatic: 0.3, enclosure: 0.1, blue: 0.15, leap: 0.2, rest: 0.3, motif: 0.6, pentatonic: true, minNotes: 3 , duet: { octave: 0.1, sixth: 0.25, triad: 0.3 } },
  },
  {
    id: "lofi", label: "Lo-fi",
    riffs: ["dedilhado", "ostinato"],
    influences: ["Nujabes", "J Dilla", "Tomppabeats", "Idealism", "Jinsang"],
    summary: "Hip hop lento e relaxado (70 a 90 BPM): Rhodes com acordes de sétima e nona, bateria um pouco atrasada e com swing, melodias simples e repetidas, muitas vezes em oitavas ou sextas.",
    comps: [
      { id: "soltos", bass: "sub", label: "Acordes soltos e respirando", pattern: "T/2. T?/4" },
      { id: "sincope", bass: "sincope", label: "Rhodes com síncope suave", pattern: "T/4. T?/8 r/4 T?/4" },
      { id: "resposta", bass: "oitava", label: "Baixo longo e resposta leve", pattern: "E/2. r/4 ; r/4 D?/8 D/8 r/2" },
      { id: "rolado", bass: "sub", label: "Arpejo rolado", pattern: "1/8 2/8 3/8 P/8 T?/2" },
      { id: "motivo", kind: "ostinato", bass: "oitava", label: "Motivo de piano na pentatônica", pattern: "E/1 ; M1/8 M3/8 M2/4 r/4 M3/8 M1/8" },
      { id: "arpejo", kind: "ostinato", bass: "sub", label: "Arpejo contínuo", pattern: "S1/8 S3/8 S5/8 S3/8 S4/8 S5/8 S3/8 S1/8" },
    ],
    // ">" e ">>" tocam um pouquinho depois do tempo (a bateria "arrastada" do estilo, de J Dilla e do boom-bap)
    beats: [
      { id: "boombap", label: "Boom-bap atrasado", bars: [
        "H!/8 H??>/8 H/8 H?>/8 H!/8 H??>/8 H/8 H?>/8 ; K!/4 r/8 K?>/8 r/4 r/8 K/8 ; r/4 S!>/4 r/4 S!>>/4",
        "H!/8 H??>/8 H/8 H?>/8 H!/8 H??>/8 H/8 O?>/8 ; K!/4 r/8 K?>/8 r/4 r/8 K?>/8 ; r/4 S!>/4 r/4 S!>>/8 S??>>/8"] },
      { id: "swing", label: "Swing de colcheias", bars: [
        "H!/4t H??>/8t H/4t H?>/8t H!/4t H??>/8t H/4t H?>/8t ; K!/4 r/4 r/8 K?>/8 r/4 ; r/4 S!>/4 r/4 S!>/4",
        "H!/4t H??>/8t H/4t H?>/8t H!/4t H??>/8t H/4t O?>/8t ; K!/4 r/8 K?>/8 r/4 K?>/4 ; r/4 S!>/4 r/4 S!>>/4"] },
      { id: "sutil", label: "Chimbal em semicolcheias suaves", bars: [
        "H!/16 H??/16 H?>/16 H??/16 H/16 H??/16 H?>/16 H??/16 H!/16 H??/16 H?>/16 H??/16 H/16 H??/16 H?>/16 H??/16 ; K!/4 r/4 K?>/8 r/4 r/8 ; r/4 S!>/4 r/4 S!>>/4",
        "H!/16 H??/16 H?>/16 H??/16 H/16 H??/16 H?>/16 H??/16 H!/16 H??/16 H?>/16 H??/16 H/16 H??/16 H??/16 O?>/16 ; K!/4 r/8 K?>/8 r/4 r/8 K??>>/8 ; r/4 S!>/4 r/4 S!>>/4"] },
    ],
    percussion: [
      { id: "shaker", label: "Shaker suave", bars: ["Q!/16 Q??/16 Q?>/16 Q??/16 Q/16 Q??/16 Q?>/16 Q??/16 Q!/16 Q??/16 Q?>/16 Q??/16 Q/16 Q??/16 Q?>/16 Q??/16"] },
      { id: "pandeirola", label: "Shaker e pandeirola", bars: ["Q?/8 Q??>/8 Q?/8 Q??>/8 Q?/8 Q??>/8 Q?/8 Q??>/8 ; r/4 A??>/4 r/4 A??>/4"] },
    ],
    fills: ["S??>/16 S?>/16 S>/8 T?>/8 M?>/8 ; K/4 r/4", "r/8 S??>/16 S?>/16 S>/8 S!>/8 ; K/4 r/4", "T?>/8 T>/8 M?>/8 F!>/8 ; r/4 K/4", "S??>/16 S?>/16 S!>/8", "X>/8 X?>/8"],
    bass: [
      { id: "sub", label: "Sub longo", pattern: "1/2. 5/4" },
      { id: "oitava", label: "Raiz e oitava", pattern: "1/4. 1/8 r/4 8/4" },
      { id: "sincope", label: "Síncope suave", pattern: "1/4 r/8 1/8 r/4 5/8 x/8" },
    ],
    bassFill: { chance: 0.25, figure: "8", beats: 1, high: 12, shapes: ["chegada", "descida"], long: 0.3 },
    cells: ["2", "4 4", "4. 8", "8 8 4", "r8 8 4", "4 r8 8", "8 4 8", "r4 8 8", "4+8 8", "8 8 8 8", "r4 4", "8. 16 4", "4. 8 4", "8 8 r8 8", "8. 16 8 8", "r8 8 8. 16"],
    fast: ["8 8 8 8 8 8", "16 16 8 8 8", "8. 16 8. 16"],
    // shift: -1 deixa o solo um nível mais calmo que a intensidade pedida; motif alto: o mesmo motivo rítmico volta muito
    phrase: { chromatic: 0.08, enclosure: 0, blue: 0, leap: 0.15, rest: 0.4, motif: 0.85, pentatonic: true, minNotes: 2, shift: -1, duet: { octave: 0.25, sixth: 0.35, triad: 0.1 } },
  },
  {
    id: "gospel", label: "Gospel americano",
    riffs: ["ataques", "dedilhado", "ostinato"],
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
    fills: ["S??/16 S?/16 S/16 S!/16 ; K/8 r/8", "S/16 T?/16 M/16 F!/16 ; K/8 K/8", "S!/16 S??/16 S?/16 S!/16 T!/16 T?/16 M!/16 M?/16 ; K/8 r/8 K/8 r/8", "S/32 S/32 S??/16 S/16 S!/16 T/16 M/16 F/16 F!!/16 ; K/8 r/8 K/16 K/16 r/8", "T!/16 T?/16 T/16 M!/16 M?/16 M/16 F!/16 F/16 ; K/4 K/4", "S!/16 S??/16 S??/16 S!/16 S??/16 S??/16 S!/16 S!!/16 ; K/16 r/16 r/8 K/16 r/16 r/8", "S/32 S?/32 S/32 S?/32 T/16 T!/16 M/32 M?/32 M/32 M?/32 F/16 F!!/16 ; K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16", "S!/16 K/16 T/16 T/16 S!/16 K/16 M/16 M/16 ; r/2"],
    bass: [
      { id: "pulso", label: "Pulso", pattern: "1/4 1/8 8/8 7/4 5/4" },
      { id: "oitavas", label: "Oitavas", pattern: "1/8 8/8 1/8 8/8 1/8 8/8 5/8 x/8" },
      { id: "shout", label: "Shout", pattern: "1/8 r/8 1/8 r/8 1/8 r/8 x/8 r/8" },
    ],
    bassFill: { chance: 0.75, figure: "16", beats: 2, high: 21, shapes: ["subida", "arco", "descida", "subida"], pop: 0.25, long: 0.75 },
    cells: [
      "16 16 16 16 4", "r8 16 16 4", "32 32 32 32 16 16 4", "8 16 16 4", "16t 16t 16t 16t 16t 16t 4", "r4 16 16 16 16", "8. 16+4",
      "4 r4", "r8 8 4", "16 16 8 4", "8t 8t 8t 4", "r16 16 16 16 4", "2",
    ],
    fast: ["32 32 32 32 32 32 32 32 4", "16 16 16 16 16 16 16 16", "16t 16t 16t 16t 16t 16t 4"],
    phrase: { chromatic: 0.35, enclosure: 0.1, blue: 0.4, leap: 0.2, rest: 0.2, motif: 0.45, pentatonic: true, minNotes: 4 , duet: { octave: 0.2, sixth: 0.3, triad: 0.35 } },
  },
  {
    id: "funk", label: "Funk (16 avos)",
    riffs: ["ataques", "oitavas", "ostinato", { id: "abafado", label: "Guitarra abafada em semicolcheias", sound: "ms-guitarra-abafada", rhythms: ["16! 16 16 16 16 16! 16 16 16 16! 16 16 16! 16 16 16", "16 16! 16 16 16! 16 16 16 16 16! 16 16 16 16 16! 16"] }],
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
    fills: ["S??/16 S?/16 S/16 S!/16 ; K/8 r/8", "S/16 T?/16 M/16 F!/16 ; K/8 K/8", "S!/16 S??/16 S?/16 S!/16 T!/16 T?/16 M!/16 M?/16 ; K/8 r/8 K/8 r/8", "S/32 S/32 S??/16 S/16 S!/16 T/16 M/16 F/16 F!!/16 ; K/8 r/8 K/16 K/16 r/8", "T!/16 T?/16 T/16 M!/16 M?/16 M/16 F!/16 F/16 ; K/4 K/4", "S!/16 S??/16 S??/16 S!/16 S??/16 S??/16 S!/16 S!!/16 ; K/16 r/16 r/8 K/16 r/16 r/8", "S!/16 S??/16 S??/16 S!/16 r/16 S??/16 S!/8 ; K/16 r/16 K/16 r/16 K/8 r/8"],
    bass: [
      { id: "dezesseis", label: "Dezesseis avos", pattern: "1/16 r/16 1/16 r/16 r/8 8/16 r/16 r/8 1/16 r/16 7/16 8/16 r/8" },
      { id: "pop", label: "Com oitava", pattern: "1/8 r/8 r/16 1/16 r/8 5/8 r/8 7/8 8/8" },
      { id: "um", label: "No um", pattern: "1/8. r/16 r/2 r/8 7/16 8/16" },
    ],
    bassFill: { chance: 0.6, figure: "16", beats: 2, high: 19, shapes: ["subida", "descida", "arco"], pop: 0.3, long: 0.75 },
    cells: ["16 r16 16 16", "r16 16 r16 16", "16 16 r8", "r8 16 16", "16 r16 r16 16", "8 r16 16", "16 16 16 r16", "r4", "16 r16 16 r16 r16 16 16 r16", "8 8", "r16 16 16 r16 16 r16 8"],
    fast: ["16 16 16 16 16 16 16 16", "16 r16 16 16 16 16 r16 16"],
    phrase: { chromatic: 0.2, enclosure: 0, blue: 0.3, leap: 0.15, rest: 0.2, motif: 0.7, pentatonic: true, minNotes: 4 , duet: { octave: 0.2, sixth: 0.1, triad: 0.15 } },
  },
  {
    id: "salsa", label: "Salsa",
    riffs: ["montuno", "ostinato", "ataques"],
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
    fills: ["T/8 T/8 M/8 M!/8 ; K/4. K/8", "T/16 T/16 T/8 M/8 F!/8", "Y/16 Y/16 Y/16 Y/16 Z!/8 Z!/8", "Y/16 Y?/16 Y/16 Y?/16 Z/16 Z?/16 Y!/16 Z!/16 ; K/4. K/8", "T!/16 T?/16 T/16 T?/16 M!/16 M?/16 M/16 M?/16 ; K/4. K/8"],
    bass: [
      { id: "tumbao", label: "Tumbao", pattern: "r/4 r/8 5/8+4 1/4" },
      { id: "tumbao2", label: "Tumbao com a oitava", pattern: "r/4 r/8 1/8+4 8/4" },
      { id: "antecipado", label: "Antecipando o acorde", pattern: "r/4 r/8 5/8+4 x/4" },
    ],
    bassFill: { chance: 0.4, figure: "8", beats: 1, high: 12, shapes: ["chegada", "descida"] },
    cells: ["8 8 8 8", "r8 8 8 8", "8 r8 8 8", "8 8 r8 8", "r8 8+8 8", "8 8+4", "4 r8 8", "r8 8 r8 8", "8 8 8 8+4 r4", "4 4", "r8 8 4"],
    fast: ["8 8 8 8 8 8 8 8", "16 16 8 16 16 8"],
    phrase: { chromatic: 0.15, enclosure: 0.05, blue: 0, leap: 0.3, rest: 0.15, motif: 0.6, pentatonic: false, minNotes: 4 , duet: { octave: 0.75, sixth: 0.05, triad: 0.05 } },
  },
  {
    id: "samba", label: "Samba",
    riffs: [{ id: "dedilhado", label: "Violão dedilhado", sound: "ms-violao" }, "ostinato", "ataques"],
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
    fills: ["S/16 S?/16 S/16 S?/16 S/16 r/16 S!/8 ; K/8. K/16 K/8. K/16", "T/16 T/16 M/16 M/16 F/8 F!/8 ; K/8. K/16 K/8. K/16", "S??/16 S/16 S/16 S??/16 S/16 S/16 S!/16 S!!/16 ; K/8. K/16 K/8. K/16", "S/16 S/16 S!/8"],
    bass: [
      { id: "surdo", label: "Surdo", pattern: "1/8. 1/16 _4/4 1/8. 1/16 _4/4" },
      { id: "partido", label: "Partido alto", pattern: "1/8. _4/16 r/8 _4/8 1/8. 1/16 _4/8 x/8" },
      { id: "corrido", label: "Corrido", pattern: "1/16 r/16 1/16 _4/16 _4/4 1/16 r/16 1/16 _4/16 x/4" },
    ],
    bassFill: { chance: 0.45, figure: "16", beats: 1, high: 14, shapes: ["chegada", "descida", "subida"] },
    cells: ["16 8 16", "16 16 16 16", "r16 16 16 16", "16 8 16 16 8 16", "8. 16", "16 16 8", "8 16 16", "r16 8 16+4", "16 8 16+4", "4", "r8 16 16", "16 16 16 16 16 8 16"],
    fast: ["16 16 16 16 16 16 16 16", "r16 16 16 16 16 16 16 16"],
    phrase: { chromatic: 0.2, enclosure: 0.05, blue: 0, leap: 0.25, rest: 0.1, motif: 0.55, pentatonic: false, minNotes: 6 , duet: { octave: 0.15, sixth: 0.3, triad: 0.2 } },
  },
  {
    id: "bossa", label: "Bossa nova",
    riffs: [{ id: "dedilhado", label: "Violão dedilhado", sound: "ms-violao" }, "guia", "ostinato"],
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
      { id: "vassourinha", label: "Chimbal em semicolcheias leves", bars: ["H/16 H??/16 H?/16 H??/16 H?/16 H??/16 H?/16 H??/16 H/16 H??/16 H?/16 H??/16 H?/16 H??/16 H?/16 H??/16 ; K/4. K/8 K/4. K/8 ; X/4. X/4. X/4", "H/16 H??/16 H?/16 H??/16 H?/16 H??/16 H?/16 H??/16 H/16 H??/16 H?/16 H??/16 H?/16 H??/16 O?/8 ; K/4. K/8 K/4. K/8 ; r/4 X/4. X/4."] },
    ],
    percussion: [
      { id: "ganza", label: "Ganzá suave", bars: ["Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16"] },
      { id: "ganzaclave", label: "Ganzá e clave", bars: ["Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 ; L/4. L/4. L/4", "Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 ; r/4 L/4. L/4."] },
    ],
    fills: ["X/8 X/8 X/8 X!/8 ; K/4 r/8. K/16", "X/8 X/8 X/4 ; r/4 K/8. K/16", "S??/16 S??/16 S?/16 S?/16 T/8 F!/8 ; K/4 K/4", "X/16 X/16 X/8 T/8 F/8 ; K/4 r/4", "S?/8 S/8"],
    bass: [
      { id: "bossa", label: "Bossa (1 e 5)", pattern: "1/4. _4/8+4. 1/8" },
      { id: "dois", label: "Em dois", pattern: "1/2 _4/2" },
      { id: "caminhando", label: "Caminhando", pattern: "1/4. _4/8+4 3/8 x/8" },
    ],
    bassFill: { chance: 0.35, figure: "8", beats: 1, high: 12, shapes: ["chegada", "descida"] },
    cells: ["r8 8 4", "8 8+4", "4 r8 8", "r8 8+4", "4. 8", "8 4 8", "2", "r4 8 8", "8 8 8 8", "r8 8 8 8+4 r4", "4 4"],
    fast: ["16 16 16 16 8 8", "8t 8t 8t 4", "16 16 8 16 16 8"],
    phrase: { chromatic: 0.25, enclosure: 0.1, blue: 0, leap: 0.2, rest: 0.25, motif: 0.5, pentatonic: false, minNotes: 3 , duet: { octave: 0.1, sixth: 0.3, triad: 0.25 } },
  },
  {
    id: "rock", label: "Rock",
    riffs: ["power", "abafado", "ostinato", { id: "pontuado", label: "Guitarra limpa arpejada" }, "deslocado", "unissono", "pedalmelodico", "gemeas", "teclado"],
    influences: ["Led Zeppelin", "Aerosmith", "Slash", "Jon Lord", "Dream Theater (Jordan Rudess)", "Iron Maiden"],
    summary: "Power chords e riffs de guitarra, colcheias retas, pentatônica menor com blue note, licks curtos e repetidos. Do rock progressivo: escalas em terças, grupos de 5 e de 6 notas que cruzam o tempo, pedal point, arpejos largos de teclado e acentos deslocados dentro do 4/4. Harmonia diatônica.",
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
      { id: "aberto", label: "Chimbal aberto e bumbo nos quatro", bars: ["O/8 H?/8 O!/8 H??/8 O/8 H?/8 O!!/8 H??/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/4", "O/8 H??/8 O!/8 H?/8 O/8 H??/8 O!!/4 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/8 S/8"] },
      { id: "duplo", label: "Bumbo duplo (semicolcheias)", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/4 S!/4 r/4 S!/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O!/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/4 S!/4 r/4 S!/8 S/8"] },
      { id: "rajada", label: "Bumbo duplo em rajadas", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4 r/4 K/8 K/8 K/16 K/16 K/16 K/16 ; r/4 S!/4 r/4 S!/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O!/8 ; K/8 K/16 K/16 r/4 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/4 S!/4 r/4 S!/4"] },
      { id: "galope", label: "Galope com bumbo duplo", bars: ["R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/8 K/16 K/16 K/8 K/16 K/16 K/8 K/16 K/16 K/8 K/16 K/16 ; r/4 S!/4 r/4 S!/4", "R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 E!/8 ; K/8 K/16 K/16 K/8 K/16 K/16 K/8 K/16 K/16 K/16 K/16 K/16 K/16 ; r/4 S!/4 r/4 S!/4"] },
      { id: "tons", label: "Levada de tons", bars: ["F!/8 F?/8 F/8 F?/8 F!/8 F?/8 M/8 M?/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/4", "F!/8 F?/8 F/8 F?/8 M!/8 M?/8 T/8 T!/8 ; K/4 K/4 K/4 K/8 K/8 ; r/4 S!/4 r/4 S!/4"] },
      { id: "prog", label: "Acentos 3+3+2 (rock progressivo)", bars: ["E!/8. R?/16 R/8 E!/8. R?/16 R/8 E!/8 R?/8 ; K/8. K/16 r/8 K/8. K/16 r/8 K/8 K/8 ; r/2 S!/2", "E!/8. R?/16 R/8 E!/8. R?/16 R/8 E!/8 O!/8 ; K/8. K/16 r/8 K/8. K/16 r/8 K/16 K/16 K/16 K/16 ; r/2 S!/4 r/8 S/8"] },
    ],
    percussion: [
      { id: "pandeirola", label: "Pandeirola em colcheias", bars: ["A?/8 A!/8 A?/8 A!/8 A?/8 A!/8 A?/8 A!/8"] },
      { id: "cowbell", label: "Cowbell", bars: ["B!/4 B/4 B!/4 B/4"] },
    ],
    fills: ["S??/16 S?/16 S/16 S!/16 ; K/8 r/8", "S/16 T?/16 M/16 F!/16 ; K/8 K/8", "S!/16 S??/16 S?/16 S!/16 T!/16 T?/16 M!/16 M?/16 ; K/8 r/8 K/8 r/8", "S/32 S/32 S??/16 S/16 S!/16 T/16 M/16 F/16 F!!/16 ; K/8 r/8 K/16 K/16 r/8", "T!/16 T?/16 T/16 M!/16 M?/16 M/16 F!/16 F/16 ; K/4 K/4", "S!/16 S??/16 S??/16 S!/16 S??/16 S??/16 S!/16 S!!/16 ; K/16 r/16 r/8 K/16 r/16 r/8"],
    bass: [
      { id: "colcheias", label: "Colcheias", pattern: "1/8 1/8 1/8 1/8 1/8 1/8 1/8 1/8" },
      { id: "riff", label: "Riff com oitava", pattern: "1/4 1/8 1/8 5/8 5/8 8/8 5/8" },
      { id: "galope", label: "Galope", pattern: "1/8 1/16 1/16 1/8 1/16 1/16 1/8 1/16 1/16 1/8 x/16 x/16" },
    ],
    bassFill: { chance: 0.45, figure: "16", beats: 2, high: 14, shapes: ["subida", "descida", "chegada"] },
    cells: ["8 8 8 8", "8 8 4", "4 8 8", "r8 8 8 8", "4 4", "8 8 r4", "16 16 8 4", "2", "r4 8 8", "8. 16 4", "8. 8. 8", "16 16 16 16 8 8"],
    fast: ["16 16 16 16 16 16 16 16", "8t 8t 8t 8t 8t 8t", "16t 16t 16t 16t 16t 16t 16t 16t 16t 16t 16t 16t", "16 16 16 16 16 16 8"],
    phrase: { chromatic: 0.05, enclosure: 0, blue: 0.4, leap: 0.25, rest: 0.25, motif: 0.8, pentatonic: true, sequence: true, prog: 0.4, minNotes: 4, duet: { octave: 0.2, sixth: 0.05, triad: 0 } },
  },
  {
    id: "ska", label: "Ska",
    riffs: [{ id: "ataques", label: "Guitarra no contratempo", sound: "ms-guitarra-limpa", rhythms: ["r8 8 r8 8 r8 8 r8 8", "r8 8 r8 8 r8 8 r8 16 16"] }, "ostinato", "oitavas"],
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
      { id: "ska", label: "Ska tradicional", bars: ["r/8 H!/8 r/16 H??/16 H/8 r/8 H!!/8 r/16 H??/16 H!/8 ; r/4 K/4 r/4 K/4 ; r/4 X!/4 r/4 X!/4", "r/8 H!/8 r/8 H/8 r/16 H??/16 H!!/8 r/8 O!/8 ; r/4 K/4 r/4 K/4 ; r/4 X!/4 r/4 X!/4"] },
      { id: "onedrop", label: "One drop", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; r/2 K!/2 ; r/2 X!/2", "H/8 H?/8 H/8 O?/8 H/8 H?/8 H/16 H?/16 O/8 ; r/2 K!/2 ; r/2 X!/2"] },
      { id: "twotone", label: "2 tone (bumbo nos quatro)", bars: ["H/8 O/8 H/8 O/8 H/8 O/8 H/8 O/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/4", "H/8 O/8 H/8 O/8 H/8 O/8 H/16 H/16 O!/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/8 S?/8"] },
    ],
    percussion: [
      { id: "pandeirola", label: "Pandeirola no contratempo", bars: ["r/8 A!/8 r/8 A!/8 r/8 A!/8 r/8 A!/8"] },
      { id: "shaker", label: "Shaker e cowbell", bars: ["Q/8 Q?/8 Q/8 Q?/8 Q/8 Q?/8 Q/8 Q?/8 ; B/4 r/4 B/4 r/4"] },
    ],
    fills: ["S/8 S/8 T/8 F!/8 ; K/4 K/4", "S/16 S/16 S/8 S!/4 ; K/4 K/4", "S/16 S?/16 S/16 S/16 T/16 T/16 F/16 F!/16 ; K/8 r/8 K/8 r/8", "S/8 S!/8"],
    bass: [
      { id: "caminhando", label: "Caminhando", pattern: "1/4 3/4 5/4 6/4" },
      { id: "pulo", label: "Pulando", pattern: "1/8 r/8 1/8 r/8 5/8 r/8 5/8 x/8" },
      { id: "metais", label: "Com a oitava", pattern: "1/4 8/4 5/4 x/4" },
    ],
    bassFill: { chance: 0.4, figure: "8", beats: 1, high: 12, shapes: ["chegada", "subida"] },
    cells: ["r8 8 r8 8", "r8 8 8 8", "8 8 r8 8", "r8 8 4", "4 r8 8", "r8 8 r4", "8 8 8 8", "r8 8+4", "4 4"],
    fast: ["16 16 8 8 8", "16 16 16 16 4"],
    phrase: { chromatic: 0.05, enclosure: 0, blue: 0.1, leap: 0.3, rest: 0.2, motif: 0.7, pentatonic: false, minNotes: 3 , duet: { octave: 0.3, sixth: 0.2, triad: 0.15 } },
  },
  {
    id: "worship", label: "Worship",
    riffs: ["pontuado", "dedilhado", "ostinato", { id: "power", label: "Guitarra em acordes abertos", sound: "ms-guitarra-overdrive", rhythms: ["8 8 8 8 8 8 8 8", "2 2", "4. 8+2"] }],
    influences: ["Hillsong", "Elevation Worship", "Bethel Music"],
    summary: "Andamento médio, guitarra com colcheia pontuada (delay), piano em arpejos, acordes com nona e quarta, crescendo do verso ao refrão. Harmonia diatônica, sem modulação.",
    comps: [
      { id: "longos", label: "Acordes longos (pad)", pattern: "T/1" },
      { id: "piano", label: "Piano em mínimas", pattern: "E/2 E/2 ; D/4. D/8+2" },
      { id: "colcheias", label: "Colcheias pulsando", pattern: "T/8 T?/8 T/8 T?/8 T/8 T?/8 T/8 T?/8" },
      { id: "baixo", bass: "colcheias", label: "Baixo em colcheias e acordes longos", pattern: "B/8 B?/8 B/8 B?/8 B/8 B?/8 B/8 B?/8 ; D/2. D/4" },
      { id: "semicolcheias", label: "Semicolcheias (crescendo)", pattern: "T?/16 T??/16 T?/16 T/16 T?/16 T??/16 T?/16 T/16 T?/16 T??/16 T?/16 T/16 T/16 T/16 T!/16 T!/16" },
      { id: "ostinato9", kind: "ostinato", label: "Ostinato com a nona", pattern: "S1/8 S5/8 S8/8 S5/8 S9/8 S5/8 S8/8 S5/8 ; D/1" },
      { id: "ostinatopontuado", kind: "ostinato", label: "Ostinato pontuado", pattern: "M1/8. M2/8. M3/8 M2/8. M1/8. M3/8 ; E/1" },
    ],
    beats: [
      { id: "verso", label: "Verso (aro)", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4. K/8 r/2 ; r/4 X/4 r/4 X/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4. K/8 r/4 r/8 K/8 ; r/4 X/4 r/4 X/4"] },
      { id: "refrao", label: "Refrão (caixa cheia)", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4 r/8 K/8 K/4 r/4 ; r/4 S!/4 r/4 S!/4", "H/16 H??/16 H/16 H??/16 H/16 H??/16 H/16 H??/16 H/16 H??/16 H/16 H??/16 H/8 O!/8 ; K/4 r/8 K/8 K/4 r/8 K/8 ; r/4 S!/4 r/4 S!/4"] },
      { id: "tons", label: "Tons (preparação)", bars: ["F/8 F?/8 F/8 F?/8 F/8 F?/8 F/8 F?/8 ; K/4 K/4 K/4 K/4 ; r/2. S!/4", "F/8 F?/8 F/8 F?/8 M/8 M?/8 T/8 T!/8 ; K/4 K/4 K/4 K/4 ; r/2 r/4 S!/8 S!/8"] },
      { id: "meio", label: "Meio tempo", bars: ["R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/4. K/8 r/2 ; r/2 S!/2", "R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/4. K/8 r/4 r/8 K/8 ; r/2 S!/2"] },
    ],
    percussion: [
      { id: "shaker", label: "Shaker em semicolcheias", bars: ["Q?/16 Q??/16 Q/16 Q??/16 Q?/16 Q??/16 Q/16 Q??/16 Q?/16 Q??/16 Q/16 Q??/16 Q?/16 Q??/16 Q/16 Q??/16"] },
      { id: "pandeirola", label: "Pandeirola no 2 e no 4", bars: ["r/4 A!/4 r/4 A!/4"] },
    ],
    fills: ["S??/16 S?/16 S/16 S!/16 ; K/8 r/8", "S/16 T?/16 M/16 F!/16 ; K/8 K/8", "S!/16 S??/16 S?/16 S!/16 T!/16 T?/16 M!/16 M?/16 ; K/8 r/8 K/8 r/8", "T!/16 T?/16 T/16 M!/16 M?/16 M/16 F!/16 F/16 ; K/4 K/4", "T/8 M/8 F/8 F!/8 ; K/4 K/4"],
    bass: [
      { id: "inteiras", label: "Notas longas", pattern: "1/1" },
      { id: "colcheias", label: "Colcheias na fundamental", pattern: "1/8 1/8 1/8 1/8 1/8 1/8 1/8 1/8" },
      { id: "pontuado", label: "Pontuado", pattern: "1/4. 1/8 r/4 1/8 5/8" },
    ],
    bassFill: { chance: 0.25, figure: "8", beats: 1, high: 10, shapes: ["chegada"] },
    cells: ["4 4", "2", "8 8 4", "4. 8", "r4 4", "4 8 8", "8. 16 4", "r8 8 4", "4 4 2"],
    fast: ["8 8 8 8", "16 16 8 4", "8 8 8 8 8 8"],
    phrase: { chromatic: 0, enclosure: 0, blue: 0, leap: 0.2, rest: 0.4, motif: 0.85, pentatonic: true, sequence: true, minNotes: 3, duet: { octave: 0.15, sixth: 0.2, triad: 0 } },
  },
  {
    id: "balada", label: "Balada",
    riffs: ["dedilhado", "ostinato", "pontuado"],
    influences: ["Elton John", "Aerosmith (baladas)", "Adele"],
    summary: "Andamento lento, piano arpejado, bateria com aro e meio tempo, frases cantadas com muito espaço. Harmonia diatônica, sem modulação.",
    comps: [
      { id: "inteiros", label: "Acordes inteiros", pattern: "T/1" },
      { id: "minimas", label: "Mínimas", pattern: "T/2 T?/2" },
      { id: "esquerda", label: "Mão esquerda e resposta", pattern: "E/2 E/2 ; r/4 D/4 r/4 D/4" },
      { id: "colcheias", label: "Direita em colcheias", pattern: "E/1 ; D/8 D?/8 D/8 D?/8 D/8 D?/8 D/8 D?/8" },
      { id: "sincopado", label: "Sincopado suave", pattern: "E/4. E/8+2 ; r/4 D/4. D/8+4" },
      { id: "arpejo8", kind: "ostinato", label: "Arpejo em colcheias", pattern: "S1/8 S5/8 S8/8 M1/8 M2/8 M1/8 S8/8 S5/8" },
      { id: "arpejo16", kind: "ostinato", label: "Arpejo em semicolcheias", pattern: "S1/16 S5/16 S8/16 M1/16 M2/16 M1/16 S8/16 S5/16 S1/16 S5/16 S8/16 M1/16 M3/16 M2/16 M1/16 S8/16" },
    ],
    beats: [
      { id: "aro", label: "Aro, meio tempo", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4. K/8 r/2 ; r/2 X/2", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4. K/8 r/4 K/4 ; r/2 X/2"] },
      { id: "caixa", label: "Caixa no 2 e no 4", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4 r/4 K/8 K/8 r/4 ; r/4 S/4 r/4 S/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O/8 ; K/4 r/4 K/8 K/8 r/8 K/8 ; r/4 S/4 r/4 S/4"] },
      { id: "conducao", label: "Condução, refrão", bars: ["R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/4 r/8 K/8 K/4 r/4 ; r/4 S!/4 r/4 S!/4", "R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 E/8 ; K/4 r/8 K/8 K/4 r/8 K/8 ; r/4 S!/4 r/4 S!/4"] },
    ],
    percussion: [
      { id: "shaker", label: "Shaker em colcheias", bars: ["Q?/8 Q/8 Q?/8 Q/8 Q?/8 Q/8 Q?/8 Q/8"] },
      { id: "pandeirola", label: "Pandeirola no 2 e no 4", bars: ["r/4 A/4 r/4 A/4"] },
    ],
    fills: ["S??/16 S?/16 S/16 S!/16 ; K/8 r/8", "T/8 M/8 F/8 F!/8 ; K/4 K/4", "S?/8 S/8 T/8 F!/8 ; K/4 r/4", "S??/16 S?/16 S?/16 S/16 T/8 F!/8 ; K/4 K/4"],
    bass: [
      { id: "inteiras", label: "Notas longas", pattern: "1/1" },
      { id: "minimas", label: "Fundamental e quinta", pattern: "1/2. 5/4" },
      { id: "pontuado", label: "Pontuado", pattern: "1/4. 1/8+2" },
    ],
    bassFill: { chance: 0.2, figure: "8", beats: 1, high: 8, shapes: ["chegada"] },
    cells: ["2", "4 4", "4. 8", "8 8 4", "r4 4", "4 8 8", "r8 8 4", "4 4 2", "2 4 4"],
    fast: ["8 8 8 8", "8 8 4", "16 16 8 4"],
    phrase: { chromatic: 0, enclosure: 0, blue: 0, leap: 0.2, rest: 0.45, motif: 0.8, pentatonic: false, minNotes: 3, shift: -1, duet: { octave: 0.1, sixth: 0.3, triad: 0 } },
  },
  {
    id: "metal", label: "Metal",
    riffs: ["galope", "abafado", "power", { id: "arpejador", label: "Arpejo de guitarra (sweep)", sound: "ms-guitarra-distorcida", rhythms: ["16 16 16 16 16 16 16 16 16 16 16 16 16 16 16 16", "8t 8t 8t 8t 8t 8t 8t 8t 8t 8t 8t 8t"] }, "gemeas", "pedalmelodico", "deslocado", "unissono", "teclado"],
    influences: ["Kiko Loureiro", "Iron Maiden", "Metallica", "Eric Johnson", "Dream Theater (Jordan Rudess)"],
    summary: "Riffs em galope e pedal abafado na corda grave, power chords, bumbo duplo, guitarras gêmeas em terças. Solos com sequências, escalas em terças, grupos de 5 e de 6 notas, pedal point e arpejos de duas oitavas (teclado e guitarra de metal progressivo), tudo dentro do 4/4. Harmonia diatônica (menor natural e frígio).",
    comps: [
      { id: "longos", label: "Acordes longos", pattern: "T/1" },
      { id: "colcheias", label: "Colcheias retas", pattern: "T/8 T?/8 T/8 T?/8 T/8 T?/8 T/8 T?/8" },
      { id: "ataques", label: "Ataques", pattern: "T!/4 r/8 T/8+4 T/4" },
      { id: "galope", bass: "galope", label: "Galope", pattern: "T/8 T?/16 T?/16 T/8 T?/16 T?/16 T/8 T?/16 T?/16 T/8 T?/16 T?/16" },
      { id: "riffpedal", kind: "ostinato", label: "Riff com pedal na fundamental", pattern: "S1/8 S1/8 S3/8 S1/8 S4/8 S1/8 S5/8 S4/8 ; D/1" },
      { id: "riffgalope", kind: "ostinato", bass: "galope", label: "Riff em galope", pattern: "S1/8 S1/16 S1/16 S5/8 S1/16 S1/16 S7/8 S1/16 S1/16 S5/8 S8/8 ; D/1" },
    ],
    beats: [
      { id: "galope", label: "Galope", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/8 K/16 K/16 K/8 K/16 K/16 K/8 K/16 K/16 K/8 K/16 K/16 ; r/4 S!/4 r/4 S!/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O!/8 ; K/8 K/16 K/16 K/8 K/16 K/16 K/8 K/16 K/16 K/8 K/16 K/16 ; r/4 S!/4 r/4 S!/4"] },
      { id: "duplo", label: "Bumbo duplo", bars: ["R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 R?/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/4 S!/4 r/4 S!/4", "R/8 R?/8 R/8 R?/8 R/8 R?/8 R/8 E/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/4 S!/4 r/4 S!/8 S/8"] },
      { id: "thrash", label: "Thrash (caixa no contratempo)", bars: ["H/8 H/8 H/8 H/8 H/8 H/8 H/8 H/8 ; K/8 r/8 K/8 r/8 K/8 r/8 K/8 r/8 ; r/8 S!/8 r/8 S!/8 r/8 S!/8 r/8 S!/8", "H/8 H/8 H/8 H/8 H/8 H/8 H/8 O!/8 ; K/8 r/8 K/8 r/8 K/8 r/8 K/8 K/8 ; r/8 S!/8 r/8 S!/8 r/8 S!/8 r/8 S!/8"] },
      { id: "meio", label: "Meio tempo pesado", bars: ["R!/8 R?/8 R/8 R?/8 R!/8 R?/8 R/8 R??/8 ; K/8 K/8 r/4 K/8 K/8 r/4 ; r/2 S!!/2", "R!/8 R?/8 R/8 R?/8 R!/8 R?/8 R/8 R??/8 ; K/8 K/8 r/4 K/8 K/16 K/16 r/4 ; r/2 S!!/2"] },
      { id: "sextinas", label: "Bumbo duplo em sextinas", bars: ["R!/8 R?/8 R/8 R??/8 R!/8 R?/8 R/8 R??/8 ; K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t ; r/4 S!/4 r/4 S!/4", "R!/8 R?/8 R/8 R??/8 R!/8 R?/8 R/8 E!/8 ; K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t K/16t ; r/4 S!/4 r/4 S!/8 S/8"] },
      { id: "meioduplo", label: "Meio tempo com bumbo duplo", bars: ["E!/8 R?/8 R/8 R??/8 E!/8 R?/8 R/8 R??/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/2 S!!/2", "E!/8 R?/8 R/8 R??/8 E!/8 R?/8 R/8 O!/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/2 S!!/2"] },
      { id: "blast", label: "Blast beat", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16 ; r/16 S/16 r/16 S/16 r/16 S/16 r/16 S/16 r/16 S/16 r/16 S/16 r/16 S/16 r/16 S/16", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O!/8 ; K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16 K/16 r/16 K/16 K/16 K/16 K/16 ; r/16 S/16 r/16 S/16 r/16 S/16 r/16 S/16 r/16 S/16 r/16 S/16 S!/8 S!/8"] },
      { id: "deslocado", label: "Bumbo duplo com acentos 3+3+2", bars: ["E!/8. R?/16 R/8 E!/8. R?/16 R/8 E!/8 R?/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/2 S!!/2", "E!/8. R?/16 R/8 E!/8. R?/16 R/8 E!/8 O!/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16 ; r/4. S!/8 r/4 S!!/4"] },
    ],
    percussion: [
      { id: "pandeirola", label: "Pandeirola em colcheias", bars: ["A?/8 A!/8 A?/8 A!/8 A?/8 A!/8 A?/8 A!/8"] },
      { id: "cowbell", label: "Cowbell", bars: ["B!/4 B/4 B!/4 B/4"] },
    ],
    fills: ["S/16 S/16 S/16 S!/16 ; K/8 K/8", "T/16 T/16 M/16 M/16 F/16 F/16 F!/16 F!/16 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16", "S!/16 S/16 T/16 T/16 M/16 M/16 F/16 F!/16 ; K/8 K/8 K/8 K/8", "S/16 S/16 S/16 S/16 T/16 T/16 M/16 M/16 ; K/4 K/4", "T!/8 M!/8 F!/8 F!!/8 ; K/16 K/16 K/16 K/16 K/16 K/16 K/16 K/16"],
    bass: [
      { id: "colcheias", label: "Colcheias", pattern: "1/8 1/8 1/8 1/8 1/8 1/8 1/8 1/8" },
      { id: "galope", label: "Galope", pattern: "1/8 1/16 1/16 1/8 1/16 1/16 1/8 1/16 1/16 1/8 1/16 1/16" },
      { id: "semicolcheias", label: "Semicolcheias", pattern: "1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16 1/16" },
    ],
    bassFill: { chance: 0.3, figure: "16", beats: 1, high: 12, shapes: ["chegada", "descida"] },
    cells: ["8 8 8 8", "4 4", "8 8 4", "16 16 16 16 4", "2", "r8 8 8 8", "8. 16 4", "4 8 8", "8 8 r4", "8. 8. 8", "16 16 16 16 8 8"],
    fast: ["16 16 16 16 16 16 16 16", "16t 16t 16t 16t 16t 16t 4", "16 16 16 16 4", "16t 16t 16t 16t 16t 16t 16t 16t 16t 16t 16t 16t", "16q 16q 16q 16q 16q 16q 16q 16q 16q 16q", "16 16 16 16 16 16 8"],
    phrase: { chromatic: 0.05, enclosure: 0, blue: 0.1, leap: 0.3, rest: 0.2, motif: 0.75, pentatonic: false, sequence: true, prog: 0.55, minNotes: 4, duet: { octave: 0.15, sixth: 0, triad: 0 } },
  },
  {
    id: "disco", label: "Disco / pop",
    riffs: ["oitavas", { id: "ataques", label: "Ataques de cordas e metais" }, "arpejador", { id: "abafado", label: "Guitarra abafada em semicolcheias", sound: "ms-guitarra-abafada", rhythms: ["16! 16 16 16 16 16! 16 16 16 16! 16 16 16! 16 16 16", "16 16! 16 16 16! 16 16 16 16 16! 16 16 16 16 16! 16"] }, "ostinato"],
    influences: ["Dua Lipa", "Bee Gees", "Daft Punk", "Nile Rodgers"],
    summary: "Bumbo nos quatro tempos, chimbal aberto no contratempo, baixo em oitavas, guitarra abafada, ataques de cordas e synths com ganchos curtos e sincopados. Harmonia diatônica, em laço.",
    comps: [
      { id: "contratempo", label: "Ataques no contratempo", pattern: "r/8 T/8 r/8 T/8 r/8 T/8 r/8 T/8" },
      { id: "quatro", label: "Piano nos quatro tempos", pattern: "T/4 T?/4 T/4 T?/4" },
      { id: "longos", label: "Acordes longos (cordas)", pattern: "T/1" },
      { id: "sincopado", label: "Sincopado", pattern: "T!/8. T/16 r/8 T/8 r/8 T/8. T/16+8" },
      { id: "semicolcheias", label: "Semicolcheias leves", pattern: "T?/16 T??/16 T/16 T??/16 T?/16 T??/16 T/16 T??/16 T?/16 T??/16 T/16 T??/16 T?/16 T??/16 T/16 T??/16" },
      { id: "oitavas", kind: "ostinato", bass: "oitavas", label: "Oitavas no baixo e ataques", pattern: "S1/8 S8/8 S1/8 S8/8 S1/8 S8/8 S1/8 S8/8 ; r/8 D/8 r/8 D/8 r/8 D/8 r/8 D/8" },
      { id: "gancho", kind: "ostinato", label: "Gancho de synth", pattern: "M1/8 M1/8 r/8 M3/8 M2/8 r/8 M1/4 ; E/1" },
    ],
    beats: [
      { id: "quatro", label: "Quatro no chão", bars: ["H/8 O!/8 H/8 O!/8 H/8 O!/8 H/8 O!/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/4", "H/8 O!/8 H/8 O!/8 H/8 O!/8 H/16 H/16 O!/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/4"] },
      { id: "dezesseis", label: "Chimbal em semicolcheias", bars: ["H/16 H??/16 O/8 H/16 H??/16 O/8 H/16 H??/16 O/8 H/16 H??/16 O/8 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/4", "H/16 H??/16 O/8 H/16 H??/16 O/8 H/16 H??/16 O/8 H/16 H/16 H/16 H/16 ; K/4 K/4 K/4 K/4 ; r/4 S!/4 r/4 S!/8 S?/8"] },
      { id: "pop", label: "Pop moderno (bumbo sincopado)", bars: ["H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4 r/8 K/8 r/8 K/8 r/4 ; r/4 S!/4 r/4 S!/4", "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 O!/8 ; K/4 r/8 K/8 r/8 K/8 r/8 K/8 ; r/4 S!/4 r/4 S!/4"] },
    ],
    percussion: [
      { id: "pandeirola", label: "Pandeirola em semicolcheias", bars: ["A?/16 A??/16 A!/16 A??/16 A?/16 A??/16 A!/16 A??/16 A?/16 A??/16 A!/16 A??/16 A?/16 A??/16 A!/16 A??/16"] },
      { id: "congas", label: "Congas", bars: ["U/8 G/8 r/8 N/8 U/8 G/8 N/8 N/8"] },
      { id: "cowbell", label: "Cowbell", bars: ["B!/4 B/4 B!/4 B/4"] },
    ],
    fills: ["S??/16 S?/16 S/16 S!/16 ; K/8 r/8", "S/16 T?/16 M/16 F!/16 ; K/8 K/8", "S!/16 S??/16 S?/16 S!/16 T!/16 T?/16 M!/16 M?/16 ; K/4 K/4", "T/8 M/8 F/8 F!/8 ; K/4 K/4"],
    bass: [
      { id: "oitavas", label: "Oitavas", pattern: "1/8 8/8 1/8 8/8 1/8 8/8 1/8 8/8" },
      { id: "sincopado", label: "Sincopado", pattern: "1/8 r/16 1/16 8/8 r/8 1/8 r/16 1/16 8/8 x/8" },
      { id: "andante", label: "Andante com quinta", pattern: "1/8 1/8 8/8 1/8 5/8 5/8 8/8 x/8" },
    ],
    bassFill: { chance: 0.35, figure: "16", beats: 1, high: 12, shapes: ["chegada", "subida"], pop: 0.15 },
    cells: ["8 8 4", "r8 8 r8 8", "16 16 8 4", "4 r4", "8 8 r4", "r8 8 4", "4 4", "8. 16 r4", "r4 8 8"],
    fast: ["16 16 16 16 4", "16 16 8 16 16 8", "8 8 8 8"],
    phrase: { chromatic: 0, enclosure: 0, blue: 0.1, leap: 0.3, rest: 0.45, motif: 0.9, pentatonic: true, minNotes: 3, duet: { octave: 0.3, sixth: 0.1, triad: 0 } },
  },
  {
    id: "forro", label: "Forró",
    sound: "ms-sanfona", // o som que combina com o estilo (o app oferece ao escolher o forró)
    riffs: [
      { id: "dedilhado", label: "Ponteado de sanfona", sound: "ms-sanfona", rhythms: ["16 16 16 16 16 16 16 16 16 16 16 16 16 16 16 16", "8 16 16 8 16 16 8 16 16 8 8", "8. 16 8 8 8. 16 8 8", "16 16 8 16 16 8 16 16 8 8 8"] },
      { id: "ostinato", label: "Frase de sanfona", sound: "ms-sanfona", rhythms: ["8. 16 8 8 4 4", "8 16 16 8 8 8. 16 4", "8. 8. 8 8. 8. 8", "16 16 8 8 8 4 4", "8 8 8. 16 4 4"] },
      { id: "ataques", label: "Fole no contratempo", sound: "ms-sanfona", rhythms: ["r8 8 r8 8 r8 8 r8 8", "r8 16 16 r8 8 r8 16 16 r8 8", "r8. 16 r8 8 r8. 16 r8 8", "r4 8 8 r4 8 8"] },
      { id: "oitavas", label: "Baixos da sanfona", sound: "ms-sanfona", rhythms: ["8. 8. 8 8. 8. 8", "8. 16 r8 8 8. 16 r8 8", "4 8 8 4 8 8"] },
      { id: "gemeas", label: "Melodia em terças (duas sanfonas)", sound: "ms-sanfona" },
    ],
    influences: ["Luiz Gonzaga", "Dominguinhos", "Sivuca", "Jackson do Pandeiro", "Trio Nordestino", "Oswaldinho do Acordeon", "Marinês"],
    summary: "Forró pé de serra: baião, xote, xaxado e arrasta-pé. A sanfona marca o baixo com a mão esquerda e o fole no contratempo; a zabumba toca o grave no 1 e no fim do tempo, e o triângulo corre em semicolcheias. Melodia no mixolídio e no dórico (o modo nordestino), em terças e sextas; harmonia simples, com I, IV e V com sétima.",
    comps: [
      { id: "baiao", bass: "baiao", label: "Baião (baixo e fole no contratempo)", pattern: "B/8. B/8. B/8 B/8. B/8. B/8 ; r/8 D/16 D?/16 r/8 D/8 r/8 D/16 D?/16 r/8 D/8" },
      { id: "xote", bass: "xote", label: "Xote", pattern: "B/4 r/4 B/4 r/4 ; r/8 D/8 r/8 D!/8 r/8 D/8 r/8 D!/8" },
      { id: "arrastape", bass: "arrastape", label: "Arrasta-pé (baixo e acorde)", pattern: "B/8 D/8 B?/8 D/8 B/8 D/8 B?/8 D/8" },
      { id: "resfolego", bass: "baiao", label: "Resfolego (fole em semicolcheias)", pattern: "B/8. B/8. B/8 B/8. B/8. B/8 ; D!/16 D?/16 D/16 D?/16 D!/16 D?/16 D/16 D?/16 D!/16 D?/16 D/16 D?/16 D!/16 D?/16 D/16 D?/16" },
      { id: "xaxado", bass: "baiao", label: "Xaxado", pattern: "B/8 B/8 r/8 B/8 B/8 B/8 r/8 B/8 ; r/8. D/16 D/8 r/8 r/8. D/16 D/8 r/8" },
      { id: "fole", label: "Fole aberto (acordes longos)", pattern: "T/2 T/2" },
      { id: "baixosdasanfona", kind: "ostinato", bass: "baiao", label: "Baixos da sanfona", pattern: "S1/8. S1/8. S5/8 S1/8. S3/8. S5/8 ; r/8 D/16 D?/16 r/8 D/8 r/8 D/16 D?/16 r/8 D/8" },
      { id: "ponteado", kind: "ostinato", bass: "baiao", label: "Ponteado da mão direita", pattern: "B/8. B/8. B/8 B/8. B/8. B/8 ; M1/16 M3/16 M5/16 M3/16 M6/8 M5/8 M3/16 M5/16 M7/16 M5/16 M3/8 M1/8" },
    ],
    beats: [],
    percussion: [
      { id: "triangulo", label: "Triângulo", bars: ["m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16"] },
      { id: "trianguloganza", label: "Triângulo e ganzá", bars: ["m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 ; Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16"] },
      { id: "trianguloxote", label: "Triângulo de xote (colcheias)", bars: ["m/8 t!/8 m/8 t!/8 m/8 t!/8 m/8 t!/8"] },
      { id: "trianguloagogo", label: "Triângulo e agogô", bars: ["m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 ; D/8 r/8 D/8 D/8 r/8 D/8 r/8 D/8"] },
      { id: "pandeiro", label: "Triângulo e pandeiro", bars: ["m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 m/16 m?/16 t!/16 m?/16 ; A/16 A?/16 A?/16 A!/16 A/16 A?/16 A?/16 A!/16 A/16 A?/16 A?/16 A!/16 A/16 A?/16 A?/16 A!/16"] },
    ],
    fills: ["S/16 S?/16 S/16 S?/16 S/16 r/16 S!/8 ; K/8. K/16 K/8. K/16", "T/16 T/16 M/16 M/16 F/8 F!/8 ; K/8. K/16 K/4", "S!/16 S/16 S/16 S!/16 S/16 S/16 S!/8 ; K/8. K/16 K/8 K/8", "F/8. F/16 F!/4 ; K/8. K/16 K/4", "S/16 S/16 S!/8"],
    bass: [
      { id: "baiao", label: "Baião", pattern: "1/8. 1/8. 5/8 1/8. 1/8. 5/8" },
      { id: "xote", label: "Xote", pattern: "1/4. 5/8 1/4. _4/8" },
      { id: "arrastape", label: "Arrasta-pé (fundamental e quinta)", pattern: "1/4 _4/4 1/4 _4/4" },
    ],
    bassFill: { chance: 0.35, figure: "16", beats: 1, high: 12, shapes: ["chegada", "subida", "descida"] },
    cells: ["8. 16 8 8", "16 16 16 16 8 8", "8 16 16 8 8", "8. 8. 8", "4 8 8", "16 8 16 8 8", "r8 8 8 8", "8 8 4", "2", "16 16 8 16 16 8", "8. 16 4", "r16 16 16 16 4"],
    fast: ["16 16 16 16 16 16 16 16", "16 16 16 16 16 16 8", "16t 16t 16t 16t 16t 16t 4"],
    phrase: { chromatic: 0.06, enclosure: 0, blue: 0, leap: 0.25, rest: 0.15, motif: 0.75, pentatonic: false, sequence: true, minNotes: 5, duet: { octave: 0.08, sixth: 0.4, triad: 0.1 } },
  },
  {
    id: "trap", label: "Trap",
    sound: "ms-piano", drumSound: "ms-bateria-808", // os sons que combinam com o estilo
    riffs: [
      { id: "ostinato", label: "Melodia de sino", sound: "ms-vibrafone", rhythms: ["4 8 8 4 4", "8 8 4 8 8 4", "4. 8 4 4", "8t 8t 8t 4 4 4", "4 4 8 8 4", "r8 8 8 8 4 r4"] },
      { id: "dedilhado", label: "Arpejo de piano", sound: "ms-piano", rhythms: ["8 8 8 8 8 8 8 8", "8 8 8 4 8 4", "4 8 8 4 8 8", "8t 8t 8t 8t 8t 8t 4 4"] },
      { id: "oitavas", label: "808 em oitavas", sound: "ms-synth-baixo", rhythms: ["4. 8 r4 4", "8 r8 r8 8 r4 8 8", "4 r8 8 r8 8 4", "2 r8 8 8 8"] },
      { id: "ataques", label: "Stabs de metais", sound: "ms-synth-metais", rhythms: ["r4 8 r8 r2", "8 r8 r4 r4 8 r8", "r2 r8 8 r4", "r4 r8 8 r4 r8 8"] },
      { id: "arpejador", label: "Arpejo de synth", sound: "ms-synth-quadrada", rhythms: ["8 8 8 8 8 8 8 8", "16 16 8 16 16 8 16 16 8 16 16 8", "8t 8t 8t 8t 8t 8t 8t 8t 8t 8t 8t 8t"] },
    ],
    influences: ["Metro Boomin", "Travis Scott", "Zaytoven", "Southside", "Matuê", "21 Savage"],
    summary: "Andamento lento com sensação de meio tempo: caixa ou palma no 3, bumbo e baixo 808 sincopados e chimbal em colcheias com rajadas (semicolcheias, tercinas e fusas). Poucos acordes, quase sempre em tom menor, em laço; melodias curtas e repetidas, com espaço.",
    comps: [
      { id: "longos", label: "Acordes longos", pattern: "T/1" },
      { id: "pad", label: "Pad em duas metades", pattern: "T/2 T?/2" },
      { id: "piano", label: "Piano melancólico (baixo e acorde)", pattern: "B/2 B/2 ; r/4 D/4 r/4 D?/4" },
      { id: "stabs", label: "Stabs espaçados", pattern: "r/4 T/8 r/8 r/4 T?/8 r/8" },
      { id: "tercinas", label: "Tercinas", pattern: "T/4t T?/4t T?/4t T/4t T?/4t T?/4t" },
      { id: "sincopado", label: "Sincopado com o 808", pattern: "T/4. T?/8 r/4 T/4" },
      { id: "arpejolento", kind: "ostinato", label: "Arpejo lento", pattern: "B/1 ; M1/8 M3/8 M5/8 M3/8 M8/8 M5/8 M3/8 M5/8" },
      { id: "sinos", kind: "ostinato", label: "Sinos (agudo, repetido)", pattern: "B/1 ; M5/4 M3/8 M1/8 M3/4 M5/8 M6/8" },
    ],
    beats: [],
    percussion: [
      { id: "cowbell", label: "Cowbell 808", bars: ["B/8 r/8 B?/8 B/8 r/8 B/8 B?/8 r/8"] },
      { id: "shaker", label: "Shaker", bars: ["Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16 Q?/16 Q?/16 Q/16 Q?/16"] },
      { id: "clave", label: "Rim/clave sincopada", bars: ["r/8. L/16 r/4 r/8 L/8 r/8. L/16"] },
      { id: "pandeirola", label: "Pandeirola no contratempo", bars: ["r/8 A/8 r/8 A?/8 r/8 A/8 r/8 A?/8"] },
      { id: "triangulo", label: "Triângulo aberto", bars: ["r/4 t/4 r/4 t?/8 m/8"] },
    ],
    fills: ["S/16 S/16 S/16 S!/16 ; K/4", "S/16t S/16t S/16t S/16t S/16t S!/16t ; K/4", "S??/32 S??/32 S?/32 S?/32 S/32 S/32 S!/32 S!/32 ; K/4", "T/8 M/8 F/8 F!/8 ; K/4 K/4", "S/8 S/16 S/16 S!/4 ; K/4 K/4"],
    bass: [
      { id: "808longo", label: "808 longo", pattern: "1/2. 1/4" },
      { id: "808sincopado", label: "808 sincopado", pattern: "1/4. 1/8 r/4 1/8 8/8" },
      { id: "808quebrado", label: "808 quebrado", pattern: "1/8 r/8 r/8 1/8 r/4 1/8 5/8" },
    ],
    bassFill: { chance: 0.3, figure: "16", beats: 1, high: 12, shapes: ["chegada", "descida"], pop: 0.25 },
    cells: ["4 4", "8 8 4", "4t 4t 4t", "8t 8t 8t 4", "r4 8 8", "2", "8 8 8 8", "4. 8", "r8 8 4", "8 8 r4", "4 r4"],
    fast: ["16 16 16 16 4", "8t 8t 8t 8t 8t 8t", "16t 16t 16t 16t 16t 16t 4"],
    phrase: { chromatic: 0, enclosure: 0, blue: 0.1, leap: 0.2, rest: 0.4, motif: 0.9, pentatonic: true, minNotes: 3, duet: { octave: 0.25, sixth: 0.05, triad: 0 } },
  },
  {
    id: "edm", label: "EDM",
    sound: "ms-synth-serra", drumSound: "ms-bateria-808",
    riffs: [
      { id: "arpejador", label: "Arpejo de synth" },
      { id: "teclado", label: "Arpejo largo (supersaw)", sound: "ms-synth-serra" },
      { id: "oitavas", label: "Baixo em oitavas", sound: "ms-synth-baixo" },
      { id: "ataques", label: "Stabs de synth", sound: "ms-synth-serra", rhythms: ["r8 8 r8 8 r8 8 r8 8", "8. 8. 8 8. 8. 8", "r8 8 r4 r8 8 r4", "8 r8 r8 8 r8 8 r8 8"] },
      { id: "ostinato", label: "Lead", sound: "ms-synth-quadrada" },
      { id: "pontuado", label: "Pluck pontuado", sound: "ms-synth-quadrada" },
    ],
    influences: ["Avicii", "Daft Punk", "Calvin Harris", "Skrillex", "Deadmau5", "Alok", "Swedish House Mafia"],
    summary: "Bumbo nos quatro tempos, palma no 2 e no 4 e chimbal aberto no contratempo; baixo no contratempo e acordes de synth que 'bombeiam' entre os bumbos. Subidas com rufo de caixa antes do drop. Laços de quatro acordes simples e melodias curtas, repetidas e fáceis de cantar.",
    comps: [
      { id: "bombeando", bass: "contratempo", label: "Bombeando (acorde no contratempo)", pattern: "r/8 T/8 r/8 T/8 r/8 T/8 r/8 T/8" },
      { id: "cheios", label: "Acordes cheios (supersaw)", pattern: "T/1" },
      { id: "pianohouse", label: "Piano house", pattern: "T/8. T?/8. T/8 r/8 T/8 T?/8 r/8" },
      { id: "tresdois", label: "Acentos 3+3+2", pattern: "T!/8. T!/8. T!/8 T!/8. T!/8. T!/8" },
      { id: "gate", label: "Trance gate (semicolcheias)", pattern: "T!/16 T?/16 T/16 T?/16 T!/16 T?/16 T/16 T?/16 T!/16 T?/16 T/16 T?/16 T!/16 T?/16 T/16 T?/16" },
      { id: "stabs", label: "Stabs curtos", pattern: "T/8 r/8 r/8 T/8 r/4 T/8 r/8" },
      { id: "pluck", kind: "ostinato", bass: "contratempo", label: "Pluck em semicolcheias", pattern: "B/1 ; M1/16 M3/16 M5/16 M8/16 M5/16 M3/16 M1/16 M3/16 M5/16 M8/16 M5/16 M3/16 M1/16 M3/16 M5/16 M8/16" },
      { id: "arpejotrance", kind: "ostinato", bass: "rolando", label: "Arpejo trance", pattern: "B/1 ; M1/8 M5/8 M8/8 M5/8 M3/8 M5/8 M8/8 M5/8" },
    ],
    beats: [],
    percussion: [
      { id: "shaker", label: "Shaker em semicolcheias", bars: ["Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16"] },
      { id: "pandeirola", label: "Pandeirola no contratempo", bars: ["r/8 A/8 r/8 A!/8 r/8 A/8 r/8 A!/8"] },
      { id: "cowbell", label: "Cowbell", bars: ["B/8 r/8 B?/8 r/8 B/8 B?/8 r/8 B/8"] },
      { id: "clave", label: "Clave", bars: ["L/8. L/8. L/8 r/8 L/8 L/8 r/8"] },
      { id: "shakerpandeirola", label: "Shaker e pandeirola", bars: ["Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 Q?/16 Q?/16 Q/16 Q!/16 ; r/8 A/8 r/8 A!/8 r/8 A/8 r/8 A!/8"] },
    ],
    fills: ["S/16 S/16 S/16 S!/16 ; K/4", "S?/16 S?/16 S/16 S/16 S!/16 S!/16 S!!/16 S!!/16 ; K/4 K/4", "S??/32 S??/32 S?/32 S?/32 S/32 S/32 S!/32 S!/32 ; K/4", "T/16 T/16 M/16 M/16 F/16 F/16 F!/16 F!/16 ; K/4 K/4", "S/8 S/8 S/16 S/16 S!/16 S!!/16 ; K/4 K/4"],
    bass: [
      { id: "contratempo", label: "Contratempo", pattern: "r/8 1/8 r/8 1/8 r/8 1/8 r/8 1/8" },
      { id: "rolando", label: "Rolando (semicolcheias)", pattern: "r/16 1/16 1/16 1/16 r/16 1/16 1/16 1/16 r/16 1/16 1/16 1/16 r/16 1/16 1/16 1/16" },
      { id: "oitavas", label: "Oitavas", pattern: "1/8 8/8 1/8 8/8 1/8 8/8 1/8 8/8" },
    ],
    bassFill: { chance: 0.3, figure: "16", beats: 1, high: 12, shapes: ["chegada", "subida"], pop: 0.2 },
    cells: ["8 8 8 8", "8. 8. 8", "4 8 8", "8 8 4", "16 16 8 4", "r8 8 8 8", "4 4", "2", "8. 16 4", "16 16 16 16 8 8", "8 8 r4", "r4 8 8"],
    fast: ["16 16 16 16 16 16 16 16", "16 16 16 16 16 16 8", "16 16 8 16 16 8"],
    phrase: { chromatic: 0, enclosure: 0, blue: 0, leap: 0.3, rest: 0.25, motif: 0.9, pentatonic: true, sequence: true, minNotes: 4, duet: { octave: 0.35, sixth: 0.05, triad: 0 } },
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

// As baterias em notação de grade (kb/baterias.js) entram depois das que cada estilo já tem: pelo menos 16 por estilo.
for (const style of STYLES) style.beats.push(...(MORE_BEATS[style.id] ?? []).map((beat) => expandBeat(beat, { late: style.id === "lofi" })));

export const findStyle = (id) => STYLES.find((s) => s.id === id) ?? null;
export const styleByLabel = (label) => STYLES.find((s) => s.label.toLowerCase() === String(label || "").trim().toLowerCase()) ?? null;
