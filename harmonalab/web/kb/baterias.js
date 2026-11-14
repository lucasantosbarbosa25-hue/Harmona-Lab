// Mais baterias para cada estilo, em notação de grade (bem mais curta que a notação da bateria do projeto).
// kb/estilos.js junta estas às baterias que cada estilo já tem: no total, pelo menos 16 por estilo.
//
// Cada bateria: [id, rótulo, camada, camada, ...]. Uma camada é "PEÇA grade": a peça (a letra da bateria: K bumbo, S caixa,
// X aro, H chimbal, O aberto, P de pé, R condução, E cúpula, C ataque, T/M/F tons...) e a grade do compasso, um caractere
// por passo:   -  pausa     x  toque     X  acento (!)     #  bem forte (!!)     o  leve (?)     .  fantasma (??)
// O tamanho da grade diz a figura do passo: 8 = colcheias, 16 = semicolcheias, 12 = tercinas de colcheia (swing e
// shuffle), 24 = sextinas. Toda bateria tem dois compassos: "grade1/grade2"; sem a barra, os dois são iguais.
// Chimbal e condução (H, R, E) vão sem marca: o app dá a dinâmica deles sozinho.

const STEP = { 8: ["8", 2], 16: ["16", 1], 12: ["8t", 0], 24: ["16t", 0], 32: ["32", 0] };
const MARK = { x: "", X: "!", "#": "!!", o: "?", ".": "??" };
// pausas: em grade reta, o maior valor que couber (em semicolcheias: 16 = semibreve ... 1 = semicolcheia)
const STRAIGHT = [[16, "1"], [12, "2."], [8, "2"], [6, "4."], [4, "4"], [3, "8."], [2, "8"], [1, "16"]];
const TRIPLET = { 12: [[12, "1"], [6, "2"], [3, "4"], [2, "4t"], [1, "8t"]], 24: [[24, "1"], [12, "2"], [6, "4"], [3, "8"], [2, "8t"], [1, "16t"]] };

function rests(count, size) {
  const table = TRIPLET[size] ?? STRAIGHT.map(([n, d]) => [size === 8 ? n / 2 : size === 32 ? n * 2 : n, d]).filter(([n]) => Number.isInteger(n));
  const out = [];
  let left = count;
  for (const [n, d] of table) while (left >= n) { out.push(`r/${d}`); left -= n; }
  if (size === 32) for (; left > 0; left--) out.push("r/32");
  return out;
}

/** Uma grade ("x---x-x-...") de uma peça → a camada na notação da bateria ("K/16 r/8. K/16 ..."). */
export function expandGrid(piece, grid, late = "") {
  const size = grid.length;
  if (!STEP[size]) throw new Error(`Grade de ${size} passos (use 8, 12, 16, 24 ou 32): ${piece} ${grid}`);
  const dur = STEP[size][0];
  const out = [];
  let gap = 0;
  for (const ch of grid) {
    if (ch === "-") { gap += 1; continue; }
    if (!(ch in MARK)) throw new Error(`Não entendi "${ch}" na grade: ${piece} ${grid}`);
    out.push(...rests(gap, size), `${piece}${MARK[ch]}${late && (late.length > 1 || out.length || gap) ? late : ""}/${dur}`);
    gap = 0;
  }
  out.push(...rests(gap, size));
  return out.join(" ");
}

/**
 * [id, rótulo, ...camadas] → { id, label, bars: [compasso 1, compasso 2] } na notação da bateria.
 * late: a bateria "arrastada" do lo-fi: caixa e aro um pouco depois do tempo (">>"), e o bumbo fora do tempo 1 também (">").
 */
export function expandBeat([id, label, ...layers], { late = false } = {}) {
  const drag = (piece) => (!late ? "" : piece === "S" || piece === "X" ? ">>" : piece === "K" ? ">" : "");
  const bars = [0, 1].map((bar) => layers.map((layer) => {
    const [piece, grids] = layer.split(" ");
    const [first, second = first] = grids.split("/");
    return expandGrid(piece, bar ? second : first, drag(piece));
  }).join(" ; "));
  return { id, label, bars };
}

