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


CAMPOS_QUE_BLOQUEIAM = ("top_note", "phrase", "phrase_scale")  # avisos desses campos também bloqueiam (como no app)


def _preenchido(acorde, chave) -> bool:
    valor = acorde.get(chave) if isinstance(acorde, dict) else None
    return bool(valor.strip()) if isinstance(valor, str) else bool(valor) if isinstance(valor, list) else False


def problemas(relatorio: dict, projeto: dict | None = None) -> list[str]:
    """O que bloqueia: erros do motor, ponta travada que não é a nota mais aguda, avisos da frase e da escala e, com o
    projeto, a frase de função (comment) e as notas da escala (phrase_scale) que faltarem. É o mesmo critério do app."""
    saida = []
    for item in relatorio["issues"]:
        if item["level"] == "error" or (item["level"] == "warning" and item["field"] in CAMPOS_QUE_BLOQUEIAM):
            onde = ""
            if item["chord"] is not None:
                simbolo = relatorio["chords"][item["chord"]]["symbol"] if item["chord"] < len(relatorio["chords"]) else ""
                onde = f"Acorde {item['chord'] + 1}" + (f" ({simbolo})" if simbolo else "")
                onde += f", campo {item['field']}: " if item["field"] else ": "
            elif item["field"]:
                onde = f"Projeto, campo {item['field']}: "
            saida.append(onde + item["message"])
    acordes = projeto.get("chords") if isinstance(projeto, dict) and isinstance(projeto.get("chords"), list) else []
    if projeto is not None:
        sem_escala = [c["index"] + 1 for c in relatorio["chords"]
                      if not c["is_rest"] and not (c["index"] < len(acordes) and _preenchido(acordes[c["index"]], "phrase_scale"))]
        if sem_escala:
            saida.append('Faltam as notas da escala (campo "phrase_scale", sem oitava, como "B C D Eb F G A") no(s) acorde(s) '
                         + ", ".join(map(str, sem_escala)) + ".")
        mudos = [c["index"] + 1 for c in relatorio["chords"]
                 if not c["is_rest"] and not (c["index"] < len(acordes) and _preenchido(acordes[c["index"]], "comment"))]
        if mudos:
            saida.append('Falta a frase de função (campo "comment": o que o acorde faz ali e por quê) no(s) acorde(s) '
                         + ", ".join(map(str, mudos)) + ".")
    return saida


def conferir(projeto: dict) -> tuple[dict, list[str]]:
    relatorio = analyze_data(projeto)
    return relatorio, problemas(relatorio, projeto)


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


def _frase_link(frase: str) -> str:
    """Frase no link: fichas separadas por "_" e "s" no lugar do "#" (o mesmo que o app lê)."""
    fichas = []
    for ficha in str(frase).split():
        cabeca, estrela, papel = ficha.partition("*")
        nome, barra, duracao = cabeca.partition("/")
        fichas.append(f"{_nota_link(nome)}{barra}{_codificar(duracao)}{estrela}{_codificar(papel)}")
    return "_".join(fichas)


def _escala_link(escala: str) -> str:
    return "_".join(re.sub(r"#", "s", n) if re.fullmatch(r"[A-Ga-g][#b]*", n) else _codificar(n) for n in str(escala).split())


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
    if projeto.get("style"):
        partes.append(f"st={texto(projeto['style'])}")
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
            texto(acorde.get("comment", "")),
            _frase_link(acorde.get("phrase", "")),
            _escala_link(acorde.get("phrase_scale", "")),
            texto(acorde.get("phrase_color", "")),
        ]
        while campos and not campos[-1]:
            campos.pop()
        acordes.append(":".join(campos))
    partes.append("p=" + ";".join(acordes))
    return f"{base}#" + "&".join(partes)


def link_parte(projeto: dict, parte: str, retocados: int = 0, explicacao: str = "", base: str = BASE_PADRAO) -> str:
    """Link de UMA PARTE (#cont=B&ret=K&p=...): leva só os acordes novos. O app encaixa na parte e mantém o resto da música."""
    acordes = link_compacto({"chords": projeto.get("chords", [])}, base).split("#p=", 1)[1]
    texto = lambda t: _codificar(str(t).strip().replace(" ", "_"))  # noqa: E731
    partes = [f"cont={texto(parte)}", f"ret={int(retocados)}"]
    if explicacao.strip():
        partes.append(f"x={texto(explicacao)}")
    partes.append(f"p={acordes}")
    return f"{base}#" + "&".join(partes)


def tempos_da_parte(projeto: dict, retocados: int = 0) -> float:
    """A soma das durações dos acordes da parte (sem os reescritos do fim da parte anterior)."""
    return sum(float(a.get("duration_beats") or 0) for a in projeto.get("chords", [])[max(0, int(retocados)):])
