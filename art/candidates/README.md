# Water normal volume candidate

`water-normal-volume-128x128x16.rgba8` is a periodic RGBA8 normal volume: x is fastest, z is the 16-step loop phase, and alpha repeats the existing crest mask in every slice. `water-normal-volume-atlas.png` is the slice stack for inspection; `water-normal-volume.blend` is the isolated Blender collection export.

Regenerate from the repo root through the local Blender MCP bridge:

```sh
/Users/aieat/.cache/uv/archive-v0/vTW8IoqVKPF0Mg7K/bin/python /private/tmp/void-blender-mcp.py art/candidates/bake-water-normal-volume.py
```

Check the raw buffer and cyclic spatial/temporal joins with:

```sh
python3 art/candidates/check-water-normal-volume.py
```

The game samples this only with `?waterVolume`; default startup continues to use `public/textures/water/water-detail.png`.
