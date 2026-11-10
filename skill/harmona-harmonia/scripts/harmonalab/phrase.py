"""Frases melódicas: notas em sequência dentro de um acorde, escritas como numa partitura.

Cada nota é ``NOTA/DURAÇÃO`` e pode levar um papel depois de ``*``::

    G5/8 F5/8 Eb5/4*alvo D5/8 C5/8 B4/4*alvo        (r/8 é uma pausa de colcheia)

A duração é o valor da figura (4 = semínima = 1 tempo, 8 = colcheia, 16 = semicolcheia...), com ``t``
para tercina, ``q`` para quiáltera de cinco e ``.`` para ponto. Quem escreve a frase não calcula onde cada
nota começa: o início de cada uma é a soma das durações anteriores, a partir do começo do acorde.

Este módulo só lê e converte em ticks (não conhece o MIDI nem o modelo). As conferências musicais ficam em
``analysis.py`` e o arquivo .mid, em ``midi_io.py``.

Pontos de extensão (para crescer sem mexer no resto): ``DURATION_MODIFIERS`` (novas divisões), ``ROLE_ALIASES``
e ``SCALE_EXEMPT_ROLES`` (papéis das notas). Qualquer papel é aceito: o que não for conhecido vale como texto livre.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from .pitch import Note, NoteParseError, parse_note, pitch_class_spelling, rename_note_text, split_note_list
from .timing import TICKS_PER_BEAT

WHOLE_NOTE_TICKS = 4 * TICKS_PER_BEAT
DURATION_VALUES = (1, 2, 4, 8, 16, 32, 64)
#: Divisões irregulares: fator = numerador / denominador (tercina = 2/3, quiáltera de cinco = 4/5).
DURATION_MODIFIERS = {"t": (2, 3), "q": (4, 5)}
#: Papéis com outro nome comum → nome canônico (sem acento e em minúsculas).
ROLE_ALIASES = {"aproximacao": "aprox", "approach": "aprox", "target": "alvo"}
#: Papéis cujas notas podem ficar fora da escala declarada da frase.
SCALE_EXEMPT_ROLES = frozenset({"aprox", "passagem", "cromatica", "blue", "outside"})
#: Levada do acorde: que notas do voicing cada toque usa. T = todas, E = mão esquerda e baixo, D = mão direita,
#: B = a nota mais grave, P = a ponta; um número (1 a 9) = a enésima nota a partir do grave (dá a volta se passar).
COMP_PARTS = ("T", "E", "D", "B", "P")
COMP_ACCENT = {"": 0, "!": 16, "?": -24}  # ! = acento, ? = toque leve (somados à velocity)

_SEPARATORS = re.compile(r"[\s,;|]+")
_DURATION_RE = re.compile(r"^(\d+)([tq]?)(\.?)$")
_COMP_TOKEN_RE = re.compile(r"^([TEDBPtedbp]|[1-9]|[rR])([!?]?)$")


class PhraseError(ValueError):
    """Duração ou ficha que não pôde ser lida."""


@dataclass(frozen=True)
class PhraseEvent:
    """Uma nota da frase, já com tempo: ``start`` e ``length`` em ticks depois do início do acorde."""

    note: Note
    start: int
    length: int
    role: str  # "" = sem marca
    token: str  # como foi escrita


def split_phrase(value) -> list[str]:
    """Fichas de uma frase (texto ou lista de textos); separadas por espaço, vírgula, ; ou |."""
    if value is None:
        return []
    text = " ".join(str(v) for v in value) if isinstance(value, (list, tuple)) else str(value)
    return [t for t in _SEPARATORS.split(text.strip()) if t]


def phrase_text(value) -> str:
    """A frase com um espaço só entre as fichas."""
    return " ".join(split_phrase(value))


def normalize_role(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.strip().lower())
    plain = "".join(c for c in decomposed if not unicodedata.combining(c))
    return ROLE_ALIASES.get(plain, plain)


def duration_ticks(text: str) -> int:
    """"8" → 240, "8t" → 160, "4." → 720 (em 480 ticks por semínima). "8+4" liga duas figuras (360 + ... = soma)."""
    if "+" in text:
        return sum(duration_ticks(part) for part in text.split("+"))
    m = _DURATION_RE.match(text.strip().lower())
    if not m or int(m.group(1)) not in DURATION_VALUES:
        raise PhraseError(f'Duração "{text}" não existe: use 1, 2, 4, 8, 16, 32 ou 64 (4 = semínima), '
                          "com t (tercina), q (quiáltera de 5) ou . (ponto).")
    fn, fd = DURATION_MODIFIERS.get(m.group(2), (1, 1))
    dn, dd = (3, 2) if m.group(3) else (1, 1)
    num = WHOLE_NOTE_TICKS * fn * dn
    den = int(m.group(1)) * fd * dd
    if num % den:
        raise PhraseError(f'A duração "{text}" não cai na grade do MIDI ({TICKS_PER_BEAT} ticks por semínima).')
    return num // den


def parse_phrase(value, middle_c: str) -> tuple[list[PhraseEvent], int, list[str]]:
    """Lê a frase. Devolve (notas com tempo, duração total em ticks, erros) sem parar no primeiro erro."""
    events: list[PhraseEvent] = []
    errors: list[str] = []
    tick = 0
    for token in split_phrase(value):
        head, star, role_text = token.partition("*")
        name, slash, dur_text = head.partition("/")
        if not slash or not name or not dur_text:
            errors.append(f'Não entendi "{token}" na frase: escreva NOTA/DURAÇÃO, por exemplo G5/8, ou r/4 para uma pausa.')
            continue
        try:
            length = duration_ticks(dur_text)
        except PhraseError as exc:
            errors.append(f'{exc} (em "{token}")')
            continue
        if star and not role_text.strip():
            errors.append(f'Papel vazio em "{token}": escreva, por exemplo, {name}/{dur_text}*alvo.')
            continue
        if name in ("r", "R"):
            tick += length
            continue
        try:
            note = parse_note(name, middle_c)
        except NoteParseError as exc:
            errors.append(f"Frase: {exc}")
            tick += length
            continue
        events.append(PhraseEvent(note, tick, length, normalize_role(role_text) if star else "", token))
        tick += length
    return events, tick, errors


def parse_scale(value) -> tuple[list[tuple[int, str]], list[str]]:
    """Escala da frase ("B C D Eb F G A") → [(classe de altura, nome)] sem repetir, e os erros."""
    scale: list[tuple[int, str]] = []
    errors: list[str] = []
    for token in split_note_list(value):
        try:
            pc, name = pitch_class_spelling(token)
        except NoteParseError as exc:
            errors.append(f"Escala da frase: {exc}")
            continue
        if all(pc != seen for seen, _ in scale):
            scale.append((pc, name))
    return scale, errors


def rename_phrase_text(value, from_middle_c: str, to_middle_c: str):
    """Reescreve as notas da frase para outra convenção de oitava, sem mudar as alturas."""
    if value is None or not isinstance(value, (str, list, tuple)):
        return value
    out = []
    for token in split_phrase(value):
        head, star, role = token.partition("*")
        name, slash, dur = head.partition("/")
        if slash and name and name not in ("r", "R"):
            name = rename_note_text(name, from_middle_c, to_middle_c)
        out.append(f"{name}{slash}{dur}{star}{role}")
    return " ".join(out)


# ---------------------------------------------------------------------------
# Levada do acorde ("comp"): o ritmo em que as notas do voicing são tocadas.
#
#   "E/4 D/8 D/8 E/4 D/4"              um toque depois do outro (E = esquerda, D = direita, T = todas...)
#   "B/4. B/8+2 ; r/8 D/8 r/4 D/4."    camadas separadas por ";" soam ao mesmo tempo (baixo + mão direita)
#
# Cada camada se repete até o fim do acorde e é cortada onde ele acaba. As durações são as mesmas da frase.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CompHit:
    part: str  # "T", "E", "D", "B", "P" ou "1".."9"
    start: int  # ticks depois do início da camada
    length: int
    accent: int  # somado à velocity do acorde


def split_comp(value) -> list[list[str]]:
    """Camadas (separadas por ";") e, em cada uma, as fichas."""
    if value is None:
        return []
    text = " ; ".join(str(v) for v in value) if isinstance(value, (list, tuple)) else str(value)
    layers = [[t for t in re.split(r"[\s,|]+", layer.strip()) if t] for layer in text.split(";")]
    return [layer for layer in layers if layer]


def comp_text(value) -> str:
    return " ; ".join(" ".join(layer) for layer in split_comp(value))


def parse_comp(value) -> tuple[list[tuple[list[CompHit], int]], list[str]]:
    """Lê a levada. Devolve ([(toques da camada, duração da camada em ticks)], erros)."""
    layers: list[tuple[list[CompHit], int]] = []
    errors: list[str] = []
    for tokens in split_comp(value):
        hits: list[CompHit] = []
        tick = 0
        for token in tokens:
            head, slash, dur_text = token.partition("/")
            m = _COMP_TOKEN_RE.match(head)
            if not slash or not dur_text or not m:
                errors.append(f'Não entendi "{token}" na levada: escreva PARTE/DURAÇÃO, por exemplo E/4, D/8, T!/8 (acento) ou r/8 (pausa). '
                              "Partes: T (todas), E (esquerda), D (direita), B (baixo), P (ponta) ou 1 a 9 (a enésima nota).")
                continue
            try:
                length = duration_ticks(dur_text)
            except PhraseError as exc:
                errors.append(f'{exc} (em "{token}")')
                continue
            part = m.group(1).upper()
            if part != "R":
                hits.append(CompHit(part, tick, length, COMP_ACCENT[m.group(2)]))
            tick += length
        if tick > 0:
            layers.append((hits, tick))
    return layers, errors
