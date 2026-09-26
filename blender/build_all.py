"""Rebuild + export every asset. Run inside Blender (via MCP: exec(open(this).read())).
Order = showroom grid order."""
import sys, importlib, io, contextlib
sys.path.insert(0, '/Users/aieat/hole-game/blender')
import lib
importlib.reload(lib)

ASSETS = [
    # street props (size ladder bottom)
    'pigeon', 'ped_business', 'ped_jogger', 'ped_tourist', 'ped_granny', 'ped_student', 'ped_chef', 'ped_worker', 'ped_kid', 'cone', 'hydrant', 'mailbox', 'trashcan', 'lamp', 'newsbox', 'flower_pot', 'vending', 'dog', 'phone_booth',
    'planter', 'bench', 'scooter', 'bicycle', 'hotdog_cart', 'picnic_table', 'tree_small', 'kiosk', 'fountain', 'tree_big',
    # vehicles
    'car', 'car_b', 'car_c', 'taxi', 'icecream_van', 'bus',
    # poison + hazards
    'gas_can', 'toxic_barrel', 'spiky', 'barricade',
    # response units
    'police_car', 'cement_truck', 'heli', 'tank',
    # buildings
    'house', 'shop', 'cafe', 'apartment', 'clock_tower', 'office', 'hotel', 'skyscraper',
    # new districts + construction + suburbs
    'gnome', 'fence', 'swing', 'dirt_pile', 'rowboat', 'crane',
    # ground + fx
    'tile_lot', 'tile_park', 'tile_plaza', 'tile_residential', 'tile_construction', 'tile_parking', 'tile_canal',
    'concrete_plug', 'hole_rim', 'cloud',
    # stage 8: beach, neon, rares
    'tile_beach', 'land_sea', 'beach_umbrella', 'deckchair', 'sandcastle', 'beach_ball', 'surfboard', 'lifeguard_tower',
    'crab', 'sailboat', 'pier', 'tile_neon', 'arcade', 'karaoke', 'neon_sign', 'noodle_stall', 'searchlight',
    'golden_gnome', 'gold_hydrant', 'rainbow_pigeon', 'mayor_limo',
    # countryside scenery ring
    'land_meadow', 'land_farm', 'land_lake', 'windmill', 'barn', 'cow',
]
# Variety pack (HANDOVER.md): tagged with a `pack` extra, exported to public/models/packs.json, loaded on demand.
PACKS = [
    # city events
    'drummer', 'marathon_runner', 'alien', 'parade_float', 'balloon_float', 'finish_arch', 'supercar', 'classic_car', 'show_turntable', 'ufo',
    # fairground
    'tile_fair', 'ferris_wheel', 'carousel', 'ticket_booth', 'balloon_stand', 'bumper_car', 'hoopla_stall',
    # airport
    'tile_runway', 'airliner', 'control_tower', 'baggage_tug', 'hangar',
    # farm fair
    'prize_pumpkin', 'hay_bale', 'tractor', 'scarecrow',
    # rail
    'tile_rail', 'locomotive', 'carriage', 'station',
    # chain reactions
    'gas_station', 'fireworks_stand', 'water_tower',
    # power-ups + mutators
    'pu_magnet', 'pu_ghost', 'pu_split', 'pu_boost', 'rubber_duck',
]
# Phase 2 (docs/PHASE2.md): the region pack - settlements, industry, the capital, the army.
REGION = [
    'cottage', 'farmhouse', 'grain_silo', 'village_church', 'village_inn',
    'castle_wall', 'castle_tower', 'castle_gate', 'castle_keep', 'cannon', 'pavilion',
    'townhouse_row', 'townhouse_row_b', 'market_hall', 'town_hall', 'cathedral',
    'factory', 'chimney_stack', 'gasholder', 'fuel_tank', 'cooling_tower', 'pylon', 'wind_turbine',
    'city_block', 'city_block_b', 'glass_tower', 'supertall', 'tv_tower', 'stadium', 'parliament',
    'army_truck', 'howitzer', 'jet', 'chinook', 'sandbags', 'capper',
]
ALL = ASSETS + PACKS + REGION
ONLY = globals().get('ONLY') or ASSETS
for n in ONLY:
    try:
        i = ALL.index(n)
        with contextlib.redirect_stdout(io.StringIO()):
            r = lib.run(n, (i % 8, i // 8))
        print(r)
    except Exception as e:
        import traceback
        print('FAIL', n, traceback.format_exc(limit=-2))
