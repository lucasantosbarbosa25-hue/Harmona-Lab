import json
import threading
import urllib.error
import urllib.request

import pytest

from harmonylab.midi_io import load_midi, summarize_midi
from harmonylab.server import make_server, slugify


@pytest.fixture(scope="module")
def base_url():
    server = make_server("127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def get(url):
    with urllib.request.urlopen(url) as r:
        return r.status, r.headers, r.read()


def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def test_interface_e_arquivos_estaticos(base_url):
    status, headers, body = get(base_url + "/")
    assert status == 200 and b"Harmony Lab" in body
    for name in ("styles.css", "app.js", "audio.js", "keyboard.js"):
        status, _, _ = get(f"{base_url}/static/{name}")
        assert status == 200


@pytest.mark.parametrize("path", ["/static/../server.py", "/static/%2e%2e/server.py", "/static/.hidden", "/nada"])
def test_nao_serve_fora_da_pasta_web(base_url, path):
    with pytest.raises(urllib.error.HTTPError) as exc:
        get(base_url + path)
    assert exc.value.code == 404


def test_exemplo(base_url):
    _, _, body = get(base_url + "/api/example")
    data = json.loads(body)
    assert data["chords"][1]["symbol"] == "B7alt"


def test_validate(base_url):
    status, _, body = post(base_url + "/api/validate", {"chords": [{"left_hand": "B2 A3", "right_hand": "D4 Eb4 G4 C5"}]})
    report = json.loads(body)
    assert status == 200 and report["ok"]
    assert [n["midi"] for n in report["chords"][0]["notes"]] == [47, 57, 62, 63, 67, 72]
    assert report["project"]["chords"][0]["right_hand"] == ["D4", "Eb4", "G4", "C5"]


def test_export_devolve_mid(base_url):
    payload = {"title": "Teste Ação", "tempo": 96, "chords": [{"right_hand": "C4 Eb4 G4", "velocity": 70}]}
    status, headers, body = post(base_url + "/api/export", payload)
    assert status == 200
    assert headers["Content-Type"] == "audio/midi"
    assert headers["X-Filename"] == "teste-acao.mid"
    summary = summarize_midi(load_midi(body))
    assert [(n.pitch, n.velocity, n.start, n.end) for n in summary.notes] == [(60, 70, 0, 1920), (63, 70, 0, 1920), (67, 70, 0, 1920)]
    assert summary.tempo_bpm == pytest.approx(96)


def test_export_com_erro_nao_gera(base_url):
    status, _, body = post(base_url + "/api/export", {"chords": [{"right_hand": "C4 H4"}]})
    assert status == 400
    assert json.loads(body)["report"]["ok"] is False


def test_json_invalido(base_url):
    req = urllib.request.Request(base_url + "/api/validate", data=b"{oops", headers={"Content-Type": "application/json"})
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req)
    assert exc.value.code == 400


def test_trocar_convencao(base_url):
    status, _, body = post(base_url + "/api/convention", {"to": "C3", "project": {"middle_c": "C4", "chords": [{"left_hand": "F#2 C3"}]}})
    assert status == 200
    assert json.loads(body)["chords"][0]["left_hand"] == "F#1 C2"


def test_slugify():
    assert slugify("Resolução B7alt → Em (F# soprano)") == "resolucao-b7alt-em-f-soprano"
    assert slugify("   ") == "progressao"
