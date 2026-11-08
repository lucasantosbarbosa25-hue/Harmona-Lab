"""Tempo em ticks e atraso do strum: a parte do MIDI que não depende da biblioteca ``mido``.

Fica separado para a análise (e a skill, que leva uma cópia do motor) funcionar sem instalar nada.
"""

from __future__ import annotations

TICKS_PER_BEAT = 480


def beats_to_ticks(beats: float, ticks_per_beat: int = TICKS_PER_BEAT) -> int:
    return int(round(beats * ticks_per_beat))


def strum_plan(count: int, delay_ms: float, tempo: float, length: int,
               ticks_per_beat: int = TICKS_PER_BEAT) -> tuple[list[int], bool]:
    """Quando cada nota de um strum entra, em ticks depois do início do acorde.

    A 1ª nota entra no tempo e cada seguinte ``delay_ms`` depois da anterior. O fim do acorde não muda.
    O strum ocupa no máximo metade do acorde: se não couber, o espaço entre as notas encolhe.
    Devolve (deslocamentos na ordem em que as notas entram, se precisou encolher).
    """
    if count < 2 or delay_ms <= 0:
        return [0] * count, False
    step = delay_ms * tempo * ticks_per_beat / 60000
    limit = length / 2
    compressed = (count - 1) * step > limit
    if compressed:
        step = limit / (count - 1)
    return [int(round(i * step)) for i in range(count)], compressed
