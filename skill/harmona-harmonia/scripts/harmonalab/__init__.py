"""Harmona Lab — laboratório de voicings, reharmonização e condução de vozes → MIDI.

Camadas (cada uma só conhece as de baixo):

    interface web / linha de comando
            │
    model (Project, ChordEvent)  ←  JSON
            │
    pitch (Note, número MIDI)    →  midi_io (arquivo .mid)
"""

from .model import ChordEvent, Issue, Project, ProjectError, load_project
from .pitch import Note, name_to_midi, midi_to_name, parse_note, parse_note_list

__version__ = "0.1.0"

__all__ = [
    "ChordEvent", "Issue", "Note", "Project", "ProjectError",
    "load_project", "midi_to_name", "name_to_midi", "parse_note", "parse_note_list",
]
