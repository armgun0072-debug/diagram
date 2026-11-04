export const LAYOUT_OPTIONS = [
  { id: 'left-right', name: 'Left-right', description: 'เรียงตารางจากซ้ายไปขวาตาม Foreign key เหมาะกับความสัมพันธ์ที่เชื่อมต่อกันหลายขั้น' },
  { id: 'pipeline', name: 'Pipeline', description: 'แบ่งตารางเป็นลำดับขั้นตามการพึ่งพาข้อมูล แต่ละขั้นเรียงจากซ้ายไปขวาและซ้อนตารางในแนวตั้ง' },
  { id: 'snowflake', name: 'Snowflake', description: 'วางตารางที่เชื่อมต่อมากที่สุดไว้ตรงกลาง แล้วกระจายตารางที่เกี่ยวข้องเป็นวงรอบ' },
  { id: 'compact', name: 'Compact', description: 'จัดตารางเป็นกลุ่มสี่เหลี่ยมอย่างกระชับ เหมาะกับตารางจำนวนมากที่มีความสัมพันธ์ไม่ซับซ้อน' },
  { id: 'flowchart', name: 'Flowchart ซ้าย → ขวา', description: 'วางตารางหลักไว้ซ้าย แตกแขนงตารางที่อ้างอิงไปทางขวา และจัดแนวตารางที่เกี่ยวข้องให้อยู่ใกล้กัน' },
] as const;

export type LayoutAlgorithm = typeof LAYOUT_OPTIONS[number]['id'];
export function readLayoutAlgorithm(value: unknown): LayoutAlgorithm {
  return LAYOUT_OPTIONS.find(option => option.id === value)?.id ?? 'left-right';
}
