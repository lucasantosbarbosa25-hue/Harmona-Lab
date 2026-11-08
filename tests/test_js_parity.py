"""O motor do navegador (JavaScript) precisa dar exatamente o mesmo resultado que o Python.

O app instalável roda sozinho no celular com harmonalab/web/engine/*.js. Este teste roda esse
código no Node e compara, caso a caso, a análise, a troca de convenção e os BYTES do .mid.
Sem Node.js instalado, o teste é pulado.
"""

import base64
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from harmonalab.analysis import analyze_data
from harmonalab.midi_io import midi_bytes
from harmonalab.model import load_project, rename_project_notes

from .test_midi_io import PROGRESSAO

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="Node.js não instalado")
HERE = Path(__file__).parent
EXAMPLE = json.loads((HERE.parent / "examples" / "resolucao_em_fsharp_ponta.json").read_text(encoding="utf-8"))

CASES = [
    EXAMPLE,
    PROGRESSAO,
    {},
    {"chords": []},
    {"chords": None},
    {"chords": [{}, {"symbol": "Pausa"}]},
    # durações, tempos e fórmulas de compasso
    {"tempo": 92.5, "chords": [{"right_hand": "C4 E4 G4", "duration_beats": 1 / 3}] * 3 + [{"right_hand": "D4", "duration_beats": 1.5}]},
    {"tempo": "87", "time_signature": "7/8", "chords": [{"right_hand": "C4"}, {"right_hand": "D4", "duration_bars": 2}]},
    {"tempo": 137.3, "time_signature": [6, 8], "chords": [{"notes": "C4 E4", "duration_beats": "2,5"}]},
    {"time_signature": "12/8", "chords": [{"right_hand": "C4", "duration_beats": 0.003125}]},  # 1,5 tick
    {"time_signature": "5/4", "chords": [{"right_hand": "C4", "duration_beats": 0.0052083333333333333}]},  # 2,5 ticks
    {"tempo": 10, "chords": [{"right_hand": "C4", "duration_beats": 0.3}]},
    {"tempo": 999, "chords": [{"right_hand": "C4", "duration_beats": 1024}]},
    # grafias, convenções e números MIDI
    {"middle_c": "C3", "chords": [{"left_hand": "F#1 C2", "right_hand": ["E2", "A2", "C3", "E3"], "top_note": "E3"}]},
    {"chords": [{"right_hand": "B#3 Cb4 C##4 Dbb4 E#4 Fb4 Cx5 B♭3 F♯2 EB4 bb3 eb2"}]},
    {"chords": [{"notes": ["60", 61, 62.0, "C-1", "G9"], "bass": 36}]},
    {"chords": [{"left_hand": "F#2 – C3", "right_hand": "E3, A3; C4 | E4", "omitted": "5, B", "comment": "x"}]},
    {"chords": [{"left_hand": ["B2", "A3 D4"], "right_hand": "Eb4 G4 C5"}]},
    # avisos musicais
    {"chords": [{"left_hand": "C3 E4", "right_hand": "D4 E4 C#5 Db5"}]},
    {"chords": [{"right_hand": "D4 G4 F#4", "top_note": "F#4"}, {"right_hand": "D4 E4", "top_note": " F#4 "}]},
    {"chords": [{"right_hand": "D4 A4 B4 F#4", "top_note": "F#4"}]},
    {"chords": [{"bass": "E3", "left_hand": "C3 G3", "right_hand": "C4 G5 A5"}]},
    {"chords": [{"left_hand": "C1 G2", "right_hand": "C4 E6", "notes": "A0 C8 G#8"}]},
    {"default_velocity": "64", "chords": [{"right_hand": "C4", "velocity": "90"}, {"right_hand": "D4", "velocity": ""}]},
    # títulos e símbolos com caracteres especiais (marcadores latin-1)
    {"title": "Resolução B7alt → Em 🎹", "chords": [{"symbol": "F△7(#11) ♭9 – teste “x”", "right_hand": "F3 A3 E4"},
                                                     {"symbol": "C𝄪 𝄫 ♮ ’ —", "right_hand": "C4"}]},
    {"title": "", "chords": [{"symbol": "   ", "right_hand": "C4"}]},
    # strum: direções, atrasos, arredondamentos (meio tick), andamentos e compassos diferentes
    {"strum": {"direction": "up", "delay_ms": 20}, "chords": [{"right_hand": "E3 G3 B3 D4 F#4"}, {"right_hand": "C4 E4 G4"}]},
    {"strum": {"direction": "down", "delay_ms": 30}, "tempo": 137.3, "chords": [{"left_hand": "E2 B2 D3", "right_hand": "G3 F#4"}]},
    {"strum": {"direction": "up", "delay_ms": 10}, "tempo": 60, "chords": [{"notes": "C4 D4 E4 F4 G4 A4 B4 C5"}]},
    {"strum": {"direction": "up", "delay_ms": 12.5}, "tempo": 75, "chords": [{"notes": "C4 E4 G4 B4"}]},  # passos de 0,5 tick
    {"strum": {"direction": "up"}, "tempo": 999, "chords": [{"notes": "C3 E3 G3 B3 D4"}]},  # atraso padrão (20 ms)
    {"strum": {"direction": "off", "delay_ms": 50}, "chords": [{"notes": "C4 E4 G4"}]},
    {"strum": {"direction": "up", "delay_ms": 20}, "chords": [
        {"notes": "C4 E4 G4", "strum": "off"}, {"notes": "C4 E4 G4", "strum": "down"}, {"notes": "C4 E4 G4", "strum": ""},
        {"notes": "C4", "strum": "up"}, {"strum": "up"}]},
    {"chords": [{"notes": "C4 E4 G4", "strum": "down", "duration_beats": 1}, {"notes": "D4 F4 A4", "strum": "up"}]},
    {"strum": {"direction": "up", "delay_ms": 250}, "tempo": 40, "chords": [{"notes": "C4 E4 G4 B4 D5", "duration_beats": 0.5}]},  # comprimido
    {"strum": {"direction": "down", "delay_ms": 30}, "time_signature": "6/8", "chords": [{"notes": "C4 E4 G4", "duration_beats": 0.05}]},  # comprimido
    {"strum": {"direction": "up", "delay_ms": 20}, "chords": [{"notes": "C4 E4 G4", "duration_beats": 0.002}]},  # 1 tick
    {"strum": {"direction": "up", "delay_ms": 20}, "chords": [{"notes": "C4 E4 G4"}, {"notes": "C4 E4 G4"}]},  # nota comum reatacada
    # duração menor que meio tick: erro (a nota ficaria presa)
    {"chords": [{"notes": "C4", "duration_beats": 0.0004}, {"notes": "D4", "duration_beats": 0.001}]},
    # tom, referências, função e escala (só informativos)
    {"key": " Em ", "references": ["Jesús Molina", " Dirty Loops ", "", 5, None], "chords": [{"notes": "E3 G3 B3", "function": "i7", "scale": " Eólio "}]},
    {"key": 5, "references": "Domi & JD Beck, Stevie Wonder; Ed Motta", "chords": [{"notes": "C4", "function": 3, "scale": ["x"]}]},
    {"references": {"a": 1}, "chords": [{"notes": "C4"}]},
    # erros
    {"strum": 5, "chords": [{"notes": "C4 E4", "strum": "sideways"}]},
    {"strum": "down", "chords": [{"notes": "C4 E4 G4"}]},  # atalho: só a direção
    {"strum": "diagonal", "chords": [{"notes": "C4 E4 G4"}]},
    {"strum": {"direction": "left", "delay_ms": 0}, "chords": [{"notes": "C4 E4", "strum": 7}]},
    {"strum": {"direction": 3, "delay_ms": "rápido"}, "chords": [{"notes": "C4 E4", "strum": ["up"]}]},
    {"strum": {"direction": "up", "delay_ms": 251.5}, "chords": [{"notes": "C4 E4"}]},
    {"strum": {"direction": "up", "delay_ms": "30"}, "chords": [{"notes": "C4 E4 G4"}]},
    {"strum": {"direction": "up", "delay_ms": "15,5"}, "chords": [{"notes": "C4 E4 G4"}]},
    {"strum": [], "chords": [{"notes": "C4"}]},
    {"strum": True, "chords": [{"notes": "C4"}]},
    # erros
    {"tempo": 0, "time_signature": "4/3", "middle_c": "C5", "default_velocity": 200,
     "chords": [{"left_hand": "H2 C3", "right_hand": "E", "duration_beats": -1, "velocity": 0, "top_note": "X"}, "texto"]},
    {"tempo": "rápido", "time_signature": "4/4/4", "chords": [{"right_hand": [60.5, {"x": 1}, None, True], "top_note": ["F#4"]}]},
    {"time_signature": "x", "chords": [{"right_hand": "C10 G#9 C-2 128 Cbbb4 C4.5 Eb", "duration_bars": 0}]},
    {"time_signature": [33, 4], "chords": "não é lista"},
    {"time_signature": "4/5", "middle_c": ["C4"], "chords": [{"right_hand": "C4", "velocity": 80.5, "duration_beats": "abc"}]},
    {"tempo": "inf", "chords": [{"right_hand": 60.5}]},
    {"tempo": 3.5, "chords": [{"right_hand": "C4"}]},
]


@pytest.fixture(scope="module")
def js_results():
    proc = subprocess.run([NODE, str(HERE / "js_engine_runner.mjs")], input=json.dumps(CASES),
                          capture_output=True, text=True, check=True, cwd=HERE)
    return json.loads(proc.stdout)


@pytest.mark.parametrize("index", range(len(CASES)))
def test_mesma_analise_e_mesmo_midi(index, js_results):
    data = CASES[index]
    js = js_results[index]
    expected = json.loads(json.dumps(analyze_data(data)))
    assert js["report"] == expected
    if expected["ok"]:
        python_bytes = midi_bytes(load_project(data)[0])
        assert base64.b64decode(js["midi"]) == python_bytes
    else:
        assert js["midi"] is None
    if isinstance(data, dict):
        assert js["renamed"] == rename_project_notes(data, "C3")


def test_casos_cobrem_erros_e_sucessos(js_results):
    oks = [r["report"]["ok"] for r in js_results]
    assert sum(oks) >= 25 and oks.count(False) >= 11
