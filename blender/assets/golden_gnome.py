"""Rare: a golden gnome. Worth a collection page and bonus dust."""
import gnome
from lib import *


def build():
    ob = gnome.build()
    recolor(ob, {'sky': 'gold', 'red': 'gold', 'peach': 'gold', 'white': 'gold', 'ink': 'gold', 'forest': 'gold', 'clay': 'gold', 'pink': 'gold'})
    ob['rare'] = True
    return ob
