# Os testes do Harmony Lab precisam do mido (harmony-lab/requirements-dev.txt).
# Sem ele — por exemplo, rodando "python -m pytest" na raiz só com as dependências do CRM —
# estes testes são ignorados, para não interromper os testes do CRM.
import importlib.util

if importlib.util.find_spec("mido") is None:
    collect_ignore_glob = ["test_*.py"]