// camadas que se repetem
const H8 = "H x-x-x-x-x-x-x-x-";
const H16 = "H xxxxxxxxxxxxxxxx";
// só nos tempos ou só nos contratempos, a dinâmica automática não teria onde variar: aqui ela vem escrita
const H4 = "H #---o---X---.---";
const HOFF = "H --x---o---X---.-";
const R8 = "R x-x-x-x-x-x-x-x-";
const R4 = "R #---o---X---.---";
// chimbal aberto contínuo: a dinâmica vem escrita (o app só dá dinâmica sozinho ao chimbal fechado e à condução)
const OOFF = "O --x---o---X---.-";
const O8 = "O X-x-o-x-X-x-.-x-";
const OPEN_END = "O ----------------/--------------x-"; // chimbal aberto no fim do segundo compasso
const BACK = "S ----X-------X---"; // caixa no 2 e no 4
const HALF = "S --------X-------"; // caixa no 3 (meio tempo)
const FOUR = "K x---x---x---x---"; // bumbo nos quatro tempos
const SWING = "R x--x-xx--x-x"; // a condução do swing (grade de tercinas)
const FOOT = "P ---x-----x--"; // chimbal de pé no 2 e no 4
const SHUFFLE = "H x-xx-xx-xx-x";
const BACK12 = "S ---X-----X--";
const K16 = "K xxxxxxxxxxxxxxxx";

