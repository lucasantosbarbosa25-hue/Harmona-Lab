"""Funções comuns aos scripts da skill (leitura do projeto, conferência e links)."""

from __future__ import annotations

import base64
import json
import re
import sys
import zlib
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parent))

from harmonalab.analysis import analyze_data  # noqa: E402

BASE_PADRAO = "https://harmona-lab.pages.dev/"


def ler_projeto(origem: str) -> dict:
    """Lê um JSON de um arquivo ("-" = entrada padrão). Aceita o projeto ou a resposta {"projeto": ...}."""
    texto = sys.stdin.read() if origem == "-" else Path(origem).read_text(encoding="utf-8")
    dados = json.loads(texto)
    if isinstance(dados, dict) and isinstance(dados.get("projeto"), dict):
        return dados["projeto"]
    return dados


def problemas(relatorio: dict) -> list[str]:
    """O que bloqueia: erros do motor e ponta travada que não é a nota mais aguda (o mesmo critério do app)."""
    saida = []
    for item in relatorio["issues"]:
        if item["level"] == "error" or (item["level"] == "warning" and item["field"] == "top_note"):
            onde = ""
            if item["chord"] is not None:
                simbolo = relatorio["chords"][item["chord"]]["symbol"] if item["chord"] < len(relatorio["chords"]) else ""
                onde = f"Acorde {item['chord'] + 1}" + (f" ({simbolo})" if simbolo else "")
                onde += f", campo {item['field']}: " if item["field"] else ": "
            elif item["field"]:
                onde = f"Projeto, campo {item['field']}: "
            saida.append(onde + item["message"])
    return saida


def conferir(projeto: dict) -> tuple[dict, list[str]]:
    relatorio = analyze_data(projeto)
    return relatorio, problemas(relatorio)


# ------------------------------------------------------------------ links

def _limpo(valor):
    """Tira campos vazios (None, "", listas vazias): o link fica curto. Mesmo critério do app."""
    if isinstance(valor, dict):
        return {k: _limpo(v) for k, v in valor.items() if v is not None and v != "" and v != []}
    if isinstance(valor, list):
        return [_limpo(v) for v in valor]
    return valor


def link_z(projeto: dict, base: str = BASE_PADRAO) -> str:
    """Link curto: o JSON comprimido (deflate) em base64url. É o que o app gera ao compartilhar."""
    bruto = json.dumps(_limpo(projeto), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    comp = zlib.compressobj(9, zlib.DEFLATED, -15)
    dados = comp.compress(bruto) + comp.flush()
    return f"{base}#z={base64.urlsafe_b64encode(dados).rstrip(b'=').decode('ascii')}"


def ler_link_z(link: str) -> dict:
    texto = link.split("#z=", 1)[1].split("&", 1)[0]
    dados = base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))
    return json.loads(zlib.decompress(dados, -15).decode("utf-8"))


def _codificar(texto: str, manter: str = "_/,.-+") -> str:
    """Percent-encoding que preserva letras (com acento), números e alguns símbolos."""
    return "".join(c if c.isalnum() or c in manter else "".join(f"%{b:02X}" for b in c.encode("utf-8")) for c in texto)


def _nota_link(nota: str) -> str:
    m = re.fullmatch(r"([A-Ga-g])([#b]*)(-?\d+)", nota.strip())
    return f"{m.group(1)}{m.group(2).replace('#', 's')}{m.group(3)}" if m else _codificar(nota)


def link_compacto(projeto: dict, base: str = BASE_PADRAO) -> str:
    """Link legível (#t=...&p=...), no formato que qualquer IA consegue escrever à mão."""
    if projeto.get("middle_c", "C4") != "C4":
        raise ValueError('O link compacto só vale com middle_c "C4".')
    texto = lambda t: _codificar(str(t).strip().replace(" ", "_"))  # noqa: E731
    partes = []
    if projeto.get("title"):
        partes.append(f"t={texto(projeto['title'])}")
    if projeto.get("key"):
        partes.append(f"k={texto(projeto['key'])}")
    if projeto.get("tempo") not in (None, ""):
        partes.append(f"bpm={projeto['tempo']:g}" if isinstance(projeto["tempo"], (int, float)) else f"bpm={projeto['tempo']}")
    if projeto.get("time_signature"):
        partes.append(f"ts={projeto['time_signature']}")
    refs = projeto.get("references") or []
    if refs:
        partes.append("ref=" + ",".join(texto(r) for r in refs))
    acordes = []
    for acorde in projeto.get("chords", []):
        mao = lambda chave: ",".join(_nota_link(n) for n in acorde.get(chave) or [])  # noqa: E731
        baixo, esq, dir_ = mao("bass"), mao("left_hand"), mao("right_hand")
        notas = f"{baixo}/{esq}/{dir_}" if baixo else f"{esq}/{dir_}" if esq else dir_
        duracao = acorde.get("duration_beats")
        campos = [
            _codificar(acorde.get("symbol", ""), "_/,.-+"),
            notas,
            f"{duracao:g}" if isinstance(duracao, (int, float)) else "",
            texto(acorde.get("function", "")),
            texto(acorde.get("scale", "")),
        ]
        while campos and not campos[-1]:
            campos.pop()
        acordes.append(":".join(campos))
    partes.append("p=" + ";".join(acordes))
    return f"{base}#" + "&".join(partes)
