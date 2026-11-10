"""A skill do Claude (harmona-harmonia): cópia do motor em dia, .zip em dia, scripts e links compatíveis com o app."""

import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / "skill" / "harmona-harmonia"
SCRIPTS = SKILL / "scripts"
EXAMPLE = ROOT / "examples" / "resolucao_em_fsharp_ponta.json"
NODE = shutil.which("node")


def _carregar(nome, caminho):
    spec = importlib.util.spec_from_file_location(nome, caminho)
    modulo = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(SCRIPTS))  # os scripts importam "_comum" e "harmonalab" da própria skill
    try:
        spec.loader.exec_module(modulo)
    finally:
        sys.path.pop(0)
    return modulo


@pytest.fixture(scope="module")
def build():
    return _carregar("build_skill", ROOT / "design" / "build_skill.py")


def rodar(*args, entrada=None):
    return subprocess.run([sys.executable, *map(str, args)], capture_output=True, text=True, input=entrada, cwd=SCRIPTS, timeout=60)


# ---------------------------------------------------------------- em dia com o código-fonte

def test_copia_do_motor_na_skill_esta_em_dia(build):
    for nome in build.MODULOS:
        original = (ROOT / "harmonalab" / f"{nome}.py").read_bytes()
        copia = (SCRIPTS / "harmonalab" / f"{nome}.py").read_bytes()
        assert copia == original, f"{nome}.py desatualizado na skill: rode python design/build_skill.py"


def test_motor_da_skill_nao_depende_de_mido():
    for nome in ("pitch", "model", "analysis", "timing", "phrase", "__init__"):
        codigo = (SCRIPTS / "harmonalab" / f"{nome}.py").read_text(encoding="utf-8")
        assert not re.search(r"^\s*(from|import)\s+mido", codigo, re.M), nome


def test_zip_para_baixar_esta_em_dia(build):
    assert build.ZIP.read_bytes() == build.montar_zip(), "rode python design/build_skill.py"


def test_zip_tem_a_skill_inteira_e_nada_de_cache(build):
    import zipfile

    nomes = zipfile.ZipFile(build.ZIP).namelist()
    assert "harmona-harmonia/SKILL.md" in nomes
    assert {"validar.py", "gerar_link.py", "_comum.py"} <= {Path(n).name for n in nomes}
    assert {"vocabulario.md", "artistas.md", "exemplo.md"} <= {Path(n).name for n in nomes}
    assert not [n for n in nomes if "__pycache__" in n or n.endswith(".pyc")]


def test_skill_md_referencia_arquivos_que_existem():
    texto = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    citados = set(re.findall(r"(references/[\w]+\.md|scripts/[\w]+\.py)", texto))
    assert citados >= {"references/vocabulario.md", "references/artistas.md", "references/exemplo.md", "scripts/validar.py", "scripts/gerar_link.py"}
    for caminho in citados:
        assert (SKILL / caminho).is_file(), caminho


# ---------------------------------------------------------------- scripts

def test_validar_aprova_o_exemplo_e_resume_ponta_e_baixo():
    r = rodar("validar.py", EXAMPLE)
    assert r.returncode == 0, r.stdout + r.stderr
    assert r.stdout.startswith("OK")
    assert "Linha da ponta: E4 → C5 → F#4 → F#4" in r.stdout
    assert "Linha do baixo: F#2 → B2 → F2 → E2" in r.stdout


def test_validar_recusa_nota_invalida_e_ponta_errada():
    projeto = {"tempo": 80, "chords": [
        {"symbol": "Em9", "right_hand": ["E3", "H4"], "comment": "Repouso.", "phrase_scale": "E F# G A B C D"},
        {"symbol": "Am7", "right_hand": ["A3", "C4", "E4"], "top_note": "A3", "comment": "Subdominante.", "phrase_scale": "A B C D E F# G"},
    ]}
    r = rodar("validar.py", "-", entrada=json.dumps(projeto))
    assert r.returncode == 1
    assert "PROBLEMAS (2)" in r.stdout
    assert 'Acorde 1 (Em9), campo right_hand: Não entendi "H4"' in r.stdout
    assert "Acorde 2 (Am7), campo top_note: A ponta travada é A3" in r.stdout
    assert rodar("validar.py", "nao-existe.json").returncode == 2
    assert rodar("validar.py").returncode == 2


