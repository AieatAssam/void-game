"""Rare: a gold-plated hydrant."""
import hydrant
from lib import *


def build():
    ob = hydrant.build()
    recolor(ob, {'red': 'gold', 'white': 'chrome', 'hazard': 'gold'})
    ob['rare'] = True
    return ob
