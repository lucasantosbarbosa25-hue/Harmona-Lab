"""Geração automática de voicings — base da Fase 3 ("Lock Top Note").

Por enquanto há uma única função, propositalmente simples: monta um voicing
fechado com a nota do soprano travada. Ela garante as duas regras que todo
gerador futuro (inversões, drops, condução de vozes) também terá de cumprir:

  1. o soprano travado está presente;
  2. nenhuma nota gerada fica acima dele.

Notas digitadas à mão nunca passam por aqui: elas são exportadas como estão.
"""

from __future__ import annotations

from typing import Iterable

from .pitch import DEFAULT_MIDDLE_C, Note, parse_note, parse_pitch_class


def voice_under_top(
    pitch_classes: Iterable[str | int],
    top: str | int | Note,
    *,
    bass: str | int | None = None,
    low_limit: int | None = None,
    middle_c: str = DEFAULT_MIDDLE_C,
) -> list[int]:
    """Voicing fechado abaixo de um soprano travado.

    ``pitch_classes``: notas do acorde sem oitava ("E", "G", "B", "D", "F#").
    ``top``: soprano com oitava ("F#4"), número MIDI ou ``Note``.
    ``bass``: classe de altura opcional, colocada abaixo de todas as vozes.
    ``low_limit``: altura MIDI mínima permitida (``ValueError`` se violada).

    Cada classe de altura ocupa a posição mais aguda possível abaixo do
    soprano (dentro de uma oitava). Devolve alturas MIDI em ordem crescente.
    """
    top_note = top if isinstance(top, Note) else parse_note(top, middle_c)
    top_midi = top_note.midi
    voices = {top_midi}
    for pc in pitch_classes:
        p = parse_pitch_class(pc)
        if p == top_note.pitch_class:
            continue
        voices.add(top_midi - (top_note.pitch_class - p) % 12)
    if bass is not None:
        lowest = min(voices)
        gap = (lowest % 12 - parse_pitch_class(bass)) % 12 or 12
        voices.add(lowest - gap)
    result = sorted(voices)
    if result[0] < 0 or (low_limit is not None and result[0] < low_limit):
        raise ValueError("O voicing gerado desce abaixo do limite grave permitido.")
    return result
