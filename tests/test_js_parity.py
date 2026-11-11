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
    # frases: notação NOTA/DURAÇÃO*papel, duas vozes (acorde no canal 1 e frase no canal 2), conferências
    {"style": " Neo-soul ", "tempo": 76, "chords": [
        {"symbol": "B7alt", "duration_beats": 4, "left_hand": "B2 A3", "right_hand": "D4 Eb4 G4 C5", "comment": "dominante",
         "phrase": "G5/8 F5/8 Eb5/4*alvo D5/8 C5/8 B4/4*alvo", "phrase_scale": "B C D Eb F G A"},
        {"symbol": "Em9", "duration_beats": 4, "left_hand": "E2 B2 D3", "right_hand": "G3 F#4",
         "phrase": "F#5/8 F5/8*aprox E5/4*alvo r/4 G5/4*ALVO", "phrase_scale": ["E", "F#", "G", "A", "B", "C", "D"]}]},
    {"chords": [{"notes": "C4 E4 G4", "duration_beats": 2, "phrase": "C5/8t E5/8t G5/8t C6/4. r/16 B5/16 A5/16q G5/16q"}]},  # tercinas, ponto, quiálteras
    {"chords": [{"notes": "C4 E4 G4", "duration_beats": 1, "phrase": ["C5/32", "D5/32", "E5/32", "F5/32", "G5/32", "A5/32", "B5/32", "C6/32"]}]},
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/16, D5/16; E5/16 | F5/16 G5/4*Passagem A5/8*cromática B5/8*Blue"}]},  # separadores e papéis livres
    {"middle_c": "C3", "chords": [{"left_hand": "E1", "right_hand": "E2 G2 B2", "phrase": "B3/8 Eb4/8*aprox E4/4*alvo", "phrase_scale": "E F# G A B"}]},
    {"strum": {"direction": "up", "delay_ms": 20}, "chords": [{"left_hand": "C3", "right_hand": "E3 G3 B3", "phrase": "B4/4 C5/4*alvo D5/2"}]},
    {"chords": [{"phrase": "C5/4 D5/4"}, {"notes": "C4", "duration_beats": 2, "phrase": "r/2"}]},  # frase sem acorde e frase só de pausas
    # frases: avisos
    {"chords": [{"left_hand": "C3", "right_hand": "E3 G3 B3", "phrase": "D5/8 E5/8*alvo F5/8*alvo", "phrase_scale": "C D E F G A B"}]},  # alvo fora do tempo
    {"chords": [{"left_hand": "C3", "right_hand": "E3 G3 B3", "phrase": "D5/4*alvo", "phrase_scale": "C D E F G A B"}]},  # alvo que não é do acorde
    {"chords": [{"notes": "C4 E4 G4", "phrase": "A4/4*aprox C5/4 D5/4*aprox Eb5/8*aprox F5/8"}]},  # aproximações que não resolvem
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/4 B4/2*aprox"}, {"notes": "C4 E4 G4"}]},  # última nota aprox: confere o próximo acorde
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/4 D5/2*aprox"}, {"notes": "C4 E4 G4"}]},
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/4 D5/2*aprox"}, {}]},  # próximo acorde é pausa
    {"chords": [{"notes": "C4 E4 G4", "phrase": "F5/8*aprox E5/8*aprox Eb5/8*aprox D5/8*alvo"}]},  # sequência de aproximações
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C2/8 D5/8 C7/8 C8/4"}]},  # fora da tessitura
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/8 Db5/8 Eb5/8 F#5/8 Db5/8", "phrase_scale": "C D E F G"}]},  # fora da escala e acorde fora dela
    {"chords": [{"notes": "C4 E4 G4 Bb4", "phrase": "C5/8", "phrase_scale": "C D E F"}]},  # várias notas do acorde fora da escala
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/8 D5/8", "phrase_scale": "C C c D E E F G G A B"}]},  # escala com repetição
    # frases: erros
    {"chords": [{"notes": "C4", "duration_beats": 1, "phrase": "C5/4 D5/4"}]},  # mais longa que o acorde
    {"chords": [{"notes": "C4", "duration_beats": 4, "phrase": "C5 D5/9 E5/4. F5/5q G5/7 H5/8 C/8 C5/ /8 C5/8* C5/4t.x r/3 C5/0"}]},
    {"chords": [{"notes": "C4", "phrase": {"x": 1}, "phrase_scale": {"y": 2}}, {"notes": "C4", "phrase": 5, "phrase_scale": 7}]},
    {"chords": [{"notes": "C4", "phrase": "C5/8", "phrase_scale": "C D H4 5 E"}]},
    {"chords": [{"notes": "C4", "phrase": "C5/1 C5/2"}]},  # 1 e 2 cabem só num acorde longo
    {"chords": [{"notes": "C4", "duration_beats": 8, "phrase": "C5/1 C5/2 C5/1t C5/64 C5/64q C5/64t."}]},
    {"style": 5, "chords": [{"notes": "C4", "phrase": ""}]},
    # levada do acorde (comp): partes, camadas, acentos, ligaduras, repetição até o fim do acorde e corte no fim
    {"chords": [{"left_hand": "C2 G2", "right_hand": "E3 G3 B3 D4", "comp": "E/4 D/8 D/8 E/4 D!/4", "phrase_color": " outside "}]},
    {"chords": [{"bass": "C2", "left_hand": "G2 E3", "right_hand": "B3 D4 G4", "duration_beats": 8,
                 "comp": "B/4. B/8+2 ; r/8 D/8 r/4 D?/4. D/8", "phrase": "G5/4 A5/4*passagem B5/2", "phrase_scale": "C D E G A B"}]},
    {"chords": [{"notes": "C4 E4 G4 B4", "comp": "1/16 2/16 3/16 4/16 5/16 9/16 P/8 B/8 T/8t T/8t T/8t", "duration_beats": 3}]},
    {"chords": [{"left_hand": "C3", "right_hand": "E4 G4", "comp": "T/2 ; T/4 ; B/8 P/8", "duration_beats": 2.5}]},  # teclas repetidas entre camadas
    {"strum": {"direction": "up", "delay_ms": 20}, "chords": [{"left_hand": "C3 G3", "right_hand": "E4 G4 B4", "comp": "E/4 D/4 T/2"},
                                                               {"left_hand": "C3 G3", "right_hand": "E4 G4 B4", "comp": "T/8", "strum": "down", "duration_beats": 1}]},
    {"default_velocity": 120, "chords": [{"notes": "C4 E4", "comp": "T!/4 T?/4 T/4", "velocity": 10}, {"notes": "C4 E4", "comp": "T!/1"}]},
    {"chords": [{"comp": "T/4 D/4"}, {"notes": "C4", "comp": "r/4 ; ; r/8"}, {"notes": "C4", "comp": ["T/8", "r/8 B/8"]}]},  # pausa, só pausas, lista
    {"chords": [{"notes": "C4 E4", "comp": "T/8t+4 T/4.+16 r/8+8"}]},  # ligaduras
    {"chords": [{"notes": "C4", "comp": "X/4 T T/9 T/ /4 E!!/4 0/4 10/4 r!/4 T/4+x"}, {"notes": "C4", "comp": {"a": 1}}, {"notes": "C4", "comp": 3}]},  # erros
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/8+8 D5/4+4t E5/8t+8t*alvo", "phrase_scale": "C D E G"}]},  # ligaduras na frase
    {"chords": [{"notes": "C4 E4 G4", "phrase": "C5/4 Db5/4*outside", "phrase_scale": "C D E G"}]},  # outside não é cobrado na escala
    # levada com graus da escala (ostinatos e riffs): a partir do baixo (S) e da mão direita (M), com e sem escala
    {"chords": [{"left_hand": "C2 G2", "right_hand": "E4 G4 Bb4", "phrase_scale": "C D E F G A Bb",
                 "comp": "S1/8 S1/8 S5/8 S5/8 S6/8 S6/8 S7/8 S8/8 ; M1/4 M2/4 M3!/4 M9?/4"}]},
    {"chords": [{"left_hand": "C2 G2", "right_hand": "E4 G4 Bb4", "comp": "S1/4 S2/4 S3/4 S9/4 ; m1/8 m2/8 m5/2."}]},  # sem escala: notas do acorde
    {"chords": [{"left_hand": "Db3", "phrase_scale": "C D E", "comp": "S1/4 S2/4 M1/4 M3/4"}, {"notes": "G9", "comp": "S5/4 M9/4"}]},  # baixo fora da escala; sem mão direita; teto do MIDI
    {"chords": [{"notes": "C4", "comp": "S0/4 M10/4 S/4 Sx/4"}]},
    # bateria (canal 10, faixa própria): camadas, compassos que se repetem, acentos, corte no fim e outros compassos
    {"drums": "H/8 H?/8 H/8 H?/8 H/8 H?/8 H/8 H?/8 ; K/4 r/4 K/8 K/8 r/4 ; r/4 S!/4 r/4 S!/4", "chords": [{"notes": "C4 E4", "duration_beats": 8}]},
    {"drums": "K/4 S/4 | K/8 K/8 S/4 ; C!/1 | r/2 T/8 M/8 F/8 F!/8", "tempo": 132, "chords": [{"notes": "C4"}, {"notes": "D4", "duration_beats": 6.5}],
     "default_velocity": 110},
    {"drums": ["K/4", "S/4 ; H/8t H/8t H/8t"], "time_signature": "3/4", "chords": [{"notes": "C4", "phrase": "C5/4 D5/4", "comp": "T/8"}, {"symbol": "Pausa"}]},
    {"drums": "K/1 ; K/2 ; K/4 X/4", "time_signature": "6/8", "chords": [{"notes": "C4", "duration_beats": 5}]},  # mesma peça em camadas
    {"drums": "r/4 | ; | K/4+8 Q/16q N/8. G/8 A/8 L/8 B/8 E/8 O/8 P/8 R/8", "chords": [{"duration_beats": 4}, {"notes": "C4"}]},
    {"drums": "Z/4 K K/9 k/4 R!!/4 r!/4 KS/4 K/4+x", "chords": [{"notes": "C4"}]},
    {"drums": "H!!/8 H??/8 H/8 H?/8 O!/8 H??/8 R!!/8 H/8 ; K/4 S??/8 S??/8 S!!/4 r/4", "chords": [{"notes": "C4 E4", "comp": "T!!/8 D??/8 B?/4 E!/2"}]},  # níveis de dinâmica
    {"drums": "H!?/4 H???/4 S!!!/4", "chords": [{"notes": "C4"}]},  # combinações que não existem
    {"drums": {"a": 1}, "chords": [{"notes": "C4"}]},
    {"drums": 5, "chords": [{"notes": "C4"}]},
    {"drums": " | ; ", "chords": [{"notes": "C4"}]},
    # linha de baixo (canal 3, faixa própria), com e sem frase e bateria, erros e troca de oitava
    {"chords": [{"left_hand": "E3 B3", "right_hand": "D4 F#4", "bass_line": "E1/4. B1/8+4 E2/8 D2/8"}, {"notes": "A3 C4", "bass_line": ["A1/2", "r/4 G1/8*aprox G#1/8*aprox"]}]},
    {"drums": "K/4 S/4", "chords": [{"notes": "C4 E4", "phrase": "C5/4", "bass_line": "C2/8t C2/8t G1/8t C2/2.", "duration_beats": 4}]},
    {"middle_c": "C3", "chords": [{"notes": "C3", "bass_line": "C1/4 G0/4"}]},
    {"chords": [{"notes": "C4", "duration_beats": 1, "bass_line": "C2/2 H2/4 C2/9"}, {"notes": "C4", "bass_line": {"a": 1}}]},
    # duetos na frase (segunda voz no mesmo tempo) e percussão numa faixa própria do canal 10
    {"chords": [{"notes": "C4 E4 G4", "phrase": "E5&C5/8 G5&E5/8*alvo r/8 C6&C5/8+4 B5&G5/4*aprox", "phrase_scale": "C D E F G A B"},
                {"notes": "C4 E4 G4", "phrase": "C6&C5&E5/4*alvo D6&H5/4 E6&/4"}]},
    {"middle_c": "C3", "chords": [{"notes": "C3", "phrase": "C5&A4/4"}]},
    {"percussion": "U/4 r/8 N/8 N/4 G/8 G/8 ; V/8 W/8 V/8 W/8 V/8 W/8 V/8 W/8 ; I/4 J/8 J/8 I/4 J/8 J/8 ; Y/4 Z/4 D/4 L/4",
     "drums": "R/8 R/8 R/8 R/8 R/8 R/8 R/8 R/8 ; r/4. K/8 r/4 K/4", "chords": [{"notes": "C4 E4", "duration_beats": 6}]},
    {"percussion": "A/8 A/8 A/8 A/8 | Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16 Q/16", "chords": [{"notes": "C4", "duration_beats": 8}]},
    {"percussion": "Ç/4 K", "chords": [{"notes": "C4"}]},
    {"percussion": 7, "chords": [{"notes": "C4"}]},
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
        project = load_project(data)[0]
        assert base64.b64decode(js["midi"]) == midi_bytes(project)
        for mode in ("chords", "line"):  # frase no canal 2: os três jeitos de exportar
            assert base64.b64decode(js["midi_modes"][mode]) == midi_bytes(project, phrase_mode=mode), mode
    else:
        assert js["midi"] is None
    if isinstance(data, dict):
        assert js["renamed"] == rename_project_notes(data, "C3")


def test_casos_cobrem_erros_e_sucessos(js_results):
    oks = [r["report"]["ok"] for r in js_results]
    assert sum(oks) >= 25 and oks.count(False) >= 11
