const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { parseHex } = require('./colors');

const EFFECTS = {

  // ==================== Filter effects ====================

  blur: {
    description: 'Gaussian blur',
    amount: { label: 'Sigma', default: 3, min: 0.3, max: 100 },
    apply(image, amt) { return image.blur(amt); },
  },

  sharpen: {
    description: 'Sharpen edges and details',
    amount: { label: 'Sigma', default: 2, min: 0.3, max: 30 },
    apply(image, amt) { return image.sharpen(amt); },
  },

  grayscale: {
    description: 'Convert to black and white',
    amount: false,
    apply(image) { return image.grayscale(); },
  },

  invert: {
    description: 'Invert / negative colors',
    amount: false,
    apply(image) { return image.negate(); },
  },

  flip: {
    description: 'Flip vertically',
    amount: false,
    apply(image) { return image.flip(); },
  },

  flop: {
    description: 'Flip horizontally',
    amount: false,
    apply(image) { return image.flop(); },
  },

  rotate: {
    description: 'Rotate by degrees',
    amount: { label: 'Degrees', default: 90, min: -360, max: 360 },
    apply(image, amt) { return image.rotate(amt, { background: { r: 0, g: 0, b: 0, alpha: 0 } }); },
  },

  median: {
    description: 'Median filter (noise reduction)',
    amount: { label: 'Window size', default: 3, min: 1, max: 25 },
    apply(image, amt) { return image.median(Math.round(amt)); },
  },

  normalize: {
    description: 'Stretch contrast to full range',
    amount: false,
    apply(image) { return image.normalize(); },
  },

  threshold: {
    description: 'Black and white threshold cut-off',
    amount: { label: 'Threshold', default: 128, min: 0, max: 255 },
    apply(image, amt) { return image.threshold(Math.round(amt)); },
  },

  gamma: {
    description: 'Gamma correction (<1 darker, >1 brighter)',
    amount: { label: 'Gamma', default: 2.2, min: 0.1, max: 10 },
    apply(image, amt) { return image.gamma(amt); },
  },

  // ==================== Color adjustment effects ====================

  brightness: {
    description: 'Adjust brightness',
    amount: { label: 'Multiplier', default: 1.2, min: 0, max: 5 },
    apply(image, amt) { return image.modulate({ brightness: amt }); },
  },

  saturation: {
    description: 'Adjust color saturation',
    amount: { label: 'Multiplier', default: 1.5, min: 0, max: 5 },
    apply(image, amt) { return image.modulate({ saturation: amt }); },
  },

  hue: {
    description: 'Rotate hue angle',
    amount: { label: 'Degrees', default: 90, min: 0, max: 360 },
    apply(image, amt) { return image.modulate({ hue: amt }); },
  },

  contrast: {
    description: 'Adjust contrast',
    amount: { label: 'Multiplier', default: 1.3, min: 0, max: 5 },
    apply(image, amt) {
      return image.linear(amt, -(128 * (amt - 1)));
    },
  },

  temperature: {
    description: 'White balance warm (+) / cool (-)',
    amount: { label: 'Shift', default: 30, min: -100, max: 100 },
    apply(image, amt) {
      const f = amt / 100;
      const r = 1 + f * 0.4;
      const g = 1 - Math.abs(f) * 0.05;
      const b = 1 - f * 0.5;
      return image.linear([r, g, b], [0, 0, 0]);
    },
  },

  exposure: {
    description: 'Exposure adjustment (stops-like)',
    amount: { label: 'EV shift', default: 1.0, min: -3, max: 3 },
    apply(image, amt) {
      if (amt >= 0) {
        return image.linear(Math.pow(2, amt), 0);
      }
      return image.gamma(Math.pow(2, -amt));
    },
  },

  'tint-balance': {
    description: 'Green (+) / magenta (-) tint shift',
    amount: { label: 'Shift', default: 20, min: -100, max: 100 },
    apply(image, amt) {
      const f = amt / 100;
      const g = 1 + f * 0.35;
      const rb = 1 - f * 0.25;
      return image.linear([rb, g, rb], [0, 0, 0]);
    },
  },

  clahe: {
    description: 'Local contrast enhancement (CLAHE)',
    amount: { label: 'Strength', default: 3, min: 0.5, max: 10 },
    apply(image, amt) {
      return image.clahe({ width: 8, height: 8, maxSlope: amt });
    },
  },

  // ==================== Composite effects ====================

  sepia: {
    description: 'Vintage sepia brown tone',
    amount: { label: 'Intensity %', default: 80, min: 0, max: 100 },
    apply(image, amt) {
      const f = amt / 100;
      return image
        .modulate({ saturation: 1 - f * 0.8 })
        .linear([(1 - f) + f * (240 / 255), (1 - f) + f * (200 / 255), (1 - f) + f * (150 / 255)], [0, 0, 0]);
    },
  },

  posterize: {
    description: 'Reduce color palette to N levels per channel',
    amount: { label: 'Levels', default: 4, min: 2, max: 64 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const buf = await image.ensureAlpha().raw().toBuffer();
      const levels = Math.round(amt);
      const step = 255 / (levels - 1);
      for (let i = 0; i < buf.length; i += 4) {
        buf[i]     = Math.round(buf[i] / step) * step;
        buf[i + 1] = Math.round(buf[i + 1] / step) * step;
        buf[i + 2] = Math.round(buf[i + 2] / step) * step;
      }
      return sharp(buf, { raw: { width: meta.width, height: meta.height, channels: 4 } });
    },
  },

  pixelate: {
    description: 'Mosaic pixelation effect',
    amount: { label: 'Pixel size', default: 8, min: 2, max: 100 },
    apply(image, amt) {
      return image.resize(Math.max(1, Math.round(amt)), Math.max(1, Math.round(amt)), {
        fit: 'fill',
        kernel: 'nearest',
      });
    },
  },

  emboss: {
    description: 'Emboss relief effect',
    amount: { label: 'Strength', default: 2, min: 1, max: 10 },
    apply(image, amt) {
      const kernel = [
        [-amt, -amt / 2, 0],
        [-amt / 2, amt / 4, amt / 2],
        [0, amt / 2, amt],
      ];
      return image.convolve({ width: 3, height: 3, kernel: kernel.flat(), scale: 1, offset: 128 });
    },
  },

  edge: {
    description: 'Edge detection (Laplacian)',
    amount: { label: 'Strength', default: 1, min: 1, max: 10 },
    apply(image, amt) {
      const kernel = [
        [0, -amt, 0],
        [-amt, 4 * amt, -amt],
        [0, -amt, 0],
      ];
      return image.convolve({ width: 3, height: 3, kernel: kernel.flat(), scale: 1, offset: 128 });
    },
  },

  noise: {
    description: 'Add film grain / noise',
    amount: { label: 'Intensity %', default: 15, min: 1, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const { width, height } = meta;
      const noise = await makeNoise(width, height, amt);
      return image.composite([{ input: noise, blend: 'over' }]);
    },
  },

  vignette: {
    description: 'Darken or lighten image edges',
    amount: { label: 'Strength %', default: 60, min: -100, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const { width, height } = meta;
      const vignetteOverlay = await makeVignette(width, height, amt);
      return image.composite([{ input: vignetteOverlay, blend: 'over' }]);
    },
  },

  glow: {
    description: 'Soft glow / bloom around bright areas',
    amount: { label: 'Radius', default: 12, min: 1, max: 100 },
    async apply(image, amt) {
      const buf = await image.toBuffer();
      const glowLayer = await sharp(buf).blur(amt).modulate({ brightness: 1.2 }).toBuffer();
      return sharp(buf).composite([{ input: glowLayer, blend: 'screen' }]);
    },
  },

  // ==================== New effects ====================

  'motion-blur': {
    description: 'Simulates directional motion blur using a convolution kernel',
    amount: { label: 'Angle', default: 0, min: 0, max: 360 },
    apply(image, amt) {
      const rad = (amt * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const size = 7;
      const half = Math.floor(size / 2);
      const kernel = new Array(size * size).fill(0);
      for (let i = 0; i < size; i++) {
        const t = i - half;
        const kx = Math.round(t * dx + half);
        const ky = Math.round(t * dy + half);
        if (kx >= 0 && kx < size && ky >= 0 && ky < size) {
          kernel[ky * size + kx] = 1;
        }
      }
      const sum = kernel.reduce((a, b) => a + b, 0) || 1;
      const normalized = kernel.map(v => v / sum);
      return image.convolve({ width: size, height: size, kernel: normalized });
    },
  },

  'radial-blur': {
    description: 'Zoom/radial blur effect',
    amount: { label: 'Strength', default: 10, min: 1, max: 30 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const scale = Math.max(0.1, 1 - amt / 100);
      const sw = Math.max(1, Math.round(meta.width * scale));
      const sh = Math.max(1, Math.round(meta.height * scale));
      const buf = await image.toBuffer();
      return sharp(buf)
        .resize(sw, sh, { kernel: 'cubic' })
        .resize(meta.width, meta.height, { kernel: 'cubic' });
    },
  },

  halftone: {
    description: 'CMYK halftone dot pattern',
    amount: { label: 'Dot size', default: 6, min: 2, max: 20 },
    apply(image, amt) {
      const levels = Math.max(2, Math.round(24 / amt));
      return image.posterize(levels);
    },
  },

  dither: {
    description: 'Floyd-Steinberg style dither to black and white',
    amount: { label: 'Threshold', default: 128, min: 0, max: 255 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const buf = await image.grayscale().ensureAlpha().raw().toBuffer();
      const { width, height } = meta;
      const out = Buffer.alloc(width * height * 4);
      const errors = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const pixel = buf[idx * 4] + (errors[idx] || 0);
          const newVal = pixel < amt ? 0 : 255;
          const err = pixel - newVal;
          if (x + 1 < width) errors[idx + 1] += err * 7 / 16;
          if (y + 1 < height) {
            if (x > 0) errors[idx + width - 1] += err * 3 / 16;
            errors[idx + width] += err * 5 / 16;
            if (x + 1 < width) errors[idx + width + 1] += err * 1 / 16;
          }
          const oi = idx * 4;
          out[oi] = newVal;
          out[oi + 1] = newVal;
          out[oi + 2] = newVal;
          out[oi + 3] = 255;
        }
      }
      return sharp(out, { raw: { width, height, channels: 4 } });
    },
  },

  'oil-paint': {
    description: 'Oil painting effect using median filter with larger window',
    amount: { label: 'Brush size', default: 5, min: 2, max: 20 },
    apply(image, amt) {
      return image.median(Math.round(amt));
    },
  },

  sketch: {
    description: 'Pencil sketch look',
    amount: { label: 'Strength', default: 3, min: 1, max: 10 },
    async apply(image, amt) {
      const buf = await image.grayscale().toBuffer();
      const edges = await sharp(buf).convolve({
        width: 3,
        height: 3,
        kernel: [0, -amt, 0, -amt, 4 * amt, -amt, 0, -amt, 0],
        scale: 1,
        offset: 128,
      }).toBuffer();
      const invEdges = await sharp(edges).negate().toBuffer();
      return sharp(buf).composite([{ input: invEdges, blend: 'screen' }]);
    },
  },

  neon: {
    description: 'Neon glow around edges',
    amount: { label: 'Glow radius', default: 8, min: 2, max: 30 },
    async apply(image, amt) {
      const buf = await image.toBuffer();
      const edges = await sharp(buf).convolve({
        width: 3,
        height: 3,
        kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0],
        scale: 1,
        offset: 128,
      }).modulate({ brightness: 1.5, saturation: 1.5 }).blur(amt).toBuffer();
      return sharp(buf).composite([{ input: edges, blend: 'screen' }]);
    },
  },

  cartoon: {
    description: 'Cartoon/cel-shaded look',
    amount: { label: 'Levels', default: 5, min: 3, max: 10 },
    async apply(image, amt) {
      const buf = await image.toBuffer();
      const posterized = await sharp(buf).posterize(amt).toBuffer();
      const edges = await sharp(buf).grayscale().convolve({
        width: 3,
        height: 3,
        kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0],
        scale: 1,
        offset: 128,
      }).threshold(100).toBuffer();
      return sharp(posterized).composite([{ input: edges, blend: 'multiply' }]);
    },
  },

  vibrance: {
    description: 'Smart saturation that boosts muted colors more than already-saturated ones',
    amount: { label: 'Strength', default: 30, min: -100, max: 100 },
    apply(image, amt) {
      const f = amt / 100;
      return image
        .modulate({ saturation: 1 + f * 0.6 })
        .linear(1 + f * 0.15, -(128 * f * 0.15));
    },
  },

  duotone: {
    description: 'Two-color duotone effect (use -c for highlight hex, default cyan-blue)',
    amount: false,
    async apply(image, _amt, color) {
      const rgb = color ? parseHex(color) : { r: 0x00, g: 0xcc, b: 0xff };
      const meta = await image.metadata();
      const overlay = await sharp({
        create: { width: meta.width, height: meta.height, channels: 4, background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1 } }
      }).png().toBuffer();
      return image.ensureAlpha().grayscale().composite([{ input: overlay, blend: 'multiply' }]);
    },
  },

  solarize: {
    description: 'Solarization effect (partial inversion of highlights)',
    amount: { label: 'Threshold', default: 128, min: 50, max: 200 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const buf = await image.ensureAlpha().raw().toBuffer();
      for (let i = 0; i < buf.length; i += 4) {
        const avg = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
        if (avg > amt) {
          buf[i] = 255 - buf[i];
          buf[i + 1] = 255 - buf[i + 1];
          buf[i + 2] = 255 - buf[i + 2];
        }
      }
      return sharp(buf, { raw: { width: meta.width, height: meta.height, channels: 4 } });
    },
  },

  'old-film': {
    description: 'Vintage film look: sepia base + noise + vignette + slight blur',
    amount: { label: 'Intensity %', default: 60, min: 0, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const f = amt / 100;
      const noiseOverlay = await makeNoise(meta.width, meta.height, 15 * f);
      const vignetteOverlay = await makeVignette(meta.width, meta.height, 45 * f);
      return image
        .modulate({ saturation: 1 - f * 0.8 })
        .linear([
          (1 - f) + f * (240 / 255),
          (1 - f) + f * (200 / 255),
          (1 - f) + f * (150 / 255),
        ], [0, 0, 0])
        .blur(0.6 * f)
        .composite([
          { input: noiseOverlay, blend: 'over' },
          { input: vignetteOverlay, blend: 'over' },
        ]);
    },
  },

  'pixel-sort': {
    description: 'Sort pixels by luminance in horizontal bands (glitch art)',
    amount: { label: 'Threshold', default: 128, min: 0, max: 255 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const buf = await image.ensureAlpha().raw().toBuffer();
      const { width, height } = meta;
      const out = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          row.push({ r, g, b, a, lum });
        }
        let start = -1;
        for (let x = 0; x <= width; x++) {
          const below = x < width && row[x].lum < amt;
          if (below && start === -1) {
            start = x;
          } else if (!below && start !== -1) {
            const band = row.slice(start, x);
            band.sort((a, b) => a.lum - b.lum);
            for (let j = 0; j < band.length; j++) {
              row[start + j] = band[j];
            }
            start = -1;
          }
        }
        for (let x = 0; x < width; x++) {
          const oi = (y * width + x) * 4;
          out[oi] = row[x].r;
          out[oi + 1] = row[x].g;
          out[oi + 2] = row[x].b;
          out[oi + 3] = row[x].a;
        }
      }
      return sharp(out, { raw: { width, height, channels: 4 } });
    },
  },

  'chromatic-aberration': {
    description: 'RGB channel shift like lens CA',
    amount: { label: 'Shift px', default: 4, min: 1, max: 20 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const buf = await image.ensureAlpha().raw().toBuffer();
      const { width, height } = meta;
      const shift = Math.round(amt);
      const out = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const di = (y * width + x) * 4;
          const rx = Math.max(0, x - shift);
          const bx = Math.min(width - 1, x + shift);
          out[di] = buf[(y * width + rx) * 4];
          out[di + 1] = buf[(y * width + x) * 4 + 1];
          out[di + 2] = buf[(y * width + bx) * 4 + 2];
          out[di + 3] = buf[di + 3];
        }
      }
      return sharp(out, { raw: { width, height, channels: 4 } });
    },
  },

  'color-curves': {
    description: 'Apply a simple S-curve contrast using gamma',
    amount: { label: 'Contrast', default: 0, min: -50, max: 50 },
    apply(image, amt) {
      if (amt === 0) return image;
      const gamma = amt > 0 ? 1 + amt / 25 : 1 / (1 - amt / 25);
      return image.gamma(gamma);
    },
  },

  // ==================== Thematic effects ====================

  rust: {
    description: 'Blotchy rusted metal — dark orange, textured patches (use -c to set rust color)',
    amount: { label: 'Intensity %', default: 70, min: 0, max: 100 },
    async apply(image, amt, color) {
      const meta = await image.metadata();
      const { width, height } = meta;
      const f = amt / 100;
      const rustRgb = color ? parseHex(color) : { r: 185, g: 85, b: 20 };

      const blotches = await makeBlotchMap(width, height, f, rustRgb);
      const spots = await makeSpots(width, height, f, { r: Math.round(rustRgb.r * 0.38), g: Math.round(rustRgb.g * 0.35), b: Math.round(rustRgb.b * 0.5) });
      const grain = await makeNoise(width, height, 20 * f);
      const vignette = await makeVignette(width, height, 55 * f);

      return image
        .modulate({ saturation: 1 - f * 0.7 })
        .linear(
          [1 - f * (1 - rustRgb.r / 255), 1 - f * (1 - rustRgb.g / 255), 1 - f * (1 - rustRgb.b / 255)],
          [0, 0, 0],
        )
        .composite([
          { input: blotches, blend: 'multiply' },
          { input: spots, blend: 'over' },
          { input: grain, blend: 'over' },
          { input: vignette, blend: 'over' },
        ]);
    },
  },

  'rust-hueless': {
    description: 'Rust texture only — blotchy, no hue shift (use -c for blotch color)',
    amount: { label: 'Intensity %', default: 70, min: 0, max: 100 },
    async apply(image, amt, color) {
      const meta = await image.metadata();
      const { width, height } = meta;
      const f = amt / 100;
      const rustRgb = color ? parseHex(color) : { r: 185, g: 85, b: 20 };

      const blotches = await makeBlotchMap(width, height, f, rustRgb);
      const spots = await makeSpots(width, height, f, { r: Math.round(rustRgb.r * 0.38), g: Math.round(rustRgb.g * 0.35), b: Math.round(rustRgb.b * 0.5) });
      const grain = await makeNoise(width, height, 20 * f);
      const vignette = await makeVignette(width, height, 55 * f);

      return image.composite([
        { input: blotches, blend: 'multiply' },
        { input: spots, blend: 'over' },
        { input: grain, blend: 'over' },
        { input: vignette, blend: 'over' },
      ]);
    },
  },

  frost: {
    description: 'Icy / frosted glass look',
    amount: { label: 'Intensity %', default: 70, min: 0, max: 100 },
    apply(image, amt) {
      const f = amt / 100;
      return image
        .blur(1 + f * 2)
        .modulate({ brightness: 1 + f * 0.4 })
        .linear([1 - f * (1 - 200 / 255), 1 - f * (1 - 220 / 255), 1 - f * 0], [0, 0, 0]);
    },
  },

  burn: {
    description: 'Scorched / burnt edge look',
    amount: { label: 'Intensity %', default: 70, min: 0, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const { width, height } = meta;
      const f = amt / 100;
      const vignette = await makeVignette(width, height, 80 * f);
      return image
        .linear([1 + f * 0.15, 1 + f * 0.1, 1 + f * 0.05], [-(128 * f * 0.15), -(128 * f * 0.1), -(128 * f * 0.05)])
        .modulate({ saturation: 1 - f * 0.6 })
        .linear([1 - f * (1 - 200 / 255), 1 - f * (1 - 120 / 255), 1 - f * (1 - 30 / 255)], [0, 0, 0])
        .composite([{ input: vignette, blend: 'over' }]);
    },
  },

  // ==================== Gradient overlay effects ====================

  'gradient-top': {
    description: 'Dark gradient from the top',
    amount: { label: 'Intensity %', default: 70, min: 5, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const overlay = await makeGradient(meta.width, meta.height, 'top', amt);
      return image.composite([{ input: overlay, blend: 'over' }]);
    },
  },

  'gradient-bottom': {
    description: 'Dark gradient from the bottom',
    amount: { label: 'Intensity %', default: 70, min: 5, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const overlay = await makeGradient(meta.width, meta.height, 'bottom', amt);
      return image.composite([{ input: overlay, blend: 'over' }]);
    },
  },

  'gradient-left': {
    description: 'Dark gradient from the left',
    amount: { label: 'Intensity %', default: 70, min: 5, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const overlay = await makeGradient(meta.width, meta.height, 'left', amt);
      return image.composite([{ input: overlay, blend: 'over' }]);
    },
  },

  'gradient-right': {
    description: 'Dark gradient from the right',
    amount: { label: 'Intensity %', default: 70, min: 5, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const overlay = await makeGradient(meta.width, meta.height, 'right', amt);
      return image.composite([{ input: overlay, blend: 'over' }]);
    },
  },

  'gradient-radial': {
    description: 'Dark radial gradient (edges dark)',
    amount: { label: 'Intensity %', default: 70, min: 5, max: 100 },
    async apply(image, amt) {
      const meta = await image.metadata();
      const overlay = await makeGradient(meta.width, meta.height, 'radial', amt);
      return image.composite([{ input: overlay, blend: 'over' }]);
    },
  },

};

