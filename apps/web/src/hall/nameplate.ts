import type Phaser from 'phaser';

// Each row is a five-bit mask, with the high bit on the left.
const glyphs = new Map(
  Object.entries({
    A: [14, 17, 17, 31, 17, 17, 17],
    B: [30, 17, 17, 30, 17, 17, 30],
    C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30],
    E: [31, 16, 16, 30, 16, 16, 31],
    F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15],
    H: [17, 17, 17, 31, 17, 17, 17],
    I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12],
    K: [17, 18, 20, 24, 20, 18, 17],
    L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17],
    N: [17, 25, 21, 19, 17, 17, 17],
    O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13],
    R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30],
    T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4],
    W: [17, 17, 17, 21, 21, 21, 10],
    X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4],
    Z: [31, 1, 2, 4, 8, 16, 31],
    a: [0, 0, 14, 1, 15, 17, 15],
    b: [16, 16, 30, 17, 17, 17, 30],
    c: [0, 0, 15, 16, 16, 16, 15],
    d: [1, 1, 15, 17, 17, 17, 15],
    e: [0, 0, 14, 17, 31, 16, 14],
    f: [6, 9, 8, 28, 8, 8, 8],
    g: [0, 0, 15, 17, 17, 15, 1, 14],
    h: [16, 16, 30, 17, 17, 17, 17],
    i: [4, 0, 12, 4, 4, 4, 14],
    j: [2, 0, 6, 2, 2, 2, 18, 12],
    k: [16, 16, 18, 20, 24, 20, 18],
    l: [12, 4, 4, 4, 4, 4, 14],
    m: [0, 0, 26, 21, 21, 21, 21],
    n: [0, 0, 30, 17, 17, 17, 17],
    o: [0, 0, 14, 17, 17, 17, 14],
    p: [0, 0, 30, 17, 17, 30, 16, 16],
    q: [0, 0, 15, 17, 17, 15, 1, 1],
    r: [0, 0, 22, 25, 16, 16, 16],
    s: [0, 0, 15, 16, 14, 1, 30],
    t: [8, 8, 28, 8, 8, 9, 6],
    u: [0, 0, 17, 17, 17, 19, 13],
    v: [0, 0, 17, 17, 17, 10, 4],
    w: [0, 0, 17, 17, 21, 21, 10],
    x: [0, 0, 17, 10, 4, 10, 17],
    y: [0, 0, 17, 17, 17, 15, 1, 14],
    z: [0, 0, 31, 2, 4, 8, 31],
    0: [14, 17, 19, 21, 25, 17, 14],
    1: [4, 12, 4, 4, 4, 4, 14],
    2: [14, 17, 1, 2, 4, 8, 31],
    3: [30, 1, 1, 14, 1, 1, 30],
    4: [2, 6, 10, 18, 31, 2, 2],
    5: [31, 16, 16, 30, 1, 1, 30],
    6: [14, 16, 16, 30, 17, 17, 14],
    7: [31, 1, 2, 4, 8, 8, 8],
    8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 1, 14],
    '.': [0, 0, 0, 0, 0, 0, 4],
    '-': [0, 0, 0, 14],
    "'": [4, 4],
  }),
);

function bitmapLayout(text: string) {
  const pixels: { x: number; y: number }[] = [];
  let width = 0;

  for (const character of text) {
    if (character === ' ') {
      width += 3;
      continue;
    }
    const rows = glyphs.get(character);
    if (!rows) return null;
    const mask = rows.reduce((combined, row) => combined | row, 0);
    const left = Math.clz32(mask) - 27;
    const right = 4 - (31 - Math.clz32(mask & -mask));
    rows.forEach((row, y) => {
      for (let column = left; column <= right; column++) {
        if (row & (16 >> column)) pixels.push({ x: width + column - left, y });
      }
    });
    width += right - left + 2;
  }
  return { width: width - 1, pixels };
}

export function hallNameplate(scene: Phaser.Scene) {
  const plate = scene.add.graphics().setDepth(500);
  let fallback: Phaser.GameObjects.Text | undefined;
  let currentText = '';
  let width = 0;
  let height = 12;

  return {
    place(text: string, x: number, bottom: number, hallWidth: number) {
      if (text !== currentText) {
        currentText = text;
        const bitmap = bitmapLayout(text);
        if (bitmap) {
          fallback?.setVisible(false);
          width = bitmap.width + 6;
          height = 12;
        } else {
          fallback ??= scene.add
            .text(0, 0, '', {
              fontSize: '9px',
              fontStyle: 'bold',
              fontFamily: 'monospace',
              color: '#fff0d5',
            })
            .setDepth(501);
          fallback.setText(text).setVisible(true);
          width = fallback.width + 6;
          height = fallback.height + 4;
        }
        plate.clear().fillStyle(0x936d55).fillRect(0, 0, width, height);
        plate.fillStyle(0x261c24).fillRect(1, 1, width - 2, height - 2);
        if (bitmap) {
          plate.fillStyle(0xfff0d5);
          for (const pixel of bitmap.pixels) plate.fillRect(pixel.x + 3, pixel.y + 2, 1, 1);
        }
      }
      const left = Math.max(3, Math.min(Math.round(x - width / 2), hallWidth - width - 3));
      const top = bottom - height;
      plate.setPosition(left, top);
      fallback?.setPosition(left + 3, top + 2);
    },
    destroy() {
      plate.destroy();
      fallback?.destroy();
    },
  };
}
