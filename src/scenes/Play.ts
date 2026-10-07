// プレイ画面。ゲームの中身(src/game/logic.ts)を 1/60 秒刻みで進め、その state を絵にするだけ。
// 入力はタップ(src/ui/taps.ts)→ 次の step に渡す。同じ入力列を Recorder に残す(?replay= で再現)。
import Phaser from 'phaser';
import { Game, DT, W, H, GRID, nodeX, nodeY, encodeTaps, decodeTaps, type Ghost, type GameEvent } from '../game/logic';
import { readParams } from '../game/params';
import { Bot } from '../game/bot';
import { snd, bgmStart, bgmStop, bgmIntensity } from '../game/sound';
import { txt, watchName } from '../game/view';
import { PAPER } from '../game/art';
import { onTap } from '../ui/taps';
import { DemoDriver, expose } from '../core/demo';
import { t } from '../core/i18n';
import { save, load } from '../core/save';
import { tune } from '../core/tuning';
import { startSeed, Rng } from '../core/rng';
import { Recorder, Player, replayFromUrl } from '../core/replay';
import { isMuted, toggleMuted } from '../core/audio';

const GHOST_TEX = { fuwa: 'g_fuwa', zig: 'g_zig', hop: 'g_hop', kirai: 'g_kirai' } as const;
/** 軒先の提灯の位置(家の中心から) */
const HANG: ReadonlyArray<[number, number]> = [[-34, 4], [34, 4], [-24, 10]];

export class Play extends Phaser.Scene {
  private game2!: Game;
  private acc = 0;
  private pending: Array<[number, number]> = [];
  private rec!: Recorder;
  private player: Player | null = null;
  private bot: Bot | null = null;
  private hitstop = 0;
  private ended = false;
  private offTap: (() => void) | null = null;

