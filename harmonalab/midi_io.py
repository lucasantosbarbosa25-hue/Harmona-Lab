"""Projeto → arquivo MIDI (.mid) e leitura de volta para conferência.

Usa ``mido``: controle total de ticks, sem conversões em ponto flutuante.

Decisões:
  - Só acordes: arquivo MIDI tipo 0 (uma única faixa), que abre igual em qualquer DAW. Com frase, baixo ou bateria:
    tipo 1, com uma faixa para os acordes, uma para a frase (canal 2), uma para o baixo (canal 3) e uma para a
    bateria (canal 10, General MIDI).
  - 480 ticks por semínima. Todas as posições são somadas em ticks inteiros,
    então não há deriva: 4 tempos em 4/4 = 1920 ticks = 1 compasso, em
    qualquer BPM.
  - Canal 1 (índice 0) para os acordes e canal 2 (índice 1) para as frases, sem program change: o som
    é decidido pelo seu VST e dá para separar a frase da harmonia na DAW.
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
from .timing import TICKS_PER_BEAT, beats_to_ticks, strum_plan  # noqa: F401 (reexportados)

CHANNEL = 0
PHRASE_CHANNEL = 1
BASS_CHANNEL = 2
VOICE_CHANNEL = 3  # a Voz (melodia cantada)
PAD_CHANNEL = 4  # o pad: o acorde aberto e parado
PAD_SOFTER = 20  # o pad toca mais leve que os acordes (velocity a menos)
VOICE2_CHANNEL = 5  # a segunda voz (dueto ou contracanto da Voz)
VOICE2_SOFTER = 12  # a segunda voz fica um pouco atrás da Voz
DRUM_CHANNEL = 9
#: O que entra no arquivo: acorde + frase, só os acordes, ou mão esquerda/baixo + frase (a mão direita canta a frase).
PHRASE_MODES = ("both", "chords", "line")

_TEXT_REPLACEMENTS = {
    "→": "->", "♭": "b", "♯": "#", "𝄪": "##", "𝄫": "bb", "♮": "",
    "△": "maj", "Δ": "maj", "–": "-", "—": "-", "“": '"', "”": '"', "’": "'",
}


def _meta_text(text: str) -> str:
    """Texto seguro para metadados MIDI (latin-1)."""
    for src, dst in _TEXT_REPLACEMENTS.items():
        text = text.replace(src, dst)
    return text.encode("latin-1", "replace").decode("latin-1")


def _hit_notes(voices: list, part: str, scale: frozenset = frozenset()) -> list[int]:
    """Alturas de um toque da levada, do grave ao agudo. ``voices`` = [(nota, parte)] já do grave ao agudo."""
    if not voices:
        return []
    if part[0] in "SM":
        # grau da escala: sobe a escala (ou, sem ela, as notas do acorde) a partir do baixo (S) ou da mão direita (M)
        base = voices[0][0].midi
        if part[0] == "M":
            right = [n.midi for n, p in voices if p in ("right_hand", "notes")]
            base = right[0] if right else base + 12
        pcs = (scale or frozenset(n.pitch_class for n, _ in voices)) | {base % 12}
        pitch = base
        for _ in range(int(part[1]) - 1):
            pitch += 1
            while pitch % 12 not in pcs:
                pitch += 1
        return [pitch] if pitch <= 127 else []
    if part == "T":
        return [n.midi for n, _ in voices]
    if part == "E":
        return [n.midi for n, p in voices if p in ("bass", "left_hand")]
    if part == "D":
        return [n.midi for n, p in voices if p in ("right_hand", "notes")]
    if part == "B":
        return [voices[0][0].midi]
    if part == "P":
        return [voices[-1][0].midi]
    return [voices[(int(part) - 1) % len(voices)][0].midi]


def chord_notes(project: Project, chord, length: int, phrase_mode: str = "both",
                ticks_per_beat: int = TICKS_PER_BEAT) -> list[tuple[int, int, int, int]]:
    """Notas do acorde no canal 1: [(início, fim, altura, velocity)], em ticks a partir do começo do acorde.

    Sem levada: todas as notas juntas (com strum, se houver) até o fim. Com levada (``comp``): cada camada se repete
    até o fim do acorde; se dois toques pedirem a mesma tecla ao mesmo tempo, ela soa uma vez só, e um toque novo
    corta o anterior da mesma tecla.
    """
    voices = chord.sounding()
    if phrase_mode == "line":
        voices = [(n, p) for n, p in voices if p != "right_hand"]
    velocity = project.velocity_for(chord)
    direction = project.strum_for(chord)
    scale = frozenset(pc for pc, _ in chord.phrase_pcs)

    def block(pitches: list[int], start: int, end: int, vel: int) -> list[tuple[int, int, int, int]]:
        offsets = [0] * len(pitches)
        if direction != "off":
            offsets, _ = strum_plan(len(pitches), project.strum_delay_ms, project.tempo, end - start, ticks_per_beat)
            if direction == "down":
                pitches = pitches[::-1]  # a nota mais aguda entra primeiro
        return [(start + offset, end, pitch, vel) for pitch, offset in zip(pitches, offsets)]

    if not chord.comp_layers:
        return block([n.midi for n, _ in voices], 0, length, velocity)

    notes: list[tuple[int, int, int, int]] = []
    for hits, total in chord.comp_layers:
        base = 0
        while base < length:
            for hit in hits:
                start = base + hit.start
                if start >= length:
                    break
                vel = max(1, min(127, velocity + hit.accent))
                notes.extend(block(_hit_notes(voices, hit.part, scale), start, min(start + hit.length, length), vel))
            base += total
    return _merge_same_keys(notes)


def _merge_same_keys(notes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """A mesma tecla pedida duas vezes: no mesmo instante, fica a mais longa; depois, o toque novo corta o anterior."""
    by_pitch: dict[int, list[tuple[int, int, int, int]]] = {}
    for note in sorted(notes, key=lambda n: n[0]):
        same = by_pitch.setdefault(note[2], [])
        if same and same[-1][0] == note[0]:
            if note[1] > same[-1][1]:
                same[-1] = (note[0], note[1], note[2], max(note[3], same[-1][3]))
            continue
        if same and same[-1][1] > note[0]:
            same[-1] = (same[-1][0], note[0], same[-1][2], same[-1][3])
        same.append(note)
    return sorted((n for group in by_pitch.values() for n in group if n[1] > n[0]), key=lambda n: (n[0], n[2]))


def drum_notes(project: Project, total: int, ticks_per_beat: int = TICKS_PER_BEAT, bars: list | None = None) -> list[tuple[int, int, int, int]]:
    """Notas da bateria (ou da percussão, com ``bars``), no canal 10: [(início, fim, nota, velocity)] em ticks.

    Os compassos escritos se repetem até o fim; em cada compasso, cada camada se repete até o fim do compasso.
    """
    drum_bars = project.drum_bars if bars is None else bars
    if not drum_bars or total <= 0:
        return []
    bar_ticks = max(1, beats_to_ticks(project.beats_per_bar, ticks_per_beat))
    notes: list[tuple[int, int, int, int]] = []
    index = 0
    bar_start = 0
    while bar_start < total:
        bar_end = min(bar_start + bar_ticks, total)
        for hits, layer_ticks in drum_bars[index % len(drum_bars)]:
            base = bar_start
            while base < bar_end:
                for hit in hits:
                    start = base + hit.start
                    if start >= bar_end:
                        break
                    velocity = max(1, min(127, project.default_velocity + hit.accent))
                    notes.append((start, min(start + hit.length, bar_end), int(hit.part), velocity))
                base += layer_ticks
        index += 1
        bar_start += bar_ticks
    return _merge_same_keys(notes)


def pad_pitches(chord) -> list[int]:
    """As notas do pad para um acorde: sempre abertas. A nota mais grave do acorde vai para a região de Sol 2 a Fá# 3,
    a quinta (se o acorde tiver) logo acima, e as outras notas na oitava seguinte."""
    sounding = chord.sounding()
    if not sounding:
        return []
    root = sounding[0][0].midi
    base = 36 + root % 12
    if base < 43:
        base += 12
    intervals = sorted({(note.midi - root) % 12 for note, _ in sounding} - {0})
    fifth = next((i for i in (7, 6, 8) if i in intervals), None)
    out = [base] + ([base + fifth] if fifth is not None else [])
    out += [base + 12 + i for i in intervals if i != fifth]
    return sorted(set(out))


def pad_notes(project: Project, ticks_per_beat: int = TICKS_PER_BEAT) -> list[list[int]]:
    """Notas do pad: [[início, fim, nota, velocity]]. Cada acorde soa inteiro; nota igual no acorde seguinte fica ligada."""
    if not project.pad:
        return []
    notes: list[list[int]] = []
    last: dict[int, list[int]] = {}
    tick = 0
    for chord in project.chords:
        length = beats_to_ticks(chord.duration_beats, ticks_per_beat)
        velocity = max(1, min(127, project.velocity_for(chord) - PAD_SOFTER))
        current: dict[int, list[int]] = {}
        for pitch in pad_pitches(chord):
            held = last.get(pitch)
            if held is not None and held[1] == tick:
                held[1] = tick + length
                current[pitch] = held
            else:
                note = [tick, tick + length, pitch, velocity]
                notes.append(note)
                current[pitch] = note
        last = current
        tick += length
    return notes


def build_midi(project: Project, *, ticks_per_beat: int = TICKS_PER_BEAT, markers: bool = True,
               phrase_mode: str = "both") -> mido.MidiFile:
    """Gera o MidiFile exatamente com as notas, oitavas e durações do projeto."""
    if phrase_mode not in PHRASE_MODES:
        raise ValueError(f"phrase_mode deve ser um de {PHRASE_MODES} (recebido {phrase_mode!r}).")
    num, den = project.time_signature
    # (tick, prioridade, altura, canal, mensagem). Prioridade: note_off < meta < note_on.
    events: list[tuple[int, int, int, int, mido.Message | mido.MetaMessage]] = []
    tick = 0
    for chord in project.chords:
        length = beats_to_ticks(chord.duration_beats, ticks_per_beat)
        velocity = project.velocity_for(chord)
        if markers and chord.symbol:
            events.append((tick, 1, 0, CHANNEL, mido.MetaMessage("marker", text=_meta_text(chord.symbol))))
        for start, end, pitch, vel in chord_notes(project, chord, length, phrase_mode, ticks_per_beat):
            events.append((tick + start, 2, pitch, CHANNEL, mido.Message("note_on", channel=CHANNEL, note=pitch, velocity=vel)))
            events.append((tick + end, 0, pitch, CHANNEL, mido.Message("note_off", channel=CHANNEL, note=pitch, velocity=0)))
        for e in chord.bass_events:
            pitch = e.note.midi
            events.append((tick + e.start, 2, pitch, BASS_CHANNEL, mido.Message("note_on", channel=BASS_CHANNEL, note=pitch, velocity=velocity)))
            events.append((tick + e.start + e.length, 0, pitch, BASS_CHANNEL, mido.Message("note_off", channel=BASS_CHANNEL, note=pitch, velocity=0)))
        if phrase_mode != "chords":
            for e in [*chord.phrase_events, *chord.phrase_extra]:
                pitch = e.note.midi
                events.append((tick + e.start, 2, pitch, PHRASE_CHANNEL,
                               mido.Message("note_on", channel=PHRASE_CHANNEL, note=pitch, velocity=velocity)))
                events.append((tick + e.start + e.length, 0, pitch, PHRASE_CHANNEL,
                               mido.Message("note_off", channel=PHRASE_CHANNEL, note=pitch, velocity=0)))
        tick += length
    end_tick = tick
    for start, end, pitch, vel in pad_notes(project, ticks_per_beat):
        events.append((start, 2, pitch, PAD_CHANNEL, mido.Message("note_on", channel=PAD_CHANNEL, note=pitch, velocity=vel)))
        events.append((end, 0, pitch, PAD_CHANNEL, mido.Message("note_off", channel=PAD_CHANNEL, note=pitch, velocity=0)))
    for e in project.voice_events:
        if e.start >= end_tick:
            continue
        pitch = e.note.midi
        events.append((e.start, 2, pitch, VOICE_CHANNEL, mido.Message("note_on", channel=VOICE_CHANNEL, note=pitch, velocity=project.default_velocity)))
        events.append((min(e.start + e.length, end_tick), 0, pitch, VOICE_CHANNEL, mido.Message("note_off", channel=VOICE_CHANNEL, note=pitch, velocity=0)))

    second_velocity = max(1, min(127, project.default_velocity - VOICE2_SOFTER))
    for e in project.voice2_events:
        if e.start >= end_tick:
            continue
        pitch = e.note.midi
        events.append((e.start, 2, pitch, VOICE2_CHANNEL, mido.Message("note_on", channel=VOICE2_CHANNEL, note=pitch, velocity=second_velocity)))
        events.append((min(e.start + e.length, end_tick), 0, pitch, VOICE2_CHANNEL, mido.Message("note_off", channel=VOICE2_CHANNEL, note=pitch, velocity=0)))

    drums = [(start, 2, pitch, DRUM_CHANNEL, mido.Message("note_on", channel=DRUM_CHANNEL, note=pitch, velocity=vel))
             for start, _, pitch, vel in drum_notes(project, end_tick, ticks_per_beat)]
    drums += [(end, 0, pitch, DRUM_CHANNEL, mido.Message("note_off", channel=DRUM_CHANNEL, note=pitch, velocity=0))
              for _, end, pitch, _ in drum_notes(project, end_tick, ticks_per_beat)]
    percussion_notes = drum_notes(project, end_tick, ticks_per_beat, project.percussion_bars)
    percussion = [(start, 2, pitch, DRUM_CHANNEL, mido.Message("note_on", channel=DRUM_CHANNEL, note=pitch, velocity=vel))
                  for start, _, pitch, vel in percussion_notes]
    percussion += [(end, 0, pitch, DRUM_CHANNEL, mido.Message("note_off", channel=DRUM_CHANNEL, note=pitch, velocity=0))
                   for _, end, pitch, _ in percussion_notes]
    phrase = [e for e in events if e[3] == PHRASE_CHANNEL]
    bass = [e for e in events if e[3] == BASS_CHANNEL]
    voice = [e for e in events if e[3] == VOICE_CHANNEL]
    pad = [e for e in events if e[3] == PAD_CHANNEL]
    voice2 = [e for e in events if e[3] == VOICE2_CHANNEL]
    chords = [e for e in events if e[3] not in (PHRASE_CHANNEL, BASS_CHANNEL, VOICE_CHANNEL, PAD_CHANNEL, VOICE2_CHANNEL)]

    def make_track(name: str, items: list, header: bool) -> mido.MidiTrack:
        track = mido.MidiTrack()
        track.append(mido.MetaMessage("track_name", name=_meta_text(name), time=0))
        if header:
            track.append(mido.MetaMessage("time_signature", numerator=num, denominator=den,
                                          clocks_per_click=24, notated_32nd_notes_per_beat=8, time=0))
            track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(project.tempo), time=0))
        last = 0
        for at, _, _, _, msg in sorted(items, key=lambda e: (e[0], e[1], e[2], e[3])):
            track.append(msg.copy(time=at - last))
            last = at
        track.append(mido.MetaMessage("end_of_track", time=end_tick - last))
        return track

    title = project.title or "Harmona Lab"
    if not phrase and not drums and not bass and not percussion and not voice and not pad and not voice2:
        midi = mido.MidiFile(type=0, ticks_per_beat=ticks_per_beat)
        midi.tracks.append(make_track(title, chords, True))
        return midi
    midi = mido.MidiFile(type=1, ticks_per_beat=ticks_per_beat)
    midi.tracks.append(make_track(title, chords, True))
    if voice:
        midi.tracks.append(make_track("Voz", voice, False))
    if voice2:
        midi.tracks.append(make_track("Voz 2", voice2, False))
    if phrase:
        midi.tracks.append(make_track("Frase", phrase, False))
    if bass:
        midi.tracks.append(make_track("Baixo", bass, False))
    if pad:
        midi.tracks.append(make_track("Pad", pad, False))
    if drums:
        midi.tracks.append(make_track("Bateria", drums, False))
    if percussion:
        midi.tracks.append(make_track("Percussão", percussion, False))
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
