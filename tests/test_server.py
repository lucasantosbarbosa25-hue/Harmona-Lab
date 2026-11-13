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
    ("/ai/chat.js", "text/javascript"),
    ("/ia.md", "text/markdown"),
    ("/harmona-harmonia.zip", "application/zip"),
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
    original = json.loads((EXAMPLES / "resolucao_em_fsharp_ponta.json").read_text(encoding="utf-8"))
    assert web == original


def test_arquivos_do_modo_offline_existem():
    shell = re.findall(r'"\./([^"]*)"', (WEB_DIR / "sw.js").read_text(encoding="utf-8"))
    assert "app.js" in shell and "engine/midi.js" in shell
    for name in shell:
        assert (WEB_DIR / (name or "index.html")).is_file(), name
    # todo módulo JS do app precisa estar no cache offline
    modules = {p.relative_to(WEB_DIR).as_posix() for p in WEB_DIR.rglob("*.js") if p.name != "sw.js" and "vendor" not in p.parts}
    assert modules <= set(shell)
    # o tocador de SF2 não é pré-baixado: só quem usa um banco de sons paga os ~700 KB (e aí ele fica no cache)
    assert not [name for name in shell if name.startswith("vendor/")]


def test_icones_principais():
    import struct
    import xml.etree.ElementTree as ET

    ET.parse(WEB_DIR / "icon.svg")  # SVG válido (logo do cabeçalho e da aba)
    expected = {"icon-192.png": (192, True), "icon-512.png": (512, True),
                "maskable-512.png": (512, False), "apple-touch-icon.png": (180, False)}
    for name, (size, transparent) in expected.items():
        head = (WEB_DIR / "icons" / name).read_bytes()[:26]
        assert head[:8] == b"\x89PNG\r\n\x1a\n", name
        assert struct.unpack(">II", head[16:24]) == (size, size), name
        # ícones recortados pelo sistema (Android maskable, iPhone) não podem ter transparência
        assert (head[25] == 6) == transparent, name


def test_manifesto_instalavel():
    manifest = json.loads((WEB_DIR / "manifest.webmanifest").read_text(encoding="utf-8"))
    assert manifest["display"] == "standalone" and manifest["start_url"] == "./"
    sizes = {i["sizes"] for i in manifest["icons"]}
    assert {"192x192", "512x512"} <= sizes
    assert any(i.get("purpose") == "maskable" for i in manifest["icons"])
    for icon in manifest["icons"]:
        assert (WEB_DIR / icon["src"]).is_file()


def test_tocador_de_sf2_vem_com_licencas_e_versoes_fixas():
    vendor = WEB_DIR / "vendor" / "spessasynth"
    for name in ("spessasynth.min.js", "spessasynth_processor.min.js", "LICENSE-spessasynth_lib.txt", "LICENSE-spessasynth_core.txt", "VERSIONS.txt"):
        assert (vendor / name).is_file(), name
    assert "Apache License" in (vendor / "LICENSE-spessasynth_lib.txt").read_text(encoding="utf-8")
    versions = (vendor / "VERSIONS.txt").read_text(encoding="utf-8")
    script = (WEB_DIR.parent.parent / "design" / "vendor_spessasynth.sh").read_text(encoding="utf-8")
    for package, var in (("spessasynth_lib", "LIB_VERSION"), ("spessasynth_core", "CORE_VERSION")):
        version = re.search(rf'{var}="([^"]+)"', script).group(1)
        assert f"{package} {version}" in versions, package
    # a página só usa o que o pacote exporta: o sintetizador (AudioWorklet) e o sequenciador
    assert re.search(r"export\{[^}]*as Sequencer[^}]*\}", (vendor / "spessasynth.min.js").read_text(encoding="utf-8"))


def test_cabecalhos_de_seguranca_do_site_e_do_servidor_local():
    """O site publicado (web/_headers, lido pelo Cloudflare Pages) e o servidor local mandam os mesmos cabeçalhos."""
    from harmonalab.server import SECURITY_HEADERS, resolve_web_file

    csp = SECURITY_HEADERS["Content-Security-Policy"]
    assert "default-src 'self'" in csp and "object-src 'none'" in csp and "frame-ancestors 'none'" in csp
    assert "unsafe-eval'" not in csp.replace("'wasm-unsafe-eval'", "")  # só o WebAssembly do tocador de sons
    assert "http:" not in csp and "https:" not in csp and "*" not in csp  # nada de fora
    assert SECURITY_HEADERS["X-Frame-Options"] == "DENY"
    assert SECURITY_HEADERS["X-Content-Type-Options"] == "nosniff"
    assert "microphone=(self)" in SECURITY_HEADERS["Permissions-Policy"]
    assert resolve_web_file("/_headers") is None  # o arquivo de configuração não é servido como página
