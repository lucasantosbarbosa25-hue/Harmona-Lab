"""Modelo interno: projeto → acordes → voicings (notas concretas).

Independente de interface e de MIDI. A interface web, a linha de comando e
o exportador MIDI consomem e produzem este mesmo modelo (e o JSON dele).

Princípio: as notas explícitas mandam. O símbolo do acorde ("B7alt") é só
um rótulo informativo; nada aqui depende de reconhecê-lo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .pitch import (
    DEFAULT_MIDDLE_C,
    MIDDLE_C_OFFSETS,
    Note,
    NoteParseError,
    parse_note,
    parse_note_list,
    rename_note_text,
    split_note_list,
)

SCHEMA_VERSION = 1

#: Partes que soam, na ordem de prioridade usada ao juntar notas repetidas.
PARTS = ("bass", "left_hand", "right_hand", "notes")
PART_LABELS = {
    "bass": "Baixo / pedal",
    "left_hand": "Mão esquerda",
    "right_hand": "Mão direita",
    "notes": "Notas (sem mão definida)",
}

VALID_DENOMINATORS = (1, 2, 4, 8, 16, 32)
# Abaixo de ~3,6 BPM o tempo não cabe nos 3 bytes do MIDI; 10 já é bem mais lento que qualquer balada.
TEMPO_MIN, TEMPO_MAX = 10.0, 999.0

# Strum: atraso entre as notas de um acorde. "up" = do grave ao agudo; "down" = do agudo ao grave.
STRUM_DIRECTIONS = ("off", "up", "down")
STRUM_DELAY_MIN, STRUM_DELAY_MAX = 1.0, 250.0  # milissegundos
DEFAULT_STRUM_DELAY_MS = 20.0
MAX_DURATION_BEATS = 1024.0


@dataclass
class Issue:
    """Problema ou observação. ``error`` impede a exportação; o resto não."""

    level: str  # "error" | "warning" | "info"
    message: str
    chord: int | None = None  # índice (0 = primeiro acorde)
    field: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"level": self.level, "message": self.message, "chord": self.chord, "field": self.field}


class ProjectError(ValueError):
    """Projeto com erros que impedem o uso (ex.: exportar MIDI)."""

    def __init__(self, issues: list[Issue]):
        self.issues = issues
        errors = [i for i in issues if i.level == "error"]
        lines = []
        for i in errors:
            where = f"acorde {i.chord + 1}" if i.chord is not None else "projeto"
            if i.field:
                where += f", {i.field}"
            lines.append(f"[{where}] {i.message}")
        super().__init__("\n".join(lines) or "Projeto inválido.")


@dataclass
class ChordEvent:
    """Um acorde da progressão = um voicing concreto com duração."""

    symbol: str = ""
    duration_beats: float = 4.0
    bass: list[Note] = field(default_factory=list)
    left_hand: list[Note] = field(default_factory=list)
    right_hand: list[Note] = field(default_factory=list)
    notes: list[Note] = field(default_factory=list)
    top_note: Note | None = None  # ponta declarada (trava); None = automático
    velocity: int | None = None  # None = velocity padrão do projeto
    strum: str | None = None  # None = segue o projeto; ou "off" / "up" / "down"
    omitted: list[str] = field(default_factory=list)  # informativo (ex.: ["5"])
    comment: str = ""

    def part(self, name: str) -> list[Note]:
        return getattr(self, name)

    def sounding(self) -> list[tuple[Note, str]]:
        """Notas que soam, do grave ao agudo, sem alturas MIDI repetidas.

        Se a mesma altura aparece em duas partes, vale a primeira em
        ``PARTS`` (baixo → mão esquerda → mão direita → notas).
        """
        seen: dict[int, tuple[Note, str]] = {}
        for part in PARTS:
            for note in self.part(part):
                seen.setdefault(note.midi, (note, part))
        return [seen[m] for m in sorted(seen)]

    @property
    def pitches(self) -> list[int]:
        return [n.midi for n, _ in self.sounding()]

    @property
    def is_rest(self) -> bool:
        return not any(self.part(p) for p in PARTS)

    @property
    def highest(self) -> Note | None:
        s = self.sounding()
        return s[-1][0] if s else None

    @property
    def lowest(self) -> Note | None:
        s = self.sounding()
        return s[0][0] if s else None

    def to_dict(self, middle_c: str = DEFAULT_MIDDLE_C) -> dict[str, Any]:
        d: dict[str, Any] = {"symbol": self.symbol, "duration_beats": _clean_number(self.duration_beats)}
        for part in PARTS:
            notes = self.part(part)
            if notes or part in ("left_hand", "right_hand"):
                d[part] = [n.name(middle_c) for n in notes]
        d["top_note"] = self.top_note.name(middle_c) if self.top_note else None
        d["velocity"] = self.velocity
        if self.strum is not None:
            d["strum"] = self.strum
        if self.omitted:
            d["omitted"] = list(self.omitted)
        if self.comment:
            d["comment"] = self.comment
        return d


@dataclass
class Project:
    title: str = "Progressão"
    tempo: float = 80.0
    time_signature: tuple[int, int] = (4, 4)
    middle_c: str = DEFAULT_MIDDLE_C
    default_velocity: int = 80
    strum_direction: str = "off"  # strum padrão dos acordes (cada acorde pode trocar)
    strum_delay_ms: float = DEFAULT_STRUM_DELAY_MS  # atraso entre notas vizinhas
    chords: list[ChordEvent] = field(default_factory=list)
    comment: str = ""

    @property
    def beats_per_bar(self) -> float:
        """Duração de um compasso em tempos de semínima (♩)."""
        num, den = self.time_signature
        return num * 4 / den

    @property
    def total_beats(self) -> float:
        return sum(c.duration_beats for c in self.chords)

    def velocity_for(self, chord: ChordEvent) -> int:
        return chord.velocity if chord.velocity is not None else self.default_velocity

    def strum_for(self, chord: ChordEvent) -> str:
        return chord.strum if chord.strum is not None else self.strum_direction

    def to_dict(self) -> dict[str, Any]:
        num, den = self.time_signature
        d: dict[str, Any] = {
            "schema_version": SCHEMA_VERSION,
            "title": self.title,
            "tempo": _clean_number(self.tempo),
            "time_signature": f"{num}/{den}",
            "middle_c": self.middle_c,
            "default_velocity": self.default_velocity,
            "strum": {"direction": self.strum_direction, "delay_ms": _clean_number(self.strum_delay_ms)},
            "chords": [c.to_dict(self.middle_c) for c in self.chords],
        }
        if self.comment:
            d["comment"] = self.comment
        return d

    @classmethod
    def from_dict(cls, data: Any) -> "Project":
        """Lê o JSON do projeto. Levanta ``ProjectError`` se houver erros."""
        project, issues = load_project(data)
        if any(i.level == "error" for i in issues):
            raise ProjectError(issues)
        return project


# ---------------------------------------------------------------------------
# Leitura tolerante: monta o que for válido e lista todos os problemas.
# ---------------------------------------------------------------------------


def _clean_number(x: float) -> float | int:
    return int(x) if float(x).is_integer() else x


def _to_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip().replace(",", "."))
        except ValueError:
            return None
    return None


def parse_time_signature(value: Any) -> tuple[int, int]:
    if isinstance(value, (list, tuple)) and len(value) == 2:
        num, den = value
    elif isinstance(value, str) and "/" in value:
        num, den = value.split("/", 1)
    else:
        raise ValueError(f'Fórmula de compasso inválida: "{value}". Use, por exemplo, "4/4" ou "6/8".')
    try:
        num, den = int(str(num).strip()), int(str(den).strip())
    except ValueError:
        raise ValueError(f'Fórmula de compasso inválida: "{value}".') from None
    if not 1 <= num <= 32:
        raise ValueError(f"Numerador do compasso deve ficar entre 1 e 32 (recebido {num}).")
    if den not in VALID_DENOMINATORS:
        raise ValueError(f"Denominador do compasso deve ser 1, 2, 4, 8, 16 ou 32 (recebido {den}).")
    return num, den


def _velocity(value: Any, issues: list[Issue], chord: int | None, field_name: str) -> int | None:
    number = _to_number(value)
    if number is None or not number.is_integer() or not 1 <= number <= 127:
        issues.append(Issue("error", f'Velocity deve ser um inteiro de 1 a 127 (recebido "{value}").', chord, field_name))
        return None
    return int(number)


def load_project(data: Any) -> tuple[Project, list[Issue]]:
    """Lê o dicionário do projeto sem parar no primeiro erro.

    Devolve o projeto com tudo o que foi possível ler e a lista de problemas.
    Campos de notas aceitam lista (["F#2", "C3"]) ou texto ("F#2 C3").
    """
    issues: list[Issue] = []
    project = Project()
    if not isinstance(data, dict):
        issues.append(Issue("error", "O projeto deve ser um objeto JSON."))
        return project, issues

    if data.get("title") is not None:
        project.title = str(data["title"])
    if data.get("comment"):
        project.comment = str(data["comment"])

    middle_c = data.get("middle_c", DEFAULT_MIDDLE_C) or DEFAULT_MIDDLE_C
    if isinstance(middle_c, str) and middle_c in MIDDLE_C_OFFSETS:
        project.middle_c = middle_c
    else:
        shown = f': "{middle_c}"' if isinstance(middle_c, str) else ""
        issues.append(Issue("error", f'Convenção de oitava desconhecida{shown}. Use "C4" ou "C3".', None, "middle_c"))

    if data.get("tempo") is not None:
        tempo = _to_number(data["tempo"])
        if tempo is None or not TEMPO_MIN <= tempo <= TEMPO_MAX:
            issues.append(Issue("error", f'BPM deve ser um número entre 10 e 999 (recebido "{data["tempo"]}").', None, "tempo"))
        else:
            project.tempo = tempo

    if data.get("time_signature") is not None:
        try:
            project.time_signature = parse_time_signature(data["time_signature"])
        except ValueError as exc:
            issues.append(Issue("error", str(exc), None, "time_signature"))

    if data.get("default_velocity") is not None:
        vel = _velocity(data["default_velocity"], issues, None, "default_velocity")
        if vel is not None:
            project.default_velocity = vel

    if data.get("strum") is not None:
        _load_strum(data["strum"], project, issues)

    raw_chords = data.get("chords")
    if raw_chords is None:
        raw_chords = []
    if not isinstance(raw_chords, list):
        issues.append(Issue("error", 'O campo "chords" deve ser uma lista de acordes.', None, "chords"))
        raw_chords = []
    for index, raw in enumerate(raw_chords):
        project.chords.append(_load_chord(raw, index, project, issues))
    return project, issues


_STRUM_HINT = 'Use "off", "up" (grave → agudo) ou "down" (agudo → grave).'


def _load_strum(raw: Any, project: Project, issues: list[Issue]) -> None:
    if isinstance(raw, str):
        raw = {"direction": raw}  # atalho: "strum": "up"
    if not isinstance(raw, dict):
        issues.append(Issue("error", 'O campo "strum" deve ser um objeto, por exemplo {"direction": "up", "delay_ms": 20}, ou só a direção ("up").', None, "strum"))
        return
    direction = raw.get("direction")
    if direction is not None:
        if isinstance(direction, str) and direction in STRUM_DIRECTIONS:
            project.strum_direction = direction
        else:
            shown = f': "{direction}"' if isinstance(direction, str) else ""
            issues.append(Issue("error", f"Direção do strum desconhecida{shown}. {_STRUM_HINT}", None, "strum"))
    if raw.get("delay_ms") is not None:
        delay = _to_number(raw["delay_ms"])
        if delay is None or not STRUM_DELAY_MIN <= delay <= STRUM_DELAY_MAX:
            issues.append(Issue("error", f'Atraso do strum deve ser um número entre 1 e 250 ms (recebido "{raw["delay_ms"]}").', None, "strum"))
        else:
            project.strum_delay_ms = delay


def _load_chord(raw: Any, index: int, project: Project, issues: list[Issue]) -> ChordEvent:
    chord = ChordEvent(duration_beats=project.beats_per_bar)
    if not isinstance(raw, dict):
        issues.append(Issue("error", "Cada acorde deve ser um objeto JSON.", index))
        return chord

    chord.symbol = str(raw.get("symbol") or "").strip()
    chord.comment = str(raw.get("comment") or "")

    if raw.get("duration_beats") is not None:
        beats = _to_number(raw["duration_beats"])
        if beats is None or not 0 < beats <= MAX_DURATION_BEATS:
            issues.append(Issue("error", f'Duração deve ser um número de tempos maior que zero (recebido "{raw["duration_beats"]}").', index, "duration_beats"))
        else:
            chord.duration_beats = beats
    elif raw.get("duration_bars") is not None:
        bars = _to_number(raw["duration_bars"])
        if bars is None or not 0 < bars * project.beats_per_bar <= MAX_DURATION_BEATS:
            issues.append(Issue("error", f'Duração em compassos inválida: "{raw["duration_bars"]}".', index, "duration_beats"))
        else:
            chord.duration_beats = bars * project.beats_per_bar

    for part in PARTS:
        notes, errors = parse_note_list(raw.get(part), project.middle_c)
        setattr(chord, part, notes)
        for message in errors:
            issues.append(Issue("error", message, index, part))

    top = raw.get("top_note")
    if top is not None and top != "":
        try:
            chord.top_note = parse_note(top.strip() if isinstance(top, str) else top, project.middle_c)
        except NoteParseError as exc:
            issues.append(Issue("error", f"Ponta: {exc}", index, "top_note"))

    if raw.get("velocity") is not None and raw.get("velocity") != "":
        chord.velocity = _velocity(raw["velocity"], issues, index, "velocity")

    strum = raw.get("strum")
    if strum is not None and strum != "":
        if isinstance(strum, str) and strum in STRUM_DIRECTIONS:
            chord.strum = strum
        else:
            shown = f': "{strum}"' if isinstance(strum, str) else ""
            issues.append(Issue("error", f"Strum do acorde desconhecido{shown}. {_STRUM_HINT}", index, "strum"))

    omitted = raw.get("omitted")
    if omitted:
        chord.omitted = [str(t) for t in split_note_list(omitted)]
    return chord


def rename_project_notes(data: dict[str, Any], to_middle_c: str) -> dict[str, Any]:
    """Troca a convenção de oitava do projeto mantendo as alturas MIDI.

    Trabalha sobre o JSON bruto (texto ou listas), ficha por ficha, para que
    funcione mesmo com campos ainda incompletos ou com erros.
    """
    from_middle_c = data.get("middle_c") or DEFAULT_MIDDLE_C
    out = dict(data)
    out["middle_c"] = to_middle_c
    # Sem convenção de origem válida não há o que converter: só adota a nova.
    if not isinstance(data.get("chords"), list) or not (isinstance(from_middle_c, str) and from_middle_c in MIDDLE_C_OFFSETS):
        return out
    chords = []
    for raw in data["chords"]:
        if not isinstance(raw, dict):
            chords.append(raw)
            continue
        c = dict(raw)
        for key in (*PARTS, "top_note"):
            if c.get(key) not in (None, ""):
                c[key] = rename_note_text(c[key], from_middle_c, to_middle_c)
        chords.append(c)
    out["chords"] = chords
    return out
