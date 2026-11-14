// 13 November In One Frame - a make.fun news-image-01 entry.
//
// A Node 22 program (standard library only, no network) that procedurally
// draws one 1024x1024 PNG summing up the world's news of Friday
// 13 November 2026, and writes it to /output/entry.png (or to
// $MAKEFUN_OUTPUT_DIR/entry.png outside the grader's container).
// Every pixel is drawn in code: a small raster canvas, a hand-made 5x7
// bitmap font, and flat editorial scenes for six stories of the day:
//   1. Zelensky meets US envoys; Europe joins the Ukraine peace talks
//   2. Iran says it struck a US radar in Bahrain; US downs Iranian drones
//   3. US Senate Banking Committee summons Nvidia's Huang and Lutnick
//   4. FBI: North Korean hackers stole $400M in crypto via fake video calls
//   5. FAA nationwide ground stop: US flights halted for over four hours
//   6. Harry Kane breaks England's appearance record with his 126th cap
// The drawing is fully deterministic: two runs write the same bytes.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 3);

function rgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

let CLIP = null; // [x0, y0, x1, y1) while a panel scene is drawing

function setPx(x, y, c) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  if (CLIP && (x < CLIP[0] || y < CLIP[1] || x >= CLIP[2] || y >= CLIP[3])) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}

function fillRect(x, y, w, h, c) {
  for (let yy = Math.max(0, y | 0); yy < Math.min(H, y + h); yy++)
    for (let xx = Math.max(0, x | 0); xx < Math.min(W, x + w); xx++)
      setPx(xx, yy, c);
}

function fillCircle(cx, cy, r, c) {
  for (let yy = Math.floor(cy - r); yy <= cy + r; yy++)
    for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) {
      const dx = xx - cx, dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) setPx(xx, yy, c);
    }
}

function fillEllipse(cx, cy, rx, ry, c) {
  for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy++)
    for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx++) {
      const dx = (xx - cx) / rx, dy = (yy - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(xx, yy, c);
    }
}

function fillTriangle(x1, y1, x2, y2, x3, y3, c) {
  const minX = Math.floor(Math.min(x1, x2, x3)), maxX = Math.ceil(Math.max(x1, x2, x3));
  const minY = Math.floor(Math.min(y1, y2, y3)), maxY = Math.ceil(Math.max(y1, y2, y3));
  const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  if (d === 0) return;
  for (let yy = minY; yy <= maxY; yy++)
    for (let xx = minX; xx <= maxX; xx++) {
      const a = ((y2 - y3) * (xx - x3) + (x3 - x2) * (yy - y3)) / d;
      const b = ((y3 - y1) * (xx - x3) + (x1 - x3) * (yy - y3)) / d;
      const g = 1 - a - b;
      if (a >= 0 && b >= 0 && g >= 0) setPx(xx, yy, c);
    }
}

function drawLine(x1, y1, x2, y2, thick, c) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thick / 2, c);
  }
}

// ---- PNG encoding (zlib from the standard library, CRC32 by hand) ----
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng() {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- a hand-made 5x7 bitmap font (uppercase, digits, punctuation) ----
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '.#.#.', '..#..', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  "'": ['.##..', '.##..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '$': ['..#..', '.####', '##.#.', '.###.', '.#.##', '####.', '..#..'],
  '%': ['##..#', '##.#.', '....#', '...#.', '..#..', '.#...', '#.###'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
};

function textWidth(str, scale) {
  return str.length === 0 ? 0 : str.length * 6 * scale - scale;
}

function drawText(str, x, y, scale, c) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT['?'];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 5; col++)
        if (glyph[row][col] === '#')
          fillRect(cx + col * scale, y + row * scale, scale, scale, c);
    cx += 6 * scale;
  }
  return cx - scale;
}

function drawTextCentred(str, cx, y, scale, c) {
  return drawText(str, Math.round(cx - textWidth(str, scale) / 2), y, scale, c);
}

function wrapText(str, maxChars) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line === '') line = word;
    else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line !== '') lines.push(line);
  return lines;
}

// ---- palette ----
const PAPER = rgb(0xf7f2e7);
const INK = rgb(0x1b2a4a);
const NAVY = rgb(0x14264c);
const GOLD = rgb(0xd9a441);
const WHITE = rgb(0xffffff);
const GREY = rgb(0x5a6472);
const RED = rgb(0xb3372c);
const SKY = rgb(0xd8e7f5);
const SAND = rgb(0xf2dfba);
const GREEN = rgb(0x3d7a44);

