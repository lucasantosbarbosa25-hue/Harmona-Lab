from harmonalab.analysis import analyze, analyze_data, describe


def levels(report, chord=None):
    return [(i["level"], i["field"]) for i in report["issues"] if chord is None or i["chord"] == chord]


def test_ponta_e_baixo():
    report = analyze_data({"chords": [{"left_hand": "B2 A3", "right_hand": "D4 Eb4 G4 C5"}]})
    chord = report["chords"][0]
    assert report["ok"]
    assert chord["top"] == {"midi": 72, "name": "C5"}
    assert chord["bottom"] == {"midi": 47, "name": "B2"}
    assert [n["part"] for n in chord["notes"]] == ["left_hand", "left_hand"] + ["right_hand"] * 4
    assert chord["spacing"] == [10, 5, 1, 4, 5]


def test_ponta_travado_que_nao_e_o_mais_agudo_gera_aviso():
    report = analyze_data({"chords": [{"right_hand": "D4 G4 F#4", "top_note": "F#4"}]})
    assert report["ok"]  # aviso não bloqueia
    assert ("warning", "top_note") in levels(report)
    msg = next(i["message"] for i in report["issues"] if i["field"] == "top_note")
    assert "G4" in msg


def test_ponta_travado_ausente_gera_aviso():
    report = analyze_data({"chords": [{"right_hand": "D4 E4", "top_note": "F#4"}]})
    assert ("warning", "top_note") in levels(report)


def test_ponta_travado_correto_sem_aviso():
    report = analyze_data({"chords": [{"left_hand": "E2 B2 D3", "right_hand": "G3 F#4", "top_note": "F#4"}]})
    assert levels(report) == []


def test_repeticao_cruzamento_e_pausa():
    report = analyze_data({"chords": [
        {"left_hand": "C3 E4", "right_hand": "D4 E4"},
        {"right_hand": ""},
    ]})
    first = levels(report, 0)
    assert ("warning", None) in first  # E4 repetida
    assert ("info", None) in first  # mãos cruzadas
    assert levels(report, 1) == [("info", None)]  # pausa
    assert report["chords"][1]["is_rest"]


def test_progressao_vazia_e_erro():
    report = analyze_data({"chords": []})
    assert not report["ok"]


def test_totais():
    report = analyze_data({"tempo": 120, "chords": [{"right_hand": "C4"}, {"right_hand": "D4", "duration_beats": 2}]})
    assert report["totals"] == {"chords": 2, "beats": 6, "bars": 1.5, "seconds": 3.0}
    assert report["chords"][1]["start_beats"] == 4


def test_describe_tem_notas_e_midi():
    text = describe(analyze_data({"chords": [{"symbol": "Em9", "left_hand": "E2 B2 D3", "right_hand": "G3 F#4"}]}))
    assert "E2 B2 D3 G3 F#4" in text
    assert "40 47 50 55 66" in text
