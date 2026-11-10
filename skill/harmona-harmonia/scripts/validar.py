#!/usr/bin/env python3
"""Confere uma progressão do Harmona Lab antes de entregá-la.

Uso:  python scripts/validar.py projeto.json      (ou: python scripts/validar.py - < projeto.json)

Sai com código 0 e imprime OK + um resumo (ponta e baixo de cada acorde) quando está tudo certo.
Sai com código 1 e lista os PROBLEMAS quando há nota inválida, BPM fora do limite, ponta travada que não é a
nota mais aguda, escala que não contém as notas do acorde, ou acorde sem a frase de função (campo "comment")
ou sem as notas da escala (campo "phrase_scale"). Corrija e rode de novo, até dar OK.
"""

import sys

from _comum import conferir, ler_projeto


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    try:
        projeto = ler_projeto(sys.argv[1])
    except (OSError, ValueError) as erro:
        print(f"Não consegui ler o JSON: {erro}")
        return 2
    relatorio, lista = conferir(projeto)
    if lista:
        print(f"PROBLEMAS ({len(lista)}): corrija todos e rode de novo.")
        for i, texto in enumerate(lista, 1):
            print(f"{i}. {texto}")
        return 1
    print("OK")
    total = relatorio["totals"]
    print(f"{total['chords']} acordes · {total['bars']:g} compasso(s) · {total['seconds']:.0f} s")
    pontas, baixos = [], []
    for c in relatorio["chords"]:
        if c["is_rest"]:
            print(f"{c['index'] + 1}. {c['symbol'] or '(pausa)'} — pausa")
            continue
        pontas.append(c["top"]["name"])
        baixos.append(c["bottom"]["name"])
        notas = " ".join(n["name"] for n in c["notes"])
        print(f"{c['index'] + 1}. {c['symbol'] or '(sem nome)'} — {notas} — ponta {c['top']['name']}, baixo {c['bottom']['name']}")
        if c.get("phrase"):
            print("   frase: " + " ".join(n["name"] + (f"*{n['role']}" if n["role"] else "") for n in c["phrase"]["events"]))
    print("Linha da ponta:", " → ".join(pontas))
    print("Linha do baixo:", " → ".join(baixos))
    avisos = [i for i in relatorio["issues"] if i["level"] in ("warning", "info")]
    if avisos:
        print("Avisos (não bloqueiam):")
        for i in avisos:
            print("-", (f"acorde {i['chord'] + 1}: " if i["chord"] is not None else "") + i["message"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
