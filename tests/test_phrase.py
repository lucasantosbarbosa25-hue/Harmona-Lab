"""Frases melódicas: leitura da notação, conferências musicais e o arquivo MIDI (canal 2)."""

import json

import pytest

from harmonalab.analysis import analyze_data
from harmonalab.midi_io import PHRASE_MODES, TICKS_PER_BEAT, build_midi, load_midi, midi_bytes, summarize_midi
from harmonalab.model import Project, rename_project_notes
from harmonalab.phrase import (
    PhraseError, duration_ticks, normalize_role, parse_phrase, parse_scale, phrase_text, rename_phrase_text, split_phrase,
)

PPQ = TICKS_PER_BEAT
B7ALT = {
    "symbol": "B7alt", "duration_beats": 4, "left_hand": "B2 A3", "right_hand": "D4 Eb4 G4 C5",
    "phrase": "G5/8 F5/8 Eb5/4*alvo D5/8 C5/8 B4/4*alvo", "phrase_scale": "B C D Eb F G A",
}


def messages(data, field="phrase"):
    return [(i["level"], i["message"]) for i in analyze_data(data)["issues"] if i["field"] == field]


def one(**chord):
    return {"chords": [{"notes": "C4 E4 G4", **chord}]}


# ------------------------------------------------------------------ durações


@pytest.mark.parametrize("text, ticks", [
    ("1", 1920), ("2", 960), ("4", 480), ("8", 240), ("16", 120), ("32", 60), ("64", 30),
    ("4.", 720), ("8.", 360), ("8t", 160), ("16t", 80), ("4t", 320), ("16q", 96), ("8q", 192), ("8t.", 240), ("64t", 20),
])
def test_duracoes_em_ticks(text, ticks):
    assert duration_ticks(text) == ticks


@pytest.mark.parametrize("text", ["", "0", "3", "5", "9", "128", "4x", "t", "4tt", "-4", "4,5"])
def test_duracao_invalida(text):
    with pytest.raises(PhraseError):
        duration_ticks(text)


# ------------------------------------------------------------------ leitura


def test_inicio_de_cada_nota_e_a_soma_das_duracoes():
    events, total, errors = parse_phrase(B7ALT["phrase"], "C4")
    assert errors == []
    assert [e.start for e in events] == [0, 240, 480, 960, 1200, 1440]
    assert [e.length for e in events] == [240, 240, 480, 240, 240, 480]
    assert total == 4 * PPQ
    assert [e.note.midi for e in events] == [79, 77, 75, 74, 72, 71]
    assert [e.role for e in events] == ["", "", "alvo", "", "", "alvo"]


def test_pausas_avancam_o_tempo_sem_nota():
    events, total, _ = parse_phrase("r/4 C5/8 R/8 D5/4", "C4")
    assert [(e.start, e.length) for e in events] == [(480, 240), (960, 480)]
    assert total == 1440


def test_separadores_e_lista():
    assert split_phrase("C5/8, D5/8; E5/8 | F5/8") == ["C5/8", "D5/8", "E5/8", "F5/8"]
    assert phrase_text(["C5/8", "  D5/8  "]) == "C5/8 D5/8"
    assert phrase_text(None) == ""


@pytest.mark.parametrize("role, expected", [
    ("alvo", "alvo"), (" ALVO ", "alvo"), ("Aproximação", "aprox"), ("aproximacao", "aprox"), ("approach", "aprox"),
    ("Cromática", "cromatica"), ("blue", "blue"), ("qualquer coisa", "qualquer coisa"),
])
def test_papeis(role, expected):
    assert normalize_role(role) == expected


def test_papel_desconhecido_e_aceito_como_texto_livre():
    events, _, errors = parse_phrase("C5/4*groove D5/4*Tensão", "C4")
    assert errors == []
    assert [e.role for e in events] == ["groove", "tensao"]


def test_convencao_c3():
    assert parse_phrase("C4/4", "C3")[0][0].note.midi == 72
    assert parse_phrase("C4/4", "C4")[0][0].note.midi == 60


def test_erros_apontam_a_ficha_com_problema_e_continuam():
    events, _, errors = parse_phrase("C5 D5/9 E5/4 H5/8 F5/4*", "C4")
    assert [e.note.midi for e in events] == [76]
    assert len(errors) == 4
    assert 'Não entendi "C5"' in errors[0]
    assert '"D5/9"' in errors[1]
    assert "H5" in errors[2]
    assert "Papel vazio" in errors[3]


def test_escala_da_frase():
    scale, errors = parse_scale("B C D Eb F G A")
    assert errors == []
    assert [name for _, name in scale] == ["B", "C", "D", "Eb", "F", "G", "A"]
    assert [pc for pc, _ in scale] == [11, 0, 2, 3, 5, 7, 9]
    scale, _ = parse_scale(["c", "C", "d#", "Fx"])
    assert scale == [(0, "C"), (3, "D#"), (7, "F##")]  # sem repetir classes de altura; Fx mantém a grafia
    _, errors = parse_scale("C H4 5")
    assert len(errors) == 2