  private gSprites = new Map<number, Phaser.GameObjects.Image>();
  private lSprites = new Map<number, { body: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private wSprites = new Map<number, { body: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }>();
  private houseImgs: Array<{ img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; hang: Phaser.GameObjects.Image[] }> = [];
  private portalImgs: Phaser.GameObjects.Image[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private glowFx!: Phaser.GameObjects.Graphics;
  private moon!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private watchText!: Phaser.GameObjects.Text;
  private chainText!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private tipShown = new Set<string>();
  private trails = new Map<number, Array<[number, number]>>();

  constructor() { super('Play'); }

  create() {
    expose('scene', 'Play');
    this.ended = false; this.acc = 0; this.pending = []; this.hitstop = 0;
    this.gSprites.clear(); this.lSprites.clear(); this.wSprites.clear(); this.houseImgs = []; this.portalImgs = []; this.trails.clear();
    this.tipShown.clear();

    const replay = replayFromUrl();
    const seed = replay ? replay.seed : startSeed();
    this.player = replay ? new Player(replay) : null;
    this.rec = new Recorder(seed);
    this.game2 = new Game(seed, readParams());
    this.bot = DemoDriver.enabled && !replay ? new Bot(0.8, seed) : null;
    expose('seed', seed); expose('score', 0);

    this.add.image(0, 0, 'bg').setOrigin(0);
    this.moon = this.add.image(0, 0, 'moon').setAlpha(0.95);
    this.drawVillage(seed);
    for (const h of this.game2.houses) {
      const glow = this.add.image(h.x, h.y + 6, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setAlpha(0.55);
      const img = this.add.image(h.x, h.y, 'house_lit').setOrigin(0.5, 0.6);
      // 軒先に下がる提灯(この家から飛ばせる数。ミサイルコマンドの基地の弾)
      const hang = HANG.map(([dx, dy]) => this.add.image(h.x + dx, h.y + dy, 'lantern').setScale(0.3).setDepth(2));
      this.houseImgs.push({ img, glow, hang });
    }
    this.fx = this.add.graphics().setDepth(5);
    this.glowFx = this.add.graphics().setDepth(19).setBlendMode(Phaser.BlendModes.ADD);

    this.sparks = this.add.particles(0, 0, 'dot', {
      lifespan: 900, speed: { min: 20, max: 110 }, angle: { min: 200, max: 340 }, gravityY: -40,
      scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xfff2b0, 0xffd27a, 0xffffff],
      blendMode: 'ADD', emitting: false,
    }).setDepth(30);
    this.shards = this.add.particles(0, 0, 'shard', {
      lifespan: 700, speed: { min: 80, max: 220 }, gravityY: 300, rotate: { min: 0, max: 360 },
      scale: { start: 1, end: 0.4 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(31);

    // HUD(巻物の上の縁に)
    this.scoreText = this.add.text(PAPER.x0 + 14, 6, '', txt(20)).setDepth(50);
    this.watchText = this.add.text(W / 2, 6, '', txt(18, '#e8d6ff')).setOrigin(0.5, 0).setDepth(50);
    const mute = this.add.text(PAPER.x1 - 14, 6, isMuted() ? '♪×' : '♪', txt(18, '#cfe')).setOrigin(1, 0).setDepth(50);
    this.chainText = this.add.text(W / 2, H / 2, '', txt(44, '#fff3c0')).setOrigin(0.5).setDepth(60).setAlpha(0);
    if (this.player) this.add.text(W / 2, H - 22, t('replaying'), txt(14, '#aaf')).setOrigin(0.5).setDepth(50);
    else if (this.bot) this.add.text(W / 2, H - 22, t('demo'), txt(14, '#aaf')).setOrigin(0.5).setDepth(50);

    this.offTap = onTap((x, y) => {
      // 右上の音ボタン
      if (x > PAPER.x1 - 50 && y < 34) { toggleMuted(); mute.setText(isMuted() ? '♪×' : '♪'); if (isMuted()) bgmStop(); else bgmStart(); return; }
      if (this.player || this.ended) return;
      this.pending.push([x, y]);
    });
    this.input.keyboard?.on('keydown-M', () => { toggleMuted(); mute.setText(isMuted() ? '♪×' : '♪'); if (isMuted()) bgmStop(); else bgmStart(); });
    this.events.once('shutdown', () => { this.offTap?.(); this.offTap = null; bgmStop(); });

    this.showPortals();
    bgmStart();
    this.updateHud();
  }

  update(_time: number, deltaMs: number) {
    if (this.hitstop > 0) { this.hitstop -= deltaMs; this.render(deltaMs / 1000); return; }
    this.acc += Math.min(deltaMs, 100) / 1000;
    const g = this.game2;
    while (this.acc >= DT && !g.over) {
      this.acc -= DT;
      let taps: Array<[number, number]>;
      if (this.player) taps = decodeTaps(this.player.input(g.frame + 1));
      else if (this.bot) taps = this.bot.decide(g);
      else { taps = this.pending; this.pending = []; }
      if (taps.length) this.rec.push(g.frame + 1, encodeTaps(taps));
      g.step(taps);
      for (const e of g.drainEvents()) this.onEvent(e);
    }
    this.render(deltaMs / 1000);
    this.updateHud();
    bgmIntensity(g.t / 180);
    if (g.over && !this.ended) this.finish();
  }

  private finish() {
    this.ended = true;
    const g = this.game2;
    const prev = load();
    const best = Math.max(prev.best, g.score);
    save({ best, played: prev.played + 1 });
    expose('replay', this.rec.toString());
    bgmStop();
    snd.over();
    this.cameras.main.fadeOut(1400, 5, 3, 10);
    this.time.delayedCall(1500, () => this.scene.start('Result', {
      score: g.score, best, newBest: g.score > prev.best && g.score > 0, bestChain: g.bestChain, purified: g.purified,
      watch: g.wave, seconds: Math.floor(g.t), replay: this.rec.toString(),
    }));
  }

  private onEvent(e: GameEvent) {
    switch (e.type) {
      case 'launch':
        snd.launch();
        this.sparks.explode(4, e.sx, e.sy);
        break;
      case 'arm':
        snd.arm();
        break;
      case 'light':
        snd.place();
        this.sparks.explode(8, e.x, e.y);
        break;
      case 'deny': {
        snd.deny();
        break;
      }
      case 'break':
        snd.break(1);
        this.shards.explode(14, e.x, e.y);
        this.sparks.explode(12, e.x, e.y);
        this.cameras.main.flash(80, 255, 220, 160, false);
        break;
      case 'purify': {
        snd.purify(e.n);
        this.sparks.explode(5, e.x, e.y);
        if (e.n >= 3) this.showChain(e.n, e.x, e.y);
        break;
      }
      case 'wispPop':
        snd.wispPop();
        this.sparks.explode(4, e.x, e.y);
        break;
      case 'chainEnd':
        snd.chainEnd(e.n);
        if (e.n >= 8) { this.hitstop = tune<number>('juice.hitstop'); this.cameras.main.shake(180, 0.006); }
        break;
      case 'caught':
        snd.catch();
        break;
      case 'haunt':
        snd.haunt();
        break;
      case 'saved':
        snd.saved();
        this.sparks.explode(10, e.x, e.y - 10);
        break;
      case 'houseOut':
        snd.houseOut();
        this.cameras.main.shake(260, tune<number>('juice.shake'));
        this.puff(e.x, e.y);
        this.flee(e.x, e.y);
        break;
      case 'portals':
        this.showPortals();
        break;
      case 'relight': {
        snd.relight();
        const orb = this.add.image(e.from[0], e.from[1], 'wisp').setBlendMode(Phaser.BlendModes.ADD).setDepth(35);
        this.tweens.add({ targets: orb, x: e.x, y: e.y, duration: 700, ease: 'Sine.InOut', onComplete: () => { orb.destroy(); this.sparks.explode(16, e.x, e.y); } });
        break;
      }
      case 'watch': {
        snd.watch();
        const s = this.add.text(W / 2, H / 2 - 60, watchName(e.n), txt(36, '#e8d6ff')).setOrigin(0.5).setDepth(55).setAlpha(0);
        this.tweens.add({ targets: s, alpha: 1, yoyo: true, hold: 900, duration: 500, onComplete: () => s.destroy() });
        break;
      }
      case 'waveEnd': {
        snd.relight();
        const s = this.add.text(W / 2, H / 2 - 20, `${t('waveClear')}  +${e.bonus}`, txt(28, '#ffe27a')).setOrigin(0.5).setDepth(55).setAlpha(0);
        this.tweens.add({ targets: s, alpha: 1, yoyo: true, hold: 1100, duration: 350, onComplete: () => s.destroy() });
        break;
      }
      case 'over':
        break;
    }
  }

  private showChain(n: number, x: number, y: number) {
    const c = this.chainText;
    c.setText(`${n}${t('chain')}!`);
    c.setPosition(Phaser.Math.Clamp(x, 140, W - 140), Phaser.Math.Clamp(y - 90, 70, H - 60));
    c.setFontSize(Math.min(30 + n * 2, 72));
    c.setColor(n >= 15 ? '#ffb0e0' : n >= 8 ? '#ffe27a' : '#fff3c0');
    this.tweens.killTweensOf(c);
    c.setAlpha(1).setScale(1.3);
    this.tweens.add({ targets: c, scale: 1, duration: 140, ease: 'Back.Out' });
    this.tweens.add({ targets: c, alpha: 0, delay: 700, duration: 400 });
  }

  /** 区画に木を少し(町並みは背景に描いてある) */
  private drawVillage(seed: number) {
    const r = new Rng(seed ^ 0x2545f491);
    for (let i = 0; i < 6; i++) {
      const c = r.int(0, GRID.cols - 2), w = r.int(0, GRID.rows - 2);
      this.add.image(GRID.x0 + (c + 0.5) * GRID.dx, GRID.y0 + (w + 0.5) * GRID.dy + 14, 'tree').setOrigin(0.5, 1).setScale(0.6 + r.next() * 0.3).setDepth(1).setAlpha(0.9);
    }
  }

  /** あの世の口(次の刻のおばけの出所)。刻の前から見えている */
  private showPortals() {
    for (const p of this.portalImgs) this.tweens.add({ targets: p, alpha: 0, duration: 500, onComplete: () => p.destroy() });
    this.portalImgs = this.game2.portals.map((p) => {
      const img = this.add.image(p.x, p.y, 'portal').setDepth(3).setAlpha(0).setScale(0.6);
      this.tweens.add({ targets: img, alpha: 0.9, scale: 1, duration: 700, ease: 'Back.Out' });
      return img;
    });
  }

  /** 灯りが消えた家から、家の人が逃げ出す */
  private flee(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      const p = this.add.image(x + (i - 1) * 6, y + 8, 'person').setDepth(26);
      const a = Math.PI * (0.15 + 0.35 * i) + (i === 1 ? Math.PI : 0);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * 60, y: y + 14 + Math.abs(Math.sin(a)) * 18, alpha: 0, duration: 1300, delay: i * 120, ease: 'Quad.Out', onComplete: () => p.destroy() });
      this.tweens.add({ targets: p, scaleY: 0.85, yoyo: true, repeat: 5, duration: 100 });
    }
  }

  private puff(x: number, y: number) {
    const p = this.add.image(x, y, 'glow').setTint(0x404060).setAlpha(0.8).setDepth(25);
    this.tweens.add({ targets: p, scale: 1.6, alpha: 0, duration: 600, onComplete: () => p.destroy() });
  }

  private updateHud() {
    const g = this.game2;
    this.scoreText.setText(`${t('score')} ${g.score}`);
    this.watchText.setText(watchName(g.wave));
    expose('score', g.score); expose('lanterns', g.lanterns.length); expose('ammo', g.ammo);
  }

  /** state → 絵。スプライトは id ごとに使い回し、消えたものは捨てる */
  private render(dt: number) {
    const g = this.game2, P = g.P;
    const time = this.time.now / 1000;

    // 月は夜更けとともに巻物の上を右から左へ
    const k = Math.min(g.t / 180, 1);
    this.moon.setPosition(PAPER.x1 - 80 - k * (PAPER.x1 - PAPER.x0 - 160), 52 - Math.sin(k * Math.PI) * 6).setScale(0.6);

    g.houses.forEach((h, i) => {
      const o = this.houseImgs[i];
      // おばけが入り込んだ家: 中の人が騒いで灯りが揺れ、家が震える(消えるまでの間が、そのまま助けに行ける猶予)
      const panic = h.haunt > 0;
      const flick = panic ? (Math.sin(time * 37 + i) + Math.sin(time * 23)) > 0.3 : true;
      o.img.setTexture(h.lit && flick ? 'house_lit' : 'house_dark');
      o.img.setPosition(h.x + (panic ? Math.sin(time * 60) * 1.5 : 0), h.y);
      o.glow.setVisible(h.lit).setAlpha(panic ? (flick ? 0.5 : 0.15) : 0.45 + 0.1 * Math.sin(time * 3 + i));
      o.img.setScale(1 + h.flash * 0.25);
      o.hang.forEach((hg, k) => hg.setVisible(h.lit && k < h.ammo).setAngle(Math.sin(time * 1.5 + k + i) * 6));
    });
    this.portalImgs.forEach((p, i) => p.setAngle(Math.sin(time * 0.8 + i) * 3).setAlpha(0.75 + 0.2 * Math.sin(time * 2 + i)));

    // 提灯: 飛んでいる間は軌跡と行き先の印、灯ったら縮んでいく灯り
    const seenL = new Set<number>();
    for (const l of g.lanterns) {
      seenL.add(l.id);
      let s = this.lSprites.get(l.id);
      if (!s) {
        const glow = this.add.image(l.x, l.y, 'glow').setTint(0xff9a40).setBlendMode(Phaser.BlendModes.ADD).setDepth(8).setAlpha(0);
        const body = this.add.image(l.x, l.y, 'lantern').setDepth(12).setScale(0.55);
        const label = this.add.text(l.x, l.y, '', txt(18, '#fff0d0')).setOrigin(0.5, 0).setDepth(45);
        s = { body, glow, label };
        this.lSprites.set(l.id, s);
      }
      s.label.setText('');
      if (l.flying) {
        // ゆっくり弧を描いて飛ぶ(行き先は辻)
        const k = l.flyT / l.flyDur;
        const arc = Math.sin(k * Math.PI) * Math.min(90, Math.hypot(nodeX(l.node) - l.sx, nodeY(l.node) - l.sy) * 0.35);
        s.body.setPosition(l.x, l.y - arc).setScale(0.55).setAngle(Math.sin(time * 14 + l.id) * 12);
        s.glow.setPosition(l.x, l.y - arc).setScale(0.5).setAlpha(0.6);
      } else {
        // 辻に下がった提灯。光は通りに沿ってこぼれる(弾けた時に光が走る道)
        if (s.body.scale < 1) s.body.setScale(Math.min(1, s.body.scale + 0.1));
        s.body.setPosition(l.x, l.y - 8).setAngle(Math.sin(time * 2 + l.id) * 5);
        s.glow.setPosition(l.x, l.y).setScale(1.1).setAlpha(0.55 + 0.08 * Math.sin(time * 5 + l.id));
      }
    }
    for (const [id, s] of this.lSprites) if (!seenL.has(id)) { s.body.destroy(); s.glow.destroy(); s.label.destroy(); this.lSprites.delete(id); }

    // 味方の灯り
    const seenW = new Set<number>();
    for (const w of g.wisps) {
      seenW.add(w.id);
      let s = this.wSprites.get(w.id);
      if (!s) {
        s = {
          glow: this.add.image(w.x, w.y, 'glow').setTint(0xffe0a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(9),
          body: this.add.image(w.x, w.y, 'wisp').setBlendMode(Phaser.BlendModes.ADD).setDepth(18),
        };
        this.wSprites.set(w.id, s);
      }
      const k = Math.min(1, w.age / Math.max(0.01, P.wispDelay));
      s.body.setPosition(w.x, w.y - 6 - k * 6).setAlpha(1).setScale(0.6 + 0.5 * k);
      s.glow.setPosition(w.x, w.y).setScale(0.4 + 0.4 * k).setAlpha(0.5);
    }
    for (const [id, s] of this.wSprites) if (!seenW.has(id)) { s.body.destroy(); s.glow.destroy(); this.wSprites.delete(id); }

    // おばけ
    const seenG = new Set<number>();
    for (const gh of g.ghosts) {
      seenG.add(gh.id);
      let s = this.gSprites.get(gh.id);
      if (!s) {
        s = this.add.image(gh.x, gh.y, GHOST_TEX[gh.kind]).setDepth(15).setAlpha(0);
        this.gSprites.set(gh.id, s);
      }
      this.drawGhost(s, gh, time);
      let tr = this.trails.get(gh.id);
      if (!tr) { tr = []; this.trails.set(gh.id, tr); }
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(last[0] - gh.x, last[1] - gh.y) > 4) { tr.push([gh.x, gh.y]); if (tr.length > 22) tr.shift(); }
    }
    for (const id of this.trails.keys()) if (!seenG.has(id)) this.trails.delete(id);
    for (const [id, s] of this.gSprites) {
      if (seenG.has(id)) continue;
      this.gSprites.delete(id);
      // 消える時: 上へ昇って薄れる(成仏)/ 家に吸い込まれる
      this.tweens.add({ targets: s, y: s.y - 30, alpha: 0, scale: 0.6, duration: 450, onComplete: () => s.destroy() });
    }

    this.fx.clear();
    // 飛んでいる提灯: 弧の軌跡と、行き先の辻の小さな十字
    for (const l of g.lanterns) {
      if (!l.flying) continue;
      const tx = nodeX(l.node), ty = nodeY(l.node);
      const top = Math.min(90, Math.hypot(tx - l.sx, ty - l.sy) * 0.35);
      const k = l.flyT / l.flyDur;
      this.fx.lineStyle(2, 0xffb060, 0.6);
      this.fx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const u = (i / 16) * k;
        const px = l.sx + (tx - l.sx) * u, py = l.sy + (ty - l.sy) * u - Math.sin(u * Math.PI) * top;
        if (i === 0) this.fx.moveTo(px, py); else this.fx.lineTo(px, py);
      }
      this.fx.strokePath();
      this.fx.lineStyle(2, l.armed ? 0xffe0a0 : 0xff6040, 0.9);
      this.fx.lineBetween(tx - 6, ty - 6, tx + 6, ty + 6);
      this.fx.lineBetween(tx - 6, ty + 6, tx + 6, ty - 6);
    }
    this.glowFx.clear();
    // 下がった提灯の光が、通りに沿ってうっすらこぼれる(弾けたら光がここを走る)
    for (const l of g.lanterns) {
      if (l.flying) continue;
      const hx = P.range * GRID.dx, vy = P.range * GRID.dy;
      for (const [w, a] of [[12, 0.05], [4, 0.07]] as const) {
        this.glowFx.fillStyle(0xffb060, a);
        this.glowFx.fillRect(l.x - hx, l.y - w / 2, hx * 2, w);
        this.glowFx.fillRect(l.x - w / 2, l.y - vy, w, vy * 2);
      }
    }
    // 十字の光: 通りに沿ってゆっくり走り、留まって、縮む
    for (const b of g.blasts) {
      if (b.ext <= 0) continue;
      const hx = b.ext * GRID.dx, vy = b.ext * GRID.dy;
      const layers: ReadonlyArray<[number, number, number]> = b.big ? [[22, 0xffb050, 0.3], [10, 0xfff0c0, 0.5], [4, 0xffffff, 0.6]] : [[14, 0xffc070, 0.28], [6, 0xfff0c0, 0.45]];
      for (const [w, col, a] of layers) {
        this.glowFx.fillStyle(col, a);
        if (b.h) this.glowFx.fillRect(b.x - hx, b.y - w / 2, hx * 2, w);
        if (b.v) this.glowFx.fillRect(b.x - w / 2, b.y - vy, w, vy * 2);
      }
      this.glowFx.fillStyle(0xfff6d8, b.big ? 0.55 : 0.4); this.glowFx.fillCircle(b.x, b.y, b.big ? 16 : 10);
    }
    // おばけの通った跡(どちらへ向かっているか読めるように)
    for (const gh of g.ghosts) {
      const tr = this.trails.get(gh.id);
      if (!tr || tr.length < 2) continue;
      for (let i = 1; i < tr.length; i++) {
        const a = (i / tr.length) * 0.35;
        this.fx.lineStyle(3 * (i / tr.length) + 0.5, gh.kind === 'kirai' ? 0x6a3a8a : gh.kind === 'zig' ? 0x60e0b0 : gh.kind === 'hop' ? 0xb080ff : 0xc8d8ff, a);
        this.fx.lineBetween(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1]);
      }
    }
    void dt;
  }

