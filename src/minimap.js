// Phase 2 minimap: the island at a glance (coast, lakes, woods, mountains, roads), the settlements still standing,
// the hole, rivals and the army's big threats. North-up, screen-up = -z like the camera.
const SIZE = 172, RES = 112; // CSS px on screen; terrain samples across

export class Minimap {
  constructor() {
    this.el = Object.assign(document.createElement('canvas'), { id: 'minimap', hidden: true });
    document.body.append(this.el);
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.el.width = this.el.height = SIZE * this.dpr;
    this.ctx = this.el.getContext('2d');
    this.base = Object.assign(document.createElement('canvas'), { width: RES, height: RES });
    this.t = 0;
  }

  /** A new region: bake its land a few rows per frame (update), so the breakout never waits on it. */
  start(city) {
    this.city = city;
    this.ext = (city.bound * 1.12);
    this.img = this.base.getContext('2d').createImageData(RES, RES);
    this.row = 0;
    this.el.hidden = false;
  }

  stop() { this.city = null; this.el.hidden = true; }

  bake(rows) {
    const T = this.city.terrain, d = this.img.data, w = T.water;
    for (let n = 0; n < rows && this.row < RES; n++, this.row++) {
      const z = (this.row / (RES - 1) * 2 - 1) * this.ext;
      for (let i = 0; i < RES; i++) {
        const x = (i / (RES - 1) * 2 - 1) * this.ext, h = T.heightAt(x, z);
        let c;
        if (h < w) { const k = Math.min(1, (w - h) / 20); c = [70 - 40 * k, 150 - 60 * k, 190 - 50 * k]; } // shallows to deep sea
        else if (h - w < 1.2) c = [226, 208, 160]; // shore
        else if (h > 46) c = [236, 238, 242]; // snow
        else if (T.mountain(x, z) > 0.22) c = [128, 124, 112]; // rock
        else if (T.forest(x, z) > 0.55) c = [78, 128, 70];
        else { const k = Math.min(1, h / 40); c = [120 - 20 * k, 176 - 30 * k, 92 - 10 * k]; }
        const o = (this.row * RES + i) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    this.base.getContext('2d').putImageData(this.img, 0, 0);
  }

  /** Called every frame; redraws ~12 times a second. things: { hole, rivals: [holes], boss, heli } */
  update(dt, things) {
    if (!this.city || this.el.hidden) return;
    if (this.row < RES) this.bake(8);
    if ((this.t -= dt) > 0) return;
    this.t = 1 / 12;
    const g = this.ctx, S = SIZE * this.dpr, k = S / (2 * this.ext), P = (x, z) => [S / 2 + x * k, S / 2 + z * k];
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, 7); g.clip();
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, 0, 0, S, S);
    // roads
    g.strokeStyle = '#f3e3c2cc'; g.lineWidth = 1.2 * this.dpr; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.city.roads) {
      g.beginPath();
      r.pts.forEach(([x, z], i) => (i ? g.lineTo : g.moveTo).call(g, ...P(x, z)));
      g.stroke();
    }
    // settlements: warm while standing, a dark scar when cleared; the one the marker points at pulses
    const next = this.city.target?.(things.hole), pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    for (const q of this.city.settlements) {
      const [x, y] = P(q.x, q.z), r = Math.max(2.5 * this.dpr, q.r * k);
      g.beginPath(); g.arc(x, y, r, 0, 7);
      g.fillStyle = q.left === 0 ? '#2a1d4a' : q === this.city.capital ? '#ff8a3d' : '#f7d774';
      g.fill();
      if (q === next) { g.lineWidth = (1.5 + pulse) * this.dpr; g.strokeStyle = '#fff'; g.stroke(); }
    }
    const dot = (x, z, r, fill, ring) => {
      const [px, py] = P(x, z);
      g.beginPath(); g.arc(px, py, Math.max(r * k, 3 * this.dpr), 0, 7);
      g.fillStyle = fill; g.fill();
      if (ring) { g.lineWidth = 1.5 * this.dpr; g.strokeStyle = ring; g.stroke(); }
    };
    for (const h of things.rivals || []) dot(h.x, h.z, h.r, '#12091f', '#ff6b6b');
    if (things.boss) dot(things.boss.x, things.boss.z, 8, '#e4473c', '#fff');
    if (things.heli) dot(things.heli.x, things.heli.z, 6, '#ffd166', '#e4473c');
    dot(things.hole.x, things.hole.z, things.hole.r, '#12091f', '#b58cff');
    g.restore();
  }
}