// ---- little flat scenes, drawn inside a panel's picture box ----
// (x, y) is the box's top-left corner; the box is 290 wide, 148 tall.

function drone(cx, cy, s, c) {
  // a quadcopter: X arms, four rotor rings, a dark body
  drawLine(cx - s, cy - s * 0.6, cx + s, cy + s * 0.6, 5, c);
  drawLine(cx - s, cy + s * 0.6, cx + s, cy - s * 0.6, 5, c);
  for (const [ox, oy] of [[-s, -s * 0.6], [s, -s * 0.6], [-s, s * 0.6], [s, s * 0.6]])
    fillEllipse(cx + ox, cy + oy, s * 0.42, s * 0.16, c);
  fillRect(cx - s * 0.3, cy - s * 0.22, s * 0.6, s * 0.44, c);
}

function sceneUkraine(x, y) {
  fillRect(x, y, 290, 148, SKY);
  fillRect(x, y + 118, 290, 30, rgb(0xb9c8a8)); // ground
  // three flags at a round table: Ukraine, the United States, the EU
  const flags = [
    (fx, fy) => { fillRect(fx, fy, 52, 17, rgb(0x2f6db3)); fillRect(fx, fy + 17, 52, 17, rgb(0xf2c230)); },
    (fx, fy) => {
      for (let i = 0; i < 7; i++) fillRect(fx, fy + i * 5, 52, 3, i % 2 ? WHITE : RED);
      fillRect(fx, fy, 24, 18, NAVY);
    },
    (fx, fy) => {
      fillRect(fx, fy, 52, 34, rgb(0x27418f));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        fillCircle(fx + 26 + Math.cos(a) * 11, fy + 17 + Math.sin(a) * 11, 2, GOLD);
      }
    },
  ];
  flags.forEach((draw, i) => {
    const fx = x + 28 + i * 86, fy = y + 58;
    drawLine(fx - 4, fy, fx - 4, fy + 66, 4, INK); // pole
    draw(fx, fy);
  });
  fillEllipse(x + 145, y + 132, 120, 13, rgb(0x8a6b42)); // the table
  drone(x + 246, y + 32, 18, INK);
  drawText('1,200 DRONES', x + 10, y + 8, 2, RED);
}

function sceneBahrain(x, y) {
  fillRect(x, y, 290, 148, SAND);
  fillEllipse(x + 52, y + 146, 110, 22, rgb(0xe3c88f)); // dunes along the bottom
  fillEllipse(x + 248, y + 148, 100, 20, rgb(0xe9d09c));
  // a radar dome on a plinth, sweeping the sky
  fillRect(x + 112, y + 118, 66, 18, rgb(0x8d9299)); // plinth
  fillCircle(x + 145, y + 120, 36, WHITE); // dome (its foot is covered by the plinth)
  fillRect(x + 109, y + 118, 72, 18, rgb(0x8d9299));
  fillTriangle(x + 145, y + 88, x + 145, y + 118, x + 208, y + 118, rgb(0xf5c542)); // the beam
  drawLine(x + 145, y + 118, x + 145, y + 84, 5, INK); // mast
  // a drone and a missile streak
  drone(x + 52, y + 36, 17, INK);
  drawLine(x + 210, y + 18, x + 262, y + 52, 5, RED);
  fillTriangle(x + 262, y + 52, x + 246, y + 50, x + 256, y + 38, RED);
  fillCircle(x + 36, y + 116, 16, rgb(0xd9a441)); // sun
}

function sceneSenate(x, y) {
  fillRect(x, y, 290, 148, rgb(0xe4e8f2));
  // the Capitol: dome, body, columns
  fillCircle(x + 145, y + 50, 33, NAVY);
  drawLine(x + 145, y + 6, x + 145, y + 18, 4, NAVY);
  fillRect(x + 70, y + 52, 150, 12, NAVY);
  fillRect(x + 62, y + 64, 166, 62, WHITE);
  for (let i = 0; i < 5; i++) fillRect(x + 78 + i * 34, y + 70, 12, 50, NAVY);
  fillRect(x + 58, y + 126, 174, 8, NAVY);
  // a microchip in front: AI chips are what the hearing is about
  fillRect(x + 196, y + 88, 62, 52, INK);
  for (let i = 0; i < 4; i++) {
    drawLine(x + 204 + i * 14, y + 88, x + 204 + i * 14, y + 78, 4, INK);
    drawLine(x + 204 + i * 14, y + 140, x + 204 + i * 14, y + 148, 4, INK);
  }
  drawTextCentred('AI', x + 227, y + 102, 3, GOLD);
}

