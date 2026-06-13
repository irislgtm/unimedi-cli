const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { parseHex, pickRainbowColors } = require('./colors');
const { resolveFormat } = require('./tint');

async function rainbow(inputPath, options) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const count = parseInt(options.count, 10);
  if (isNaN(count) || count < 1 || count > 12) {
    console.error('Error: --count must be a number between 1 and 12');
    process.exit(1);
  }

  const format = resolveFormat(inputPath, options.format);
  const outputDir = options.output;
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const ext = format === 'jpeg' ? '.jpg' : `.${format}`;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const colors = pickRainbowColors(count);
  const results = [];

  for (const color of colors) {
    const rgb = parseHex(color.hex);
    const multipliers = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
    const outputPath = path.join(outputDir, `${baseName}-${color.name}${ext}`);

    try {
      await sharp(inputPath)
        .ensureAlpha()
        .linear(multipliers, [0, 0, 0])
        .toFormat(format)
        .toFile(outputPath);

      results.push(outputPath);
    } catch (err) {
      console.error(`Error generating ${color.name}: ${err.message}`);
    }
  }

  console.log(`Generated ${results.length} rainbow variation(s) in: ${outputDir}`);
  for (const p of results) {
    console.log(`  ${path.basename(p)}`);
  }
}

module.exports = { rainbow };
