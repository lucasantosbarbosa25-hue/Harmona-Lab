// Bancos de sons que vêm com o app (arquivos em sons/). Só são baixados quando alguém escolhe um deles, e ficam guardados
// no aparelho depois disso. Para acrescentar um banco: suba o .sf2 em sons/ e acrescente uma linha aqui (o repositório é
// público, então anote a origem e confira se a licença permite redistribuir).
//
// kind: "teclado" (aparece em "Som dos acordes" e "Som da frase"), "baixo" ("Som do baixo"), "pad" ("Som do pad") ou
// "bateria" ("Som da bateria"). group: o título do grupo no menu.
// preset: o instrumento dentro do arquivo { program, bankMSB, bankLSB }.

// Os instrumentos do MuseScore General (licença MIT: sons/MuseScore_General_License.md), um arquivo SF3 por instrumento,
// separados do original por design/split_soundfont.mjs. Cada arquivo guarda o instrumento no programa General MIDI dele.
const MS_CREDIT = "MuseScore General (S. Christian Collins), a partir do FluidR3 (Frank Wen) e do FluidR3Mono (Michael Cowgill)";
const ms = (id, label, kind, group, program, size) => ({
  id, file: `${id}.sf3`, label, kind, group, size, preset: { program, bankMSB: 0, bankLSB: 0 }, credit: MS_CREDIT, license: "MIT",
  source: "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/",
});

export const BUILTIN_BANKS = [
  ms("ms-piano-eletrico", "Piano elétrico (tine)", "teclado", "Teclados", 4, 184514),
  ms("ms-piano", "Piano de cauda", "teclado", "Teclados", 0, 15064370),
  ms("ms-piano-fm", "Piano elétrico FM", "teclado", "Teclados", 5, 74938),
  ms("ms-vibrafone", "Vibrafone", "teclado", "Teclados", 11, 89296),
  ms("ms-orgao", "Órgão", "teclado", "Teclados", 16, 19658),
  ms("ms-violao", "Violão de nylon", "teclado", "Cordas dedilhadas", 24, 257540),
  ms("ms-guitarra-jazz", "Guitarra jazz", "teclado", "Cordas dedilhadas", 26, 183350),
  ms("ms-flauta", "Flauta", "teclado", "Sopros e vozes", 73, 146550),
  ms("ms-sax-alto", "Sax alto", "teclado", "Sopros e vozes", 65, 253668),
  ms("ms-sax-tenor", "Sax tenor", "teclado", "Sopros e vozes", 66, 534876),
  ms("ms-trompete", "Trompete", "teclado", "Sopros e vozes", 56, 70202),
  ms("ms-coro", "Coro (aah)", "teclado", "Sopros e vozes", 52, 1093722),
  ms("ms-voz", "Voz (ooh)", "teclado", "Sopros e vozes", 53, 155950),
  ms("ms-guitarra-limpa", "Guitarra limpa", "teclado", "Guitarras", 27, 150474),
  ms("ms-guitarra-abafada", "Guitarra abafada", "teclado", "Guitarras", 28, 127934),
  ms("ms-guitarra-overdrive", "Guitarra overdrive", "teclado", "Guitarras", 29, 578638),
  ms("ms-guitarra-distorcida", "Guitarra distorcida", "teclado", "Guitarras", 30, 491724),
  ms("ms-synth-serra", "Synth (onda serra)", "teclado", "Synths e metais", 81, 56024),
  ms("ms-synth-quadrada", "Synth (onda quadrada)", "teclado", "Synths e metais", 80, 58888),
  ms("ms-synth-baixo", "Synth de baixo", "teclado", "Synths e metais", 38, 114940),
  ms("ms-metais", "Naipe de metais", "teclado", "Synths e metais", 61, 686380),
  ms("ms-synth-metais", "Metais de synth", "teclado", "Synths e metais", 62, 56184),
  ms("ms-sanfona", "Sanfona", "teclado", "Sanfona e foles", 21, 248258),
  ms("ms-sanfona-italiana", "Sanfona italiana (mais brilhante)", "teclado", "Sanfona e foles", 21, 248278), // no original é o banco 8; no arquivo do app fica no banco 0
  ms("ms-sanfona-tango", "Bandoneon", "teclado", "Sanfona e foles", 23, 352702),
  ms("ms-gaita", "Gaita (harmônica)", "teclado", "Sanfona e foles", 22, 105218),
  ms("ms-baixo-dedilhado", "Baixo elétrico (dedo)", "baixo", "Baixos", 33, 236154),
  ms("ms-baixo-acustico", "Baixo acústico", "baixo", "Baixos", 32, 159166),
  ms("ms-baixo-fretless", "Baixo fretless", "baixo", "Baixos", 35, 198276),
  ms("ms-baixo-slap", "Baixo slap", "baixo", "Baixos", 36, 401800),
  ms("ms-cordas", "Cordas (lentas)", "pad", "Pads e cordas", 49, 1262786),
  ms("ms-pad", "Pad quente", "pad", "Pads e cordas", 89, 636204),
  ms("ms-cordas-sinteticas", "Cordas sintéticas", "pad", "Pads e cordas", 50, 483626),
  ms("ms-cordas-rapidas", "Cordas (ataque rápido)", "pad", "Pads e cordas", 48, 1262782),
  ms("ms-bateria", "Bateria padrão", "bateria", "Baterias", 0, 1304786),
  ms("ms-bateria-jazz", "Bateria jazz", "bateria", "Baterias", 32, 1302924),
  ms("ms-bateria-vassourinha", "Bateria com vassourinha", "bateria", "Baterias", 40, 1318016),
  ms("ms-bateria-sala", "Bateria de sala", "bateria", "Baterias", 8, 1307346),
  ms("ms-bateria-rock", "Bateria rock", "bateria", "Baterias", 16, 1325364),
  ms("ms-bateria-808", "Bateria eletrônica 808", "bateria", "Baterias", 25, 1293950),
  {
    id: "freerhodes", file: "FreeRhodes_ff_layer.SF2", label: "Rhodes MkII (FreeRhodes)", kind: "teclado", size: 3961816,
    preset: { program: 0, bankMSB: 0, bankLSB: 0 },
    credit: "Andrew Fatseas — 1979 Fender Rhodes MkII Stage", license: "a confirmar",
  },
  {
    id: "u1", file: "yahama U1.SF2", label: "Piano Yamaha U1", kind: "teclado", size: 14311504,
    preset: { program: 0, bankMSB: 0, bankLSB: 0 },
    credit: "Shai Cohen, 1999", license: "a confirmar",
  },
  {
    id: "sonor3007", file: "SF-3007-Drum-Kit-Public.sf2", label: "Bateria Sonor Force 3007", kind: "bateria", size: 11061908,
    preset: { program: 0, bankMSB: 0, bankLSB: 0 },
    credit: "Rainer Steffen Hain (TAERSH)", license: "domínio público",
    source: "https://www.polyphone.io/en/soundfonts/unclassifiable/502-sonor-force-3007-huge-drum-kit",
  },
];

/** Os sons que o app usa quando a pessoa ainda não escolheu nada (todos do MuseScore General, baixados só ao tocar). */
export const DEFAULT_SOUNDS = { chords: "ms-piano-eletrico", bass: "ms-baixo-dedilhado", pad: "ms-cordas", drums: "ms-bateria" };


export const findBuiltin = (id) => BUILTIN_BANKS.find((b) => b.id === id) ?? null;
