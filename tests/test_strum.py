"""Strum: a 1ª nota entra no tempo, as outras entram atrasadas; o acorde acaba no mesmo instante."""

import pytest

from harmonalab.analysis import analyze_data, describe
from harmonalab.midi_io import TICKS_PER_BEAT as PPQ
from harmonalab.midi_io import build_midi, midi_bytes, strum_plan, summarize_midi
from harmonalab.model import Project

EM9 = "E3 G3 B3 D4 F#4"  # MIDI 52 55 59 62 66


def notes_of(data):
    """[(altura, início, fim)] em ticks, na ordem do arquivo."""
    summary = summarize_midi(build_midi(Project.from_dict(data)))
    return [(n.pitch, n.start, n.end) for n in summary.notes]


def raw_events(data, pitch):
    """[(tick, 'note_on' | 'note_off')] de uma altura, direto das mensagens MIDI."""
    tick, out = 0, []
    for msg in build_midi(Project.from_dict(data)).tracks[0]:
        tick += msg.time
        if msg.type in ("note_on", "note_off") and msg.note == pitch:
            out.append((tick, msg.type))
    return out


def test_grave_para_agudo():
    data = {"tempo": 80, "strum": {"direction": "up", "delay_ms": 20}, "chords": [{"right_hand": EM9}]}
    # 20 ms a 80 BPM = 12,8 ticks por nota (arredondado a partir da posição exata, sem acumular erro)
    assert notes_of(data) == [(52, 0, 1920), (55, 13, 1920), (59, 26, 1920), (62, 38, 1920), (66, 51, 1920)]


def test_agudo_para_grave():
    data = {"tempo": 80, "strum": {"direction": "down", "delay_ms": 20}, "chords": [{"right_hand": EM9}]}
    assert notes_of(data) == [(66, 0, 1920), (62, 13, 1920), (59, 26, 1920), (55, 38, 1920), (52, 51, 1920)]
    order, tick = [], 0
    for msg in build_midi(Project.from_dict(data)).tracks[0]:
        tick += msg.time
        if msg.type == "note_on":
            order.append(msg.note)
    assert order == [66, 62, 59, 55, 52]  # a mais aguda entra primeiro


def test_strum_nao_desloca_o_acorde_seguinte_nem_o_fim():
    data = {"strum": {"direction": "up", "delay_ms": 30}, "chords": [
        {"right_hand": EM9}, {"right_hand": "C4 E4 G4", "duration_beats": 2}]}
    notes = notes_of(data)
    first, second = notes[:5], notes[5:]
    assert {end for _, _, end in first} == {1920}  # todas as notas terminam juntas, no fim do acorde
    assert min(s for _, s, _ in second) == 1920  # o acorde seguinte começa exatamente no compasso 2
    assert {end for _, _, end in second} == {1920 + 960}


def test_desligado_gera_o_mesmo_arquivo_de_antes():
    base = {"chords": [{"right_hand": EM9}, {"left_hand": "C2 G2", "right_hand": "E3 B3"}]}
    explicit = {**base, "strum": {"direction": "off", "delay_ms": 50}}
    assert midi_bytes(Project.from_dict(base)) == midi_bytes(Project.from_dict(explicit))
    assert {s for _, s, _ in notes_of(base)} == {0, 1920}  # notas juntas, como digitado


def test_acorde_pode_trocar_o_strum_do_projeto():
    data = {"tempo": 80, "strum": {"direction": "up", "delay_ms": 20}, "chords": [
        {"notes": "C4 E4 G4", "strum": "off"},
        {"notes": "C4 E4 G4"},
        {"notes": "C4 E4 G4", "strum": "down"},
    ]}
    notes = notes_of(data)
    assert notes[:3] == [(60, 0, 1920), (64, 0, 1920), (67, 0, 1920)]
    assert notes[3:6] == [(60, 1920, 3840), (64, 1933, 3840), (67, 1946, 3840)]
    assert notes[6:] == [(67, 3840, 5760), (64, 3853, 5760), (60, 3866, 5760)]


def test_projeto_desligado_acorde_liga():
    data = {"chords": [{"notes": "C4 E4 G4", "strum": "up"}, {"notes": "C4 E4 G4"}]}
    assert [s for _, s, _ in notes_of(data)] == [0, 13, 26, 1920, 1920, 1920]


def test_uma_nota_e_pausa_nao_mudam():
    data = {"strum": {"direction": "up", "delay_ms": 30}, "chords": [{"notes": "C4"}, {}, {"notes": "D4"}]}
    assert notes_of(data) == [(60, 0, 1920), (62, 3840, 5760)]


def test_nota_comum_e_reatacada_depois_do_strum():
    data = {"strum": {"direction": "up", "delay_ms": 20}, "chords": [{"notes": "C4 E4 G4"}, {"notes": "C4 E4 G4"}]}
    # E4 (64): entra em 13, solta em 1920, entra de novo em 1933 — o note_off nunca fica para trás
    assert raw_events(data, 64) == [(13, "note_on"), (1920, "note_off"), (1933, "note_on"), (3840, "note_off")]


