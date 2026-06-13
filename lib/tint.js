const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { parseHex, tintMultipliers } = require('./colors');

const VALID_FORMATS = ['png', 'jpeg', 'jpg', 'webp'];

function resolveFormat(inputPath, optFormat) {
  if (optFormat) {
    const f = optFormat.toLowerCase().replace(/^\./, '');
    if (f === 'jpg') return 'jpeg';
    if (!VALID_FORMATS.includes(f)) {
      throw new Error(`Unsupported format: "${optFormat}". Use png, jpeg, or webp.`);
    }
    return f;
  }
  const ext = path.extname(inputPath).toLowerCase().replace(/^\./, '');
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return 'png';
}

function defaultOutput(inputPath, format) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const ext = format === 'jpeg' ? '.jpg' : `.${format}`;
  return path.join(dir, `${base}-tinted${ext}`);
}

async function tint(inputPath, options) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const format = resolveFormat(inputPath, options.format);
  if (!options.color) {
    const rainbow = require('./colors').RAINBOW_COLORS;
    const names = rainbow.map(c => c.name).join(', ');
    console.error('Error: --color is required for tint.\n');
    console.error(`Example: tinter tint image.png --color "#ff0000"\n`);
    console.error(`Common colors: ${names}`);
    process.exit(1);
  }

  const rgb = parseHex(options.color);
  const intensity = parseInt(options.intensity, 10);
  if (isNaN(intensity) || intensity < 0 || intensity > 100) {
    console.error('Error: Intensity must be a number 0-100');
    process.exit(1);
  }

  const multipliers = tintMultipliers(rgb, intensity);
  const outputPath = options.output || defaultOutput(inputPath, format);

  try {
    await sharp(inputPath)
      .ensureAlpha()
      .linear(multipliers, [0, 0, 0])
      .toFormat(format)
      .toFile(outputPath);

    console.log(`Tinted: ${outputPath}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { tint, resolveFormat };
