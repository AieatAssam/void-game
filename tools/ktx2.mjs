// Encode the scanned PBR layers (public/tex/*_{col,nrm,rha}.jpg) to GPU-compressed KTX2 (Basis Universal):
//   col: ETC1S, sRGB (small; scanned albedo is detail blended over palette colour, where ETC1S holds up)
//   nrm: UASTC + normal-map tuning, linear   } UASTC: ETC1S's shared-endpoint blocks smear normals and the
//   rha: UASTC, linear                        } unrelated roughness / height / AO channels into each other
// Mipmaps are generated here (compressed textures can't be mipmapped on the GPU). Also writes means.json: each
// layer's mean albedo in linear RGB, which src/pbr.js used to measure from the decoded JPEGs at load.
// node tools/ktx2.mjs            (about 5 minutes; skips files that are newer than their JPEG)
import { encodeToKTX2 } from 'ktx2-encoder';
import jpeg from 'jpeg-js';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';

const LAYERS = ['plaster', 'asphalt', 'concrete', 'grass', 'paving', 'sand', 'dirt', 'brick', 'wood', 'foliage', 'metal',
  'roof', 'rock', 'bark', 'forest', 'shore']; // same order as src/pbr.js
const SIZE = 512;
const OUT = 'public/tex/ktx2';
mkdirSync(OUT, { recursive: true });

const decode = (buf) => {
  const im = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  if (im.width !== SIZE || im.height !== SIZE) throw new Error(`expected ${SIZE}x${SIZE}, got ${im.width}x${im.height}`);
  return { data: im.data, width: im.width, height: im.height };
};
const OPTS = {
  col: { isUASTC: false, qualityLevel: 255, compressionLevel: 4, isPerceptual: true, isSetKTX2SRGBTransferFunc: true },
  nrm: { isUASTC: true, isNormalMap: true, enableRDO: true, rdoQualityLevel: 2, needSupercompression: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },
  rha: { isUASTC: true, enableRDO: true, rdoQualityLevel: 3, needSupercompression: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },
};
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const means = [];
let bytesIn = 0, bytesOut = 0;
for (const name of LAYERS) {
  for (const k of ['col', 'nrm', 'rha']) {
    const src = `public/tex/${name}_${k}.jpg`, dst = `${OUT}/${name}_${k}.ktx2`;
    const buf = readFileSync(src);
    bytesIn += buf.length;
    if (k === 'col') { // mean albedo (linear), sampled like src/pbr.js did: every 16th texel
      const px = decode(buf).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 64, n++) { r += srgbToLinear(px[i] / 255); g += srgbToLinear(px[i + 1] / 255); b += srgbToLinear(px[i + 2] / 255); }
      means.push([r / n, g / n, b / n].map((v) => +v.toFixed(5)));
    }
    if (existsSync(dst) && statSync(dst).mtimeMs > statSync(src).mtimeMs) { bytesOut += statSync(dst).size; continue; }
    const out = await encodeToKTX2(new Uint8Array(buf), { ...OPTS[k], generateMipmap: true, imageDecoder: async (b) => decode(b) });
    writeFileSync(dst, out);
    bytesOut += out.length;
    console.log(`${dst}  ${(buf.length / 1024).toFixed(0)} KB jpg -> ${(out.length / 1024).toFixed(0)} KB`);
  }
}
writeFileSync(`${OUT}/means.json`, JSON.stringify(means));
console.log(`done: ${(bytesIn / 1e6).toFixed(1)} MB of JPEG -> ${(bytesOut / 1e6).toFixed(1)} MB of KTX2`);
