const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { parseHex, RAINBOW_COLORS } = require('./colors');

const ANIMATIONS = {

  'rainbow-cycle': {
    description: 'Cycle through rainbow hues',
    amount: false,
    async frames(inputPath, count, amt, color) {
      const base = sharp(inputPath).ensureAlpha();
      const meta = await base.metadata();
      const frameBufs = [];
      const step = RAINBOW_COLORS.length / count;
      for (let i = 0; i < count; i++) {
        const c = RAINBOW_COLORS[Math.round(i * step)];
        const rgb = parseHex(c.hex);
        const f = await sharp(inputPath)
          .ensureAlpha()
          .linear([rgb.r / 255, rgb.g / 255, rgb.b / 255], [0, 0, 0])
          .png()
          .toBuffer();
        frameBufs.push(f);
      }
      return frameBufs;
    },
  },

  pulse: {
    description: 'Oscillating brightness pulse',
    amount: { label: 'Amplitude %', default: 40, min: 5, max: 100 },
    async frames(inputPath, count, amt, color) {
      const f_pct = amt / 100;
      const bufs = [];
      for (let i = 0; i < count; i++) {
        const t = (Math.sin((i / (count - 1 || 1)) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        const b = 1 - f_pct / 2 + t * f_pct;
        const f = await sharp(inputPath)
          .ensureAlpha()
          .modulate({ brightness: b })
          .png()
          .toBuffer();
        bufs.push(f);
      }
      return bufs;
    },
  },

  'blur-pulse': {
    description: 'Blur in and out',
    amount: { label: 'Max blur sigma', default: 8, min: 1, max: 50 },
    async frames(inputPath, count, amt, color) {
      const bufs = [];
      for (let i = 0; i < count; i++) {
        const t = (Math.sin((i / (count - 1 || 1)) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        const sigma = Math.max(0.3, t * amt);
        const f = await sharp(inputPath)
          .ensureAlpha()
          .blur(sigma)
          .png()
          .toBuffer();
        bufs.push(f);
      }
      return bufs;
    },
  },

  spin: {
    description: 'Full rotation spin',
    amount: false,
    async frames(inputPath, count, amt, color) {
      const meta = await sharp(inputPath).metadata();
      const { width, height } = meta;
      const bg = { r: 0, g: 0, b: 0, alpha: 0 };
      const bufs = [];
      for (let i = 0; i < count; i++) {
        const angle = (360 / count) * i;
        const f = await sharp(inputPath)
          .rotate(angle, { background: bg })
          .resize(width, height, { fit: 'fill' })
          .png()
          .toBuffer();
        bufs.push(f);
      }
      return bufs;
    },
  },

  fade: {
    description: 'Fade to a target color',
    amount: { label: 'Intensity %', default: 80, min: 5, max: 100 },
    async frames(inputPath, count, amt, color) {
      if (!color) throw new Error('--color is required for the "fade" animation');
      const rgb = parseHex(color);
      const f_pct = amt / 100;
      const bufs = [];
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1 || 1) * f_pct;
        const mult = [
          1 - t * (1 - rgb.r / 255),
          1 - t * (1 - rgb.g / 255),
          1 - t * (1 - rgb.b / 255),
        ];
        const f = await sharp(inputPath)
          .ensureAlpha()
          .linear(mult, [0, 0, 0])
          .png()
          .toBuffer();
        bufs.push(f);
      }
      return bufs;
    },
  },

  wipe: {
    description: 'Gradient wipe across the image',
    amount: { label: 'Direction', default: 0, min: 0, max: 3 },
    async frames(inputPath, count, amt, color) {
      const dir = Math.round(amt) % 4; // 0=right, 1=down, 2=left, 3=up
      const meta = await sharp(inputPath).metadata();
      const { width, height } = meta;
      const bufs = [];
      for (let i = 0; i < count; i++) {
        const progress = i / (count - 1 || 1);
        const mask = await makeWipeMask(width, height, dir, progress);
        const f = await sharp(inputPath)
          .ensureAlpha()
          .composite([{ input: mask, blend: 'in' }])
          .png()
          .toBuffer();
        bufs.push(f);
      }
      return bufs;
    },
  },

  wave: {
    description: 'Sine wave distortion',
    amount: { label: 'Amplitude px', default: 8, min: 1, max: 50 },
    async frames(inputPath, count, amt, color) {
      const bufs = [];
      const meta = await sharp(inputPath).metadata();
      const { width, height } = meta;
      for (let i = 0; i < count; i++) {
        const phase = (i / count) * Math.PI * 2;
        const buf = await distortWave(inputPath, width, height, amt, phase);
        bufs.push(buf);
      }
      return bufs;
    },
  },

};

function makeWipeMask(width, height, dir, progress) {
  const size = width * height * 4;
  const buf = Buffer.alloc(size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let v;
      switch (dir) {
        case 0: v = (x / width) <= progress ? 255 : 0; break;   // right
        case 1: v = (y / height) <= progress ? 255 : 0; break;   // down
        case 2: v = (1 - x / width) <= progress ? 255 : 0; break; // left
        case 3: v = (1 - y / height) <= progress ? 255 : 0; break; // up
        default: v = 255;
      }
      buf[i] = 255;
      buf[i + 1] = 255;
      buf[i + 2] = 255;
      buf[i + 3] = v;
    }
  }
  return sharp(buf, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function distortWave(inputPath, width, height, amplitude, phase) {
  const base = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const offsetY = Math.round(Math.sin((y / height) * Math.PI * 4 + phase) * amplitude);
    for (let x = 0; x < width; x++) {
      const srcY = Math.min(height - 1, Math.max(0, y + offsetY));
      const si = (srcY * width + x) * 4;
      const di = (y * width + x) * 4;
      out[di] = base.data[si];
      out[di + 1] = base.data[si + 1];
      out[di + 2] = base.data[si + 2];
      out[di + 3] = base.data[si + 3];
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function buildSpritesheet(frames, meta, outputPath) {
  const frameHeight = meta.height;
  const totalHeight = frameHeight * frames.length;

  const composites = [];
  for (let i = 0; i < frames.length; i++) {
    const buf = frames[i] instanceof Buffer ? frames[i] : await frames[i];
    composites.push({ input: buf, top: i * frameHeight, left: 0 });
  }

  await sharp({
    create: {
      width: meta.width,
      height: totalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

function writeMcmeta(outputPath, frameCount, frametime, interpolate) {
  const frames = [];
  for (let i = 0; i < frameCount; i++) frames.push(i);

  const anim = { frametime, frames };
  if (interpolate) anim.interpolate = true;

  const mcmeta = { animation: anim };
  fs.writeFileSync(outputPath + '.mcmeta', JSON.stringify(mcmeta, null, 2));
}

async function animate(inputPath, options) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const animType = options.name;
  const anim = ANIMATIONS[animType];
  if (!anim) {
    const list = Object.keys(ANIMATIONS).sort().join(', ');
    console.error(`Error: Unknown animation "${animType}".`);
    console.error(`Available: ${list}`);
    console.error(`Run "tinter animations" to see descriptions.`);
    process.exit(1);
  }

  const frameCount = parseInt(options.frames, 10) || 12;
  if (frameCount < 2 || frameCount > 256) {
    console.error('Error: --frames must be 2–256');
    process.exit(1);
  }

  const frametime = parseInt(options.frametime, 10) || 2;
  if (frametime < 1 || frametime > 100) {
    console.error('Error: --frametime must be 1–100 (Minecraft ticks)');
    process.exit(1);
  }

  let amount;
  if (anim.amount) {
    amount = options.amount !== undefined ? parseFloat(options.amount) : anim.amount.default;
    if (isNaN(amount) || amount < anim.amount.min || amount > anim.amount.max) {
      console.error(`Error: --amount for "${animType}" must be ${anim.amount.min}–${anim.amount.max} (${anim.amount.label}).`);
      process.exit(1);
    }
  }

  const meta = await sharp(inputPath).metadata();
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = options.output || path.join(path.dirname(inputPath), `${baseName}-${animType}`);

  if (!outputPath.endsWith('.png')) {
    console.error('Error: Output path must end with .png');
    process.exit(1);
  }

  const frames = await anim.frames(inputPath, frameCount, amount, options.color);

  // Convert frame buffers to raw PNG buffers if needed
  const pngFrames = [];
  for (const f of frames) {
    if (f instanceof Buffer) {
      pngFrames.push(f);
    } else {
      pngFrames.push(await sharp(f, { raw: { width: meta.width, height: meta.height, channels: 4 } }).png().toBuffer());
    }
  }

  await buildSpritesheet(pngFrames, meta, outputPath);
  writeMcmeta(outputPath, frameCount, frametime, !!options.interpolate);

  console.log(`Animation "${animType}": ${frameCount} frames @ ${frametime} tick(s)`);
  console.log(`  ${outputPath}`);
  console.log(`  ${outputPath}.mcmeta`);
}

function printAnimations() {
  console.log('\n  Available animation types:\n');
  const names = Object.keys(ANIMATIONS).sort();
  for (const name of names) {
    const a = ANIMATIONS[name];
    const param = a.amount
      ? `  [--amount ${a.amount.default}] (${a.amount.label}: ${a.amount.min}–${a.amount.max})`
      : '';
    console.log(`  ${name.padEnd(18)} ${a.description}${param}`);
  }
  console.log('');
}

module.exports = { ANIMATIONS, animate, printAnimations };