def test_validar_cobra_a_frase_de_funcao_e_as_notas_da_escala():
    cru = {"tempo": 80, "chords": [{"symbol": "Em9", "right_hand": ["E3", "G3"]}, {"symbol": "Pausa"},
                                   {"symbol": "Am7", "right_hand": "A3 C4", "comment": "ok", "phrase_scale": "A B C D E F G"}]}
    r = rodar("validar.py", "-", entrada=json.dumps(cru))
    assert r.returncode == 1
    assert 'Falta a frase de função (campo "comment"' in r.stdout and 'Faltam as notas da escala (campo "phrase_scale"' in r.stdout
    assert r.stdout.count("acorde(s) 1.") == 2  # só o acorde 1: pausa não conta e o 3 está completo
    escala_errada = {"tempo": 80, "chords": [{"symbol": "Em9", "right_hand": ["E3", "G3"], "comment": "ok", "phrase_scale": "C D F A"}]}
    r = rodar("validar.py", "-", entrada=json.dumps(escala_errada))
    assert r.returncode == 1 and "A escala (C D F A) não tem E, G, que são notas do acorde" in r.stdout
    com_frase = json.loads(EXAMPLE.read_text(encoding="utf-8"))  # frases escritas à mão continuam conferidas
    r = rodar("validar.py", "-", entrada=json.dumps(com_frase))
    assert r.returncode == 0, r.stdout
    assert "frase: G5 F5 Eb5*alvo D5 C5 B4*alvo" in r.stdout
    com_frase["chords"][1]["phrase"] = "G5/8 F5/8 Eb5/4*alvo D5/8 C5/8 A4/8*aprox r/8"  # aproximação sem resolver
    r = rodar("validar.py", "-", entrada=json.dumps(com_frase))
    assert r.returncode == 1 and "A aproximação A4 termina a frase" in r.stdout


def test_gerar_link_so_gera_com_projeto_valido():
    r = rodar("gerar_link.py", EXAMPLE, "--base", "https://meu.site")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "https://meu.site/#z=" in r.stdout and "https://meu.site/#t=" in r.stdout
    ruim = rodar("gerar_link.py", "-", entrada=json.dumps({"tempo": 1, "chords": []}))
    assert ruim.returncode == 1 and "PROBLEMAS" in ruim.stdout and "https://" not in ruim.stdout


# ---------------------------------------------------------------- compatível com o app (JavaScript)

pulando_sem_node = pytest.mark.skipif(NODE is None, reason="Node.js não instalado")


def app_le(hashes):
    proc = subprocess.run([NODE, str(ROOT / "tests" / "js" / "link_runner.mjs")], input=json.dumps(hashes), capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


def teclas(projeto):
    sys.path.insert(0, str(SCRIPTS))
    try:
        from harmonalab.analysis import analyze_data

        return [[n["midi"] for n in c["notes"]] for c in analyze_data(projeto)["chords"]]
    finally:
        sys.path.pop(0)


@pulando_sem_node
def test_link_curto_gerado_em_python_abre_igual_no_app():
    comum = _carregar("comum", SCRIPTS / "_comum.py")
    projeto = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    projeto["references"] = ["Jesús Molina", "Dirty Loops"]
    [lido] = app_le([comum.link_z(projeto).split("/#", 1)[1].join(["#", ""])])
    assert lido["kind"] == "project"
    assert lido["project"] == comum._limpo(projeto)


@pulando_sem_node
def test_link_legivel_gerado_em_python_abre_com_as_mesmas_teclas_no_app():
    comum = _carregar("comum", SCRIPTS / "_comum.py")
    projeto = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    projeto["chords"][0]["bass"] = ["F#1"]  # baixo separado também vira parte do link
    link = comum.link_compacto(projeto)
    [lido] = app_le(["#" + link.split("/#", 1)[1]])
    assert lido["kind"] == "project"
    assert teclas(lido["project"]) == teclas(projeto)
    assert [c["symbol"] for c in lido["project"]["chords"]] == [c["symbol"] for c in projeto["chords"]]
    assert [c.get("function") for c in lido["project"]["chords"]] == [c.get("function") for c in projeto["chords"]]
    assert lido["project"]["key"] == "Em" and lido["project"]["tempo"] == 80


@pulando_sem_node
def test_links_do_exemplo_da_skill_abrem_no_app_e_passam_na_conferencia():
    texto = (SKILL / "references" / "exemplo.md").read_text(encoding="utf-8")
    link = re.search(r"\]\((https://\S+#z=[\w-]+)\)", texto).group(1)
    comum = _carregar("comum", SCRIPTS / "_comum.py")
    projeto = comum.ler_link_z(link)
    assert comum.conferir(projeto)[1] == []
    [lido] = app_le(["#" + link.split("#", 1)[1]])
    assert lido["project"] == projeto
    json_reserva = json.loads(re.search(r"```json\n(.+?)\n```", texto, re.S).group(1))
    assert teclas(json_reserva) == teclas(projeto)  # o JSON de reserva é a mesma progressão do link
