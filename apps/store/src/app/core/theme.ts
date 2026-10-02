/** Black or white text, whichever reads better on the given hex background. */
export function readableTextOn(hex: string): '#0b0d12' | '#ffffff' {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return '#ffffff';
  }
  const value = parseInt(match[1], 16);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.4 ? '#0b0d12' : '#ffffff';
}
