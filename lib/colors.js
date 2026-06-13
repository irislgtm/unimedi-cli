const RAINBOW_COLORS = [
  { name: 'red',          hex: '#FF0000' },
  { name: 'orange',       hex: '#FF8000' },
  { name: 'yellow',       hex: '#FFFF00' },
  { name: 'chartreuse',   hex: '#80FF00' },
  { name: 'green',        hex: '#00FF00' },
  { name: 'spring-green', hex: '#00FF80' },
  { name: 'cyan',         hex: '#00FFFF' },
  { name: 'azure',        hex: '#0080FF' },
  { name: 'blue',         hex: '#0000FF' },
  { name: 'violet',       hex: '#8000FF' },
  { name: 'magenta',      hex: '#FF00FF' },
  { name: 'rose',         hex: '#FF0080' },
];

function parseHex(hex) {
  const cleaned = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex color: "${hex}". Must be a 6-digit hex (e.g. #ff0000 or ff0000).`);
  }
  return {
    r: parseInt(cleaned.substring(0, 2), 16),
    g: parseInt(cleaned.substring(2, 4), 16),
    b: parseInt(cleaned.substring(4, 6), 16),
  };
}

function tintMultipliers(rgb, intensity) {
  const f = intensity / 100;
  return [
    1 - (1 - rgb.r / 255) * f,
    1 - (1 - rgb.g / 255) * f,
    1 - (1 - rgb.b / 255) * f,
  ];
}

function pickRainbowColors(count) {
  const step = 12 / count;
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(RAINBOW_COLORS[Math.round(i * step)]);
  }
  return result;
}

module.exports = { RAINBOW_COLORS, parseHex, tintMultipliers, pickRainbowColors };
