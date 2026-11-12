import Phaser from 'phaser';

const WIDTH = 352;
const HEIGHT = 240;
const WOOD = [0x7d4b36, 0x89563c, 0x935e42, 0x86513b] as const;
const BOOKS = [0x954740, 0xa78152, 0x52716a, 0x74764f, 0x654b5e] as const;

function drawHall(graphics: Phaser.GameObjects.Graphics) {
  const rect = (color: number, x: number, y: number, w: number, h: number) =>
    graphics.fillStyle(color).fillRect(x, y, w, h);

  rect(0x241d23, 0, 0, WIDTH, HEIGHT);
  rect(0x382732, 12, 10, 328, 216);
  rect(0x523540, 17, 17, 318, 73);
  rect(0x6c4650, 20, 19, 312, 54);
  for (let x = 24; x < 330; x += 16) rect(0x60404a, x, 20, 1, 57);
  rect(0x795357, 20, 24, 312, 3);
  rect(0x9e6b56, 18, 72, 316, 3);
  rect(0x452b2b, 18, 76, 316, 6);

  for (let y = 82; y < 223; y += 8) {
    const row = (y - 82) / 8;
    for (let x = 19 - (row % 2) * 15; x < 332; x += 31) {
      const column = Math.floor(x / 31) + 1;
      const left = Math.max(19, x);
      const right = Math.min(332, x + 30);
      const shade = WOOD[(row * 3 + column * 7) % WOOD.length] ?? WOOD[0];
      rect(shade, left, y, right - left, 7);
      rect(0xa0694a, left + 2, y + 1, Math.min(8, right - left - 2), 1);
    }
  }
  rect(0x603c3a, 13, 14, 7, 208);
  rect(0x603c3a, 332, 14, 7, 208);
  rect(0x9c674f, 16, 14, 2, 208);
  rect(0x9c674f, 332, 14, 2, 208);
  rect(0x4b2d30, 17, 222, 317, 8);

  const window = (x: number) => {
    rect(0x3b2c36, x, 35, 26, 30);
    rect(0x3b2c36, x + 4, 30, 18, 8);
    rect(0x66627d, x + 4, 37, 18, 22);
    rect(0x66627d, x + 8, 34, 10, 5);
    rect(0x9791a6, x + 5, 38, 7, 8);
    rect(0xd1b8a3, x + 8, 39, 2, 2);
    rect(0x3b2c36, x + 12, 35, 2, 24);
    rect(0x3b2c36, x + 4, 49, 18, 2);
    rect(0xa2775f, x - 2, 62, 30, 3);
  };

  const bookcase = (x: number, y: number, width: number) => {
    rect(0x432b32, x + 3, y + 5, width, 43);
    rect(0x5d3832, x, y, width, 44);
    rect(0x9a6249, x, y, width, 3);
    rect(0x40292b, x + 4, y + 5, width - 8, 34);
    for (let shelf = 0; shelf < 2; shelf++) {
      for (let offset = 6; offset < width - 6; offset += 4) {
        const bookHeight = 7 + ((offset * 7 + shelf * 13 + x) % 6);
        const base = y + 21 + shelf * 16;
        rect(
          BOOKS[(offset + shelf + x) % BOOKS.length] ?? BOOKS[0],
          x + offset,
          base - bookHeight,
          3,
          bookHeight,
        );
        if (offset % 3 === 0) rect(0xc6a46c, x + offset, base - 4, 2, 1);
      }
      rect(0xaa7450, x + 2, y + 21 + shelf * 16, width - 4, 2);
    }
  };

  const table = (x: number, y: number, width: number) => {
    rect(0x58382f, x + 3, y + 4, width, 26);
    rect(0x493037, x + 3, y + 17, 4, 11);
    rect(0x493037, x + width - 7, y + 17, 4, 11);
    rect(0xb47a51, x, y, width, 17);
    rect(0xcd9565, x, y, width, 2);
    rect(0x734533, x, y + 15, width, 5);
    rect(0x917052, x + 6, y + 5, 15, 9);
    rect(0xdfc298, x + 5, y + 4, 14, 8);
    rect(0x8c745c, x + 7, y + 6, 9, 1);
    rect(0x8c745c, x + 7, y + 9, 6, 1);
    rect(0x4f6457, x + width - 15, y + 4, 10, 8);
    rect(0xd4ac73, x + width - 14, y + 10, 8, 1);
  };

  window(46);
  window(279);
  bookcase(95, 42, 44);
  bookcase(151, 37, 50);
  bookcase(214, 42, 43);
  table(32, 98, 49);
  table(105, 99, 43);
  table(206, 99, 43);
  table(272, 98, 49);

  // The embroidered rug leaves a clear path from the door to each workstation.
  rect(0x573538, 119, 137, 116, 63);
  rect(0x68454c, 117, 134, 116, 63);
  rect(0xba8566, 122, 138, 106, 55);
  rect(0x79505b, 125, 141, 100, 49);
  rect(0x674752, 129, 145, 92, 41);
  for (const x of [141, 173, 205]) {
    rect(0x8b6570, x, 155, 5, 21);
    rect(0x8b6570, x - 8, 163, 21, 5);
    rect(0xc79873, x + 1, 164, 3, 3);
  }

  // Hearth, lounge seats and the expedition board.
  rect(0x51353a, 33, 147, 46, 36);
  rect(0x7b6060, 34, 146, 43, 28);
  rect(0xa07c71, 31, 143, 49, 5);
  rect(0x503339, 43, 152, 25, 19);
  rect(0x6d3e38, 45, 165, 21, 5);
  rect(0xc26641, 50, 157, 10, 11);
  rect(0xec984e, 52, 155, 5, 12);
  rect(0xf2c278, 54, 161, 7, 6);
  rect(0x9d766b, 29, 173, 53, 4);
  rect(0x583736, 38, 190, 35, 15);
  rect(0x597065, 39, 186, 33, 13);
  rect(0x789080, 41, 188, 29, 3);

  rect(0x5c3836, 275, 149, 42, 34);
  rect(0xac7351, 272, 147, 46, 25);
  rect(0x784936, 275, 150, 40, 19);
  rect(0xe2bb83, 279, 152, 11, 13);
  rect(0xc8a976, 294, 155, 15, 10);
  rect(0x98684e, 281, 156, 6, 1);
  rect(0x98684e, 296, 158, 10, 1);

  for (const x of [85, 266]) {
    graphics.fillStyle(0xefb86b, 0.14).fillCircle(x, 61, 15);
    rect(0x493034, x - 3, 57, 7, 10);
    rect(0xe3a764, x - 2, 58, 5, 6);
    rect(0xf9d79b, x, 59, 2, 4);
  }
  rect(0x9f684b, 155, 215, 42, 8);
  rect(0x563939, 151, 221, 50, 6);
  rect(0x29232b, 157, 224, 38, 6);
}

export function mountHall(parent: HTMLElement): () => void {
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: WIDTH,
    height: HEIGHT,
    pixelArt: true,
    banner: false,
    audio: { noAudio: true },
    backgroundColor: '#241d23',
    scene: {
      create(this: Phaser.Scene) {
        drawHall(this.add.graphics());
        this.game.events.once(Phaser.Core.Events.POST_RENDER, () => this.game.loop.sleep());
      },
    },
  });
  return () => {
    game.loop.wake();
    game.destroy(true);
  };
}
