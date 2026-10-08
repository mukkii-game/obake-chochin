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
  // 夕焼け(夜の背景の上に足す。刻が進むほど薄くなって夜になる)
  make(scene, 'dusk', W, H, (c) => {
    const { x0, y0, x1 } = PAPER;
    const g = c.createLinearGradient(0, y0, 0, 470);
    g.addColorStop(0, 'rgba(70,30,80,0.35)'); g.addColorStop(0.45, 'rgba(170,60,50,0.32)');
    g.addColorStop(0.68, 'rgba(220,110,50,0.45)'); g.addColorStop(1, 'rgba(200,90,50,0)');
    c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, 470 - y0);
    // 山の端に沈む夕日
    const sx = x0 + (x1 - x0) * 0.72, sy = 300;
    const sg = c.createRadialGradient(sx, sy, 4, sx, sy, 110);
    sg.addColorStop(0, 'rgba(255,220,150,0.95)'); sg.addColorStop(0.12, 'rgba(255,160,80,0.6)'); sg.addColorStop(1, 'rgba(220,100,40,0)');
    c.fillStyle = sg; c.fillRect(sx - 130, sy - 130, 260, 260);
  });
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
  // 提灯の形 = 光の形(縦長 = 縦 / 横長 = 横 / 丸 = 丸)。置かれた提灯を見れば、どちらへ弾けるか分かる
  make(scene, 'lantern_vline', 28, 60, (c) => drawShapedLantern(c, 28, 60, 9, 25));
  make(scene, 'lantern_hline', 60, 34, (c) => drawShapedLantern(c, 60, 34, 25, 10));
  make(scene, 'lantern_area', 44, 48, (c) => drawShapedLantern(c, 44, 48, 18, 17));
  make(scene, 'lantern_up', 28, 60, (c) => drawShapedLantern(c, 28, 60, 9, 25));
  make(scene, 'lantern_down', 28, 60, (c) => drawShapedLantern(c, 28, 60, 9, 25));
  make(scene, 'lantern_cross', 44, 48, (c) => drawShapedLantern(c, 44, 48, 18, 17));
  // 逃げる人(小さなドット絵。2 コマで走る)
  make(scene, 'px_run0', 18, 24, (c) => drawPixelPerson(c, 0));
  make(scene, 'px_run1', 18, 24, (c) => drawPixelPerson(c, 1));
  // お月さま: 8/13 三日月 → 8/14 ふくらむ → 8/15 満月(欠けた所が埋まっていく)。
  // 満ちるまでは、目をぱっちり開けて町を見物している顔(物見遊山)。満月(8/15・エンディング)は笑顔。色は黄色め
  const moonPhases: Array<{ cut: number | null; face: 'watch' | 'smile' | 'grin' }> = [
    { cut: 13, face: 'watch' }, { cut: 40, face: 'watch' }, { cut: null, face: 'smile' }, { cut: null, face: 'grin' },
  ];
  moonPhases.forEach(({ cut, face }, i) => make(scene, `moon_${i}`, 120, 120, (c) => {
    const R = 34;
    const g = c.createRadialGradient(60, 60, 14, 60, 60, 60);
    g.addColorStop(0, `rgba(255,232,140,${cut === null ? 0.5 : 0.3})`); g.addColorStop(1, 'rgba(255,232,140,0)');
    c.fillStyle = g; c.fillRect(0, 0, 120, 120);
    // 欠けている所: うっすら見える(顔はここにもかかる)
    c.fillStyle = 'rgba(30,26,48,0.88)'; c.beginPath(); c.arc(60, 60, R, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,232,140,0.25)'; c.lineWidth = 1.5; c.stroke();
    // 光っている所: 別の紙に満月を描いて、左から影の丸で切り取る(右が光る)
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 120;
    const m = cv.getContext('2d')!;
    m.fillStyle = '#ffe58a'; m.beginPath(); m.arc(60, 60, R, 0, 7); m.fill();
    m.fillStyle = 'rgba(214,180,90,0.35)';
    for (const [x, y, r] of [[46, 46, 5], [80, 48, 4], [74, 80, 5]]) { m.beginPath(); m.arc(x, y, r, 0, 7); m.fill(); }
    if (cut !== null) { m.globalCompositeOperation = 'destination-out'; m.fillStyle = '#000'; m.beginPath(); m.arc(60 - cut, 60, R + 1, 0, 7); m.fill(); }
    c.drawImage(cv, 0, 0);
    c.save(); c.translate(60, 60);
    if (face === 'watch') {
      // じっと見物: 白目つきのまんまる目で、町(左下)をのぞきこむ。口は「ほー」
      c.lineWidth = 1.6; c.strokeStyle = '#3a2a2a';
      for (const sx of [-11, 11]) {
        c.fillStyle = '#fffaf0'; c.beginPath(); c.ellipse(sx, -4, 7, 8, 0, 0, 7); c.fill(); c.stroke();
        c.fillStyle = '#2b2020'; c.beginPath(); c.arc(sx - 2.5, -1, 3.8, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(sx - 1.2, -2.6, 1.3, 0, 7); c.fill();
      }
      c.beginPath(); c.moveTo(-17, -16); c.quadraticCurveTo(-11, -20, -5, -16); c.stroke();
      c.beginPath(); c.moveTo(5, -16); c.quadraticCurveTo(11, -20, 17, -16); c.stroke();
      c.fillStyle = '#7a3a3a'; c.beginPath(); c.ellipse(-2, 13, 3.2, 4, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,140,120,0.45)';
      for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * 19, 6, 5, 3, 0, 0, 7); c.fill(); }
    } else {
      c.scale(2, 2); cuteFace(c, 0, 0, 6.5, face === 'grin' ? 'grin' : 'smile', 2.4, true);
    }
    c.restore();
  }));
  make(scene, 'moon', 120, 120, (c) => c.drawImage(scene.textures.get('moon_0').getSourceImage() as CanvasImageSource, 0, 0));
  make(scene, 'house_lit', 72, 64, (c) => drawHouse(c, true));
  make(scene, 'house_dark', 72, 64, (c) => drawHouse(c, false));
  // 家の形 = 光の形。上 = 火の見櫓(上へ高い)/ 下 = 軒の長い提灯屋(下へ垂れる)/ 周り = 丸い蔵 / 横 = 長屋 / 縦 = 二階の楼 / 十字 = 辻の祠
  for (const p of ['up', 'down', 'area', 'hline', 'vline', 'cross'] as const) {
    make(scene, `house_${p}_lit`, 72, 72, (c) => drawShapedHouse(c, p, true));
    make(scene, `house_${p}_dark`, 72, 72, (c) => drawShapedHouse(c, p, false));
  }
  make(scene, 'g_fuwa', 64, 68, drawFuwa);
  // 大入道: 幽霊を大きく描いたもの(色は Play で桃色にする)
  make(scene, 'g_big', 96, 102, (c) => { c.scale(1.5, 1.5); drawFuwa(c); });
  // 大大入道: さらに大きく(色は Play でうす紫にする)
  make(scene, 'g_giant', 160, 170, (c) => { c.scale(2.5, 2.5); drawFuwa(c); });
  // はやて: 小さめの幽霊に、うしろへ流れる風の線(色は Play で黄色にする)
  const drawKaze = (c: Ctx, ko = false) => {
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2.5; c.lineCap = 'round';
    for (const [y, l] of [[26, 14], [36, 20], [46, 12]]) { c.beginPath(); c.moveTo(4, y); c.lineTo(4 + l, y); c.stroke(); }
    c.save(); c.translate(14, 6); c.scale(0.85, 0.85); drawFuwa(c, ko); c.restore();
  };
  make(scene, 'g_kaze', 72, 68, (c) => drawKaze(c));
  make(scene, 'g_kaze_ko', 72, 68, (c) => drawKaze(c, true));
  make(scene, 'g_oni', 64, 68, drawOnibi);
  make(scene, 'g_kasa', 64, 72, drawKarakasa);
  // やられた顔(＞＜ や ×)
  make(scene, 'g_fuwa_ko', 64, 68, (c) => drawFuwa(c, true));
  make(scene, 'g_oni_ko', 64, 68, (c) => drawOnibi(c, true));
  make(scene, 'g_kasa_ko', 64, 72, (c) => drawKarakasa(c, true));
  make(scene, 'g_big_ko', 96, 102, (c) => { c.scale(1.5, 1.5); drawFuwa(c, true); });
  make(scene, 'g_giant_ko', 160, 170, (c) => { c.scale(2.5, 2.5); drawFuwa(c, true); });
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

