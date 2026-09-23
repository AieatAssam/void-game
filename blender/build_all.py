"""Rebuild + export every asset. Run inside Blender (via MCP: exec(open(this).read())).
Order = showroom grid order."""
import sys, importlib, io, contextlib
sys.path.insert(0, '/Users/aieat/hole-game/blender')
import lib
importlib.reload(lib)

ASSETS = [
    # street props (size ladder bottom)
    'pigeon', 'peg_a', 'peg_b', 'peg_c', 'cone', 'hydrant', 'mailbox', 'trashcan', 'lamp', 'newsbox', 'flower_pot', 'vending', 'dog', 'phone_booth',
    'planter', 'bench', 'scooter', 'bicycle', 'hotdog_cart', 'picnic_table', 'tree_small', 'kiosk', 'fountain', 'tree_big',
    # vehicles
    'car', 'car_b', 'taxi', 'icecream_van', 'bus',
    # poison + hazards
    'gas_can', 'toxic_barrel', 'spiky', 'barricade',
    # response units
    'police_car', 'cement_truck', 'heli', 'tank',
    # buildings
    'house', 'shop', 'cafe', 'apartment', 'clock_tower', 'office', 'hotel', 'skyscraper',
    # ground + fx
    'tile_lot', 'tile_park', 'tile_plaza', 'concrete_plug', 'hole_rim',
]
ONLY = globals().get('ONLY') or ASSETS
for n in ONLY:
    i = ASSETS.index(n)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            r = lib.run(n, (i % 8, i // 8))
        print(r)
    except Exception as e:
        import traceback
        print('FAIL', n, traceback.format_exc(limit=-2))
