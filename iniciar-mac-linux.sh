#!/usr/bin/env sh
# Harmona Lab: rode "./iniciar-mac-linux.sh". Na primeira vez cria o ambiente e instala o mido.
cd "$(dirname "$0")" || exit 1
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
python -m pip install -q -r requirements.txt
exec python -m harmonalab "$@"
