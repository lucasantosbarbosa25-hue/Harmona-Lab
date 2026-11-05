"""Servidor local mínimo (só biblioteca padrão) para a interface web.

Rotas:
  GET  /                  → interface (web/index.html)
  GET  /static/<arquivo>  → CSS/JS da interface
  GET  /api/example       → projeto de exemplo
  POST /api/validate      → lê o projeto e devolve a análise de cada acorde
  POST /api/export        → devolve o arquivo .mid (ou 400 com os erros)
  POST /api/convention    → troca a convenção de oitava sem mudar as alturas

Pensado para um único usuário na própria máquina: escuta em 127.0.0.1 por
padrão, sem banco de dados e sem autenticação.
"""

from __future__ import annotations

import json
import re
import socket
import unicodedata
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .analysis import analyze
from .midi_io import midi_bytes
from .model import load_project, rename_project_notes
from .pitch import MIDDLE_C_OFFSETS

WEB_DIR = Path(__file__).parent / "web"
EXAMPLE_FILE = Path(__file__).resolve().parent.parent / "examples" / "resolucao_em_fsharp_soprano.json"
MAX_BODY = 2 * 1024 * 1024

STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
}


def slugify(text: str, default: str = "progressao") -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug[:60] or default


class Handler(BaseHTTPRequestHandler):
    server_version = "HarmonyLab/0.1"

    # -- utilidades ---------------------------------------------------------
    def log_message(self, fmt: str, *args: Any) -> None:  # silencioso
        if getattr(self.server, "verbose", False):
            super().log_message(fmt, *args)

    def _send(self, status: int, body: bytes, content_type: str, headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: Any) -> None:
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _read_json(self) -> Any:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("Projeto grande demais.")
        raw = self.rfile.read(length) if length else b""
        try:
            return json.loads(raw.decode("utf-8") or "null")
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"JSON inválido: {exc}") from None

    # -- rotas --------------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            return self._static("index.html")
        if path.startswith("/static/"):
            return self._static(path[len("/static/"):])
        if path == "/api/example":
            if not EXAMPLE_FILE.is_file():
                return self._json(404, {"error": "Exemplo não encontrado."})
            return self._json(200, json.loads(EXAMPLE_FILE.read_text(encoding="utf-8")))
        if path == "/api/health":
            return self._json(200, {"ok": True})
        self._json(404, {"error": "Não encontrado."})

    def _static(self, name: str) -> None:
        # Só arquivos diretamente dentro de web/ (sem subpastas, sem "..").
        if "/" in name or "\\" in name or name.startswith("."):
            return self._json(404, {"error": "Não encontrado."})
        file = WEB_DIR / name
        content_type = STATIC_TYPES.get(file.suffix)
        if not content_type or not file.is_file():
            return self._json(404, {"error": "Não encontrado."})
        self._send(200, file.read_bytes(), content_type)

    def do_POST(self) -> None:  # noqa: N802
        try:
            self._post()
        except Exception as exc:  # noqa: BLE001 - responde em JSON em vez de derrubar a conexão
            self.log_error("Erro inesperado: %r", exc)
            self._json(500, {"error": f"Erro interno: {exc}"})

    def _post(self) -> None:
        path = self.path.split("?", 1)[0]
        try:
            data = self._read_json()
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})

        if path == "/api/validate":
            project, issues = load_project(data)
            return self._json(200, analyze(project, issues))

        if path == "/api/export":
            project, issues = load_project(data)
            report = analyze(project, issues)
            if not report["ok"]:
                return self._json(400, {"error": "O projeto tem erros.", "report": report})
            body = midi_bytes(project)
            filename = slugify(project.title) + ".mid"
            return self._send(200, body, "audio/midi", {
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Filename": filename,
            })

        if path == "/api/convention":
            if not isinstance(data, dict) or data.get("to") not in MIDDLE_C_OFFSETS:
                return self._json(400, {"error": 'Envie {"project": {...}, "to": "C4" | "C3"}.'})
            project = data.get("project")
            if not isinstance(project, dict):
                return self._json(400, {"error": "Projeto ausente."})
            return self._json(200, rename_project_notes(project, data["to"]))

        self._json(404, {"error": "Não encontrado."})


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
