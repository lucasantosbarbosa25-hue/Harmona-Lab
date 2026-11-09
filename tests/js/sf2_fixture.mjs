// Um SoundFont (.sf2) mínimo e válido, gerado em código, para testar o tocador sem precisar de um banco de verdade.
// Cada preset toca a mesma amostra (uma senoide curta com loop), em notas e programas diferentes.

const ascii = (text, size) => {
  const out = new Uint8Array(size);
  for (let i = 0; i < Math.min(text.length, size - 1); i++) out[i] = text.charCodeAt(i);
  return out;
};

class Writer {
  constructor() { this.parts = []; }
  u8(...values) { this.parts.push(Uint8Array.from(values)); return this; }
  u16(v) { return this.u8(v & 0xff, (v >> 8) & 0xff); }
  i16(v) { return this.u16(v & 0xffff); }
  u32(v) { return this.u8(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); }
  bytes(arr) { this.parts.push(arr); return this; }
  build() {
    const size = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    return out;
  }
}

const chunk = (id, body) => {
  const w = new Writer().bytes(ascii(id, 5).slice(0, 4)).u32(body.length).bytes(body);
  if (body.length % 2) w.u8(0);
  return w.build();
};
const list = (type, ...chunks) => chunk("LIST", concat([ascii(type, 5).slice(0, 4), ...chunks]));
const concat = (arrays) => { const w = new Writer(); for (const a of arrays) w.bytes(a); return w.build(); };

/**
 * presets: [{ name, program, bank = 0, rootKey = 60 }].
 * Devolve os bytes de um .sf2 com uma amostra de 0,25 s a 22050 Hz.
 */
export function buildSf2(presets = [{ name: "Rhodes Teste", program: 4 }, { name: "Piano Teste", program: 0 }], { name = "Banco de teste" } = {}) {
  const rate = 22050;
  const length = Math.round(rate * 0.25);
  const period = rate / 261.6256; // dó central
  const smpl = new Writer();
  for (let i = 0; i < length; i++) smpl.i16(Math.round(Math.sin((2 * Math.PI * i) / period) * 12000));
  for (let i = 0; i < 46; i++) smpl.i16(0); // 46 zeros depois de cada amostra (exigência do formato)

  const info = list("INFO",
    chunk("ifil", new Writer().u16(2).u16(1).build()),
    chunk("isng", ascii("EMU8000", 8)),
    chunk("INAM", ascii(name, name.length + (name.length % 2 ? 1 : 2))));
  const sdta = list("sdta", chunk("smpl", smpl.build()));

  const phdr = new Writer();
  const pbag = new Writer();
  const pgen = new Writer();
  presets.forEach((p, i) => {
    phdr.bytes(ascii(p.name, 20)).u16(p.program).u16(p.bank ?? 0).u16(i).u32(0).u32(0).u32(0);
    pbag.u16(i).u16(0);
    pgen.u16(41).u16(i); // instrument → instrumento i
  });
  phdr.bytes(ascii("EOP", 20)).u16(0).u16(0).u16(presets.length).u32(0).u32(0).u32(0);
  pbag.u16(presets.length).u16(0);
  pgen.u16(0).u16(0);

  const inst = new Writer();
  const ibag = new Writer();
  const igen = new Writer();
  presets.forEach((p, i) => {
    inst.bytes(ascii(`${p.name} inst`, 20)).u16(i);
    ibag.u16(i * 3).u16(0);
    igen.u16(58).u16(p.rootKey ?? 60); // overridingRootKey
    igen.u16(54).u16(1); // sampleModes: loop contínuo
    igen.u16(53).u16(0); // sampleID (sempre o último gerador da zona)
  });
  inst.bytes(ascii("EOI", 20)).u16(presets.length);
  ibag.u16(presets.length * 3).u16(0);
  igen.u16(0).u16(0);

  const shdr = new Writer()
    .bytes(ascii("seno", 20)).u32(0).u32(length).u32(Math.round(period * 10)).u32(Math.round(period * 40)).u32(rate)
    .u8(60, 0).u16(0).u16(1)
    .bytes(ascii("EOS", 20)).u32(0).u32(0).u32(0).u32(0).u32(0).u8(0, 0).u16(0).u16(0);
  const zeroMod = new Uint8Array(10);

  const pdta = list("pdta",
    chunk("phdr", phdr.build()), chunk("pbag", pbag.build()), chunk("pmod", zeroMod), chunk("pgen", pgen.build()),
    chunk("inst", inst.build()), chunk("ibag", ibag.build()), chunk("imod", zeroMod), chunk("igen", igen.build()),
    chunk("shdr", shdr.build()));

  return chunk("RIFF", concat([ascii("sfbk", 5).slice(0, 4), info, sdta, pdta]));
}