@pytest.mark.parametrize("bpm", [40, 80, 120, 175.5, 300])
@pytest.mark.parametrize("delay", [10, 20, 30])
def test_atraso_em_milissegundos_vale_em_qualquer_bpm(bpm, delay):
    offsets, compressed = strum_plan(6, delay, bpm, 4 * PPQ)
    assert not compressed and offsets[0] == 0
    tick_ms = 60000 / (bpm * PPQ)
    for i, ticks in enumerate(offsets):
        assert abs(ticks * tick_ms - i * delay) <= tick_ms / 2 + 1e-9  # erro máximo: meio tick


def test_strum_que_nao_cabe_encolhe_para_metade_do_acorde():
    data = {"tempo": 40, "strum": {"direction": "up", "delay_ms": 250},
            "chords": [{"notes": "C4 E4 G4 B4 D5", "duration_beats": 0.5}]}
    # 250 ms a 40 BPM = 80 ticks por nota → 320 ticks, mas o acorde tem 240: o strum cabe em 120 (metade)
    assert [s for _, s, _ in notes_of(data)] == [0, 30, 60, 90, 120]
    report = analyze_data(data)
    assert report["ok"]
    assert [(i["level"], i["field"]) for i in report["issues"]] == [("warning", "strum")]


def test_strum_que_cabe_nao_gera_aviso():
    report = analyze_data({"strum": {"direction": "up", "delay_ms": 30}, "chords": [{"notes": EM9}]})
    assert report["issues"] == []


def test_json_ida_e_volta():
    data = {"strum": {"direction": "down", "delay_ms": 30}, "chords": [{"notes": "C4 E4", "strum": "up"}, {"notes": "C4"}]}
    d = Project.from_dict(data).to_dict()
    assert d["strum"] == {"direction": "down", "delay_ms": 30}
    assert d["chords"][0]["strum"] == "up" and "strum" not in d["chords"][1]
    assert Project.from_dict(d).to_dict() == d
    assert Project.from_dict({"chords": []}).to_dict()["strum"] == {"direction": "off", "delay_ms": 20}


@pytest.mark.parametrize("data, chord, message", [
    ({"strum": 5}, None, 'deve ser um objeto'),
    ({"strum": ["up"]}, None, 'deve ser um objeto'),
    ({"strum": "diagonal"}, None, 'Direção do strum desconhecida: "diagonal"'),
    ({"strum": {"direction": "left"}}, None, 'Direção do strum desconhecida: "left"'),
    ({"strum": {"direction": 3}}, None, "Direção do strum desconhecida."),
    ({"strum": {"delay_ms": 0}}, None, "entre 1 e 250 ms"),
    ({"strum": {"delay_ms": 251}}, None, "entre 1 e 250 ms"),
    ({"strum": {"delay_ms": "rápido"}}, None, 'recebido "rápido"'),
    ({"chords": [{"notes": "C4 E4", "strum": "sideways"}]}, 0, 'Strum do acorde desconhecido: "sideways"'),
    ({"chords": [{"notes": "C4 E4", "strum": 7}]}, 0, "Strum do acorde desconhecido."),
])
def test_valores_invalidos_viram_erro(data, chord, message):
    report = analyze_data({"chords": [{"notes": "C4"}], **data})
    assert not report["ok"]
    errors = [i for i in report["issues"] if i["level"] == "error"]
    assert [(e["chord"], e["field"]) for e in errors] == [(chord, "strum")]
    assert message in errors[0]["message"]


def test_atalho_so_com_a_direcao():
    notes = notes_of({"tempo": 80, "strum": "down", "chords": [{"notes": "C4 E4 G4"}]})
    assert notes == [(67, 0, 1920), (64, 13, 1920), (60, 26, 1920)]  # atraso padrão: 20 ms


def test_aceita_atraso_como_texto_e_virgula():
    notes = notes_of({"tempo": 80, "strum": {"direction": "up", "delay_ms": "15,5"}, "chords": [{"notes": "C4 E4 G4"}]})
    assert [s for _, s, _ in notes] == [0, 10, 20]  # 15,5 ms a 80 BPM = 9,92 ticks por nota


def test_analise_informa_o_strum_de_cada_acorde():
    report = analyze_data({"strum": {"direction": "up", "delay_ms": 20}, "chords": [
        {"notes": "C4 E4"}, {"notes": "C4"}, {"notes": "C4 E4", "strum": "off"}, {"notes": "C4 E4", "strum": "down"}]})
    assert [c["strum"] for c in report["chords"]] == ["up", "off", "off", "down"]
    assert report["strum_delay_ms"] == 20


def test_texto_do_comando_check_mostra_o_strum():
    text = describe(analyze_data({"strum": {"direction": "down", "delay_ms": 30}, "chords": [{"notes": "C4 E4 G4"}]}))
    assert "strum: agudo → grave, 30 ms entre as notas" in text
    assert "strum" not in describe(analyze_data({"chords": [{"notes": "C4 E4 G4"}]}))


def test_duracao_menor_que_meio_tick_e_erro_para_nao_prender_nota():
    # Com a nota ligando e desligando no mesmo tick, o note_off viria antes do note_on e a nota ficaria presa.
    report = analyze_data({"chords": [{"notes": "C4", "duration_beats": 0.0004}]})
    assert not report["ok"]
    assert [(i["level"], i["field"]) for i in report["issues"]] == [("error", "duration_beats")]
    assert analyze_data({"chords": [{"notes": "C4", "duration_beats": 0.002}]})["ok"]  # ≈ 1 tick: vale
