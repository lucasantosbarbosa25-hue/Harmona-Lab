"""Projeto → arquivo MIDI (.mid) e leitura de volta para conferência.

Usa ``mido``: controle total de ticks, sem conversões em ponto flutuante.

Decisões:
  - Arquivo MIDI tipo 0 (uma única faixa): abre igual em qualquer DAW.
  - 480 ticks por semínima. Todas as posições são somadas em ticks inteiros,
    então não há deriva: 4 tempos em 4/4 = 1920 ticks = 1 compasso, em
    qualquer BPM.
  - Canal 1 (índice 0), sem program change: o som é decidido pelo seu VST.
  - Cada acorde vira note_on no início e note_off exatamente no fim. Quando
    uma nota se repete no acorde seguinte (nota comum), o note_off vem antes
    do note_on no mesmo tick, para que a nota seja re-articulada sem cortes.
  - O símbolo do acorde vai como marcador (meta "marker"); ele não influencia
    as notas.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

import mido

from .model import Project

TICKS_PER_BEAT = 480
CHANNEL = 0

_TEXT_REPLACEMENTS = {
    "→": "->", "♭": "b", "♯": "#", "𝄪": "##", "𝄫": "bb", "♮": "",
    "△": "maj", "Δ": "maj", "–": "-", "—": "-", "“": '"', "”": '"', "’": "'",
}


def beats_to_ticks(beats: float, ticks_per_beat: int = TICKS_PER_BEAT) -> int:
    return int(round(beats * ticks_per_beat))


def _meta_text(text: str) -> str:
    """Texto seguro para metadados MIDI (latin-1)."""
    for src, dst in _TEXT_REPLACEMENTS.items():
        text = text.replace(src, dst)
    return text.encode("latin-1", "replace").decode("latin-1")


def build_midi(project: Project, *, ticks_per_beat: int = TICKS_PER_BEAT, markers: bool = True) -> mido.MidiFile:
    """Gera o MidiFile exatamente com as notas, oitavas e durações do projeto."""
    num, den = project.time_signature
    # (tick, prioridade, altura, mensagem). Prioridade: note_off < meta < note_on.
    events: list[tuple[int, int, int, mido.Message | mido.MetaMessage]] = []
    tick = 0
    for chord in project.chords:
        length = beats_to_ticks(chord.duration_beats, ticks_per_beat)
        velocity = project.velocity_for(chord)
        if markers and chord.symbol:
            events.append((tick, 1, 0, mido.MetaMessage("marker", text=_meta_text(chord.symbol))))
        for pitch in chord.pitches:
            events.append((tick, 2, pitch, mido.Message("note_on", channel=CHANNEL, note=pitch, velocity=velocity)))
            events.append((tick + length, 0, pitch, mido.Message("note_off", channel=CHANNEL, note=pitch, velocity=0)))
        tick += length
    end_tick = tick

    events.sort(key=lambda e: (e[0], e[1], e[2]))

    track = mido.MidiTrack()
    track.append(mido.MetaMessage("track_name", name=_meta_text(project.title or "Harmona Lab"), time=0))
    track.append(mido.MetaMessage("time_signature", numerator=num, denominator=den,
                                  clocks_per_click=24, notated_32nd_notes_per_beat=8, time=0))
    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(project.tempo), time=0))
    last = 0
    for at, _, _, msg in events:
        track.append(msg.copy(time=at - last))
        last = at
    track.append(mido.MetaMessage("end_of_track", time=end_tick - last))

    midi = mido.MidiFile(type=0, ticks_per_beat=ticks_per_beat)
    midi.tracks.append(track)
    return midi


def midi_bytes(project: Project, **kwargs) -> bytes:
    buffer = io.BytesIO()
    build_midi(project, **kwargs).save(file=buffer)
    return buffer.getvalue()


def save_midi(project: Project, path: str | Path, **kwargs) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    build_midi(project, **kwargs).save(str(path))
    return path


# ---------------------------------------------------------------------------
# Leitura de volta (testes e comando "inspect")
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NoteEvent:
    pitch: int
    velocity: int
    start: int  # tick do note_on
    end: int  # tick do note_off
    channel: int = 0

    @property
    def length(self) -> int:
        return self.end - self.start


@dataclass
class MidiSummary:
    ticks_per_beat: int
    tempo_bpm: float | None
    time_signature: tuple[int, int] | None
    notes: list[NoteEvent]
    markers: list[tuple[int, str]]
    length_ticks: int
    midi_type: int


def load_midi(source: str | Path | bytes) -> mido.MidiFile:
    if isinstance(source, (bytes, bytearray)):
        return mido.MidiFile(file=io.BytesIO(source))
    return mido.MidiFile(str(source))


def summarize_midi(midi: mido.MidiFile) -> MidiSummary:
    """Lê notas (pares note_on/note_off), tempo, compasso e marcadores."""
    tempo_bpm = None
    time_signature = None
    markers: list[tuple[int, str]] = []
    notes: list[NoteEvent] = []
    length = 0
    for track in midi.tracks:
        open_notes: dict[tuple[int, int], list[tuple[int, int]]] = {}
        tick = 0
        for msg in track:
            tick += msg.time
            if msg.type == "set_tempo" and tempo_bpm is None:
                tempo_bpm = mido.tempo2bpm(msg.tempo)
            elif msg.type == "time_signature" and time_signature is None:
                time_signature = (msg.numerator, msg.denominator)
            elif msg.type == "marker":
                markers.append((tick, msg.text))
            elif msg.type == "note_on" and msg.velocity > 0:
                open_notes.setdefault((msg.channel, msg.note), []).append((tick, msg.velocity))
            elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
                stack = open_notes.get((msg.channel, msg.note))
                if stack:
                    start, velocity = stack.pop(0)
                    notes.append(NoteEvent(msg.note, velocity, start, tick, msg.channel))
        length = max(length, tick)
    notes.sort(key=lambda n: (n.start, n.pitch))
    return MidiSummary(midi.ticks_per_beat, tempo_bpm, time_signature, notes, markers, length, midi.type)
