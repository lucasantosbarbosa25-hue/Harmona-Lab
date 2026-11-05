import itertools

import pytest

from harmonylab.pitch import name_to_midi
from harmonylab.voicing import voice_under_top

PCS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def test_em9_com_fsharp4_no_topo():
    assert voice_under_top(["E", "G", "B", "D", "F#"], "F#4") == [55, 59, 62, 64, 66]  # G3 B3 D4 E4 F#4
    assert voice_under_top(["E", "G", "B", "D", "F#"], "F#4", bass="E") == [52, 55, 59, 62, 64, 66]


def test_top_fsharp5_nunca_e_ultrapassado():
    """Teste obrigatório: com top_note = F#5, nenhuma nota gerada passa de F#5."""
    top = name_to_midi("F#5")
    for size in range(1, 7):
        for chord in itertools.combinations(PCS, size):
            for bass in (None, "E", "C", "F#"):
                voicing = voice_under_top(chord, "F#5", bass=bass)
                assert max(voicing) == top, (chord, bass)
                assert top in voicing
                assert all(p <= top for p in voicing)


@pytest.mark.parametrize("top", ["C4", "F#4", "Bb5", "E6", "G2"])
def test_soprano_sempre_presente_e_mais_agudo(top):
    voicing = voice_under_top(["B", "C", "D", "Eb", "F", "G", "A"], top)
    assert voicing[-1] == name_to_midi(top)
    assert len(voicing) == len(set(voicing))


def test_limite_grave():
    with pytest.raises(ValueError):
        voice_under_top(["C", "E", "G"], "C1", bass="F", low_limit=24)