function sceneCrypto(x, y) {
  fillRect(x, y, 290, 148, rgb(0x20293d));
  // a laptop on a video call
  fillRect(x + 52, y + 22, 150, 96, rgb(0x0e1524));
  fillRect(x + 58, y + 28, 138, 84, rgb(0x33507e));
  fillCircle(x + 127, y + 62, 24, rgb(0xe8b98d)); // a face on the call
  fillRect(x + 103, y + 54, 48, 11, rgb(0x111111)); // a mask band over the eyes
  fillEllipse(x + 127, y + 104, 30, 12, rgb(0x274a75)); // shoulders
  fillRect(x + 40, y + 118, 174, 10, rgb(0x39445c)); // laptop base
  // coins spilling out of the screen
  for (const [cx, cy, r] of [[228, 52, 17], [248, 84, 14], [222, 108, 12], [258, 122, 10]]) {
    fillCircle(cx + x, cy + y, r, GOLD);
    drawTextCentred('$', cx + x, cy + y - r * 0.42, r >= 14 ? 2 : 1, rgb(0x7a5410));
  }
  drawText('FAKE VIDEO CALLS', x + 16, y + 6, 2, rgb(0xf5c542));
}

function sceneFaa(x, y) {
  fillRect(x, y, 290, 148, SKY);
  fillEllipse(x + 66, y + 34, 34, 11, WHITE); // clouds
  fillEllipse(x + 228, y + 24, 28, 9, WHITE);
  // a jet, parked at the gate of the sky
  fillEllipse(x + 128, y + 74, 76, 17, WHITE);
  fillTriangle(x + 84, y + 78, x + 128, y + 112, x + 150, y + 76, rgb(0xc8d2de)); // wing
  fillTriangle(x + 186, y + 68, x + 206, y + 40, x + 212, y + 70, RED); // tail fin
  for (let i = 0; i < 6; i++) fillCircle(x + 92 + i * 15, y + 70, 3, NAVY); // windows
  drawLine(x + 52, y + 132, x + 238, y + 132, 4, GREY); // runway
  // a control tower
  fillRect(x + 246, y + 74, 12, 58, GREY);
  fillRect(x + 238, y + 58, 28, 16, NAVY);
  // a halt sign
  fillCircle(x + 36, y + 106, 24, RED);
  drawTextCentred('HALT', x + 36, y + 99, 2, WHITE);
}

function sceneKane(x, y) {
  fillRect(x, y, 290, 148, GREEN);
  for (let i = 0; i < 4; i++) fillRect(x + i * 74, y, 36, 148, rgb(0x35703c)); // mowing stripes
  drawLine(x + 145, y, x + 145, y + 148, 3, WHITE);
  fillCircle(x + 145, y + 74, 26, WHITE);
  fillCircle(x + 145, y + 74, 25, GREEN);
  // an England shirt with Kane's 9
  fillRect(x + 34, y + 34, 62, 74, rgb(0xf2f2f2));
  fillTriangle(x + 34, y + 34, x + 12, y + 58, x + 34, y + 66, rgb(0xf2f2f2));
  fillTriangle(x + 96, y + 34, x + 118, y + 58, x + 96, y + 66, rgb(0xf2f2f2));
  drawTextCentred('9', x + 65, y + 56, 5, NAVY);
  drawTextCentred('ENGLAND', x + 65, y + 40, 1, RED);
  // a football
  fillCircle(x + 216, y + 96, 30, WHITE);
  fillCircle(x + 216, y + 96, 10, INK);
  for (const [ox, oy] of [[-20, -14], [20, -14], [-24, 12], [24, 12], [0, 24]])
    fillCircle(x + 216 + ox, y + 96 + oy, 6, INK);
  drawText('126 CAPS', x + 182, y + 16, 2, WHITE);
}