  private drawGhost(s: Phaser.GameObjects.Image, gh: Ghost, time: number) {
    const bob = Math.sin(time * 3 + gh.id) * 3;
    let sx = 1, sy = 1;
    if (gh.kind === 'hop') {
      // 辻で止まって、しゃがんでから跳ぶ
      const crouch = gh.pause > 0 ? Math.max(0, 1 - gh.pause / 0.6) : 0;
      sy = 1 - crouch * 0.3; sx = 1 + crouch * 0.15;
      if (gh.pause <= 0 && gh.from !== gh.to) { sy = 1.15; sx = 0.9; }
    }
    const appear = Math.min(1, gh.age / 0.6);
    let alpha = appear * (gh.kind === 'fuwa' ? 0.8 + 0.2 * Math.sin(time * 4 + gh.id) : 1);
    if (gh.kind === 'kirai') alpha *= 0.92;
    if (gh.haunt) { alpha *= 0.55 + 0.3 * Math.sin(time * 9 + gh.id); sx *= 0.8; sy *= 0.8; }
    // 罠にかかったおばけは提灯のまわりを回る(見とれている)
    const orbit = gh.caught > 0 ? time * 3 + gh.id : 0;
    const ox = gh.caught > 0 ? Math.cos(orbit) * 18 : gh.haunt ? Math.sin(time * 7 + gh.id) * 8 : 0;
    const oy = gh.caught > 0 ? Math.sin(orbit) * 10 - 6 : gh.haunt ? -10 : 0;
    // 唐傘が跳んでいる間は、弧を描いて浮く
    const hopArc = gh.kind === 'hop' && gh.from !== gh.to ? -Math.sin(Math.min(1, gh.prog / Math.hypot(nodeX(gh.to) - nodeX(gh.from), nodeY(gh.to) - nodeY(gh.from))) * Math.PI) * 26 : 0;
    s.setPosition(gh.x + ox, gh.y + oy + hopArc + (gh.kind === 'hop' ? 0 : bob)).setScale(sx * 0.9, sy * 0.9).setAlpha(alpha).setFlipX(gh.face < 0);
    s.setAngle(gh.kind === 'zig' ? Math.sin(time * 8 + gh.id) * 8 : 0);
  }
}

