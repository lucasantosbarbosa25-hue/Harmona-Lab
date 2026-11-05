import pytest

from harmonalab.pitch import (
    Note,
    NoteParseError,
    midi_to_name,
    name_to_midi,
    parse_note,
    parse_note_list,
    parse_pitch_class,
    rename_note_text,
    split_note_list,
)


@pytest.mark.parametrize("name, midi", [
    ("C4", 60), ("C#4", 61), ("Db4", 61), ("B3", 59),
    ("A4", 69), ("C-1", 0), ("G9", 127), ("A0", 21), ("C8", 108),
    ("F#2", 42), ("Eb4", 63), ("E2", 40), ("F#4", 66), ("C5", 72),
])
def test_conversoes_obrigatorias(name, midi):
    assert name_to_midi(name) == midi


@pytest.mark.parametrize("name, midi", [
    ("B#3", 60),   # B#3 soa como C4
    ("Cb4", 59),   # Cb4 soa como B3
    ("E#4", 65), ("Fb4", 64),
    ("C##4", 62), ("Cx4", 62), ("Dbb4", 60),
    ("B♭3", 58), ("F♯2", 42), ("bb3", 58), ("eb4", 63), ("f#2", 42),
    ("EB4", 63), ("BB3", 58), ("AB2", 44),
])
def test_grafias_especiais(name, midi):
    assert name_to_midi(name) == midi


def test_enarmonia_mesma_altura_grafia_preservada():
    sharp, flat = parse_note("C#4"), parse_note("Db4")
    assert sharp.midi == flat.midi == 61
    assert sharp.name() == "C#4"
    assert flat.name() == "Db4"
    assert parse_note("B#3").name() == "B#3"
    assert parse_note("Cb4").name() == "Cb4"
    assert parse_note("B♭3").name() == "Bb3"


def test_numero_midi_usa_grafia_padrao():
    assert parse_note("61").name() == "C#4"
    assert parse_note(63).name() == "Eb4"
    assert midi_to_name(70) == "Bb4"
    assert midi_to_name(0) == "C-1"


def test_convencao_c3():
    assert name_to_midi("C3", "C3") == 60
    assert name_to_midi("C4", "C3") == 72
    assert parse_note("Db4").name("C3") == "Db3"
    assert parse_note("F#2", "C3").midi == 54
    assert midi_to_name(60, "C3") == "C3"
    assert midi_to_name(0, "C3") == "C-2"


def test_rename_mantem_alturas():
    assert rename_note_text("F#2 C3 Db4", "C4", "C3") == "F#1 C2 Db3"
    assert rename_note_text(["Eb4", "60", 61], "C4", "C3") == ["Eb3", "60", 61]
    # ficha inválida fica como está
    assert rename_note_text("C4 xyz", "C4", "C3") == "C3 xyz"


@pytest.mark.parametrize("bad", ["H3", "C", "F#", "", "C10", "G#9", "C-2", "128", "Cbbb4", "C4.5"])
def test_erros(bad):
    with pytest.raises(NoteParseError):
        parse_note(bad)


def test_falta_oitava_tem_mensagem_clara():
    with pytest.raises(NoteParseError, match="Falta a oitava"):
        parse_note("Eb")


def test_lista_aceita_varios_separadores():
    assert split_note_list("F#2 – C3") == ["F#2", "C3"]
    assert split_note_list("E3, A3; C4 | E4") == ["E3", "A3", "C4", "E4"]
    assert split_note_list("F#2 - C3") == ["F#2", "C3"]
    assert split_note_list("C-1 C0") == ["C-1", "C0"]
    assert split_note_list(["B2", "A3 D4"]) == ["B2", "A3", "D4"]
    assert split_note_list(None) == []


def test_parse_note_list_coleta_erros_sem_parar():
    notes, errors = parse_note_list("E3 H3 C4 G")
    assert [n.midi for n in notes] == [52, 60]
    assert len(errors) == 2


def test_classe_de_altura():
    assert parse_pitch_class("F#") == 6
    assert parse_pitch_class("Db") == 1
    assert parse_pitch_class("B#") == 0
    assert parse_pitch_class(11) == 11
    with pytest.raises(NoteParseError):
        parse_pitch_class("F#4")


def test_note_fora_do_intervalo():
    with pytest.raises(NoteParseError):
        Note(128)
