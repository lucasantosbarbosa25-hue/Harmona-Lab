"""Leitura do voicing: ponta, baixo, espaçamento e avisos musicais.

Nada aqui altera notas. Avisos (``warning``/``info``) apontam situações que
podem ser engano de digitação — mas notas explícitas são sempre respeitadas.
Só ``error`` bloqueia a exportação.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from .timing import TICKS_PER_BEAT, beats_to_ticks, strum_plan
from .model import PART_LABELS, PARTS, ChordEvent, Issue, Project, load_project
from .phrase import SCALE_EXEMPT_ROLES
from .pitch import midi_to_name

PIANO_LOW, PIANO_HIGH = 21, 108  # A0 a C8
HAND_SPAN_LIMIT = 16  # semitons (uma 10ª maior)
PHRASE_LOW, PHRASE_HIGH = 48, 96  # tessitura confortável de uma frase (C3 a C7, com C4 = 60)


def _fmt_beats(beats: float) -> str:
    return str(int(beats)) if float(beats).is_integer() else f"{beats:g}"


def chord_issues(project: Project, chord: ChordEvent, index: int, next_chord: ChordEvent | None = None) -> list[Issue]:
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

    # Ponta travada.
    highest = chord.highest
    if chord.top_note is not None and highest is not None:
        top = chord.top_note
        if top.midi not in where:
            add("warning", f"A ponta travada {top.name(mc)} não está entre as notas do voicing.", "top_note")
        elif highest.midi != top.midi:
            above = [n.name(mc) for n, _ in chord.sounding() if n.midi > top.midi]
            add("warning", f"A ponta travada é {top.name(mc)}, mas {' '.join(above)} "
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
    issues.extend(phrase_issues(project, chord, index, next_chord))
    return issues


def _chord_pc_names(chord: ChordEvent) -> dict[int, str]:
    """Classe de altura → nome (a grafia da primeira nota do acorde que a tem)."""
    names: dict[int, str] = {}
    for note, _ in chord.sounding():
        names.setdefault(note.pitch_class, note.pitch_class_name())
    return names


def phrase_issues(project: Project, chord: ChordEvent, index: int, next_chord: ChordEvent | None) -> list[Issue]:
    """Confere a frase com o acorde: tessitura, alvos no tempo e no acorde, aproximações e escala.

    Só avisa (``warning``/``info``): erros de escrita já foram apontados na leitura do projeto. Os papéis
    ``alvo`` e ``aprox`` são conferidos; qualquer outro papel é livre. Novas conferências entram aqui.
    """
    events = chord.phrase_events
    mc = project.middle_c
    issues: list[Issue] = []

    def add(level: str, message: str, field: str = "phrase") -> None:
        issues.append(Issue(level, message, index, field))

    chord_names = _chord_pc_names(chord)
    scale = {pc for pc, _ in chord.phrase_pcs}
    shown = " ".join(name for _, name in chord.phrase_pcs)
    if chord.phrase_pcs:
        missing = [name for pc, name in chord_names.items() if pc not in scale]
        if missing:
            add("warning", f"A escala ({shown}) não tem {', '.join(missing)}, "
                           f"{'que é nota do acorde' if len(missing) == 1 else 'que são notas do acorde'}.", "phrase_scale")
    if not events:
        return issues

    out = [e.note.name(mc) for e in events if not PHRASE_LOW <= e.note.midi <= PHRASE_HIGH]
    if out:
        add("warning", f"Notas fora da tessitura confortável da frase ({midi_to_name(PHRASE_LOW, mc)} a "
                       f"{midi_to_name(PHRASE_HIGH, mc)}): {' '.join(dict.fromkeys(out))}.")

    for i, event in enumerate(events):
        name = event.note.name(mc)
        if event.role == "alvo":
            if event.start % TICKS_PER_BEAT:
                add("warning", f"O alvo {name} não cai num tempo: começa em {event.start / TICKS_PER_BEAT + 1:g}.")
            if chord_names and event.note.pitch_class not in chord_names:
                add("warning", f"O alvo {name} não é nota do acorde.")
        elif event.role == "aprox":
            following = events[i + 1] if i + 1 < len(events) else None
            if following is not None and following.role == "aprox":
                continue  # só a última aproximação da sequência precisa resolver (ex.: envolvente)
            if following is not None:
                distance = abs(following.note.midi - event.note.midi)
                if distance != 1:
                    add("warning", f"A aproximação {name} não resolve por semitom: a nota seguinte é "
                                   f"{following.note.name(mc)} ({distance} semitons).")
            elif next_chord is not None and not next_chord.is_rest:
                pcs = {n.pitch_class for n, _ in next_chord.sounding()}
                if not any((event.note.pitch_class - pc) % 12 in (1, 11) for pc in pcs):
                    add("warning", f"A aproximação {name} termina a frase, mas nenhuma nota do próximo acorde fica a um semitom dela.")

    if not chord.phrase_pcs:
        add("info", "A frase não declara a escala (phrase_scale): não dá para conferir se as notas são dela.")
        return issues
    outside_scale = list(dict.fromkeys(
        e.note.pitch_class_name() for e in events if e.note.pitch_class not in scale and e.role not in SCALE_EXEMPT_ROLES))
    if outside_scale:
        add("warning", f"Notas fora da escala da frase ({shown}): {', '.join(outside_scale)}. "
                       "Se são cromáticas de propósito, marque como *aprox, *passagem, *blue ou *outside.")
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
        "phrase": {
            "events": [{"midi": e.note.midi, "name": e.note.name(mc), "start": e.start, "length": e.length, "role": e.role}
                       for e in chord.phrase_events],
            **({"extra": [{"midi": e.note.midi, "name": e.note.name(mc), "start": e.start, "length": e.length}
                          for e in chord.phrase_extra]} if chord.phrase_extra else {}),
        } if chord.phrase_events else None,
        "comp": chord.comp or None,
        "bass_line": chord.bass_line or None,
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
        following = project.chords[i + 1] if i + 1 < len(project.chords) else None
        all_issues.extend(chord_issues(project, chord, i, following))
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
        "drums": project.drums or None,
        "percussion": project.percussion or None,
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
        lines.append(f"   ponta: {c['top']['name']} · baixo: {c['bottom']['name']}")
        if c["strum"] != "off":
            arrow = "grave → agudo" if c["strum"] == "up" else "agudo → grave"
            lines.append(f"   strum: {arrow}, {report['strum_delay_ms']:g} ms entre as notas")
        if c.get("phrase"):
            lines.append("   frase: " + " ".join(n["name"] + (f"*{n['role']}" if n["role"] else "") for n in c["phrase"]["events"]))
    icons = {"error": "ERRO", "warning": "aviso", "info": "nota"}
    for issue in report["issues"]:
        where = f"acorde {issue['chord'] + 1}: " if issue["chord"] is not None else ""
        lines.append(f"[{icons[issue['level']]}] {where}{issue['message']}")
    return "\n".join(lines)