# ------------------------------------------------------------------ projeto


def test_frase_vai_e_volta_no_json():
    project = Project.from_dict({"style": " Neo-soul ", "chords": [B7ALT]})
    assert project.style == "Neo-soul"
    data = project.to_dict()
    assert data["style"] == "Neo-soul"
    assert data["chords"][0]["phrase"] == B7ALT["phrase"]
    assert data["chords"][0]["phrase_scale"] == "B C D Eb F G A"
    assert Project.from_dict(data).to_dict() == data
    plain = Project.from_dict({"chords": [{"notes": "C4"}]}).to_dict()  # sem frase, o JSON não ganha campos novos
    assert "phrase" not in plain["chords"][0] and "style" not in plain


def test_frase_mais_longa_que_o_acorde_e_erro():
    data = one(duration_beats=1, phrase="C5/4 D5/4")
    assert messages(data)[0] == ("error", "A frase dura 2 tempos, mais que os 1 do acorde.")
    assert analyze_data(data)["ok"] is False


def test_frase_mais_curta_que_o_acorde_e_valida():
    assert analyze_data(one(duration_beats=4, phrase="C5/4 D5/4"))["ok"] is True


def test_tipos_errados_sao_erros_claros():
    report = analyze_data(one(phrase={"x": 1}, phrase_scale=7))
    assert not report["ok"]
    assert [i["field"] for i in report["issues"] if i["level"] == "error"] == ["phrase", "phrase_scale"]


def test_trocar_convencao_de_oitava_leva_a_frase():
    out = rename_project_notes({"chords": [{"notes": "C4", "phrase": "C5/8 r/8 Eb4/4*alvo 60/4"}]}, "C3")
    assert out["chords"][0]["phrase"] == "C4/8 r/8 Eb3/4*alvo 60/4"
    assert rename_phrase_text("C4/8*aprox", "C4", "C3") == "C3/8*aprox"
    assert rename_phrase_text(5, "C4", "C3") == 5


def test_relatorio_traz_as_notas_com_tempo():
    chord = analyze_data({"chords": [B7ALT]})["chords"][0]
    assert chord["phrase"]["events"][2] == {"midi": 75, "name": "Eb5", "start": 480, "length": 480, "role": "alvo"}
    assert analyze_data({"chords": [{"notes": "C4"}]})["chords"][0]["phrase"] is None


# ------------------------------------------------------------------ conferências musicais


def test_frase_de_exemplo_passa_sem_avisos():
    assert messages({"chords": [B7ALT]}) == []


def test_alvo_precisa_cair_num_tempo_e_ser_nota_do_acorde():
    data = {"chords": [{"left_hand": "C3", "right_hand": "E3 G3 B3", "phrase_scale": "C D E F G A B",
                        "phrase": "D5/8 E5/8*alvo F5/8*alvo"}]}
    assert [m for _, m in messages(data)] == ["O alvo E5 não cai num tempo: começa em 1.5.", "O alvo F5 não é nota do acorde."]


def test_aproximacao_resolve_por_semitom():
    assert [m for _, m in messages(one(phrase="B4/8*aprox C5/4*alvo")) if "aproxima" in m] == []
    bad = messages(one(phrase="A4/4*aprox C5/4"))
    assert "não resolve por semitom: a nota seguinte é C5 (3 semitons)" in bad[0][1]


def test_envolvente_so_a_ultima_aproximacao_resolve():
    assert [m for _, m in messages(one(phrase="F5/8*aprox D#5/8*aprox E5/4*alvo")) if "aproxima" in m] == []


