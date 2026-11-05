@echo off
REM Harmony Lab: duplo clique para abrir. Na primeira vez cria o ambiente e instala o mido.
cd /d "%~dp0"
if not exist .venv (
  py -3 -m venv .venv || python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
python -m harmonylab
pause
