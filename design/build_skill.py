#!/usr/bin/env python3
"""Prepara a skill para o Claude: copia o motor Python para dentro dela e gera o .zip para baixar no app.

Uso:  python design/build_skill.py

A skill precisa funcionar sozinha, então leva uma cópia do motor (pitch, model, analysis, timing). Os testes
conferem que a cópia e o .zip estão em dia com o código-fonte.
"""

from __future__ import annotations

import io
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / "skill" / "harmona-harmonia"
MODULOS = ("__init__", "pitch", "model", "analysis", "timing")
ZIP = ROOT / "harmonalab" / "web" / "harmona-harmonia.zip"
DATA_FIXA = (2026, 1, 1, 0, 0, 0)  # o .zip sai sempre igual para o mesmo conteúdo


def sincronizar_motor() -> None:
    destino = SKILL / "scripts" / "harmonalab"
    destino.mkdir(parents=True, exist_ok=True)
    for nome in MODULOS:
        shutil.copyfile(ROOT / "harmonalab" / f"{nome}.py", destino / f"{nome}.py")


def arquivos_da_skill() -> list[Path]:
    return sorted(p for p in SKILL.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc")


def montar_zip() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as pacote:
        for arquivo in arquivos_da_skill():
            info = zipfile.ZipInfo(f"{SKILL.name}/{arquivo.relative_to(SKILL).as_posix()}", DATA_FIXA)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if arquivo.suffix == ".py" and arquivo.parent.name == "scripts" else 0o644) << 16
            pacote.writestr(info, arquivo.read_bytes())
    return buffer.getvalue()


def main() -> None:
    sincronizar_motor()
    ZIP.write_bytes(montar_zip())
    print(f"{ZIP.relative_to(ROOT)} ({ZIP.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
