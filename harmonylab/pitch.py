"""Notas, alturas MIDI e convenções de oitava.

Representação canônica: o número MIDI (0–127). A grafia original (letra +
acidente) é guardada à parte, só para exibição: C#4 e Db4 têm o mesmo número
MIDI (61), mas continuam sendo exibidas como o usuário escreveu.

Convenção de oitava ("middle_c"): como se chama o MIDI 60 (dó central).
  - "C4": padrão científico (MIDI 60 = C4). Padrão deste programa.
  - "C3": padrão Yamaha, usado por Ableton Live, Studio One e Cubase (MIDI 60 = C3).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

MIDI_MIN = 0
MIDI_MAX = 127

#: Convenções aceitas → deslocamento de oitava (oitava = midi // 12 + deslocamento).
MIDDLE_C_OFFSETS = {"C4": -1, "C3": -2}
DEFAULT_MIDDLE_C = "C4"

LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# Grafia usada quando a nota chega como número MIDI (sem grafia original).
DEFAULT_SPELLING = [
    ("C", 0), ("C", 1), ("D", 0), ("E", -1), ("E", 0), ("F", 0),
    ("F", 1), ("G", 0), ("A", -1), ("A", 0), ("B", -1), ("B", 0),
]

_ACCIDENTAL_SYMBOLS = {
    "#": 1, "♯": 1, "b": -1, "B": -1, "♭": -1,
    "x": 2, "𝄪": 2, "𝄫": -2, "♮": 0,
}
_ACCIDENTAL_TEXT = {-2: "bb", -1: "b", 0: "", 1: "#", 2: "##"}

# "B" maiúsculo depois da letra também é bemol ("EB4" = Eb4), comum quando o
# teclado do celular capitaliza sozinho.
_NOTE_RE = re.compile(r"^([A-Ga-g])([#♯bB♭x𝄪𝄫♮]*)(-?\d+)$")
_MIDI_RE = re.compile(r"^\d{1,3}$")
_PITCH_CLASS_RE = re.compile(r"^([A-Ga-g])([#♯bB♭x𝄪𝄫♮]*)$")

# Separadores aceitos numa lista de notas: espaço, vírgula, ponto e vírgula,
# barra vertical, travessões (– —) e hífen isolado ("F#2 - C3").
_LIST_SPLIT_RE = re.compile(r"[\s,;|–—]+")


class NoteParseError(ValueError):
    """Texto que não pôde ser lido como nota."""


def check_middle_c(middle_c: str) -> str:
    if middle_c not in MIDDLE_C_OFFSETS:
        opts = " ou ".join(f'"{k}"' for k in MIDDLE_C_OFFSETS)
        raise ValueError(f'Convenção de oitava desconhecida: "{middle_c}". Use {opts}.')
    return middle_c


@dataclass(frozen=True)
class Note:
    """Uma nota concreta: altura MIDI + grafia opcional.

    ``letter``/``accidental`` guardam a grafia original (ex.: Db4 → "D", -1).
    Quando a nota chega como número MIDI, ficam ``None``/0 e a exibição usa
    a grafia padrão.
    """

    midi: int
    letter: str | None = None
    accidental: int = 0

    def __post_init__(self) -> None:
        if not MIDI_MIN <= self.midi <= MIDI_MAX:
            raise NoteParseError(f"Altura MIDI fora do intervalo 0–127: {self.midi}")

    @property
    def pitch_class(self) -> int:
        return self.midi % 12

    @property
    def spelling(self) -> tuple[str, int]:
        if self.letter is None:
            return DEFAULT_SPELLING[self.pitch_class]
        return self.letter, self.accidental

    def pitch_class_name(self) -> str:
        letter, acc = self.spelling
        return letter + _ACCIDENTAL_TEXT[acc]

    def name(self, middle_c: str = DEFAULT_MIDDLE_C) -> str:
        """Nome com oitava na convenção pedida, preservando a grafia."""
        offset = MIDDLE_C_OFFSETS[check_middle_c(middle_c)]
        letter, acc = self.spelling
        # A oitava acompanha a letra: B#3 = MIDI 60 e Cb4 = MIDI 59 (C4 = 60).
        octave = (self.midi - LETTER_PC[letter] - acc) // 12 + offset
        return f"{letter}{_ACCIDENTAL_TEXT[acc]}{octave}"

    def __str__(self) -> str:  # pragma: no cover - conveniência
        return self.name()


def _parse_accidentals(text: str, original: str) -> int:
    total = 0
    for ch in text:
        total += _ACCIDENTAL_SYMBOLS[ch]
    if not -2 <= total <= 2:
        raise NoteParseError(f'Acidentes demais em "{original}" (máximo: dobrado).')
    return total


def parse_note(token: str | int, middle_c: str = DEFAULT_MIDDLE_C) -> Note:
    """Lê "C4", "Eb3", "F#2", "Bb-1", "B♭3" ou um número MIDI ("60" ou 60)."""
    check_middle_c(middle_c)
    if isinstance(token, bool):
        raise NoteParseError(f"Nota inválida: {token!r}")
    if isinstance(token, int):
        return Note(token)
    original = str(token)
    text = original.strip()
    if not text:
        raise NoteParseError("Nota vazia.")
    if _MIDI_RE.match(text):
        value = int(text)
        if value > MIDI_MAX:
            raise NoteParseError(f'"{original}" está fora do intervalo MIDI 0–127.')
        return Note(value)
    m = _NOTE_RE.match(text)
    if not m:
        if _PITCH_CLASS_RE.match(text):
            raise NoteParseError(
                f'Falta a oitava em "{original}" — escreva, por exemplo, {text.upper()[0]}{text[1:]}3.'
            )
        raise NoteParseError(
            f'Não entendi "{original}". Use nomes como C4, F#2, Eb3 ou números MIDI (0–127).'
        )
    letter = m.group(1).upper()
    accidental = _parse_accidentals(m.group(2), original)
    octave = int(m.group(3))
    midi = (octave - MIDDLE_C_OFFSETS[middle_c]) * 12 + LETTER_PC[letter] + accidental
    if not MIDI_MIN <= midi <= MIDI_MAX:
        raise NoteParseError(
            f'"{original}" fica fora do intervalo MIDI 0–127 (seria {midi}) na convenção {middle_c} = MIDI 60.'
        )
    return Note(midi, letter, accidental)


def parse_pitch_class(token: str | int) -> int:
    """Classe de altura sem oitava: "F#" → 6, "Db" → 1, 11 → 11."""
    if isinstance(token, int) and not isinstance(token, bool):
        if not 0 <= token <= 11:
            raise NoteParseError(f"Classe de altura deve ficar entre 0 e 11 (recebido {token}).")
        return token
    text = str(token).strip()
    m = _PITCH_CLASS_RE.match(text)
    if not m:
        raise NoteParseError(f'Não entendi a nota "{token}" (sem oitava, ex.: F#, Eb, B).')
    return (LETTER_PC[m.group(1).upper()] + _parse_accidentals(m.group(2), text)) % 12


def split_note_list(value: str | int | Iterable[str | int] | None) -> list[str | int]:
    """Divide um texto de notas em fichas; listas passam direto."""
    if value is None:
        return []
    if isinstance(value, (int, str)) and not isinstance(value, bool):
        if isinstance(value, int):
            return [value]
        return [t for t in _LIST_SPLIT_RE.split(value.strip()) if t and t != "-"]
    tokens: list[str | int] = []
    for item in value:
        if isinstance(item, str):
            tokens.extend(split_note_list(item))
        else:
            tokens.append(item)
    return tokens


def parse_note_list(
    value: str | int | Iterable[str | int] | None, middle_c: str = DEFAULT_MIDDLE_C
) -> tuple[list[Note], list[str]]:
    """Lê várias notas. Devolve (notas válidas, mensagens de erro) sem interromper."""
    notes: list[Note] = []
    errors: list[str] = []
    for token in split_note_list(value):
        try:
            notes.append(parse_note(token, middle_c))
        except NoteParseError as exc:
            errors.append(str(exc))
    return notes, errors


def midi_to_name(midi: int, middle_c: str = DEFAULT_MIDDLE_C) -> str:
    return Note(midi).name(middle_c)


def name_to_midi(name: str, middle_c: str = DEFAULT_MIDDLE_C) -> int:
    return parse_note(name, middle_c).midi


def rename_note_text(value, from_middle_c: str, to_middle_c: str):
    """Reescreve nomes de notas para outra convenção sem mudar as alturas MIDI.

    Aceita texto ("F#2 C3") ou lista. Fichas que não são notas válidas, e
    números MIDI, ficam como estão.
    """
    check_middle_c(from_middle_c)
    check_middle_c(to_middle_c)

    def convert(token):
        if isinstance(token, int) or (isinstance(token, str) and _MIDI_RE.match(token.strip())):
            return token
        try:
            return parse_note(token, from_middle_c).name(to_middle_c)
        except NoteParseError:
            return token

    if value is None:
        return None
    if isinstance(value, str):
        return " ".join(str(convert(t)) for t in split_note_list(value))
    if isinstance(value, int):
        return value
    return [convert(t) for t in split_note_list(value)]