/** 形のある提灯(ポップでかわいく: 平らな色・太いふち・白いつや・にっこり顔)。rx, ry = 胴の半径(縦長・横長・丸) */
function drawShapedLantern(c: Ctx, w: number, h: number, rx: number, ry: number) {
  const cx = w / 2, cy = h / 2 + 1, ol = '#5a1a2a';
  c.lineJoin = 'round'; c.lineCap = 'round';
  // ひも
  c.strokeStyle = ol; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, cy - ry - 2); c.stroke();
  // 胴
  c.fillStyle = '#ff6a5a'; c.strokeStyle = ol; c.lineWidth = 2.5;
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.fill(); c.stroke();
  // 横のしま(2 本だけ、やわらかく)
  c.strokeStyle = 'rgba(160,30,40,0.45)'; c.lineWidth = 1.5;
  for (const k of [-0.45, 0.45]) {
    const yy = cy + ry * k, ww = rx * Math.sqrt(1 - k * k) - 1.5;
    c.beginPath(); c.moveTo(cx - ww, yy); c.quadraticCurveTo(cx, yy + 1.5, cx + ww, yy); c.stroke();
  }
  // つや
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath(); c.ellipse(cx - rx * 0.45, cy - ry * 0.4, Math.max(1.5, rx * 0.18), Math.max(2, ry * 0.25), -0.4, 0, 7); c.fill();
  // 上下のふた(丸い黒)
  c.fillStyle = '#3a2030';
  c.beginPath(); c.roundRect(cx - Math.max(5, rx * 0.5), cy - ry - 4, Math.max(10, rx), 5, 2.5); c.fill();
  c.beginPath(); c.roundRect(cx - Math.max(5, rx * 0.5), cy + ry - 1, Math.max(10, rx), 5, 2.5); c.fill();
  // にっこり顔(小さく)
  const fy = cy + ry * 0.1, sp = Math.min(rx, ry) * 0.38;
  c.strokeStyle = '#5a1a2a'; c.lineWidth = 1.4;
  for (const s2 of [-1, 1]) { c.beginPath(); c.arc(cx + s2 * sp, fy, 1.8, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  c.fillStyle = 'rgba(255,190,200,0.8)';
  for (const s2 of [-1, 1]) { c.beginPath(); c.ellipse(cx + s2 * (sp + 3.5), fy + 3, 2.2, 1.4, 0, 0, 7); c.fill(); }
}

/** 小さなドット絵の人(着物・髷)。f = 走るコマ */
function drawPixelPerson(c: Ctx, f: number) {
  const P = 2; // 1 ドット = 2px
  const px = (x: number, y: number, col: string) => { c.fillStyle = col; c.fillRect(x * P, y * P, P, P); };
  const skin = '#f0c8a0', hair = '#1a1010', kimono = f ? '#4a6ab0' : '#4a6ab0', obi = '#c03030';
  // 頭・髷
  for (const [x, y] of [[4, 0], [3, 1], [4, 1], [5, 1]]) px(x, y, hair);
  for (const [x, y] of [[3, 2], [4, 2], [5, 2], [3, 3], [4, 3], [5, 3]]) px(x, y, skin);
  // 体
  for (let y = 4; y <= 7; y++) for (let x = 3; x <= 5; x++) px(x, y, kimono);
  px(3, 6, obi); px(4, 6, obi); px(5, 6, obi);
  // 腕(振る)
  if (f) { px(2, 4, skin); px(6, 5, skin); } else { px(2, 5, skin); px(6, 4, skin); }
  // 足(交互)
  if (f) { px(3, 8, kimono); px(2, 9, skin); px(5, 8, kimono); px(6, 9, skin); px(2, 10, hair); px(6, 10, hair); }
  else { px(4, 8, kimono); px(4, 9, skin); px(4, 10, hair); px(5, 9, skin); px(5, 10, hair); }
}

function drawLantern(c: Ctx) {
  drawShapedLantern(c, 36, 52, 15, 19);
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
      // 丸い蔵: 白壁に丸い窓明かり = 丸く光る
      c.fillStyle = lit ? '#cfc6b0' : '#5a5650'; c.fillRect(10, 26, 52, 42);
      c.fillStyle = roof; c.beginPath(); c.ellipse(36, 26, 32, 16, 0, Math.PI, 0); c.fill();
      c.fillRect(4, 24, 64, 5);
      c.fillStyle = lit ? '#2a2a2a' : '#1a1a1a'; c.fillRect(10, 60, 52, 4);
      c.fillStyle = win; c.beginPath(); c.arc(36, 44, 11, 0, 7); c.fill();
      c.strokeStyle = lit ? 'rgba(90,50,10,0.85)' : 'rgba(60,60,70,0.6)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(36, 44, 11, 0, 7); c.moveTo(25, 44); c.lineTo(47, 44); c.moveTo(36, 33); c.lineTo(36, 55); c.stroke();
      if (lit) { c.fillStyle = 'rgba(255,220,140,0.25)'; c.beginPath(); c.arc(36, 44, 16, 0, 7); c.fill(); }
      break;
    }
    case 'hline': {
      // 横の家(長屋): 横に 3 つつながった窓明かり = 横に光る
      c.fillStyle = wall; c.fillRect(2, 34, 68, 32);
      gable(0, 72, 36, 18);
      c.fillStyle = win; c.fillRect(8, 42, 56, 14);
      c.strokeStyle = lit ? 'rgba(90,50,10,0.85)' : 'rgba(60,60,70,0.6)'; c.lineWidth = 1.5;
      c.strokeRect(8, 42, 56, 14);
      c.beginPath(); c.moveTo(26.7, 42); c.lineTo(26.7, 56); c.moveTo(45.3, 42); c.lineTo(45.3, 56); c.moveTo(8, 49); c.lineTo(64, 49); c.stroke();
      if (lit) { c.fillStyle = 'rgba(255,220,140,0.25)'; c.fillRect(4, 38, 64, 22); }
      break;
    }
    case 'vline': {
      // 縦の家(二階の楼): 縦に 3 つつながった窓明かり = 縦に光る
      c.fillStyle = wall; c.fillRect(20, 10, 32, 58);
      gable(12, 60, 14, 0);
      c.fillStyle = win; c.fillRect(29, 18, 14, 44);
      c.strokeStyle = lit ? 'rgba(90,50,10,0.85)' : 'rgba(60,60,70,0.6)'; c.lineWidth = 1.5;
      c.strokeRect(29, 18, 14, 44);
      c.beginPath(); c.moveTo(29, 32.7); c.lineTo(43, 32.7); c.moveTo(29, 47.3); c.lineTo(43, 47.3); c.moveTo(36, 18); c.lineTo(36, 62); c.stroke();
      if (lit) { c.fillStyle = 'rgba(255,220,140,0.25)'; c.fillRect(25, 14, 22, 52); }
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

/** かわいい顔(点の目・ほっぺ・小さい口)。シンプルで丸い、かわいげのある顔 */
function cuteFace(c: Ctx, cx: number, cy: number, spread: number, mouth: 'w' | 'o' | 'smile' | 'grin' = 'w', eyeR = 2.6, happyEyes = false, ko = false) {
  if (ko) {
    // やられた顔: 目が ＞＜、口はぽかん
    c.strokeStyle = '#2b2020'; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
    const e = eyeR * 1.3;
    c.beginPath(); c.moveTo(cx - spread - e, cy - e); c.lineTo(cx - spread + e, cy); c.lineTo(cx - spread - e, cy + e); c.stroke();
    c.beginPath(); c.moveTo(cx + spread + e, cy - e); c.lineTo(cx + spread - e, cy); c.lineTo(cx + spread + e, cy + e); c.stroke();
    c.fillStyle = 'rgba(255,140,160,0.55)';
    for (const s2 of [-1, 1]) { c.beginPath(); c.ellipse(cx + s2 * (spread + 6), cy + 5, 4.2, 2.6, 0, 0, 7); c.fill(); }
    c.fillStyle = '#7a2a36'; c.beginPath(); c.ellipse(cx, cy + 6, 3, 3.6, 0, 0, 7); c.fill(); c.stroke();
    return;
  }
  if (happyEyes) {
    // にこっと閉じた目(∩ ∩)
    c.strokeStyle = '#2b2020'; c.lineWidth = 1.8; c.lineCap = 'round';
    for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * spread, cy + 1, eyeR * 1.2, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  } else {
    c.fillStyle = '#2b2020';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * spread, cy, eyeR, eyeR * 1.15, 0, 0, 7); c.fill(); }
    c.fillStyle = '#fff';
    for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * spread + 0.8, cy - 1, eyeR * 0.38, 0, 7); c.fill(); }
  }
  c.fillStyle = 'rgba(255,140,160,0.55)';
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * (spread + 6), cy + 5, 4.2, 2.6, 0, 0, 7); c.fill(); }
  c.strokeStyle = '#2b2020'; c.lineWidth = 1.4; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  if (mouth === 'w') { c.moveTo(cx - 3, cy + 4); c.quadraticCurveTo(cx - 1.5, cy + 6.5, cx, cy + 4.5); c.quadraticCurveTo(cx + 1.5, cy + 6.5, cx + 3, cy + 4); c.stroke(); }
  else if (mouth === 'smile') { c.arc(cx, cy + 3, 3, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  else if (mouth === 'grin') {
    // 大きく開けて笑う口(▽)と、ちいさい舌
    c.fillStyle = '#7a2a36'; c.moveTo(cx - 4.5, cy + 3.5); c.lineTo(cx + 4.5, cy + 3.5); c.quadraticCurveTo(cx, cy + 11, cx - 4.5, cy + 3.5); c.fill(); c.stroke();
    c.fillStyle = '#ff8aa0'; c.beginPath(); c.ellipse(cx, cy + 7.5, 2.2, 1.4, 0, 0, 7); c.fill();
  }
  else { c.fillStyle = '#5a2a30'; c.ellipse(cx, cy + 5, 2.2, 2.6, 0, 0, 7); c.fill(); }
}

/** 幽霊: ころんと丸い白いおもち。小さい天冠と、ちょろっとしたしっぽ */
function drawFuwa(c: Ctx, ko = false) {
  const ol = '#4a3c46';
  c.lineWidth = 2; c.strokeStyle = ol; c.lineJoin = 'round';
  c.fillStyle = '#fbfaff';
  c.beginPath();
  c.moveTo(12, 34);
  c.bezierCurveTo(10, 10, 54, 10, 52, 34);
  c.bezierCurveTo(53, 46, 47, 54, 40, 56);
  c.quadraticCurveTo(38, 63, 31, 64); c.quadraticCurveTo(35, 59, 31, 56);
  c.bezierCurveTo(20, 56, 11, 48, 12, 34);
  c.closePath(); c.fill(); c.stroke();
  // ちょこんと手
  c.beginPath(); c.ellipse(12, 40, 4, 3, 0.4, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(52, 40, 4, 3, -0.4, 0, 7); c.fill(); c.stroke();
  // 天冠
  c.fillStyle = '#fff'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(27, 17); c.lineTo(32, 10); c.lineTo(37, 17); c.closePath(); c.fill(); c.stroke();
  // 影でふんわり
  c.fillStyle = 'rgba(170,190,240,0.25)';
  c.beginPath(); c.ellipse(36, 48, 12, 5, 0, 0, 7); c.fill();
  cuteFace(c, 32, 33, 8, 'grin', 2.6, true, ko);
}

/** 鬼火: ぷっくりした青緑の火の玉。ゆらっとした炎の先 */
function drawOnibi(c: Ctx, ko = false) {
  const ol = '#1f4a42';
  const g = c.createRadialGradient(32, 42, 2, 32, 40, 26);
  g.addColorStop(0, '#e8fff4'); g.addColorStop(0.55, '#8ff0cc'); g.addColorStop(1, '#4cc8a4');
  c.fillStyle = g; c.strokeStyle = ol; c.lineWidth = 2; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(32, 6);
  c.bezierCurveTo(36, 16, 44, 14, 44, 22);
  c.bezierCurveTo(54, 28, 56, 44, 50, 52);
  c.bezierCurveTo(44, 62, 20, 62, 14, 52);
  c.bezierCurveTo(8, 44, 10, 28, 20, 22);
  c.bezierCurveTo(22, 14, 28, 16, 32, 6);
  c.closePath(); c.fill(); c.stroke();
  // 内側の明るい芯
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath(); c.ellipse(26, 36, 5, 7, -0.4, 0, 7); c.fill();
  cuteFace(c, 32, 43, 8, 'grin', 2.6, false, ko);
}

/** 唐傘: まるいむらさきの傘に、大きな一つ目とちいさい舌。一本足に下駄 */
function drawKarakasa(c: Ctx, ko = false) {
  const ol = '#3e2a52';
  c.lineWidth = 2; c.strokeStyle = ol; c.lineJoin = 'round';
  c.fillStyle = '#b796e6';
  c.beginPath();
  c.moveTo(32, 6);
  c.bezierCurveTo(50, 8, 60, 26, 60, 42);
  c.quadraticCurveTo(52, 38, 46, 43); c.quadraticCurveTo(39, 38, 32, 43); c.quadraticCurveTo(25, 38, 18, 43); c.quadraticCurveTo(12, 38, 4, 42);
  c.bezierCurveTo(4, 26, 14, 8, 32, 6);
  c.closePath(); c.fill(); c.stroke();
  // 骨
  c.strokeStyle = 'rgba(62,42,82,0.35)'; c.lineWidth = 1.2;
  for (const x of [18, 46]) { c.beginPath(); c.moveTo(32, 8); c.quadraticCurveTo((32 + x) / 2, 24, x, 41); c.stroke(); }
  c.fillStyle = '#5a3c78'; c.beginPath(); c.arc(32, 6, 3, 0, 7); c.fill();
  // 大きな一つ目(点の目を大きくしたもの)+ ほっぺ + 舌
  c.fillStyle = '#fff'; c.strokeStyle = ol; c.lineWidth = 1.6;
  c.beginPath(); c.ellipse(32, 25, 8, 8.5, 0, 0, 7); c.fill(); c.stroke();
  if (ko) {
    // やられた顔: 大きな目が ×
    c.strokeStyle = '#2b2020'; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(28.5, 21.5); c.lineTo(35.5, 28.5); c.moveTo(35.5, 21.5); c.lineTo(28.5, 28.5); c.stroke();
  } else {
    c.fillStyle = '#2b2020'; c.beginPath(); c.ellipse(32.5, 26, 4.2, 4.8, 0, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(34, 24, 1.6, 0, 7); c.fill();
  }
  c.fillStyle = 'rgba(255,140,170,0.55)';
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(32 + s * 15, 31, 4, 2.4, 0, 0, 7); c.fill(); }
  c.fillStyle = '#ff7a96'; c.strokeStyle = ol; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(29, 35); c.quadraticCurveTo(32, 44, 35, 35); c.closePath(); c.fill(); c.stroke();
  // 一本足と下駄
  c.strokeStyle = '#e8d2b0'; c.lineWidth = 3.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(32, 43); c.lineTo(32, 60); c.stroke();
  c.fillStyle = '#7a5232'; c.strokeStyle = ol; c.lineWidth = 1.5;
  c.beginPath(); c.roundRect(24, 60, 16, 5, 2); c.fill(); c.stroke();
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
