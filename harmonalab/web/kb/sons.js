// Bancos de sons que vêm com o app (arquivos em sons/). Só são baixados quando alguém escolhe um deles, e ficam guardados
// no aparelho depois disso. Para acrescentar um banco: suba o .sf2 em sons/ e acrescente uma linha aqui (o repositório é
// público, então anote a origem e confira se a licença permite redistribuir).
//
// kind: "teclado" (aparece em "Som dos acordes" e "Som da frase") ou "bateria" (aparece em "Som da bateria").
// preset: o instrumento dentro do arquivo { program, bankMSB, bankLSB }.

export const BUILTIN_BANKS = [
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

export const findBuiltin = (id) => BUILTIN_BANKS.find((b) => b.id === id) ?? null;
