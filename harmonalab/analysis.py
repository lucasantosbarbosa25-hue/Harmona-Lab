"""Leitura do voicing: soprano, baixo, espaçamento e avisos musicais.

Nada aqui altera notas. Avisos (``warning``/``info``) apontam situações que
podem ser engano de digitação — mas notas explícitas são sempre respeitadas.
Só ``error`` bloqueia a exportação.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from .midi_io import TICKS_PER_BEAT, beats_to_ticks, strum_plan
from .model import PART_LABELS, PARTS, ChordEvent, Issue, Project, load_project

PIANO_LOW, PIANO_HIGH = 21, 108  # A0 a C8
HAND_SPAN_LIMIT = 16  # semitons (uma 10ª maior)


def _fmt_beats(beats: float) -> str:
    return str(int(beats)) if float(beats).is_integer() else f"{beats:g}"


def chord_issues(project: Project, chord: ChordEvent, index: int) -> list[Issue]:
    mc = project.middle_c
    issues: list[Issue] = []

    def add(level: str, message: str, field: str | None = None) -> None:
        issues.append(Issue(level, message, index, field))

    if chord.is_rest:
        add("info", "Sem notas: este trecho será uma pausa (silêncio).")

    exact = chord.duration_beats * TICKS_PER_BEAT
    if round(exact) < 1:
        add("error", "Duração curta demais: o MIDI não marca menos de 1/960 de tempo.", "duration_beats")
    elif abs(exact - round(exact)) > 1e-6:
        add("warning", f"Duração arredondada para {round(exact) / TICKS_PER_BEAT:g} tempos "
                       f"(resolução de 1/{TICKS_PER_BEAT} de semínima).", "duration_beats")

    # Strum que não cabe no acorde: o espaço entre as notas encolhe.
    count = len(chord.pitches)
    if project.strum_for(chord) != "off" and count >= 2 and round(exact) >= 1:
        _, compressed = strum_plan(count, project.strum_delay_ms, project.tempo, beats_to_ticks(chord.duration_beats))
        if compressed:
            add("warning", "Acorde curto demais para este strum: o espaço entre as notas foi reduzido "
                           "(o strum ocupa no máximo metade do acorde).", "strum")

    # Alturas repetidas (mesma tecla em duas partes ou duas vezes na mesma parte).
    where: dict[int, list[str]] = {}
    for part in PARTS:
        for note in chord.part(part):
            where.setdefault(note.midi, []).append(part)
    for midi, parts in where.items():
        if len(parts) > 1:
            name = next(n for n in chord.sounding() if n[0].midi == midi)[0].name(mc)
            labels = ", ".join(dict.fromkeys(PART_LABELS[p].lower() for p in parts))
            add("warning", f"{name} aparece {len(parts)} vezes ({labels}). No MIDI ela soa uma vez só.")

    # Soprano travado.
    highest = chord.highest
    if chord.top_note is not None and highest is not None:
        top = chord.top_note
        if top.midi not in where:
            add("warning", f"O soprano travado {top.name(mc)} não está entre as notas do voicing.", "top_note")
        elif highest.midi != top.midi:
            above = [n.name(mc) for n, _ in chord.sounding() if n.midi > top.midi]
            add("warning", f"O soprano travado é {top.name(mc)}, mas {' '.join(above)} "
                           f"{'fica' if len(above) == 1 else 'ficam'} acima.", "top_note")

    # Cruzamentos (só informativo: pode ser intencional).
    lh, rh, bass = chord.left_hand, chord.right_hand, chord.bass
    if lh and rh and max(n.midi for n in lh) > min(n.midi for n in rh):
        add("info", f"Mãos cruzadas: a esquerda chega a {max(lh, key=lambda n: n.midi).name(mc)}, "
                    f"acima de {min(rh, key=lambda n: n.midi).name(mc)} da direita.")
    others = [n for p in ("left_hand", "right_hand", "notes") for n in chord.part(p)]
    if bass and others and max(n.midi for n in bass) > min(n.midi for n in others):
        add("info", "O baixo/pedal não é a nota mais grave do acorde.", "bass")

    for part in ("left_hand", "right_hand"):
        notes = chord.part(part)
        if len(notes) > 1:
            span = max(n.midi for n in notes) - min(n.midi for n in notes)
            if span > HAND_SPAN_LIMIT:
                add("info", f"{PART_LABELS[part]} abre {span} semitons (mais que uma 10ª).", part)

    outside = [n.name(mc) for n, _ in chord.sounding() if not PIANO_LOW <= n.midi <= PIANO_HIGH]
    if outside:
        add("info", f"Fora da extensão do piano de 88 teclas: {' '.join(outside)}.")
    return issues


def analyze_chord(project: Project, chord: ChordEvent, index: int, start_beats: float) -> dict[str, Any]:
    mc = project.middle_c
    sounding = chord.sounding()
    notes = [{"midi": n.midi, "name": n.name(mc), "part": part} for n, part in sounding]
    pcs = Counter(n.pitch_class for n, _ in sounding)
    doublings = []
    for n, _ in sounding:
        if pcs[n.pitch_class] > 1 and n.pitch_class_name() not in doublings:
            doublings.append(n.pitch_class_name())
    highest, lowest = chord.highest, chord.lowest
    return {
        "index": index,
        "symbol": chord.symbol,
        "is_rest": chord.is_rest,
        "notes": notes,
        "top": {"midi": highest.midi, "name": highest.name(mc)} if highest else None,
        "bottom": {"midi": lowest.midi, "name": lowest.name(mc)} if lowest else None,
        "top_locked": chord.top_note.name(mc) if chord.top_note else None,
        "spacing": [b["midi"] - a["midi"] for a, b in zip(notes, notes[1:])],
        "doublings": doublings,
        "start_beats": start_beats,
        "duration_beats": chord.duration_beats,
        "velocity": project.velocity_for(chord),
        "strum": project.strum_for(chord) if len(notes) >= 2 else "off",
    }


def analyze(project: Project, issues: list[Issue] | None = None) -> dict[str, Any]:
    """Relatório completo (usado pela interface e pela linha de comando)."""
    all_issues = list(issues or [])
    if not project.chords:
        all_issues.append(Issue("error", "A progressão está vazia: adicione pelo menos um acorde."))
    elif all(c.is_rest for c in project.chords):
        all_issues.append(Issue("warning", "Nenhum acorde tem notas: o MIDI sairá vazio."))

    chords = []
    start = 0.0
    for i, chord in enumerate(project.chords):
        all_issues.extend(chord_issues(project, chord, i))
        chords.append(analyze_chord(project, chord, i, start))
        start += chord.duration_beats

    ok = not any(i.level == "error" for i in all_issues)
    total = project.total_beats
    return {
        "ok": ok,
        "issues": [i.to_dict() for i in all_issues],
        "chords": chords,
        "middle_c": project.middle_c,
        "beats_per_bar": project.beats_per_bar,
        "strum_delay_ms": project.strum_delay_ms,
        "totals": {
            "chords": len(project.chords),
            "beats": total,
            "bars": total / project.beats_per_bar,
            "seconds": total * 60 / project.tempo,
        },
        "project": project.to_dict() if ok else None,
    }


def analyze_data(data: Any) -> dict[str, Any]:
    project, issues = load_project(data)
    return analyze(project, issues)


def describe(report: dict[str, Any]) -> str:
    """Texto legível do relatório (linha de comando)."""
    lines = []
    t = report["totals"]
    lines.append(f"{t['chords']} acorde(s) · {_fmt_beats(t['bars'])} compasso(s) · {t['seconds']:.1f} s"
                 f" · convenção: MIDI 60 = {report['middle_c']}")
    for c in report["chords"]:
        head = f"{c['index'] + 1}. {c['symbol'] or '(sem nome)'} — {_fmt_beats(c['duration_beats'])} tempos"
        if c["is_rest"]:
            lines.append(f"{head} — pausa")
            continue
        voicing = " ".join(n["name"] for n in c["notes"])
        lines.append(f"{head} — vel {c['velocity']}")
        lines.append(f"   grave → agudo: {voicing}")
        lines.append(f"   MIDI:          {' '.join(str(n['midi']) for n in c['notes'])}")
        lines.append(f"   soprano: {c['top']['name']} · baixo: {c['bottom']['name']}")
        if c["strum"] != "off":
            arrow = "grave → agudo" if c["strum"] == "up" else "agudo → grave"
            lines.append(f"   strum: {arrow}, {report['strum_delay_ms']:g} ms entre as notas")
    icons = {"error": "ERRO", "warning": "aviso", "info": "nota"}
    for issue in report["issues"]:
        where = f"acorde {issue['chord'] + 1}: " if issue["chord"] is not None else ""
        lines.append(f"[{icons[issue['level']]}] {where}{issue['message']}")
    return "\n".join(lines)
