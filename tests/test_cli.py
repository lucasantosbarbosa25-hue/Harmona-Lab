import json

from harmonylab.cli import main
from harmonylab.midi_io import load_midi, summarize_midi


def test_export_e_inspect(tmp_path, capsys):
    project = tmp_path / "prog.json"
    project.write_text(json.dumps({"chords": [{"symbol": "Em9", "left_hand": "E2 B2 D3", "right_hand": "G3 F#4"}]}))
    assert main(["export", str(project)]) == 0
    midi = tmp_path / "prog.mid"
    assert [n.pitch for n in summarize_midi(load_midi(midi)).notes] == [40, 47, 50, 55, 66]
    capsys.readouterr()
    assert main(["inspect", str(midi)]) == 0
    assert "E2 B2 D3 G3 F#4" in capsys.readouterr().out
    assert main(["inspect", str(midi), "--middle-c", "C3"]) == 0
    assert "E1 B1 D2 G2 F#3" in capsys.readouterr().out


def test_export_com_erro_nao_cria_arquivo(tmp_path):
    project = tmp_path / "ruim.json"
    project.write_text(json.dumps({"chords": [{"right_hand": "C4 Q4"}]}))
    assert main(["export", str(project)]) == 1
    assert not (tmp_path / "ruim.mid").exists()
    assert main(["check", str(project)]) == 1
