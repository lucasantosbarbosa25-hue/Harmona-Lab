// Separa o MuseScore_General.sf3 (licença MIT) em um arquivo SF3 por instrumento, para o app baixar só o que a pessoa usa.
//
// Uso (numa pasta de trabalho com `npm install spessasynth_core@4.3.22`):
//   node design/split_soundfont.mjs caminho/MuseScore_General.sf3 harmonalab/web/sons
// O original vem de https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/ (com a licença e a lista das fontes
// das amostras). As amostras continuam comprimidas (Vorbis), como no original: nada é recodificado.
// A lista abaixo é a mesma de harmonalab/web/kb/sons.js (id do banco → instrumento no arquivo original).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BasicSoundBank, SoundBankLoader } from "spessasynth_core";

export const INSTRUMENTS = [
  // [id, bateria?, programa]
  ["ms-piano", false, 0], ["ms-piano-eletrico", false, 4], ["ms-piano-fm", false, 5], ["ms-vibrafone", false, 11], ["ms-orgao", false, 16],
  ["ms-violao", false, 24], ["ms-guitarra-jazz", false, 26],
  ["ms-flauta", false, 73], ["ms-sax-alto", false, 65], ["ms-sax-tenor", false, 66], ["ms-trompete", false, 56], ["ms-coro", false, 52], ["ms-voz", false, 53],
  ["ms-baixo-dedilhado", false, 33], ["ms-baixo-acustico", false, 32], ["ms-baixo-fretless", false, 35], ["ms-baixo-slap", false, 36],
  ["ms-cordas", false, 49], ["ms-cordas-rapidas", false, 48], ["ms-cordas-sinteticas", false, 50], ["ms-pad", false, 89],
  ["ms-guitarra-limpa", false, 27], ["ms-guitarra-abafada", false, 28], ["ms-guitarra-overdrive", false, 29], ["ms-guitarra-distorcida", false, 30],
  ["ms-synth-serra", false, 81], ["ms-synth-quadrada", false, 80], ["ms-synth-baixo", false, 38], ["ms-metais", false, 61], ["ms-synth-metais", false, 62],
  ["ms-bateria", true, 0], ["ms-bateria-sala", true, 8], ["ms-bateria-rock", true, 16], ["ms-bateria-jazz", true, 32], ["ms-bateria-vassourinha", true, 40], ["ms-bateria-808", true, 25],
];

if (process.argv[2]) {
  const [source, target] = process.argv.slice(2);
  await BasicSoundBank.isSF3DecoderReady;
  const file = readFileSync(source);
  mkdirSync(target, { recursive: true });
  const sizes = {};
  for (const [id, drum, program] of INSTRUMENTS) {
    const bank = SoundBankLoader.fromArrayBuffer(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    for (const preset of [...bank.presets]) {
      if (!(preset.isDrum === drum && preset.program === program && preset.bankMSB === 0 && preset.bankLSB === 0)) bank.deletePreset(preset);
    }
    bank.removeUnusedElements();
    if (bank.presets.length !== 1) throw new Error(`${id}: esperava 1 instrumento, achei ${bank.presets.length}`);
    const bytes = Buffer.from(bank.writeSF2({ software: "Harmona Lab (design/split_soundfont.mjs)" }));
    writeFileSync(`${target}/${id}.sf3`, bytes);
    sizes[id] = bytes.length;
    console.log(id.padEnd(26), bank.presets[0].name.padEnd(22), bytes.length);
  }
  console.log(JSON.stringify(sizes));
}
