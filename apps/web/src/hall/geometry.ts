import type { HallStation } from '@guild/shared';
import type { IconName } from '../game/icons';

export const hallWidth = 352;
export const hallHeight = 240;
export type Point = { x: number; y: number };
type Landmark = HallStation | 'Expedition Board';

export const landmarks: {
  name: Landmark;
  icon: IconName;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: boolean;
}[] = [
  { name: 'Scriptorium', icon: 'quill', x: 31, y: 96, width: 53, height: 28 },
  { name: 'Archives', icon: 'journal', x: 104, y: 97, width: 46, height: 29 },
  { name: 'Restoration Table', icon: 'spark', x: 205, y: 97, width: 46, height: 29 },
  { name: 'Restoration Table', icon: 'spark', x: 271, y: 96, width: 52, height: 29, label: false },
  { name: 'Expedition Board', icon: 'expeditions', x: 271, y: 145, width: 49, height: 34 },
  { name: 'Lounge', icon: 'lounge', x: 29, y: 141, width: 54, height: 61 },
];

export function landmarkAt({ x, y }: Point) {
  return landmarks.find(
    (item) => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height,
  )?.name;
}
