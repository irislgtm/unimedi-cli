#!/usr/bin/env node
const path = require('path');
const { program } = require('commander');
const { tint, resolveFormat } = require('../lib/tint');
const { rainbow } = require('../lib/rainbow');
const { RAINBOW_COLORS } = require('../lib/colors');
const { applyEffect, printEffects } = require('../lib/effects');
const { animate, printAnimations } = require('../lib/animate');

program
  .name('tinter')
  .description('Universal image tinting CLI — fast, lossless tint, effects, gradients, and Minecraft animations')
  .version('1.0.0');

program
  .command('tint <input>')
  .description('Apply a tint color to an image')
  .option('-c, --color <hex>', 'Tint color in hex (e.g. #ff0000 or ff0000)')
  .option('-i, --intensity <number>', 'Tint intensity 0-100 (default: 100)', '100')
  .option('-o, --output <path>', 'Output file path')
  .option('-f, --format <format>', 'Output format: png, jpeg, webp')
  .action(async (input, options) => {
    await tint(input, options);
  });

program
  .command('rainbow <input>')
  .description('Generate up to 12 rainbow color variations from a white/base image')
  .option('-n, --count <number>', 'Number of variations 1-12 (default: 12)', '12')
  .option('-o, --output <dir>', 'Output directory (default: ./rainbow-output)', './rainbow-output')
  .option('-f, --format <format>', 'Output format: png, jpeg, webp')
  .action(async (input, options) => {
    await rainbow(input, options);
  });

program
  .command('effect <input>')
  .description('Apply an image effect, filter, or gradient overlay')
  .option('-n, --name <effect>', 'Effect name (required)')
  .option('-a, --amount <value>', 'Effect amount/strength')
  .option('-c, --color <hex>', 'Color for effects that use it (rust, duotone, glow)')
  .option('-o, --output <path>', 'Output file path')
  .option('-f, --format <format>', 'Output format: png, jpeg, webp')
  .action(async (input, options) => {
    if (!options.name) {
      console.error('Error: --name is required. Use "tinter effects" to list all effects.');
      process.exit(1);
    }
    const format = resolveFormat(input, options.format);
    const ext = format === 'jpeg' ? '.jpg' : `.${format}`;
    const outputPath = options.output || path.join(
      path.dirname(input),
      path.basename(input, path.extname(input)) + `-${options.name}${ext}`
    );
    await applyEffect(input, options.name, options.amount, outputPath, format, options.color);
  });

program
  .command('effects')
  .description('List all available image effects, filters, and gradients')
  .action(() => {
    printEffects();
  });

program
  .command('animate <input>')
  .description('Generate a Minecraft-compatible animated texture (spritesheet + .mcmeta)')
  .option('-n, --name <type>', 'Animation type (required)')
  .option('-f, --frames <number>', 'Number of frames 2-256 (default: 12)', '12')
  .option('-t, --frametime <number>', 'Frame time in Minecraft ticks (default: 2)', '2')
  .option('-i, --interpolate', 'Enable smooth frame interpolation in Minecraft')
  .option('-a, --amount <value>', 'Animation strength / parameter')
  .option('-c, --color <hex>', 'Target color for fade animation')
  .option('-o, --output <path>', 'Output .png path (also creates .png.mcmeta)')
  .action(async (input, options) => {
    if (!options.name) {
      console.error('Error: --name is required. Use "tinter animations" to list all types.');
      process.exit(1);
    }
    await animate(input, options);
  });

program
  .command('animations')
  .description('List all available Minecraft animation types')
  .action(() => {
    printAnimations();
  });

program
  .command('help')
  .description('Show detailed help with examples and color reference')
  .action(() => {
    console.log(`
  tinter — Universal Image Tinting CLI
  ====================================

  Commands:
    tinter tint <image>        Apply a tint color to an image
    tinter rainbow <image>     Generate up to 12 rainbow color variations
    tinter effect <image>      Apply an image effect, filter, or gradient
    tinter effects             List all available effects and gradients
    tinter animate <image>     Generate Minecraft animated texture spritesheet
    tinter animations          List all animation types

  Tint examples:
    tinter tint icon.png -c "#ff0000"
    tinter tint photo.jpg -c ff8000 -i 50 -o half-orange.png

  Rainbow examples:
    tinter rainbow icon.png                          (all 12 colors)
    tinter rainbow base.png -n 6 -o ./variants       (6 colors)

  Effect examples:
    tinter effect photo.png -n blur -a 5
    tinter effect icon.png -n rust -a 60 -o rusted.png
    tinter effect sky.png -n gradient-top -a 50
    tinter effect img.png -n pixelate -a 10 -f jpeg

  Animation examples:
    tinter animate icon.png -n rainbow-cycle -f 16 -t 2
    tinter animate item.png -n spin -f 8 -o ./anim/spin.png
    tinter animate fade.png -n fade -c "#ff0000" -f 12 -t 3 -i

  Options:
    -c, --color <hex>       Hex color (#ff0000 or ff0000)
    -i, --intensity <n>     Tint intensity 0-100
    -n, --name <name>       Effect or animation type name
    -a, --amount <value>    Effect/animation strength
    -t, --frametime <n>     Minecraft ticks per frame (default: 2)
    -f, --frames <n>        Frame count for animations (default: 12)
    -i, --interpolate       Enable Minecraft frame interpolation
    -o, --output <path>     Output path
    -f, --format <fmt>      png | jpeg | webp (effect/tint only)

  Rainbow color palette (12):
`);

    RAINBOW_COLORS.forEach((c, i) => {
      const n = `${i + 1}`.padStart(2);
      console.log(`    ${n}. ${c.name.padEnd(14)} ${c.hex}`);
    });

    console.log(`
  Formats supported: PNG, JPEG, WebP (any mix of input/output)
  Alpha/transparency is fully preserved.

  Run "tinter effects" or "tinter animations" to browse all options.
`);
  });

program.parseAsync().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