// ---- the page ----
const PANELS = [
  {
    tag: 'WAR + DIPLOMACY', colour: rgb(0x2f6db3), scene: sceneUkraine,
    headline: 'UKRAINE TALKS WIDEN TO EUROPE',
    sub: 'ZELENSKY MEETS US ENVOYS; EUROPE GETS A SEAT AT THE TABLE',
  },
  {
    tag: 'MIDDLE EAST', colour: RED, scene: sceneBahrain,
    headline: 'IRAN SAYS IT HIT US RADAR IN BAHRAIN',
    sub: 'US SAYS IT DOWNED TWO IRANIAN DRONES HEADED FOR BAHRAIN',
  },
  {
    tag: 'US + TECH', colour: rgb(0x6b4fa1), scene: sceneSenate,
    headline: 'SENATE SUMMONS NVIDIA CHIEF HUANG',
    sub: 'BANKING COMMITTEE ALSO CALLS LUTNICK TO TESTIFY',
  },
  {
    tag: 'CYBER CRIME', colour: rgb(0x20293d), scene: sceneCrypto,
    headline: 'N. KOREA $400M CRYPTO THEFT, SAYS FBI',
    sub: 'HACKERS POSED ON FAKE VIDEO CALLS TO STEAL THE COINS',
  },
  {
    tag: 'TRAVEL', colour: rgb(0x1f7a8c), scene: sceneFaa,
    headline: 'FAA HALTS US FLIGHTS FOR 4 HOURS',
    sub: 'COMMS FAILURE FORCES A NATIONWIDE GROUND STOP',
  },
  {
    tag: 'SPORT', colour: GREEN, scene: sceneKane,
    headline: 'KANE BREAKS ENGLAND CAPS RECORD',
    sub: '126TH CAP, AGAINST CROATIA IN THE NATIONS LEAGUE',
  },
];

function drawGlobe(cx, cy, r) {
  fillCircle(cx, cy, r, rgb(0x2f6db3));
  fillEllipse(cx - r * 0.35, cy - r * 0.25, r * 0.3, r * 0.2, rgb(0x59a05a));
  fillEllipse(cx + r * 0.3, cy + r * 0.15, r * 0.34, r * 0.24, rgb(0x59a05a));
  fillEllipse(cx + r * 0.05, cy - r * 0.55, r * 0.2, r * 0.13, rgb(0x59a05a));
  drawLine(cx - r, cy, cx + r, cy, 2, rgb(0x9dbfdd));
  drawLine(cx, cy - r, cx, cy + r, 2, rgb(0x9dbfdd));
}

function drawPanel(p, x, y) {
  fillRect(x, y, 318, 392, WHITE);
  fillRect(x, y, 318, 6, p.colour);
  fillRect(x + 14, y + 16, textWidth(p.tag, 2) + 20, 30, p.colour);
  drawText(p.tag, x + 24, y + 23, 2, WHITE);
  CLIP = [x + 14, y + 56, x + 304, y + 204]; // a scene may not spill out of its box
  p.scene(x + 14, y + 56);
  CLIP = null;
  let ty = y + 222;
  for (const line of wrapText(p.headline, 16)) {
    drawText(line, x + 14, ty, 3, INK);
    ty += 30;
  }
  ty += 6;
  for (const line of wrapText(p.sub, 24)) {
    drawText(line, x + 14, ty, 2, GREY);
    ty += 19;
  }
}

function drawPage() {
  fillRect(0, 0, W, H, PAPER);
  fillRect(0, 0, W, 148, NAVY);
  fillRect(0, 148, W, 6, GOLD);
  drawGlobe(948, 74, 52);
  drawText('THE WORLD TODAY', 36, 26, 7, WHITE);
  drawText('FRIDAY 13 NOVEMBER 2026', 38, 88, 3, GOLD);
  drawText('THE DAY IN ONE FRAME: SIX STORIES', 38, 118, 2, rgb(0xc9d4ea));
  PANELS.forEach((p, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    drawPanel(p, 20 + col * 332, 170 + row * 406);
  });
  drawTextCentred('REPORTED ON 13 NOVEMBER 2026 - BBC - AL JAZEERA - ASSOCIATED PRESS', 512, 990, 2, GREY);
}

drawPage();

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'entry.png');
writeFileSync(outFile, encodePng());
console.log(`wrote ${outFile}`);