def test_aproximacao_no_fim_confere_o_proximo_acorde():
    data = {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/4 B4/2*aprox"}, {"notes": "C4 E4 G4"}]}
    assert [m for _, m in messages(data) if "aproxima" in m] == []  # B está a um semitom de C
    data["chords"][0]["phrase"] = "C5/4 D5/2*aprox"
    assert "nenhuma nota do próximo acorde" in [m for _, m in messages(data) if "aproxima" in m][0]
    del data["chords"][1]  # último acorde: nada a conferir
    assert [m for _, m in messages(data) if "aproxima" in m] == []


def test_escala_confere_notas_e_acorde():
    data = one(phrase="C5/8 Db5/8 Eb5/8 F#5/8*passagem Db5/8*blue", phrase_scale="C D E F G")
    assert [m for _, m in messages(data)] == [
        "Notas fora da escala da frase (C D E F G): Db, Eb. Se são cromáticas de propósito, marque como *aprox, *passagem ou *blue."]
    data = one(notes="C4 E4 G4 Bb4", phrase="C5/8", phrase_scale="C D E F")
    assert messages(data)[0][1] == "A escala da frase (C D E F) não tem G, Bb, que são notas do acorde."


def test_sem_escala_so_avisa_com_nota_informativa():
    assert [lvl for lvl, _ in messages(one(phrase="C5/8"))] == ["info"]


def test_tessitura():
    found = messages(one(phrase="C2/8 D5/8 C8/4", phrase_scale="C D E F G A B"))
    assert found == [("warning", "Notas fora da tessitura confortável da frase (C3 a C7): C2 C8.")]


def test_so_erros_bloqueiam_a_exportacao():
    report = analyze_data(one(phrase="A4/4*aprox C5/4*alvo", phrase_scale="C D"))
    assert report["ok"] is True
    assert any(i["level"] == "warning" for i in report["issues"])


# ------------------------------------------------------------------ MIDI


def summary_of(data, **kwargs):
    return summarize_midi(load_midi(midi_bytes(Project.from_dict(data), **kwargs)))


def test_frase_vai_no_canal_2_com_os_tempos_certos():
    summary = summary_of({"tempo": 76, "chords": [B7ALT]})
    chord = [n for n in summary.notes if n.channel == 0]
    phrase = [n for n in summary.notes if n.channel == 1]
    assert sorted(n.pitch for n in chord) == [47, 57, 62, 63, 67, 72]
    assert [(n.pitch, n.start, n.length) for n in phrase] == [
        (79, 0, 240), (77, 240, 240), (75, 480, 480), (74, 960, 240), (72, 1200, 240), (71, 1440, 480)]
    assert {n.velocity for n in phrase} == {80}


def test_frase_usa_a_velocity_do_acorde_e_segue_o_acorde_seguinte():
    data = {"default_velocity": 70, "chords": [{**B7ALT, "velocity": 95}, {"notes": "E3 B3", "duration_beats": 2, "phrase": "E5/4 G5/4"}]}
    phrase = [n for n in summary_of(data).notes if n.channel == 1]
    assert {n.velocity for n in phrase if n.start < 4 * PPQ} == {95}
    assert [(n.pitch, n.start) for n in phrase if n.start >= 4 * PPQ] == [(76, 4 * PPQ), (79, 5 * PPQ)]
    assert {n.velocity for n in phrase if n.start >= 4 * PPQ} == {70}


def test_modos_de_exportar():
    data = {"chords": [B7ALT]}
    both = summary_of(data, phrase_mode="both")
    chords = summary_of(data, phrase_mode="chords")
    line = summary_of(data, phrase_mode="line")
    assert {n.channel for n in both.notes} == {0, 1}
    assert {n.channel for n in chords.notes} == {0}
    assert sorted(n.pitch for n in chords.notes) == [47, 57, 62, 63, 67, 72]
    assert sorted(n.pitch for n in line.notes if n.channel == 0) == [47, 57]  # só a mão esquerda fica com a frase
    assert len([n for n in line.notes if n.channel == 1]) == 6
    with pytest.raises(ValueError):
        build_midi(Project.from_dict(data), phrase_mode="outro")
    assert PHRASE_MODES == ("both", "chords", "line")


def test_sem_frase_o_arquivo_e_o_mesmo_de_antes():
    data = {"chords": [{"left_hand": "E2 B2", "right_hand": "G3 B3"}, {"notes": "C4 E4"}]}
    reference = midi_bytes(Project.from_dict(data))
    assert midi_bytes(Project.from_dict(data), phrase_mode="chords") == reference
    assert midi_bytes(Project.from_dict(data), phrase_mode="line") != reference  # "line" tira a mão direita


def test_nota_repetida_entre_frases_e_reatacada_sem_corte():
    data = {"chords": [{"notes": "C4", "duration_beats": 1, "phrase": "C5/4"}, {"notes": "C4", "duration_beats": 1, "phrase": "C5/4"}]}
    phrase = [n for n in summary_of(data).notes if n.channel == 1]
    assert [(n.start, n.end) for n in phrase] == [(0, 480), (480, 960)]


def test_exportar_pela_linha_de_comando(tmp_path, capsys):
    from harmonalab.cli import main

    source = tmp_path / "p.json"
    source.write_text(json.dumps({"chords": [B7ALT]}), encoding="utf-8")
    out = tmp_path / "p.mid"
    assert main(["export", str(source), "-o", str(out)]) == 0
    assert "frase: G5 F5 Eb5*alvo D5 C5 B4*alvo" in capsys.readouterr().out
    assert {n.channel for n in summarize_midi(load_midi(out)).notes} == {0, 1}
    assert main(["export", str(source), "-o", str(out), "--phrase", "chords"]) == 0
    assert {n.channel for n in summarize_midi(load_midi(out)).notes} == {0}
