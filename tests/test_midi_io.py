"""Gera o .mid, lê de volta com mido e confere tudo o que importa na DAW."""

import mido
import pytest

from harmonalab.midi_io import TICKS_PER_BEAT, build_midi, load_midi, midi_bytes, save_midi, summarize_midi
from harmonalab.model import Project

PPQ = TICKS_PER_BEAT

PROGRESSAO = {
    "title": "Resolução B7alt → Em",
    "tempo": 80, "time_signature": "4/4",
    "chords": [
        {"symbol": "F#m7b5", "duration_beats": 4, "left_hand": ["F#2", "C3"],
         "right_hand": ["E3", "A3", "C4", "E4"], "velocity": 80},
        {"symbol": "B7alt", "duration_beats": 4, "left_hand": ["B2", "A3"],
         "right_hand": ["D4", "Eb4", "G4", "C5"], "velocity": 82},
        {"symbol": "F△7(#11)", "duration_beats": 4, "left_hand": "F2 E3", "right_hand": "A3 B3 C4 F#4", "velocity": 90},
        {"symbol": "Em9", "duration_beats": 4, "left_hand": "E2 B2 D3", "right_hand": "G3 F#4", "velocity": 76},
    ],
}
ESPERADO = [
    [42, 48, 52, 57, 60, 64],
    [47, 57, 62, 63, 67, 72],
    [41, 52, 57, 59, 60, 66],
    [40, 47, 50, 55, 66],
]


def roundtrip(data, tmp_path):
    project = Project.from_dict(data)
    path = save_midi(project, tmp_path / "progressao.mid")
    return project, mido.MidiFile(str(path))


def test_arquivo_relido_confere_notas_velocity_duracao_e_ordem(tmp_path):
    _, midi = roundtrip(PROGRESSAO, tmp_path)
    summary = summarize_midi(midi)
    assert summary.midi_type == 0
    assert summary.ticks_per_beat == PPQ
    assert summary.tempo_bpm == pytest.approx(80)
    assert summary.time_signature == (4, 4)

    bar = 4 * PPQ
    for i, (pitches, velocity) in enumerate(zip(ESPERADO, (80, 82, 90, 76))):
        notes = [n for n in summary.notes if n.start == i * bar]
        assert sorted(n.pitch for n in notes) == pitches
        assert {n.velocity for n in notes} == {velocity}
        assert {n.end for n in notes} == {(i + 1) * bar}
    assert len(summary.notes) == sum(len(p) for p in ESPERADO)
    assert summary.length_ticks == 4 * bar


def test_mensagens_note_on_e_note_off_brutas(tmp_path):
    _, midi = roundtrip(PROGRESSAO, tmp_path)
    tick, ons, offs = 0, [], []
    for msg in midi.tracks[0]:
        tick += msg.time
        if msg.type == "note_on":
            assert msg.velocity > 0 and msg.channel == 0
            ons.append((tick, msg.note))
        elif msg.type == "note_off":
            offs.append((tick, msg.note))
    assert len(ons) == len(offs) == 23
    # Ordem temporal nunca volta para trás e cada note_off vem depois do seu note_on.
    assert [t for t, _ in ons] == sorted(t for t, _ in ons)
    assert ons[:6] == [(0, p) for p in ESPERADO[0]]
    assert ons[6:12] == [(1920, p) for p in ESPERADO[1]]
    assert sorted(offs[:6]) == [(1920, p) for p in ESPERADO[0]]


@pytest.mark.parametrize("bpm", [40, 60, 80, 92.5, 140, 220])
def test_quatro_tempos_em_4_4_e_um_compasso_em_qualquer_bpm(bpm, tmp_path):
    data = {"tempo": bpm, "time_signature": "4/4", "chords": [{"right_hand": "C4 E4 G4", "duration_beats": 4},
                                                              {"right_hand": "D4", "duration_beats": 4}]}
    _, midi = roundtrip(data, tmp_path)
    summary = summarize_midi(midi)
    first = [n for n in summary.notes if n.start == 0]
    assert {n.length for n in first} == {4 * PPQ}  # um compasso musical
    assert [n.start for n in summary.notes if n.pitch == 62] == [4 * PPQ]  # começa no compasso 2
    assert summary.tempo_bpm == pytest.approx(bpm, rel=1e-5)


