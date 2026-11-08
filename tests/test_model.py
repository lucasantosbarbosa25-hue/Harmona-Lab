import json

import pytest

from harmonalab.model import Project, ProjectError, load_project, rename_project_notes

# Exatamente o formato da seção 21 do pedido.
EXEMPLO_PEDIDO = {
    "tempo": 80, "time_signature": "4/4",
    "chords": [
        {"symbol": "F#m7b5", "duration_beats": 4, "left_hand": ["F#2", "C3"],
         "right_hand": ["E3", "A3", "C4", "E4"], "top_note": "E4", "velocity": 80},
        {"symbol": "B7alt", "duration_beats": 4, "left_hand": ["B2", "A3"],
         "right_hand": ["D4", "Eb4", "G4", "C5"], "top_note": "C5", "velocity": 82},
    ],
}


def test_le_formato_do_pedido():
    project = Project.from_dict(EXEMPLO_PEDIDO)
    assert project.tempo == 80
    assert project.time_signature == (4, 4)
    assert project.middle_c == "C4"
    first, second = project.chords
    assert [n.midi for n in first.left_hand] == [42, 48]
    assert [n.midi for n in first.right_hand] == [52, 57, 60, 64]
    assert second.pitches == [47, 57, 62, 63, 67, 72]
    assert second.top_note.name() == "C5"
    assert second.highest.midi == 72 and second.lowest.midi == 47
    assert project.velocity_for(second) == 82


def test_ida_e_volta_preserva_grafia_e_alturas():
    project = Project.from_dict(EXEMPLO_PEDIDO)
    data = json.loads(json.dumps(project.to_dict()))
    assert data["chords"][1]["right_hand"] == ["D4", "Eb4", "G4", "C5"]
    again = Project.from_dict(data)
    assert [c.pitches for c in again.chords] == [c.pitches for c in project.chords]
    assert again.to_dict() == project.to_dict()


def test_campos_de_notas_aceitam_texto():
    project = Project.from_dict({"chords": [{"left_hand": "F#2 – C3", "right_hand": "E3, A3, C4, E4"}]})
    assert project.chords[0].pitches == [42, 48, 52, 57, 60, 64]


def test_padroes():
    project = Project.from_dict({"chords": [{"right_hand": "C4 E4 G4"}]})
    chord = project.chords[0]
    assert chord.duration_beats == 4  # 1 compasso em 4/4
    assert chord.velocity is None and project.velocity_for(chord) == 80
    assert chord.top_note is None


def test_duracao_em_compassos():
    project = Project.from_dict({"time_signature": "3/4", "chords": [{"right_hand": "C4", "duration_bars": 2}]})
    assert project.chords[0].duration_beats == 6
    project = Project.from_dict({"time_signature": "6/8", "chords": [{"right_hand": "C4"}]})
    assert project.beats_per_bar == 3
    assert project.chords[0].duration_beats == 3


def test_baixo_e_notas_sem_mao_tambem_soam():
    project = Project.from_dict({"chords": [{"bass": "E1", "notes": "G3 B3", "right_hand": "F#4"}]})
    assert project.chords[0].pitches == [28, 55, 59, 66]


def test_altura_repetida_vira_uma_so():
    project = Project.from_dict({"chords": [{"left_hand": "B2 A3", "right_hand": "A3 C#4 Db4"}]})
    assert project.chords[0].pitches == [47, 57, 61]


def test_acorde_sem_notas_e_pausa():
    project = Project.from_dict({"chords": [{"symbol": "", "left_hand": [], "right_hand": []}]})
    assert project.chords[0].is_rest


def test_todos_os_erros_sao_coletados():
    data = {
        "tempo": 0, "time_signature": "4/3", "middle_c": "C5", "default_velocity": 200,
        "chords": [
            {"left_hand": "H2 C3", "right_hand": "E", "duration_beats": -1, "velocity": 0, "top_note": "X"},
            "não é acorde",
        ],
    }
    _, issues = load_project(data)
    fields = {(i.chord, i.field) for i in issues if i.level == "error"}
    assert (None, "tempo") in fields
    assert (None, "time_signature") in fields
    assert (None, "middle_c") in fields
    assert (None, "default_velocity") in fields
    assert {(0, "left_hand"), (0, "right_hand"), (0, "duration_beats"), (0, "velocity"), (0, "top_note")} <= fields
    assert (1, None) in fields
    with pytest.raises(ProjectError) as exc:
        Project.from_dict(data)
    assert "acorde 1" in str(exc.value)


def test_tipos_inesperados_viram_erro_e_nao_excecao():
    _, issues = load_project({"middle_c": ["C4"], "tempo": "rápido", "chords": [{"right_hand": [60.5, {"x": 1}]}]})
    assert {i.field for i in issues if i.level == "error"} >= {"middle_c", "tempo", "right_hand"}


def test_nao_depende_do_simbolo():
    # Símbolo estranho ou vazio não impede nada: as notas mandam.
    project = Project.from_dict({"chords": [
        {"symbol": "??? (F E A C B F#)", "left_hand": "F2 E3", "right_hand": "A3 B3 C4 F#4"},
        {"symbol": "", "right_hand": "C4 Db4 D4"},
    ]})
    assert project.chords[0].pitches == [41, 52, 57, 59, 60, 66]
    assert project.chords[1].pitches == [60, 61, 62]


def test_convencao_c3_no_projeto():
    project = Project.from_dict({"middle_c": "C3", "chords": [{"right_hand": "C3 Eb3"}]})
    assert project.chords[0].pitches == [60, 63]
    assert project.to_dict()["chords"][0]["right_hand"] == ["C3", "Eb3"]


def test_trocar_convencao_mantem_alturas():
    original = {"middle_c": "C4", "chords": [{"left_hand": "F#2 C3", "right_hand": ["Eb4", "C5"], "top_note": "C5"}]}
    converted = rename_project_notes(original, "C3")
    assert converted["middle_c"] == "C3"
    assert converted["chords"][0]["left_hand"] == "F#1 C2"
    assert converted["chords"][0]["right_hand"] == ["Eb3", "C4"]
    assert converted["chords"][0]["top_note"] == "C4"
    a = Project.from_dict(original).chords[0].pitches
    b = Project.from_dict(converted).chords[0].pitches
    assert a == b


def test_tom_referencias_funcao_e_escala_sao_informativos():
    data = {"key": " Em ", "references": ["Jesús Molina", " Dirty Loops ", "", 5],
            "chords": [{"notes": "E3 G3 B3", "function": "i7", "scale": " Eólio "}, {"notes": "C4"}]}
    project = Project.from_dict(data)
    assert project.key == "Em" and project.references == ["Jesús Molina", "Dirty Loops"]
    assert (project.chords[0].function, project.chords[0].scale) == ("i7", "Eólio")
    d = project.to_dict()
    assert d["key"] == "Em" and d["references"] == ["Jesús Molina", "Dirty Loops"]
    assert d["chords"][0]["function"] == "i7" and "function" not in d["chords"][1]
    assert Project.from_dict(d).to_dict() == d  # ida e volta
    assert "key" not in Project.from_dict({"chords": []}).to_dict()


def test_referencias_como_texto():
    assert Project.from_dict({"references": "Domi & JD Beck, Stevie Wonder; Ed Motta", "chords": []}).references == [
        "Domi & JD Beck", "Stevie Wonder", "Ed Motta"]
    assert Project.from_dict({"references": {"a": 1}, "chords": []}).references == []
