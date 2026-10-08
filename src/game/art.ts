// 絵はすべて Canvas2D で手続き的に描き、Phaser のテクスチャとして登録する(画像ファイルなし)。
// 見た目を差し替える時は、同じキーで assets/mine/ の画像を load すればよい。
import Phaser from 'phaser';
import { Rng } from '../core/rng';
import { W, H, FIELD, PLAY, GUIDE } from './logic';

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  if (scene.textures.exists(key)) return;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c);
  scene.textures.addCanvas(key, cv);
}

export const PAPER = { x0: 52, y0: 28, x1: 908, y1: 512 };

export function makeArt(scene: Phaser.Scene) {
  make(scene, 'bg', W, H, drawBackground);
  make(scene, 'glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  make(scene, 'dot', 8, 8, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(4, 4, 3.5, 0, 7); c.fill(); });
  make(scene, 'shard', 10, 10, (c) => { c.fillStyle = '#e8452c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 3); c.lineTo(3, 10); c.fill(); });
  make(scene, 'lantern', 36, 52, drawLantern);
  make(scene, 'moon', 90, 90, (c) => {
    const g = c.createRadialGradient(45, 45, 10, 45, 45, 45);
    g.addColorStop(0, 'rgba(255,246,214,0.35)'); g.addColorStop(1, 'rgba(255,246,214,0)');
    c.fillStyle = g; c.fillRect(0, 0, 90, 90);
    c.fillStyle = '#f6edcf'; c.beginPath(); c.arc(45, 45, 22, 0, 7); c.fill();
    c.fillStyle = 'rgba(200,190,160,0.35)';
    for (const [x, y, r] of [[38, 40, 5], [52, 50, 4], [46, 56, 3]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  });
  make(scene, 'house_lit', 72, 64, (c) => drawHouse(c, true));
  make(scene, 'house_dark', 72, 64, (c) => drawHouse(c, false));
  // 家の形 = 光の形。上 = 火の見櫓(上へ高い)/ 下 = 軒の長い提灯屋(下へ垂れる)/ 周り = 丸い蔵 / 横 = 長屋 / 縦 = 二階の楼 / 十字 = 辻の祠
  for (const p of ['up', 'down', 'area', 'hline', 'vline', 'cross'] as const) {
    make(scene, `house_${p}_lit`, 72, 72, (c) => drawShapedHouse(c, p, true));
    make(scene, `house_${p}_dark`, 72, 72, (c) => drawShapedHouse(c, p, false));
  }
  make(scene, 'g_fuwa', 48, 56, drawFuwa);
  make(scene, 'g_oni', 48, 56, drawOnibi);
  make(scene, 'g_kasa', 52, 60, drawKarakasa);
  make(scene, 'g_kirai', 50, 56, drawKage);
  make(scene, 'wisp', 32, 40, drawWisp);
  make(scene, 'portal', 72, 72, drawPortal);
  make(scene, 'person', 12, 18, drawPerson);
  // 提灯の模様 = 光の形(キャンディのしま模様のように、見ればどう弾けるか分かる)。上向きを「前」として描く
  make(scene, 'mark_up', 28, 28, (c) => ink(c, (c2) => { c2.moveTo(14, 26); c2.lineTo(14, 4); c2.moveTo(7, 11); c2.lineTo(14, 3); c2.lineTo(21, 11); }));
  make(scene, 'mark_down', 28, 28, (c) => ink(c, (c2) => { c2.moveTo(14, 2); c2.lineTo(14, 24); c2.moveTo(7, 17); c2.lineTo(14, 25); c2.lineTo(21, 17); }));
  make(scene, 'mark_area', 28, 28, (c) => ink(c, (c2) => { c2.rect(5, 5, 18, 18); c2.moveTo(14, 12); c2.lineTo(14, 16); }));
  make(scene, 'mark_hline', 28, 28, (c) => ink(c, (c2) => { c2.moveTo(3, 14); c2.lineTo(25, 14); }));
  make(scene, 'mark_vline', 28, 28, (c) => ink(c, (c2) => { c2.moveTo(14, 3); c2.lineTo(14, 25); }));
  make(scene, 'mark_cross', 28, 28, (c) => ink(c, (c2) => { c2.moveTo(14, 5); c2.lineTo(14, 23); c2.moveTo(5, 14); c2.lineTo(23, 14); }));
  make(scene, 'tree', 40, 44, (c) => {
    c.fillStyle = 'rgba(12,14,22,0.9)';
    c.fillRect(18, 28, 4, 16);
    for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(20 + (k - 1) * 6, 24 - k * 7, 16 - k * 3, 6, 0, 0, 7); c.fill(); }
  });
}

function drawBackground(c: Ctx) {
  const rng = new Rng(20261006);
  // 机(巻物の外)
  c.fillStyle = '#0d0907'; c.fillRect(0, 0, W, H);
  // 表装(金茶の縁)
  const { x0, y0, x1, y1 } = PAPER;
  c.fillStyle = '#6b4a24'; c.fillRect(x0, y0 - 8, x1 - x0, y1 - y0 + 16);
  c.fillStyle = '#a07b3c'; c.fillRect(x0, y0 - 4, x1 - x0, y1 - y0 + 8);
  for (let x = x0; x < x1; x += 14) { c.fillStyle = 'rgba(255,230,160,0.12)'; c.fillRect(x, y0 - 4, 7, 2); c.fillRect(x + 7, y1 + 2, 7, 2); }
  // 紙(夜の墨色。上ほど深い)
  const sky = c.createLinearGradient(0, y0, 0, y1);
  sky.addColorStop(0, '#141a33'); sky.addColorStop(0.55, '#262848'); sky.addColorStop(1, '#2e2638');
  c.fillStyle = sky; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  // 和紙の繊維
  for (let i = 0; i < 1600; i++) {
    c.strokeStyle = `rgba(255,255,255,${0.012 + rng.next() * 0.025})`;
    c.lineWidth = 0.6;
    const x = x0 + rng.next() * (x1 - x0), y = y0 + rng.next() * (y1 - y0), a = rng.next() * Math.PI;
    const l = 3 + rng.next() * 9;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  c.save();
  c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
  // 星
  for (let i = 0; i < 90; i++) {
    c.fillStyle = `rgba(255,248,220,${0.15 + rng.next() * 0.5})`;
    c.fillRect(x0 + rng.next() * (x1 - x0), y0 + rng.next() * 150, 1.3, 1.3);
  }
  // 遠い山(墨のにじみ、3 重)
  const ridge = (base: number, amp: number, col: string, seedOff: number) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(x0, y1);
    for (let x = x0; x <= x1; x += 8) {
      const y = base - amp * (0.5 + 0.5 * Math.sin(x / 90 + seedOff)) - amp * 0.4 * Math.sin(x / 37 + seedOff * 2) - amp * 0.2 * Math.sin(x / 13);
      c.lineTo(x, y);
    }
    c.lineTo(x1, y1); c.closePath(); c.fill();
  };
  ridge(200, 60, 'rgba(40,46,80,0.55)', 1);
  ridge(225, 40, 'rgba(30,34,62,0.7)', 3);
  // 霞(横に流れる帯)
  for (const [y, a] of [[170, 0.07], [215, 0.06], [400, 0.05], [455, 0.06]] as const) {
    const g = c.createLinearGradient(0, y - 16, 0, y + 16);
    g.addColorStop(0, 'rgba(200,210,255,0)'); g.addColorStop(0.5, `rgba(200,210,255,${a})`); g.addColorStop(1, 'rgba(200,210,255,0)');
    c.fillStyle = g; c.fillRect(x0, y - 16, x1 - x0, 32);
  }
  // 遠景: 寺の屋根と五重塔の影(霞の向こう)
  const silhouette = (col: string, base: number, seedOff: number, tall: boolean) => {
    c.fillStyle = col;
    let x = x0;
    const r2 = new Rng(seedOff);
    while (x < x1) {
      const w = 40 + r2.next() * 70, h = 14 + r2.next() * 22;
      // 反った瓦屋根
      c.beginPath(); c.moveTo(x - 6, base); c.quadraticCurveTo(x + w * 0.15, base - h * 0.55, x + w * 0.3, base - h); c.lineTo(x + w * 0.7, base - h);
      c.quadraticCurveTo(x + w * 0.85, base - h * 0.55, x + w + 6, base); c.closePath(); c.fill();
      c.fillRect(x, base, w, 60);
      x += w + r2.next() * 30;
    }
    if (tall) {
      // 五重塔
      const px = x0 + (x1 - x0) * 0.22;
      for (let k = 0; k < 5; k++) {
        const yy = base - 30 - k * 26, ww = 64 - k * 8;
        c.beginPath(); c.moveTo(px - ww / 2 - 8, yy); c.quadraticCurveTo(px - ww / 4, yy - 10, px - ww / 4, yy - 14); c.lineTo(px + ww / 4, yy - 14);
        c.quadraticCurveTo(px + ww / 4, yy - 10, px + ww / 2 + 8, yy); c.closePath(); c.fill();
        c.fillRect(px - ww / 3, yy, (ww * 2) / 3, 12);
      }
      c.fillRect(px - 1.5, base - 30 - 5 * 26 - 30, 3, 34);
    }
  };
  silhouette('rgba(26,28,52,0.75)', 352, 7, true);
  // 霞
  const mist = c.createLinearGradient(0, 300, 0, 420);
  mist.addColorStop(0, 'rgba(160,170,220,0)'); mist.addColorStop(0.6, 'rgba(160,170,220,0.08)'); mist.addColorStop(1, 'rgba(160,170,220,0)');
  c.fillStyle = mist; c.fillRect(x0, 300, x1 - x0, 120);
  // 近景: 家並みの後ろの町家の屋根(家はこの前に建つ)
  silhouette('rgba(16,16,30,0.92)', 440, 11, false);
  const ground = c.createLinearGradient(0, 430, 0, y1);
  ground.addColorStop(0, 'rgba(10,10,20,0)'); ground.addColorStop(1, 'rgba(8,8,16,0.8)');
  c.fillStyle = ground; c.fillRect(x0, 430, x1 - x0, y1 - 430);
  // 目安のマス目: 線ではなく、交わる所の小さな点だけ(位置はアナログ)
  c.fillStyle = 'rgba(230,215,180,0.11)';
  for (let x = PLAY.x0; x <= PLAY.x1; x += GUIDE) for (let y = PLAY.y0; y <= PLAY.y1; y += GUIDE) c.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
  // 紙の端のかすれ
  const vg = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 560);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = vg; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.restore();
  // 遊べる範囲を示す、ごく薄い罫
  c.strokeStyle = 'rgba(255,240,200,0.05)'; c.setLineDash([2, 6]);
  c.strokeRect(FIELD.x0, FIELD.y0, FIELD.x1 - FIELD.x0, FIELD.y1 - FIELD.y0);
  c.setLineDash([]);
  // 軸(左右の巻き)
  for (const ax of [x0 - 6, x1 + 6]) {
    const g = c.createLinearGradient(ax - 14, 0, ax + 14, 0);
    g.addColorStop(0, '#2a1a10'); g.addColorStop(0.45, '#7a5130'); g.addColorStop(0.6, '#5a3820'); g.addColorStop(1, '#1e120a');
    c.fillStyle = g; c.fillRect(ax - 14, y0 - 16, 28, y1 - y0 + 32);
    c.fillStyle = '#c9a24a';
    c.fillRect(ax - 11, y0 - 24, 22, 10); c.fillRect(ax - 11, y1 + 14, 22, 10);
    c.fillStyle = 'rgba(255,240,180,0.35)';
    c.fillRect(ax - 9, y0 - 22, 4, 6); c.fillRect(ax - 9, y1 + 16, 4, 6);
  }
}

function drawLantern(c: Ctx) {
  // 赤い提灯。上下の黒い枠、横の骨
  const cx = 18;
  c.fillStyle = '#222'; c.fillRect(cx - 7, 2, 14, 6); c.fillRect(cx - 7, 44, 14, 6);
  c.fillStyle = '#000'; c.fillRect(cx - 1, 0, 2, 3);
  const g = c.createRadialGradient(cx - 3, 22, 2, cx, 26, 20);
  g.addColorStop(0, '#ffe08a'); g.addColorStop(0.45, '#f05a2a'); g.addColorStop(1, '#a3201a');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(cx, 26, 15, 19, 0, 0, 7); c.fill();
  c.strokeStyle = 'rgba(80,10,10,0.55)'; c.lineWidth = 1;
  for (let y = 12; y <= 40; y += 4) {
    const w = 15 * Math.sqrt(Math.max(0, 1 - ((y - 26) / 19) ** 2));
    c.beginPath(); c.moveTo(cx - w, y); c.lineTo(cx + w, y); c.stroke();
  }
  // 「灯」の代わりに、丸い紋
  c.strokeStyle = 'rgba(40,0,0,0.7)'; c.lineWidth = 1.6;
  c.beginPath(); c.arc(cx, 26, 6, 0, 7); c.stroke();
  c.beginPath(); c.moveTo(cx, 20); c.lineTo(cx, 32); c.stroke();
}

function drawHouse(c: Ctx, lit: boolean) {
  // 茅葺きの民家
  c.fillStyle = lit ? '#3d2f25' : '#25201c';
  c.fillRect(14, 30, 44, 28);
  // 屋根
  c.fillStyle = lit ? '#5b4630' : '#332a22';
  c.beginPath(); c.moveTo(4, 34); c.lineTo(22, 8); c.lineTo(50, 8); c.lineTo(68, 34); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(10 + i * 9, 33); c.lineTo(24 + i * 4, 10); c.stroke(); }
  c.fillStyle = '#1b1410'; c.fillRect(20, 4, 32, 6);
  // 障子窓
  if (lit) {
    const g = c.createLinearGradient(0, 36, 0, 52);
    g.addColorStop(0, '#ffd27a'); g.addColorStop(1, '#f39b3a');
    c.fillStyle = g;
  } else c.fillStyle = '#1a1a22';
  c.fillRect(20, 37, 18, 14); c.fillRect(42, 37, 10, 21);
  c.strokeStyle = lit ? 'rgba(90,50,10,0.8)' : 'rgba(60,60,70,0.6)';
  c.lineWidth = 1;
  for (const x of [26, 32]) { c.beginPath(); c.moveTo(x, 37); c.lineTo(x, 51); c.stroke(); }
  c.beginPath(); c.moveTo(20, 44); c.lineTo(38, 44); c.stroke();
  c.beginPath(); c.moveTo(47, 37); c.lineTo(47, 58); c.stroke();
}

/** 形のある家(家の形 = この家から投げる提灯の光の形)。72×72、地面は y=64 */
function drawShapedHouse(c: Ctx, p: 'up' | 'down' | 'area' | 'hline' | 'vline' | 'cross', lit: boolean) {
  const wall = lit ? '#3d2f25' : '#25201c', roof = lit ? '#5b4630' : '#332a22', win = lit ? '#ffc864' : '#1a1a22';
  const shoji = (x: number, y: number, w: number, h: number) => {
    c.fillStyle = win; c.fillRect(x, y, w, h);
    c.strokeStyle = lit ? 'rgba(90,50,10,0.8)' : 'rgba(60,60,70,0.6)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); c.stroke();
  };
  const gable = (x0: number, x1: number, yb: number, yt: number) => {
    c.fillStyle = roof; c.beginPath(); c.moveTo(x0, yb); c.lineTo(x0 + 10, yt); c.lineTo(x1 - 10, yt); c.lineTo(x1, yb); c.closePath(); c.fill();
    c.fillStyle = '#1b1410'; c.fillRect(x0 + 10, yt - 3, x1 - x0 - 20, 4);
  };
  switch (p) {
    case 'up': {
      // 火の見櫓: 細く高い。てっぺんに半鐘と、上を向いた屋根
      c.strokeStyle = wall; c.lineWidth = 4;
      c.beginPath(); c.moveTo(22, 66); c.lineTo(30, 14); c.moveTo(50, 66); c.lineTo(42, 14); c.stroke();
      c.lineWidth = 2;
      for (let y = 22; y < 64; y += 9) { c.beginPath(); c.moveTo(30 - (y - 14) * 0.15, y); c.lineTo(42 + (y - 14) * 0.15, y); c.stroke(); }
      c.fillStyle = roof; c.beginPath(); c.moveTo(20, 16); c.lineTo(36, 0); c.lineTo(52, 16); c.closePath(); c.fill();
      c.fillStyle = lit ? '#ffd27a' : '#3a3530'; c.beginPath(); c.arc(36, 22, 5, 0, 7); c.fill();
      shoji(28, 42, 16, 12);
      break;
    }
    case 'down': {
      // 提灯屋: 低い屋根の下に、大きな提灯が地面近くまで垂れる
      c.fillStyle = wall; c.fillRect(12, 22, 48, 30);
      gable(4, 68, 24, 6);
      shoji(16, 28, 14, 14);
      c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(46, 24); c.lineTo(46, 40); c.stroke();
      const g = c.createRadialGradient(46, 52, 2, 46, 52, 12);
      g.addColorStop(0, lit ? '#ffe08a' : '#5a3a30'); g.addColorStop(1, lit ? '#c0301e' : '#3a1a14');
      c.fillStyle = g; c.beginPath(); c.ellipse(46, 53, 9, 13, 0, 0, 7); c.fill();
      c.fillStyle = '#222'; c.fillRect(41, 39, 10, 3); c.fillRect(41, 65, 10, 3);
      break;
    }
    case 'area': {
      // 丸い蔵: どっしり四角い白壁に、丸く低い屋根(周りを照らす)
      c.fillStyle = lit ? '#cfc6b0' : '#5a5650'; c.fillRect(10, 28, 52, 38);
      c.fillStyle = roof; c.beginPath(); c.ellipse(36, 28, 32, 16, 0, Math.PI, 0); c.fill();
      c.fillRect(4, 26, 64, 5);
      c.fillStyle = lit ? '#2a2a2a' : '#1a1a1a'; c.fillRect(10, 54, 52, 4);
      shoji(28, 36, 16, 14);
      break;
    }
    case 'hline': {
      // 長屋: 横に長い
      c.fillStyle = wall; c.fillRect(2, 34, 68, 30);
      gable(0, 72, 36, 18);
      shoji(8, 42, 14, 12); shoji(29, 42, 14, 12); shoji(50, 42, 14, 12);
      break;
    }
    case 'vline': {
      // 二階の楼: 縦に高い
      c.fillStyle = wall; c.fillRect(20, 12, 32, 54);
      gable(14, 58, 14, 0); gable(12, 60, 40, 30);
      shoji(28, 18, 16, 10); shoji(28, 46, 16, 14);
      break;
    }
    case 'cross': {
      // 辻の祠: 十字の屋根
      c.fillStyle = wall; c.fillRect(22, 30, 28, 34);
      c.fillStyle = roof; c.fillRect(6, 24, 60, 8); c.fillRect(30, 4, 12, 26);
      shoji(28, 40, 16, 14);
      break;
    }
  }
}

/** ふらふら漂う: 白い幽霊(額に三角の天冠) */
function drawFuwa(c: Ctx) {
  const g = c.createLinearGradient(0, 4, 0, 54);
  g.addColorStop(0, 'rgba(240,248,255,0.98)'); g.addColorStop(1, 'rgba(170,200,255,0.15)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(10, 24); c.bezierCurveTo(10, 4, 38, 4, 38, 24);
  c.bezierCurveTo(40, 36, 34, 44, 28, 54);
  c.bezierCurveTo(26, 46, 20, 50, 16, 42);
  c.bezierCurveTo(12, 38, 9, 32, 10, 24);
  c.fill();
  // 天冠
  c.fillStyle = '#fff'; c.strokeStyle = '#9aa'; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(19, 11); c.lineTo(24, 4); c.lineTo(29, 11); c.closePath(); c.fill(); c.stroke();
  // 目と口
  c.fillStyle = '#1b1e2c';
  c.beginPath(); c.ellipse(19, 21, 2.2, 3, 0, 0, 7); c.ellipse(29, 21, 2.2, 3, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(24, 29, 2.5, 2, 0, 0, 7); c.fill();
  // 手(うらめしや)
  c.strokeStyle = 'rgba(230,240,255,0.9)'; c.lineWidth = 2.4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(12, 30); c.lineTo(5, 33); c.lineTo(3, 37); c.stroke();
}

/** ジグザグ: 青緑の鬼火 */
function drawOnibi(c: Ctx) {
  const g = c.createRadialGradient(24, 34, 2, 24, 30, 24);
  g.addColorStop(0, 'rgba(230,255,240,1)'); g.addColorStop(0.5, 'rgba(90,230,170,0.9)'); g.addColorStop(1, 'rgba(30,140,120,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(24, 2); c.lineTo(30, 14); c.lineTo(28, 18); c.lineTo(36, 22);
  c.bezierCurveTo(42, 34, 38, 50, 24, 52);
  c.bezierCurveTo(10, 50, 6, 34, 12, 24); c.lineTo(18, 20); c.lineTo(16, 12); c.closePath(); c.fill();
  c.fillStyle = '#06301f';
  // つり目
  c.beginPath(); c.moveTo(15, 32); c.lineTo(22, 35); c.lineTo(15, 36); c.fill();
  c.beginPath(); c.moveTo(33, 32); c.lineTo(26, 35); c.lineTo(33, 36); c.fill();
  c.beginPath(); c.moveTo(19, 42); c.lineTo(22, 40); c.lineTo(24, 43); c.lineTo(26, 40); c.lineTo(29, 42); c.lineWidth = 1.5; c.strokeStyle = '#06301f'; c.stroke();
}

/** 急に跳ぶ: 唐傘おばけ(一つ目・一本足) */
function drawKarakasa(c: Ctx) {
  c.fillStyle = '#7a4fa8';
  c.beginPath(); c.moveTo(26, 2); c.lineTo(50, 38); c.quadraticCurveTo(26, 30, 2, 38); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(30,10,50,0.6)'; c.lineWidth = 1;
  for (const x of [10, 18, 34, 42]) { c.beginPath(); c.moveTo(26, 3); c.lineTo(x, 35); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.beginPath(); c.moveTo(26, 2); c.lineTo(18, 34); c.lineTo(10, 36); c.closePath(); c.fill();
  // 一つ目
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(26, 20, 6, 5, 0, 0, 7); c.fill();
  c.fillStyle = '#111'; c.beginPath(); c.arc(27, 20, 2.6, 0, 7); c.fill();
  // 舌
  c.fillStyle = '#e04a6a'; c.beginPath(); c.ellipse(26, 30, 3, 5, 0, 0, Math.PI); c.fill();
  // 一本足
  c.strokeStyle = '#d9c3a0'; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(26, 36); c.lineTo(26, 52); c.stroke();
  c.fillStyle = '#3a2a1a'; c.fillRect(19, 52, 14, 5);
}

/** 光を嫌う: 影法師(黒い靄に赤い目) */
function drawKage(c: Ctx) {
  const g = c.createRadialGradient(25, 26, 4, 25, 28, 26);
  g.addColorStop(0, 'rgba(10,6,16,1)'); g.addColorStop(0.65, 'rgba(25,12,35,0.92)'); g.addColorStop(1, 'rgba(40,20,60,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(8, 30); c.bezierCurveTo(4, 6, 46, 6, 42, 30);
  c.lineTo(46, 50); c.lineTo(38, 44); c.lineTo(32, 54); c.lineTo(25, 45); c.lineTo(18, 54); c.lineTo(12, 44); c.lineTo(4, 50); c.closePath();
  c.fill();
  c.fillStyle = '#ff3b3b';
  c.shadowColor = '#ff2020'; c.shadowBlur = 6;
  c.beginPath(); c.ellipse(18, 24, 3, 1.6, 0.2, 0, 7); c.ellipse(32, 24, 3, 1.6, -0.2, 0, 7); c.fill();
  c.shadowBlur = 0;
}

/** 成仏したおばけ = 味方の人魂 */
function drawWisp(c: Ctx) {
  const g = c.createRadialGradient(16, 26, 1, 16, 24, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,236,160,0.95)'); g.addColorStop(1, 'rgba(255,190,80,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(16, 2); c.bezierCurveTo(20, 10, 30, 16, 28, 26);
  c.bezierCurveTo(27, 36, 5, 36, 4, 26); c.bezierCurveTo(4, 16, 14, 14, 16, 2); c.fill();
}

/** あの世の口: 墓石と卒塔婆、まわりに紫の靄 */
function drawPortal(c: Ctx) {
  const g = c.createRadialGradient(36, 40, 4, 36, 40, 36);
  g.addColorStop(0, 'rgba(120,60,170,0.55)'); g.addColorStop(0.6, 'rgba(70,30,110,0.25)'); g.addColorStop(1, 'rgba(40,20,70,0)');
  c.fillStyle = g; c.fillRect(0, 0, 72, 72);
  // 卒塔婆
  c.fillStyle = '#b8b0a0';
  for (const [x, h] of [[18, 30], [52, 26], [58, 20]]) {
    c.beginPath(); c.moveTo(x - 2, 52); c.lineTo(x - 2, 52 - h); c.lineTo(x, 52 - h - 3); c.lineTo(x + 2, 52 - h); c.lineTo(x + 2, 52); c.fill();
  }
  // 墓石
  c.fillStyle = '#4a4656';
  c.fillRect(27, 30, 18, 24);
  c.fillStyle = '#5c586a'; c.fillRect(24, 52, 24, 5);
  c.fillStyle = 'rgba(20,16,30,0.8)'; c.fillRect(33, 34, 6, 14);
}

/** 家の人(逃げ出す時に描く小さな影) */
function drawPerson(c: Ctx) {
  c.fillStyle = '#1a1420';
  c.beginPath(); c.arc(6, 4, 3.2, 0, 7); c.fill();
  c.beginPath(); c.moveTo(2, 18); c.lineTo(4, 8); c.lineTo(8, 8); c.lineTo(10, 18); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,210,140,0.6)'; c.lineWidth = 1;
  c.beginPath(); c.arc(6, 4, 3.2, 0, 7); c.stroke();
}

/** 墨の太い線(明るい縁取り付き)。提灯の模様に使う */
function ink(c: Ctx, path: (c: Ctx) => void) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [w, col] of [[7, '#ffd9a0'], [4, '#2a0806']] as const) {
    c.strokeStyle = col; c.lineWidth = w;
    c.beginPath(); path(c); c.stroke();
  }
}
