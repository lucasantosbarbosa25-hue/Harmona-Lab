import json
import re
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from harmonalab.server import WEB_DIR, make_server

EXAMPLES = Path(__file__).resolve().parent.parent / "examples"


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


@pytest.mark.parametrize("path, content_type", [
    ("/", "text/html"),
    ("/index.html", "text/html"),
    ("/app.js", "text/javascript"),
    ("/engine/midi.js", "text/javascript"),
    ("/styles.css", "text/css"),
    ("/manifest.webmanifest", "application/manifest+json"),
    ("/sw.js", "text/javascript"),
    ("/icons/icon-192.png", "image/png"),
    ("/example.json", "application/json"),
])
def test_serve_o_app(base_url, path, content_type):
    status, headers, body = get(base_url + path)
    assert status == 200 and body
    assert headers["Content-Type"].startswith(content_type)


@pytest.mark.parametrize("path", [
    "/../server.py", "/%2e%2e/server.py", "/engine/../../server.py", "/engine/%2e%2e/%2e%2e/cli.py",
    "/.hidden", "/nada", "/engine/", "//etc/passwd",
])
def test_nao_serve_fora_da_pasta_web(base_url, path):
    with pytest.raises(urllib.error.HTTPError) as exc:
        get(base_url + path)
    assert exc.value.code == 404


def test_exemplo_do_app_e_o_mesmo_da_pasta_examples():
    web = json.loads((WEB_DIR / "example.json").read_text(encoding="utf-8"))
    original = json.loads((EXAMPLES / "resolucao_em_fsharp_soprano.json").read_text(encoding="utf-8"))
    assert web == original


def test_arquivos_do_modo_offline_existem():
    shell = re.findall(r'"\./([^"]*)"', (WEB_DIR / "sw.js").read_text(encoding="utf-8"))
    assert "app.js" in shell and "engine/midi.js" in shell
    for name in shell:
        assert (WEB_DIR / (name or "index.html")).is_file(), name
    # todo módulo JS do app precisa estar no cache offline
    modules = {p.relative_to(WEB_DIR).as_posix() for p in WEB_DIR.rglob("*.js") if p.name != "sw.js"}
    assert modules <= set(shell)


def test_manifesto_instalavel():
    manifest = json.loads((WEB_DIR / "manifest.webmanifest").read_text(encoding="utf-8"))
    assert manifest["display"] == "standalone" and manifest["start_url"] == "./"
    sizes = {i["sizes"] for i in manifest["icons"]}
    assert {"192x192", "512x512"} <= sizes
    assert any(i.get("purpose") == "maskable" for i in manifest["icons"])
    for icon in manifest["icons"]:
        assert (WEB_DIR / icon["src"]).is_file()
