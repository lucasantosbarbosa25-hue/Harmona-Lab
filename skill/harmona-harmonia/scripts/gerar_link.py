#!/usr/bin/env python3
"""Confere a progressão e gera os links que abrem no Harmona Lab.

Uso:  python scripts/gerar_link.py projeto.json [--base https://harmona-lab.pages.dev/]

Pedido de UMA PARTE (o pedido traz "PARTE NOVA", "CONTINUAÇÃO DA MÚSICA" ou "AJUSTE DA PARTE"): o JSON leva só os
acordes novos (primeiro os reescritos do fim da parte anterior, se houver, depois os da parte), e o link é outro:
      python scripts/gerar_link.py parte.json --parte B [--retocados 1] [--tempos 16] [--explicacao "..."]
--tempos confere a soma das durações da parte (use quando o pedido disser que ela deve somar EXATAMENTE N tempos).

Imprime o link curto (#z=, preferido: é o que o app gera ao compartilhar) e o link legível (#p=, reserva).
Só gera links se a progressão passar na conferência; senão lista os problemas (código de saída 1).
"""

import argparse
import sys

from _comum import BASE_PADRAO, conferir, ler_projeto, link_compacto, link_parte, link_z, tempos_da_parte


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("projeto", help='arquivo JSON do projeto ("-" para ler da entrada padrão)')
    parser.add_argument("--base", default=BASE_PADRAO, help=f"endereço do app (padrão: {BASE_PADRAO})")
    parser.add_argument("--parte", help="pedido de uma parte: o nome dela (ex.: B); o link leva só os acordes novos")
    parser.add_argument("--retocados", type=int, default=0, help="quantos acordes do começo do JSON reescrevem o fim da parte anterior (0, 1 ou 2)")
    parser.add_argument("--tempos", type=float, help="a soma que os acordes da parte devem ter, em tempos (quando o pedido fixar o tamanho)")
    parser.add_argument("--explicacao", default="", help="explicação curta, que vai no link da parte")
    args = parser.parse_args()
    try:
        projeto = ler_projeto(args.projeto)
    except (OSError, ValueError) as erro:
        print(f"Não consegui ler o JSON: {erro}")
        return 2
    _, lista = conferir(projeto)
    if lista:
        print(f"PROBLEMAS ({len(lista)}): corrija todos antes de gerar o link.")
        for i, texto in enumerate(lista, 1):
            print(f"{i}. {texto}")
        return 1
    base = args.base if args.base.endswith("/") else args.base + "/"
    if args.parte:
        if not 0 <= args.retocados <= 2 or args.retocados >= len(projeto.get("chords", [])):
            print("PROBLEMA: --retocados vale 0, 1 ou 2, e o JSON precisa ter também os acordes da parte.")
            return 1
        soma = tempos_da_parte(projeto, args.retocados)
        if args.tempos is not None and abs(soma - args.tempos) > 1e-6:
            print(f"PROBLEMA: os acordes da parte {args.parte} somam {soma:g} tempos, mas o pedido pede {args.tempos:g}. Acerte as durações.")
            return 1
        print(f"Link da parte {args.parte} ({soma:g} tempos; só os acordes novos):")
        print(link_parte(projeto, args.parte, args.retocados, args.explicacao, base))
        return 0
    print("Link curto (preferido):")
    print(link_z(projeto, base))
    try:
        print("\nLink legível (reserva):")
        print(link_compacto(projeto, base))
    except ValueError as erro:
        print(f"\n(sem link legível: {erro})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
