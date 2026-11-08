"""Servidor local mínimo (só biblioteca padrão) que entrega o app web.

O app (``harmonalab/web``) é estático: análise e geração do MIDI rodam no próprio
navegador (``web/engine``). Este servidor existe para usar o app no computador sem
hospedar nada — ``python -m harmonalab`` — e escuta só em 127.0.0.1 por padrão.
"""

from __future__ import annotations

import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

WEB_DIR = Path(__file__).resolve().parent / "web"

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".zip": "application/zip",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}


def resolve_web_file(url_path: str) -> Path | None:
    """Arquivo de ``web/`` para um caminho de URL, ou ``None`` (fora da pasta, oculto, tipo não servido)."""
    path = unquote(urlsplit(url_path).path)
    if path.endswith("/"):
        path += "index.html"
    parts = path.lstrip("/").split("/")
    if any(p in ("", ".", "..") or p.startswith(".") for p in parts):
        return None
    file = (WEB_DIR / Path(*parts)).resolve()
    if not file.is_relative_to(WEB_DIR) or not file.is_file() or file.suffix not in CONTENT_TYPES:
        return None
    return file


class Handler(BaseHTTPRequestHandler):
    server_version = "HarmonaLab/0.2"

    def log_message(self, fmt: str, *args: Any) -> None:  # silencioso
        if getattr(self.server, "verbose", False):
            super().log_message(fmt, *args)

    def _serve(self, with_body: bool) -> None:
        file = resolve_web_file(self.path)
        body = file.read_bytes() if file else "Não encontrado.".encode("utf-8")
        self.send_response(200 if file else 404)
        self.send_header("Content-Type", CONTENT_TYPES[file.suffix] if file else "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")  # o service worker cuida do modo offline
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if with_body:
            self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        self._serve(with_body=True)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve(with_body=False)


def make_server(host: str = "127.0.0.1", port: int = 8765, *, verbose: bool = False) -> ThreadingHTTPServer:
    """Cria o servidor; se a porta estiver ocupada, tenta as próximas."""
    last_error: OSError | None = None
    for candidate in ([port] if port == 0 else range(port, port + 20)):
        try:
            server = ThreadingHTTPServer((host, candidate), Handler)
            server.verbose = verbose  # type: ignore[attr-defined]
            return server
        except OSError as exc:  # porta em uso
            last_error = exc
    raise OSError(f"Nenhuma porta livre a partir de {port}: {last_error}")


def local_ip() -> str | None:
    """IP da máquina na rede local (para abrir no celular)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None
