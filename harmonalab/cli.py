"""Linha de comando.

  python -m harmonalab                      abre a interface no navegador
  python -m harmonalab serve [--port N]     idem, com opções
  python -m harmonalab export proj.json     gera proj.mid (ou -o outro.mid)
  python -m harmonalab check proj.json      mostra notas, ponta, baixo e avisos
  python -m harmonalab inspect arquivo.mid  lista as notas de um .mid
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import webbrowser
from pathlib import Path

from .analysis import analyze, describe
from .midi_io import load_midi, save_midi, summarize_midi
from .model import load_project
from .pitch import DEFAULT_MIDDLE_C, MIDDLE_C_OFFSETS, midi_to_name


def _load(path: str):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        sys.exit(f"Arquivo não encontrado: {path}")
    except json.JSONDecodeError as exc:
        sys.exit(f"JSON inválido em {path}: {exc}")
    project, issues = load_project(data)
    return project, analyze(project, issues)


def cmd_serve(args: argparse.Namespace) -> int:
    from .server import local_ip, make_server

    server = make_server(args.host, args.port, verbose=args.verbose)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    print(f"Harmona Lab rodando em {url}")
    if args.host == "0.0.0.0":
        ip = local_ip()
        if ip:
            print(f"No celular (mesma rede Wi-Fi): http://{ip}:{port}/")
    print("Para encerrar: Ctrl+C")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")
    finally:
        server.server_close()
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    project, report = _load(args.project)
    if not report["ok"]:
        print(describe(report), file=sys.stderr)
        print("\nNada foi gerado: corrija os erros acima.", file=sys.stderr)
        return 1
    out = Path(args.output) if args.output else Path(args.project).with_suffix(".mid")
    save_midi(project, out)
    print(describe(report))
    print(f"\nMIDI salvo em: {out}")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    _, report = _load(args.project)
    print(describe(report))
    return 0 if report["ok"] else 1


def cmd_inspect(args: argparse.Namespace) -> int:
    summary = summarize_midi(load_midi(args.midi))
    ppq = summary.ticks_per_beat
    mc = args.middle_c
    sig = f"{summary.time_signature[0]}/{summary.time_signature[1]}" if summary.time_signature else "?"
    bpm = f"{summary.tempo_bpm:g}" if summary.tempo_bpm else "?"
    print(f"Tipo {summary.midi_type} · {ppq} ticks/♩ · BPM {bpm} · compasso {sig} · MIDI 60 = {mc}")
    groups: dict[tuple[int, int], list] = {}
    for n in summary.notes:
        groups.setdefault((n.start, n.end), []).append(n)
    markers = dict(summary.markers)
    for (start, end), notes in sorted(groups.items()):
        label = f" [{markers[start]}]" if start in markers else ""
        names = " ".join(midi_to_name(n.pitch, mc) for n in notes)
        vels = sorted({n.velocity for n in notes})
        print(f"tempo {start / ppq:g} → {end / ppq:g} ({(end - start) / ppq:g} ♩){label}: {names}"
              f"  (vel {'/'.join(map(str, vels))})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="harmonalab", description="Harmona Lab — voicings exatos → MIDI.")
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="abre a interface web local")
    serve.add_argument("--host", default="127.0.0.1", help='use 0.0.0.0 para abrir no celular pela rede local')
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--no-browser", action="store_true", help="não abrir o navegador")
    serve.add_argument("--verbose", action="store_true", help="mostrar cada requisição")
    serve.set_defaults(func=cmd_serve)

    export = sub.add_parser("export", help="gera o .mid de um projeto JSON")
    export.add_argument("project")
    export.add_argument("-o", "--output", help="caminho do .mid (padrão: mesmo nome do JSON)")
    export.set_defaults(func=cmd_export)

    check = sub.add_parser("check", help="confere um projeto JSON sem gerar MIDI")
    check.add_argument("project")
    check.set_defaults(func=cmd_check)

    inspect = sub.add_parser("inspect", help="lista as notas de um arquivo .mid")
    inspect.add_argument("midi")
    inspect.add_argument("--middle-c", choices=sorted(MIDDLE_C_OFFSETS), default=DEFAULT_MIDDLE_C,
                         help="convenção dos nomes exibidos (padrão C4)")
    inspect.set_defaults(func=cmd_inspect)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command is None:
        args = parser.parse_args(["serve", *(argv or [])])
    return args.func(args)
