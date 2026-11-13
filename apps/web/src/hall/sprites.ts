import type { HallMember, HallStation } from '@guild/shared';
import type Phaser from 'phaser';
import type { HallVisualState } from './canvas';
import { hallNameplate } from './nameplate';

type Point = { x: number; y: number };
const ENTRANCE = { x: 176, y: 211 };
const HAIR = [0x78442e, 0x302830, 0xaa5142, 0xd2a661, 0xb8aeb2];
const TUNIC = [0x527a64, 0x656397, 0xa05458, 0xae7d40, 0x815779];
const desks: Record<HallStation, Point[]> = {
  Lounge: [
    { x: 94, y: 191 },
    { x: 95, y: 210 },
    { x: 111, y: 195 },
    { x: 112, y: 213 },
  ],
  Scriptorium: [
    { x: 43, y: 130 },
    { x: 64, y: 130 },
    { x: 39, y: 149 },
    { x: 63, y: 148 },
  ],
  Archives: [
    { x: 116, y: 129 },
    { x: 140, y: 129 },
    { x: 160, y: 110 },
    { x: 181, y: 108 },
  ],
  'Restoration Table': [
    { x: 220, y: 130 },
    { x: 241, y: 130 },
    { x: 283, y: 130 },
    { x: 306, y: 130 },
  ],
};

function destination(member: HallMember, peers: HallMember[]): Point {
  const rank = peers.filter(
    (peer) => peer.station === member.station && peer.slot < member.slot,
  ).length;
  return (
    desks[member.station][rank] ?? {
      x: 31 + (member.slot % 15) * 20,
      y: 205 + Math.floor(member.slot / 15) * 5,
    }
  );
}

function animate(from: Point, to: Point, elapsed: number): { point: Point; walking: boolean } {
  const points = [from, { x: from.x, y: 201 }, { x: to.x, y: 201 }, to];
  let distance = Math.max(0, elapsed) * 0.085;
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance < length)
      return {
        point: {
          x: start.x + ((end.x - start.x) * distance) / length,
          y: start.y + ((end.y - start.y) * distance) / length,
        },
        walking: true,
      };
    distance -= length;
  }
  return { point: to, walking: false };
}

export function hallSprites(scene: Phaser.Scene) {
  const sprites = new Map<
    string,
    {
      drawing: Phaser.GameObjects.Graphics;
      label: ReturnType<typeof hallNameplate>;
      to: Point;
      from: Point;
      at: number;
    }
  >();
  return ({ members, reducedMotion, wave }: HallVisualState) => {
    const now = Date.now();
    const ids = new Set(members.map(({ id }) => id));
    for (const [id, sprite] of sprites) {
      if (ids.has(id)) continue;
      sprite.drawing.destroy();
      sprite.label.destroy();
      sprites.delete(id);
    }
    for (const member of members) {
      const to = destination(member, members);
      let sprite = sprites.get(member.id);
      if (!sprite) {
        const drawing = scene.add.graphics();
        sprite = {
          drawing,
          label: hallNameplate(scene),
          to,
          from: ENTRANCE,
          at: Math.max(member.arrivalAt, member.stationAt),
        };
        sprites.set(member.id, sprite);
      } else if (sprite.to.x !== to.x || sprite.to.y !== to.y) {
        sprite.from = animate(sprite.from, sprite.to, now - sprite.at).point;
        sprite.to = to;
        sprite.at = now;
      }
      const { point, walking } = reducedMotion
        ? { point: to, walking: false }
        : animate(sprite.from, sprite.to, now - sprite.at);
      const phase = reducedMotion
        ? 0
        : Math.floor((now + member.slot * 317) / (walking ? 105 : 470)) % 2;
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      const { drawing, label } = sprite;
      const hair = HAIR[member.hairColor] ?? HAIR[0] ?? 0;
      const tunic = TUNIC[member.tunicColor] ?? TUNIC[0] ?? 0;
      drawing.clear().setDepth(y);
      drawing.fillStyle(0x34252d, 0.4).fillEllipse(x, y, 13, 5);
      drawing
        .fillStyle(0x322532)
        .fillRect(x - 4, y - 4, 3, 4 + (walking ? phase : 0))
        .fillRect(x + 1, y - 4, 3, 4 + (walking ? 1 - phase : 0));
      drawing.fillStyle(tunic).fillRect(x - 5, y - 11, 10, 8);
      drawing
        .fillStyle(0xd79d76)
        .fillRect(x - 4, y - 19, 8, 8)
        .fillRect(x - 6, y - 9, 2, 3)
        .fillRect(x + 4, y - 9 + phase, 2, 3);
      drawing.fillStyle(hair).fillRect(x - 5, y - 20, 10, 4);
      if (member.hairStyle > 0) drawing.fillRect(x - 5, y - 17, 2, member.hairStyle === 2 ? 7 : 4);
      if (member.hairStyle === 2) drawing.fillRect(x + 3, y - 17, 2, 7);
      drawing
        .fillStyle(0x302830)
        .fillRect(x - 2, y - 15, 1, 1)
        .fillRect(x + 2, y - 15, 1, 1);
      if (!walking && member.station !== 'Lounge')
        drawing.fillStyle(0xf0d19e).fillRect(x + 4, y - 7 + phase, 4, 2);
      const waving = wave?.memberId === member.id && now - wave.at < 2400;
      label.place(
        waving ? `${member.displayName} waves` : member.displayName,
        x,
        y - 23 - (member.slot % 2) * 12,
        scene.scale.width,
      );
    }
  };
}