@pytest.mark.parametrize("sig, bar_ticks", [("3/4", 3 * PPQ), ("6/8", 3 * PPQ), ("5/4", 5 * PPQ), ("7/8", int(3.5 * PPQ))])
def test_compassos_diferentes(sig, bar_ticks, tmp_path):
    _, midi = roundtrip({"time_signature": sig, "chords": [{"right_hand": "C4"}, {"right_hand": "D4"}]}, tmp_path)
    summary = summarize_midi(midi)
    num, den = map(int, sig.split("/"))
    assert summary.time_signature == (num, den)
    assert [(n.start, n.end) for n in summary.notes] == [(0, bar_ticks), (bar_ticks, 2 * bar_ticks)]


def test_duracoes_fracionarias_sem_deriva(tmp_path):
    chords = [{"right_hand": "C4", "duration_beats": 1 / 3} for _ in range(9)] + [{"right_hand": "D4", "duration_beats": 1.5}]
    _, midi = roundtrip({"chords": chords}, tmp_path)
    summary = summarize_midi(midi)
    assert [n.start for n in summary.notes] == [i * 160 for i in range(10)]
    assert summary.notes[-1].length == 720


def test_nota_comum_entre_acordes_e_rearticulada(tmp_path):
    # F#4 se repete: o note_off do 1º acorde precisa vir ANTES do note_on do 2º.
    data = {"chords": [{"right_hand": "A3 C4 F#4"}, {"right_hand": "G3 B3 F#4"}]}
    _, midi = roundtrip(data, tmp_path)
    tick, sequence = 0, []
    for msg in midi.tracks[0]:
        tick += msg.time
        if msg.type in ("note_on", "note_off") and msg.note == 66:
            sequence.append((tick, msg.type))
    assert sequence == [(0, "note_on"), (1920, "note_off"), (1920, "note_on"), (3840, "note_off")]
    summary = summarize_midi(midi)
    assert [(n.start, n.end) for n in summary.notes if n.pitch == 66] == [(0, 1920), (1920, 3840)]


def test_pausas_deslocam_e_preservam_tamanho(tmp_path):
    data = {"chords": [{"right_hand": "C4"}, {"right_hand": ""}, {"right_hand": "E4", "duration_beats": 2}, {}]}
    _, midi = roundtrip(data, tmp_path)
    summary = summarize_midi(midi)
    assert [(n.pitch, n.start, n.end) for n in summary.notes] == [(60, 0, 1920), (64, 3840, 4800)]
    assert summary.length_ticks == 4800 + 1920  # pausa final mantida


def test_velocity_padrao_do_projeto(tmp_path):
    _, midi = roundtrip({"default_velocity": 64, "chords": [{"right_hand": "C4 E4"}, {"right_hand": "D4", "velocity": 100}]}, tmp_path)
    assert [n.velocity for n in summarize_midi(midi).notes] == [64, 64, 100]


def test_alturas_repetidas_viram_uma_nota(tmp_path):
    _, midi = roundtrip({"chords": [{"left_hand": "A3", "right_hand": "A3 C#4 Db4"}]}, tmp_path)
    assert [n.pitch for n in summarize_midi(midi).notes] == [57, 61]


def test_marcadores_com_simbolos(tmp_path):
    _, midi = roundtrip(PROGRESSAO, tmp_path)
    summary = summarize_midi(midi)
    assert summary.markers == [(0, "F#m7b5"), (1920, "B7alt"), (3840, "Fmaj7(#11)"), (5760, "Em9")]
    names = [m.name for m in midi.tracks[0] if m.type == "track_name"]
    assert names == ["Resolução B7alt -> Em"]


def test_extremos_do_midi(tmp_path):
    _, midi = roundtrip({"chords": [{"notes": "C-1 G9"}]}, tmp_path)
    assert [n.pitch for n in summarize_midi(midi).notes] == [0, 127]


def test_bytes_e_arquivo_sao_identicos(tmp_path):
    project = Project.from_dict(PROGRESSAO)
    path = save_midi(project, tmp_path / "a.mid")
    assert path.read_bytes() == midi_bytes(project)
    assert summarize_midi(load_midi(midi_bytes(project))).notes == summarize_midi(build_midi(project)).notes


def test_convencao_c3_gera_as_mesmas_alturas(tmp_path):
    c4 = Project.from_dict({"middle_c": "C4", "chords": [{"left_hand": "F#2 C3", "right_hand": "E3 A3 C4 E4"}]})
    c3 = Project.from_dict({"middle_c": "C3", "chords": [{"left_hand": "F#1 C2", "right_hand": "E2 A2 C3 E3"}]})
    assert midi_bytes(c4) == midi_bytes(c3)