// ==================== Helpers ====================

async function makeNoise(width, height, intensity) {
  const size = width * height * 4;
  const buf = Buffer.alloc(size);
  const amp = (intensity / 100) * 60; // scale for subtle noise
  for (let i = 0; i < size; i += 4) {
    const v = Math.round((Math.random() - 0.5) * amp * 2 + 128);
    buf[i] = v;     // R
    buf[i + 1] = v; // G
    buf[i + 2] = v; // B
    buf[i + 3] = Math.round(intensity * 2.55 * 0.25); // alpha proportional to intensity
  }
  return sharp(buf, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function makeVignette(width, height, strength) {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const f = Math.abs(strength) / 100;
  const size = width * height * 4;
  const buf = Buffer.alloc(size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxR;
      const alpha = Math.min(1, Math.max(0, dist ** 2 * f));
      const val = strength >= 0 ? 0 : 255; // dark for positive, white for negative
      buf[i] = val;
      buf[i + 1] = val;
      buf[i + 2] = val;
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return sharp(buf, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function makeGradient(width, height, type, intensity) {
  const f = intensity / 100;
  const buf = Buffer.alloc(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let t;
      switch (type) {
        case 'top':     t = y / (height - 1 || 1); break;
        case 'bottom':  t = 1 - y / (height - 1 || 1); break;
        case 'left':    t = x / (width - 1 || 1); break;
        case 'right':   t = 1 - x / (width - 1 || 1); break;
        case 'radial':  t = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxR; break;
        default:        t = 0;
      }
      const alpha = Math.round(Math.min(1, t) * f * 255);
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = alpha;
    }
  }
  return sharp(buf, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function makeBlotchMap(width, height, intensity, color = { r: 185, g: 85, b: 20 }) {
  const scale = 8;
  const sw = Math.max(4, Math.round(width / scale));
  const sh = Math.max(4, Math.round(height / scale));

  const small = Buffer.alloc(sw * sh * 4);
  for (let i = 0; i < small.length; i += 4) {
    const v = Math.round(Math.random() * 255);
    small[i] = v;
    small[i + 1] = v;
    small[i + 2] = v;
    small[i + 3] = 255;
  }

  const smooth = await sharp(small, { raw: { width: sw, height: sh, channels: 4 } })
    .resize(width, height, { kernel: 'cubic' })
    .grayscale()
    .linear(3.0, -280)
    .png()
    .toBuffer();

  const { data } = await sharp(smooth).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    const v = data[i] / 255;
    const alpha = Math.round((1 - v) * intensity * 210);
    out[i] = color.r;
    out[i + 1] = color.g;
    out[i + 2] = color.b;
    out[i + 3] = Math.min(255, alpha);
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function makeSpots(width, height, intensity, color = { r: 70, g: 30, b: 10 }) {
  const scale = 4;
  const sw = Math.max(4, Math.round(width / scale));
  const sh = Math.max(4, Math.round(height / scale));

  const small = Buffer.alloc(sw * sh * 4);
  for (let i = 0; i < small.length; i += 4) {
    const v = Math.round(Math.random() * 255);
    small[i] = v;
    small[i + 1] = v;
    small[i + 2] = v;
    small[i + 3] = 255;
  }

  const smooth = await sharp(small, { raw: { width: sw, height: sh, channels: 4 } })
    .resize(width, height, { kernel: 'cubic' })
    .grayscale()
    .linear(5.0, -450)
    .png()
    .toBuffer();

  const { data } = await sharp(smooth).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    const v = data[i] / 255;
    const alpha = Math.round((1 - v) * intensity * 140);
    out[i] = color.r;
    out[i + 1] = color.g;
    out[i + 2] = color.b;
    out[i + 3] = Math.min(255, alpha);
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// ==================== Apply effect ====================

async function applyEffect(inputPath, effectName, amount, outputPath, format, color) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const effect = EFFECTS[effectName];
  if (!effect) {
    const list = Object.keys(EFFECTS).sort().join(', ');
    console.error(`Error: Unknown effect "${effectName}".\n`);
    console.error(`Available effects: ${list}`);
    console.error(`Run "tinter effects" to see descriptions.`);
    process.exit(1);
  }

  const amt = amount !== undefined ? parseFloat(amount) : (effect.amount ? effect.amount.default : 0);
  if (effect.amount && (isNaN(amt) || amt < effect.amount.min || amt > effect.amount.max)) {
    console.error(`Error: --amount for "${effectName}" must be ${effect.amount.min}-${effect.amount.max} (${effect.amount.label}).`);
    process.exit(1);
  }

  let image = sharp(inputPath).ensureAlpha();
  image = effect.amount
    ? await effect.apply(image, amt, color)
    : await effect.apply(image, undefined, color);

  try {
    await image.toFormat(format).toFile(outputPath);
    console.log(`Applied "${effectName}" → ${outputPath}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function printEffects() {
  console.log('\n  Available effects:\n');
  const names = Object.keys(EFFECTS).sort();
  for (const name of names) {
    const e = EFFECTS[name];
    const param = e.amount
      ? `  [--amount ${e.amount.default}] (${e.amount.label}: ${e.amount.min}–${e.amount.max})`
      : '';
    console.log(`  ${name.padEnd(16)} ${e.description}${param}`);
  }
  console.log('');
}

module.exports = { EFFECTS, applyEffect, printEffects };
