export type TableColors = Record<string, string>;

export const TABLE_PALETTE = [
  { color: '#68d9b1', label: 'เขียวมิ้นต์' },
  { color: '#8ca8ff', label: 'น้ำเงิน' },
  { color: '#d7ad71', label: 'ทอง' },
  { color: '#bd9cf4', label: 'ม่วง' },
  { color: '#f28b82', label: 'แดง' },
  { color: '#f4a6cd', label: 'ชมพู' },
  { color: '#67d2e3', label: 'ฟ้า' },
  { color: '#b7c5d3', label: 'เทา' },
];

export function cleanTableColors(value: unknown): TableColors {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && /^#[0-9a-f]{6}$/i.test(entry[1]))
    .map(([name, color]) => [name, color.toLowerCase()]));
}

export function tableColor(colors: TableColors, name: string, index: number): string {
  return Object.hasOwn(colors, name) ? colors[name] : TABLE_PALETTE[index % 4].color;
}

export function headerTextColor(background: string): string {
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(background.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

export function renameTableColor(colors: TableColors, from: string, to: string): TableColors {
  if (from === to || !Object.hasOwn(colors, from)) return colors;
  const next = { ...colors, [to]: colors[from] };
  delete next[from];
  return next;
}
