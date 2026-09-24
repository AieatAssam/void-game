"""Rare: a rainbow pigeon."""
import pigeon
from lib import *


def build():
    ob = pigeon.build()
    recolor(ob, {'steel': 'pink', 'teal': 'mint', 'asphalt_lt': 'sky', 'hazard': 'butter'})
    ob['rare'] = True
    return ob
