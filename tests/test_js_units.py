"""Testes do assistente de IA (JavaScript), rodados com o executor de testes do próprio Node.

Usam uma API da Anthropic simulada (tests/js/fake_api.mjs), então não gastam nada e não precisam de chave nem de rede.
Sem Node.js instalado, os testes são pulados.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

NODE = shutil.which("node")
JS_DIR = Path(__file__).parent / "js"
pytestmark = pytest.mark.skipif(NODE is None, reason="Node.js não instalado")


@pytest.mark.parametrize("file", sorted(JS_DIR.glob("*.test.mjs")), ids=lambda p: p.name)
def test_testes_js(file):
    proc = subprocess.run([NODE, "--test", str(file)], capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, (proc.stdout[-5000:] + proc.stderr[-2000:])