export const MORE_BEATS = {
  swing: [
    ["quatro", "Bumbo leve nos quatro", SWING, FOOT, "K o--o--o--o--"],
    ["doistempos", "Em dois (two feel)", SWING, FOOT, "K x-----x-----"],
    ["conversa1", "Caixa conversando", SWING, FOOT, "S -----o-----o/--o-----o---", "K o--o--o--o--"],
    ["conversa2", "Caixa e bumbo conversando", SWING, FOOT, "S --o-----o---/-----o--o---", "K --------x---/-----x------"],
    ["bombas", "Bombas de bumbo", SWING, FOOT, "K -----X------/--------X---", "S --o---------/-----------o"],
    ["aro4", "Aro no quatro", SWING, FOOT, "X ---------x--", "K o--o--o--o--"],
    ["shuffleswing", "Shuffle de caixa", SWING, FOOT, "S --o--X--o--X", "K x-----x-----"],
    ["afro", "Afro 12/8", "E x-x-xx-x-x-x", "K x-----x-----", "X ---x-----x--", "P ---x-----x--"],
    ["bebop", "Bebop rápido", SWING, FOOT, "S -----x--x---/--x------x--", "K --------x---/-----x------"],
    ["baladajazz", "Balada de jazz", "R X--o--x--.--", FOOT, "K o-----------"],
    ["jump", "Jump (caixa no 2 e no 4)", SWING, BACK12, "K x-----x--x--/x--x--x-----"],
    ["chimbalswing", "Swing no chimbal", "H x--x-xx--x-x", "S ---x-----x--", "K x-----x-----"],
    ["tercinas", "Tercinas no prato", "R xxxxxxxxxxxx", BACK12, "K x-----x-----/x-----x--x--"],
  ],
  blues: [
    ["chicago", "Shuffle de Chicago", SHUFFLE, BACK12, "K x-----x-----/x-----x--x--"],
    ["texas", "Shuffle do Texas (caixa junto)", SHUFFLE, "S .-.X-..-.X-.", "K x-----x-----"],
    ["paradas", "Paradas (stop time)", "K X-----------/------------", "S ---------X--/------------", "P ---x-----x--"],
    ["trem", "Batida de trem", "S x-xX-xx-xX-x", "K x--x--x--x--", "P ---x-----x--"],
    ["boogie", "Boogie", SHUFFLE, BACK12, "K x--x--x--x--"],
    ["meioshuffle", "Meio shuffle", SHUFFLE, "S ------X-----", "K x----x-----x/x----x---x--"],
    ["seminimas", "Chimbal em semínimas", "H #--o--X--.--", BACK12, "K x----xx-----"],
    ["tons12", "Tons em 12/8", "F x-xx-xx-xx-x", BACK12, "K x-----x-----"],
    ["rumba", "Rumba blues", H8, "X ---x--x---x-x---", "K x--x--x-x--x--x-", "T ------------x-x-"],
    ["funkblues", "Blues funkeado", H16, BACK, "K x--x--x---x-x---/x--x--x---x--x--"],
    ["rockblues", "Blues rock reto", H8, BACK, "K x-----x-x-------/x-----x-x-x-----", OPEN_END],
    ["doisquatro", "Só o dois e o quatro", "P ---x-----x--", BACK12, "K x-----x-----"],
    ["gospelblues", "Blues gospel em 12/8", "R xxxxxxxxxxxx", "S ---X-----X-o", "K x----xx-----/x----xx--x--"],
  ],
  fusion: [
    ["linear", "Linear", "H x--x--x--x-x----", "S ----X------x-X--", "K -xx--x---x----x-"],
    ["conducao16", "Condução em semicolcheias", "R xxxxxxxxxxxxxxxx", BACK, "K x--x--x---x--x--"],
    ["cupulaoff", "Cúpula no contratempo", "E --x---x---x---x-", R4, BACK, "K x--x------x-x---"],
    ["fantasmas", "Caixa com notas fantasmas", H8, "S -..-X..-.-..X-.-", "K x-----x--x------/x-----x--x---x--"],
    ["meiofusion", "Meio tempo", R8, HALF, "K x--x-----x-x----/x--x-----x---x--"],
    ["latinfusion", "Latino (cáscara na condução)", "E x-x-xx-xx-xx-x-x", "X ---x--x---x-x---", "K ---x--x----x--x-", "P --x---x---x---x-"],
    ["samba16", "Samba fusion", "R xxxxxxxxxxxxxxxx", "X x--x--x-x--x-x--", "K x--xx--xx--xx--x", "P --x---x---x---x-"],
    ["deslocado", "Caixa deslocada", H16, "S ------X------X--/----X--------X--", "K x--x------x--x--"],
    ["doischimbais", "Chimbal aberto no contratempo", H4, OOFF, BACK, "K x--x--x---x-----"],
    ["shufflefusion", "Meio shuffle (sextinas)", "H x-xx-xx-xx-xx-xx-xx-xx-x", "S -.--.-.--.-.X.--.-.--.-.", "K x----x-----x------x-----"],
    ["setefeel", "Grupos de 3 sobre 4", "H x--x--x--x--x-x-", BACK, "K x--x--x--x--x---"],
    ["tonsfusion", "Tons e bumbo", "F x-x---x-x-x---x-", "T ---x-----x---x--", BACK, "K x--x--x---x--x--"],
    ["ecm", "Aberto, na condução", R4, "E ------x-------x-", "S -------o-----o--/----o-------o---", "K x---------x-----"],
  ],
  neosoul: [
    ["arrastado", "Arrastado (caixa atrás)", H8, "S ----X-------X---", "K x------x-x------/x------x-x-----x"],
    ["fantasmaneo", "Fantasmas com chimbal em semicolcheias", H16, "S ---.X..-.-..X-.-", "K x--x------x-----/x--x------x--x--"],
    ["aroneo", "Aro e chimbal de pé", "P --x---x---x---x-", "X ----x-------x---", "K x------x-x------"],
    ["bumbotardio", "Bumbo no fim do tempo", H8, BACK, "K x--x---x--x----x/x--x---x--x-----"],
    ["chimbal16", "Chimbal em semicolcheias", H16, BACK, "K x-----x---x-----/x-----x---x---x-", OPEN_END],
    ["meioneo", "Meio tempo", H8, HALF, "K x------x--x-----/x--x---x--x-----"],
    ["quebrado", "Chimbal quebrado", "H x-xx-x-xx-xx-x-x", BACK, "K x--x------x-----"],
    ["dilla", "Sem grade (bumbo adiantado)", H8, BACK, "K x-----x--x-x----/x--x--x--x------"],
    ["conducaoneo", "Na condução", R8, "X ----x-------x---", "K x------x-x---x--"],
    ["tresquatro", "Aberto no e do quatro", H8, "O --------------x-", BACK, "K x--x-----xx-----"],
    ["bouncy", "Saltitante", "H x-xxx-xxx-xxx-xx", BACK, "K x--x---x--x-----"],
    ["minimo", "Mínimo", HOFF, BACK, "K x---------x-----"],
    ["gospelneo", "Com rajadas de chimbal", "H x-x-x-xxx-x-xxxx", BACK, "K x------x-x------/x------x-x--x---"],
  ],
  lofi: [
    ["boombapreto", "Boom bap reto", H8, BACK, "K x-----x---x-----/x--x--x---x-----"],
    ["preguica", "Preguiçoso", H8, BACK, "K x------x--------/x------x--x-----"],
    ["aro", "Aro no lugar da caixa", H8, "X ----x-------x---", "K x-----x--x------"],
    ["chimbalaberto", "Chimbal aberto no fim", H8, OPEN_END, BACK, "K x--x------x-----"],
    ["quebradolofi", "Bumbo quebrado", H8, BACK, "K x-----x---x--x--"],
    ["swingado", "Semicolcheias balançadas", "H x-xx-xx-xx-xx-xx-xx-xx-x", "S ------X-----------X-----", "K x--------x-----x--------"],
    ["meiolofi", "Meio tempo", H8, HALF, "K x--x-------x----"],
    ["fantasmalofi", "Caixa com fantasmas", H8, "S -..-X--.-.--X--.", "K x-----x---x-----"],
    ["bumbo2", "Dois bumbos no início", H8, BACK, "K xx--------x-----/xx-----x--x-----"],
    ["conducaolofi", "Na condução", R8, "X ----x-------x---", "K x--x------x-----"],
    ["quatrolofi", "Chimbal em semínimas", H4, BACK, "K x-----x---x-----"],
    ["offlofi", "Chimbal no contratempo", HOFF, BACK, "K x--x------x--x--"],
    ["jazzhop", "Jazz hop", "R x--x-xx--x-x", "S ---X-----X--", "K x-----x--x--/x----xx-----"],
  ],
  gospel: [
    ["andante", "Andante com chimbal aberto", H8, "O --x-----------x-", BACK, "K x-----x-x-----x-"],
    ["fantasmagospel", "Caixa com fantasmas", H16, "S -..-X..-.-..X-..", "K x--x--x---x--x--/x--x--x---x-xx--"],
    ["meiogospel", "Meio tempo (louvor lento)", H8, HALF, "K x--x-----xx-----/x--x-----xx--x--"],
    ["doze", "12/8 de louvor", "H xxxxxxxxxxxx", BACK12, "K x----xx-----/x----xx--x--"],
    ["chimbalgospel", "Chimbal com rajadas", "H x-x-xxx-x-x-xxxx", BACK, "K x--x--x---x-----"],
    ["linhadebumbo", "Bumbo sincopado", H8, BACK, "K x--x--xx--x-x---/x--x--xx-xx-x---"],
    ["conducaogospel", "Na condução com cúpula", R8, "E ------x-------x-", BACK, "K x--x------x--x--"],
    ["tonsgospel", "Tons (ponte)", "F x-x-x-x-x-x-x-x-", "T ------x-------x-", BACK, "K x---x---x---x---"],
    ["quatronochao", "Bumbo nos quatro", H8, BACK, FOUR, OOFF],
    ["sextinasgospel", "Semicolcheias com sextina no fim", H16, BACK, "K x--x--x---x--x--/x--x--x---xxxxxx"],
    ["arogospel", "Aro (verso calmo)", H8, "X ----x-------x---", "K x-----x---x-----"],
    ["funkgospel", "Funk gospel", "H x-xxx-xxx-xxx-xx", "S ----X--o-o--X---", "K x--x--x---x--x--"],
    ["praise", "Praise break (caixa nos quatro)", H8, "S X---X---X---X---", "K x-x-x-x-x-x-x-x-"],
  ],
  funk: [
    ["jb", "Funk clássico", H16, "S ----X--.-.--X--.", "K x-x-------x--x--"],
    ["sincopa", "Bumbo sincopado", H16, BACK, "K x--x--x---x--x--/x--x--x--xx--x--"],
    ["abertofunk", "Aberto com bumbo quebrado", "H xx-xxx-xxx-xxx-x", OOFF, BACK, "K x--x------x-x---"],
    ["linearfunk", "Linear", "H x--x-x---x-x--x-", "S ----X--x----X---", "K -xx---x-x-----x-"],
    ["meiofunk", "Meio tempo", H16, HALF, "K x--x--x----x--x-"],
    ["neworleans", "New Orleans (segunda linha)", "S x-.x.-x-.x.xX-x-", "K x-----x---x-----", "P ----x-------x---"],
    ["discofunk", "Bumbo nos quatro", HOFF, BACK, FOUR],
    ["pocket", "No bolso (simples)", H8, BACK, "K x---------x-----/x-------x-x-----"],
    ["conducaofunk", "Cúpula", "E x-x-x-x-x-x-x-x-", "S ----X--.-.--X---", "K x--x--x---x--x--"],
    ["fantasmafunk", "Fantasmas com chimbal em colcheias", H8, "S -..-X.-..-.-X-..", "K x--x------x-----"],
    ["gogo", "Go-go", H16, "S ----X-------X---", "K x-----x--xx-----", "T -----------x--x-"],
    ["afrobeat", "Afrobeat", "H x-xx-xxx-xx-xxx-", "S ---x--x----x--x-", "K x---x-----x-x---"],
    ["tresdois", "Acentos 3+3+2", "H x--x--x-x--x--x-", BACK, "K x--x--x-x--x--x-"],
  ],
  salsa: [
    ["campanamontuno", "Campana de montuno", "B x-x-xx-xx-xx-x-x", "K ---x--x----x--x-", "X ---x--x---x-x---"],
    ["songo", "Songo", "E x-x-x-x-x-x-x-x-", "S --x--x-x-xx-x--x", "K ---x--x----x--x-", "P --x---x---x---x-"],
    ["mozambique", "Mozambique", "B x-x-xx-x-xx-x-x-", "S ---x---x--x--x--", "K ---x--x----x--x-"],
    ["chacha", "Cha-cha-chá", "B x---x---x---x---", "X ---x--------x-x-", "K ---x--x----x--x-", "H x-x-x-x-x-x-x-x-"],
    ["bolero", "Bolero", "H x-xxx-x-x-xxx-x-", "X ----x-------x---", "K x-----x-x-----x-"],
    ["guaguanco", "Guaguancó", "X --x--x---x-xx---", "T ------x-x-------", "K ---x--x----x--x-", "P x---x---x---x---"],
    ["merengue", "Merengue", "H x-xxx-xxx-xxx-xx", "S x--xx-x-x--xx-x-", FOUR],
    ["cumbia", "Cumbia", "H --xx--xx--xx--xx", "X ----x-------x---", "K x-----x-x-----x-"],
    ["bomba", "Bomba", "B x-xx-xx-x-xx-xx-", "K ---x--x----x--x-", "S ----x--x----x--x"],
    ["timba", "Timba", "E x-x-xx-xx-xx-x-x", "S ----X--x-x--X---", "K x--x--x--x-x--x-"],
    ["sonmontuno", "Son montuno (verso)", "H x-xx-xx-x-xx-xx-", "X ---x--x---x-x---", "K ---x--x----x--x-"],
    ["seisoito", "Afro-cubano 6/8", "B x-x-xx-x-x-x", "K x-----x-----", "X ---x-----x--", "P ---x-----x--"],
    ["latinjazz", "Latin jazz na condução", "R x-x-xx-xx-xx-x-x", "X ---x--x---x-x---", "K ---x--x----x--x-", "P --x---x---x---x-"],
  ],
  samba: [
    ["sambajazz", "Samba jazz na condução", "R xxxxxxxxxxxxxxxx", "X x--x--x-x--x-x--", "K x--xx--xx--xx--x", "P --x---x---x---x-"],
    ["bossasamba", "Samba leve", H16, "X x--x--x---x--x--", "K x--xx--xx--xx--x"],
    ["telecoteco", "Teleco-teco na caixa", H16, "S x-x--x-x-x-x--x-", "K x--xx--xx--xx--x"],
    ["sambafunk", "Samba funk", H16, "S ----X--x-x--X---", "K x--xx--xx--xx--x"],
    ["sambareggae", "Samba-reggae", "H x-xxx-xxx-xxx-xx", "S x--x--x---x-x---", "K x-----x-x-----x-", "T ----------x--x--"],
    ["pagode", "Pagode", H16, "X --x--x-x--x-x--x", "K x--x--x-x--x--x-"],
    ["maracatu", "Maracatu", "S x-xxx-xxx-xxx-xx", "K x--x--x---x-x---", "B x---x---x---x---"],
    ["baiaosamba", "Baião", H16, "X ------x-------x-", "K x--x----x--x----", "S ---------------x"],
    ["partidoaro", "Partido alto no aro", H16, "X x-x--x-x--x-x--x", "K x--xx--xx--xx--x"],
    ["sambarock", "Samba rock", H8, BACK, "K x--x--x---x-x---"],
    ["sambacancao", "Samba-canção (lento)", "H x-x-x-x-x-x-x-x-", "X ---x--x----x--x-", "K x--x----x--x----"],
    ["afoxe", "Afoxé (ijexá)", "B x-xx-x-xx-x-xx-x", "K x-----x-x-----x-", "X ---x--------x---"],
    ["marcha", "Marcha-rancho", "S x-xxx-xxx-xxx-xx", FOUR, "P --x---x---x---x-"],
  ],
  bossa: [
    ["bossaaro", "Clave de bossa no aro (3-2)", H8, "X x--x--x---x--x--", "K x--xx--xx--xx--x"],
    ["bossa23", "Clave de bossa no aro (2-3)", H8, "X --x--x--x--x--x-", "K x--xx--xx--xx--x"],
    ["bossalenta", "Bossa lenta", H8, "X ---x--x-----x---", "K x--x----x--x----"],
    ["conducaobossa", "Condução com chimbal de pé", R8, "X x--x--x---x--x--", "K x--xx--xx--xx--x", "P --x---x---x---x-"],
    ["chimbal16bossa", "Chimbal em semicolcheias", H16, "X x--x--x---x--x--", "K x--xx--xx--xx--x"],
    ["caixaleve", "Caixa leve contínua", "S oooooooooooooooo", "X ---x--x---x-x---", "K x--xx--xx--xx--x"],
    ["bossajazz", "Bossa jazz", R8, "X ---x--x---x-x---", "K x--xx--xx--xx--x", "P ----x-------x---"],
    ["sembumbo", "Só aro e chimbal", H8, "X x--x--x---x--x--"],
    ["bossapop", "Bossa pop", H8, "S ----x-------x---", "K x--x--x---x-----"],
    ["doisbossa", "Em dois", H8, "X ----x-------x---", "K x-------x-------"],
    ["bossafunk", "Bossa funkeada", H16, "X x--x--x---x--x--", "K x--x--x---x-x---"],
    ["cinco", "Aro em cinco toques", H8, "X x--x--x--x--x---", "K x--xx--xx--xx--x"],
    ["bossanova6", "Chimbal de pé e aro", "P --x---x---x---x-", "X x--x--x---x--x--", "K x--xx--xx--xx--x"],
  ],
  rock: [
    ["hardrock", "Hard rock (bumbo e caixa retos)", H8, "S ----#-------#---", "K x-x-----x-x-----/x-x-----x-x---x-"],
    ["sextinasrock", "Bumbo duplo em sextinas", "R #-----o-----X-----.-----", "S ------X-----------X-----", "K xxxxxxxxxxxxxxxxxxxxxxxx"],
    ["shufflerock", "Shuffle de rock", SHUFFLE, BACK12, "K x-----x----x/x----xx-----"],
    ["duploshuffle", "Shuffle com bumbo duplo", "R x-xx-xx-xx-x", BACK12, "K x-xx-xx-xx-x"],
    ["punk", "Punk (caixa no contratempo)", H8, "S --X---X---X---X-", "K x---x---x---x---"],
    ["balada", "Balada de rock", H8, HALF, "K x-----x-----x---/x-----x---x-x---"],
    ["ride", "Na condução, com cúpula", "E x---x---x---x---", "R --x---x---x---x-", BACK, "K x--x--x---x-----"],
    ["duplomeio", "Meio tempo com bumbo duplo", R8, "S --------#-------", K16],
  ],
  ska: [
    ["skank", "Ska rápido (bumbo nos quatro)", HOFF, BACK, FOUR],
    ["nyabinghi", "Nyabinghi", H8, "F x-x-----x-x-----", "K x-------x-------"],
    ["rockers", "Rockers", HOFF, "X --------x-------", FOUR],
    ["steppers", "Steppers", "H x-x-x-x-x-x-x-x-", "S --------X-------", FOUR],
    ["sincopadoska", "Bumbo sincopado", HOFF, BACK, "K x-----x-x-----x-"],
    ["reggae16", "Reggae com chimbal em semicolcheias", H16, "X --------x-------", "K --------x-------"],
    ["skapunk", "Ska punk", "H x-x-x-x-x-x-x-x-", "S ----X-------X---", "K x-x---x-x-x---x-"],
    ["rocksteady", "Rocksteady", "H x-x-x-x-x-x-x-x-", "X ----x-------x---", "K --------x-------"],
    ["abertoska", "Chimbal aberto no contratempo", OOFF, BACK, "K x-----x-x-----x-"],
    ["conducaoska", "Na condução", "E --x---x---x---x-", R4, BACK, FOUR],
    ["dub", "Dub (espaçado)", HOFF, "X --------x-------", "K --------x-----x-"],
    ["tonsska", "Com tons no fim", HOFF, BACK, FOUR, "T --------------x-/------------x-x-"],
    ["shuffleska", "Ska shuffle", "H -x--o--X--.-", BACK12, "K x--x--x--x--"],
  ],
  worship: [
    ["construcao", "Construção (bumbo nos quatro)", H8, FOUR],
    ["tonscrescendo", "Tons (ponte)", "F x-x-x-x-x-x-x-x-", "T --------x-x-x-x-", FOUR],
    ["refraoaberto", "Refrão com prato aberto", "C x---------------/----------------", O8, "S ----#-------#---", "K x-----x-x-----x-"],
    ["meioworship", "Meio tempo com chimbal", H8, HALF, "K x-----x---------/x-----x-----x---"],
    ["seisoitoworship", "6/8 de adoração", "H xxxxxxxxxxxx", "S ------X-----", "K x----x------/x----x---x--"],
    ["semicolcheiasw", "Chimbal em semicolcheias", H16, BACK, "K x-----x---x-----/x--x--x---x-----"],
    ["conducaoworship", "Na condução", R8, BACK, "K x-----x-x-------"],
    ["caixanosquatro", "Caixa nos quatro (final)", O8, "S X---X---X---X---", "K x-x-x-x-x-x-x-x-"],
    ["bumbosincopado", "Bumbo sincopado", H8, BACK, "K x--x--x---x-x---"],
    ["delaychimbal", "Chimbal pontuado", "H x--x--x--x--x-x-", BACK, "K x-----x-x-------"],
    ["soaro", "Só aro e bumbo", "X ----x-------x---", "K x-------x-------"],
    ["marchaworship", "Marcha de caixa", "S x-xxx-xxx-xxx-xx", FOUR],
  ],
  balada: [
    ["baladasimples", "Balada simples", H8, BACK, "K x-------x-------/x-------x-x-----"],
    ["baladaaro", "Aro (verso)", H8, "X ----x-------x---", "K x-------x-------"],
    ["meiobalada", "Meio tempo", H8, HALF, "K x-----x---------/x-----x-----x---"],
    ["baladapower", "Power ballad", H8, "S ----#-------#---", "K x--x----x-x-----/x--x----x-x---x-", OPEN_END],
    ["doze8", "12/8 (balada dos anos 50)", "H xxxxxxxxxxxx", BACK12, "K x-----x-----/x-----x--x--"],
    ["seis8", "6/8 lento", "H x-x-x-x-x-x-", "S ------X-----", "K x-----------/x--------x--"],
    ["conducaobalada", "Na condução", R8, BACK, "K x-------x-x-----"],
    ["semicolcheiasbalada", "Chimbal em semicolcheias", H16, BACK, "K x-------x-x-----/x------xx-x-----"],
    ["sobumbo", "Só bumbo e chimbal", H8, "K x-------x-------"],
    ["tonsbalada", "Tons (ponte)", "F x-x-x-x-x-x-x-x-", "S ------------X---", "K x-------x-------"],
    ["rnb", "R&B lento", H16, BACK, "K x------x-x------/x------x-x---x--"],
    ["soul", "Soul (caixa nos quatro)", H8, "S x---X---x---X---", "K x-------x-x-----"],
    ["crescendo", "Refrão cheio", "C x---------------/----------------", O8, "S ----#-------#---", "K x--x----x-x-----"],
  ],
  metal: [
    ["tercinasduplo", "Galope triplo (tercinas)", "R #--o--X--.--", BACK12, "K xxxxxxxxxxxx"],
    ["dbeat", "D-beat", H8, "S --X---X---X---X-", "K x--x--x-x--x--x-"],
    ["groove", "Groove metal", "H x-x-x-x-x-x-x-x-", "S ----#-------#---", "K x-xx--x-x-xx--x-/x-xx--x-xxxx--x-"],
    ["breakdown", "Breakdown", "C x-------x-------", "S --------#-------", "K x-x---x-x-x---x-/x-xx-xx-x-xx-xx-"],
    ["china", "Prato nos quatro com bumbo duplo", "C x---x---x---x---", "S ----#-------#---", K16],
    ["skank", "Skank beat (thrash rápido)", "H x-x-x-x-x-x-x-x-", "S --X---X---X---X-", "K x---x---x---x---"],
    ["tonsmetal", "Tons tribais", "F x-xx-xx-x-xx-xx-", "T ------x-------x-", "S ----X-------X---", "K x---x---x---x---"],
    ["cavalgada", "Cavalgada (galope invertido)", H8, BACK, "K xx-xxx-xxx-xxx-x"],
  ],
  // Forró (o kit de bateria imitando a zabumba: bumbo = a pele grave; aro = o bacalhau, a vareta na pele de baixo)
  forro: [
    ["baiao", "Baião", H16, "K x--x----x--x----", "X ------x-------x-"],
    ["baiaocaixa", "Baião com caixa", H16, "K x--x----x--x----", "S ------X-------X-"],
    ["xote", "Xote", H8, "K x-----x-x-----x-", "X ----x-------x---"],
    ["xotearrastado", "Xote arrastado", "H x-xx-xx-xx-xx-xx-xx-xx-x", "K x--------x--x--------x--", "X ------x-----------x-----"],
    ["arrastape", "Arrasta-pé", "S x-xxx-xxx-xxx-xx", FOUR, "P --x---x---x---x-"],
    ["xaxado", "Xaxado", H16, "K x-x---x-x-x---x-", "X ---x-x-----x-x--"],
    ["pedeserra", "Pé de serra", "H x-xxx-xxx-xxx-xx", "K x--x--x-x--x--x-", "X ----x-------x---"],
    ["forrouniversitario", "Forró universitário", H16, "K x--x--x-x--x--x-", "S ----X-------X---"],
    ["coco", "Coco", "S x-xx-x-xx-xx-x-x", "K x--x----x--x----", "P --x---x---x---x-"],
    ["quadrilha", "Quadrilha (marcha junina)", "S x-x-xxx-x-x-xxx-", FOUR],
    ["galopeforro", "Galope", "H x-xxx-xxx-xxx-xx", "K x-xxx-xxx-xxx-xx", "S ----X-------X---"],
    ["toada", "Toada (lenta)", H8, "K x-----x---------/x-----x-----x---", "X --------x-------"],
    ["baiaolento", "Baião lento", H8, "K x--x----x--x----", "X ------x-------x-", "O --------------x-"],
    ["rojao", "Rojão", H16, "K x--x--x-x--x--x-", "X ------x-------x-", "T ---------------x/-------------x-x"],
    ["forrock", "Forró com pegada de rock", H8, "S ----#-------#---", "K x--x--x-x--x--x-"],
    ["viradaforro", "Baião com tons", "F x--x----x--x----", "T ------x-------x-", "H x-xxx-xxx-xxx-xx", "K x--x----x--x----"],
  ],
  disco: [
    ["discoaberto", "Chimbal aberto no contratempo", OOFF, H4, BACK, FOUR],
    ["italo", "Chimbal no contratempo e cowbell", HOFF, BACK, FOUR, "B ------x-------x-"],
    ["house", "House", OOFF, "S ----X-------X---", FOUR, "H x-xxx-xxx-xxx-xx"],
    ["funkydisco", "Disco funk", "H x-xxx-xxx-xxx-xx", BACK, "K x---x--xx---x---"],
    ["poprock", "Pop rock", H8, BACK, "K x-----x-x-------/x-----x-x-x-----"],
    ["synthpop", "Synth pop (palmas)", H8, "S ----X-------X-X-", FOUR],
    ["dancepop", "Dance pop", OOFF, BACK, "K x---x---x--xx---"],
    ["nudisco", "Nu disco", "H x-x-x-x-x-x-x-x-", "O --------------x-", "S ----X--.-.--X---", FOUR],
    ["meiodisco", "Meio tempo", H8, HALF, FOUR],
    ["reggaeton", "Dembow", H8, "S ---x--x----x--x-", FOUR],
    ["electro", "Electro", H16, "S ----X-------X---", "K x--x--x---x--x--"],
    ["cowbelldisco", "Cowbell nos tempos", "B x---x---x---x---", OOFF, BACK, FOUR],
    ["tonsdisco", "Com tons", H8, BACK, FOUR, "T ----------------/----------x-x-x-"],
  ],
};
