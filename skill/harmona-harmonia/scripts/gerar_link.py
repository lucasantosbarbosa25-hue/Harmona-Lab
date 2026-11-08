#!/usr/bin/env python3
"""Confere a progressão e gera os links que abrem no Harmona Lab.

Uso:  python scripts/gerar_link.py projeto.json [--base https://harmona-lab.pages.dev/]

Imprime o link curto (#z=, preferido: é o que o app gera ao compartilhar) e o link legível (#p=, reserva).
Só gera links se a progressão passar na conferência; senão lista os problemas (código de saída 1).
"""

import argparse
import sys

from _comum import BASE_PADRAO, conferir, ler_projeto, link_compacto, link_z


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("projeto", help='arquivo JSON do projeto ("-" para ler da entrada padrão)')
    parser.add_argument("--base", default=BASE_PADRAO, help=f"endereço do app (padrão: {BASE_PADRAO})")
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
