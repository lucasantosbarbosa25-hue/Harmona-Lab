// Exemplos usados nos testes do assistente.

export const GOOD_PROJECT = {
  title: "Resolução em Em com F# na ponta",
  tempo: 76,
  time_signature: "4/4",
  middle_c: "C4",
  chords: [
    { symbol: "Fmaj7(#11)", duration_beats: 4, bass: ["F2"], left_hand: ["C3"], right_hand: ["E3", "A3", "B3", "F#4"], top_note: "F#4", comment: "lídio" },
    { symbol: "B7alt", duration_beats: 4, left_hand: ["B2", "A3"], right_hand: ["D4", "Eb4", "G4", "C5"], top_note: "C5" },
    { symbol: "Em9", duration_beats: 8, left_hand: ["E2", "B2", "D3"], right_hand: ["G3", "F#4"], top_note: "F#4" },
  ],
};

/** O que uma IA devolve: explicação, o que o pedido dizia e o projeto. */
export const delivery = (overrides = {}) => ({
  pedido_extraido: { acordes: 3, bpm: 76 },
  explicacao: "Fmaj7(#11) empurra para B7alt, que resolve em Em9 com o F# no topo.",
  projeto: GOOD_PROJECT,
  ...overrides,
});
