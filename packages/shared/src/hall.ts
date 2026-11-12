import type { CharacterAppearance } from './accounts';

export const hallStations = ['Lounge', 'Scriptorium', 'Archives', 'Restoration Table'] as const;
export type HallStation = (typeof hallStations)[number];

export interface HallMember extends CharacterAppearance {
  id: string;
  level: number;
  station: HallStation;
  presence: 'active' | 'idle';
  arrivalAt: number;
  stationAt: number;
  slot: number;
}

export type HallMessage =
  { type: 'roster'; members: HallMember[] } | { type: 'wave'; memberId: string } | { type: 'pong' };
