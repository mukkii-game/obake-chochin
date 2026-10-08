// プレイ画面。ゲームの中身(src/game/logic.ts)を 1/60 秒刻みで進め、その state を絵にするだけ。
// 入力はタップ(src/ui/taps.ts)→ 次の step に渡す。同じ入力列を Recorder に残す(?replay= で再現)。
import Phaser from 'phaser';
import { Game, DT, W, H, encodeTaps, decodeTaps, type Ghost, type GameEvent, type Blast, type Piece } from '../game/logic';
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
import { startSeed } from '../core/rng';
import { Recorder, Player, replayFromUrl } from '../core/replay';
import { isMuted, toggleMuted } from '../core/audio';

const GHOST_TEX = { fuwa: 'g_fuwa', oni: 'g_oni', kasa: 'g_kasa' } as const;
const GHOST_GLOW = { fuwa: 0x8fb4ff, oni: 0x40e0a0, kasa: 0xb070ff } as const;
/** 軒先の提灯の位置(家の中心から) */
const HANG: ReadonlyArray<[number, number]> = [[-21, -4], [21, -4], [-21, 8]];

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
  private gGlows = new Map<number, Phaser.GameObjects.Image>();
  private lSprites = new Map<number, { body: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; label: Phaser.GameObjects.Image }>();
  private houseImgs: Array<{ img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; hang: Phaser.GameObjects.Image[]; key: string }> = [];
  private selFx!: Phaser.GameObjects.Graphics;
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
    this.gSprites.clear(); this.gGlows.clear(); this.lSprites.clear(); this.houseImgs = []; this.portalImgs = []; this.trails.clear();

    const replay = replayFromUrl();
    const seed = replay ? replay.seed : startSeed();
    this.player = replay ? new Player(replay) : null;
    this.rec = new Recorder(seed);
    this.game2 = new Game(seed, readParams());
    this.bot = DemoDriver.enabled && !replay ? new Bot(0.8, seed) : null;
    expose('seed', seed); expose('score', 0);

    this.add.image(0, 0, 'bg').setOrigin(0);
    this.moon = this.add.image(0, 0, 'moon').setAlpha(0.95);
    this.selFx = this.add.graphics().setDepth(4);
    for (const h of this.game2.houses) {
      const glow = this.add.image(h.x, h.y + 6, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.55);
      // 家の形 = この家から投げる提灯の光の形(縦の楼は縦、長屋は横)
      const key = `house_${h.piece}`;
      const img = this.add.image(h.x, h.y + 22, `${key}_lit`).setOrigin(0.5, 0.92).setScale(0.68).setDepth(2);
      // 軒先に下がる提灯(この家から飛ばせる数。ミサイルコマンドの基地の弾)
      const hang = HANG.map(([dx, dy]) => this.add.image(h.x + dx, h.y + dy, 'lantern').setScale(0.22).setDepth(3));
      this.houseImgs.push({ img, glow, hang, key });
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
      case 'select':
        snd.ui();
        break;
      case 'hang':
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
        snd.break(e.chained ? 1 : 0);
        this.shards.explode(14, e.x, e.y);
        this.sparks.explode(12, e.x, e.y);
        break;
      case 'purify': {
        snd.purify(e.n);
        this.sparks.explode(5, e.x, e.y);
        if (e.n >= 3) this.showChain(e.n, e.x, e.y);
        break;
      }
      case 'chainEnd':
        snd.chainEnd(e.n);
        if (e.n >= 6) { this.hitstop = tune<number>('juice.hitstop'); this.cameras.main.shake(180, 0.006); }
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
      o.img.setTexture(`${o.key}_${h.lit && flick ? 'lit' : 'dark'}`);
      o.img.setPosition(h.x + (panic ? Math.sin(time * 60) * 1.5 : 0), h.y + 22);
      o.glow.setVisible(h.lit).setAlpha(panic ? (flick ? 0.5 : 0.15) : 0.45 + 0.1 * Math.sin(time * 3 + i));
      o.img.setScale(0.68 * (1 + h.flash * 0.25));
      o.hang.forEach((hg, k) => hg.setVisible(h.lit && k < h.ammo).setAngle(Math.sin(time * 1.5 + k + i) * 6));
    });
    // 選んだ家: 家の人が提灯を掲げて待つ(家のマスの縁がほんのり明るい)
    this.selFx.clear();
    if (g.selected >= 0) {
      const h = g.houses[g.selected], s = 26;
      this.selFx.lineStyle(3, 0xffd890, 0.55 + 0.3 * Math.sin(time * 6));
      this.selFx.strokeRoundedRect(h.x - s, h.y - s, s * 2, s * 2, 6);
    }

    // 提灯: 飛んでいる間は軌跡と行き先の印、灯ったら縮んでいく灯り
    const seenL = new Set<number>();
    for (const l of g.lanterns) {
      seenL.add(l.id);
      let s = this.lSprites.get(l.id);
      if (!s) {
        const glow = this.add.image(l.x, l.y, 'glow').setTint(0xff9a40).setBlendMode(Phaser.BlendModes.ADD).setDepth(8).setAlpha(0);
        const body = this.add.image(l.x, l.y, 'lantern').setDepth(12).setScale(0.45);
        // 提灯の模様 = 光の形(縦 / 横)
        const label = this.add.image(l.x, l.y, `mark_${l.piece}`).setDepth(13);
        s = { body, glow, label };
        this.lSprites.set(l.id, s);
      }
      if (l.flying) {
        // ゆっくり弧を描いて飛ぶ。着いたら弾ける
        const k = l.flyT / l.flyDur;
        const arc = Math.sin(k * Math.PI) * Math.min(90, Math.hypot(l.tx - l.sx, l.ty - l.sy) * 0.35);
        s.body.setPosition(l.x, l.y - arc).setScale(0.45).setAngle(Math.sin(time * 14 + l.id) * 12);
        s.glow.setPosition(l.x, l.y - arc).setScale(0.5).setAlpha(0.6);
        s.label.setPosition(l.x, l.y - arc + 1).setScale(0.4);
      } else {
        // 下がった提灯。いつも同じ時間で弾ける(終わり際に火がゆらぐだけ。数字は出さない)
        if (s.body.scale < 0.75) s.body.setScale(Math.min(0.75, s.body.scale + 0.08));
        const late = Math.max(0, l.age - (P.hangTime - 1.2)) / 1.2;
        const sway = Math.sin(time * (2 + late * 14) + l.id) * (5 + late * 7);
        s.body.setPosition(l.x, l.y - 8).setAngle(sway);
        s.label.setPosition(l.x, l.y - 7).setScale(0.62 * s.body.scale).setAngle(s.body.angle);
        s.glow.setPosition(l.x, l.y).setScale(0.8).setAlpha(0.55 + (0.08 + late * 0.25) * Math.sin(time * (5 + late * 20) + l.id));
      }
    }
    for (const [id, s] of this.lSprites) if (!seenL.has(id)) { s.body.destroy(); s.glow.destroy(); s.label.destroy(); this.lSprites.delete(id); }

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
      // おばけのまわりの淡い光(種類ごとの色。暗い空でも動きが読める)
      let gl = this.gGlows.get(gh.id);
      if (!gl) { gl = this.add.image(gh.x, gh.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(14).setTint(GHOST_GLOW[gh.kind]); this.gGlows.set(gh.id, gl); }
      gl.setPosition(s.x, s.y + 2).setScale(0.42 + 0.04 * Math.sin(time * 3 + gh.id)).setAlpha(s.alpha * (gh.haunt ? 0.25 : 0.4));
      let tr = this.trails.get(gh.id);
      if (!tr) { tr = []; this.trails.set(gh.id, tr); }
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(last[0] - gh.x, last[1] - gh.y) > 4) { tr.push([gh.x, gh.y]); if (tr.length > 22) tr.shift(); }
    }
    for (const id of this.trails.keys()) if (!seenG.has(id)) this.trails.delete(id);
    for (const [id, gl] of this.gGlows) if (!seenG.has(id)) { gl.destroy(); this.gGlows.delete(id); }
    for (const [id, s] of this.gSprites) {
      if (seenG.has(id)) continue;
      this.gSprites.delete(id);
      // 消える時: 上へ昇って薄れる(成仏)/ 家に吸い込まれる
      this.tweens.add({ targets: s, y: s.y - 30, alpha: 0, scale: 0.6, duration: 450, onComplete: () => s.destroy() });
    }

    this.fx.clear();
    // 飛んでいる提灯: 弧の軌跡と、行き先のマスの小さな × (下げる時は、吊るす鉤の輪)
    for (const l of g.lanterns) {
      if (!l.flying) continue;
      const tx = l.tx, ty = l.ty;
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
      if (l.hang) { this.fx.lineStyle(2, 0xffe0a0, 0.9); this.fx.strokeCircle(tx, ty - 10, 6); this.fx.lineBetween(tx, ty - 4, tx, ty + 4); }
      else {
        this.fx.lineStyle(2, 0xff6040, 0.9);
        this.fx.lineBetween(tx - 6, ty - 6, tx + 6, ty + 6);
        this.fx.lineBetween(tx - 6, ty + 6, tx + 6, ty - 6);
      }
    }
    this.glowFx.clear();
    // 下がった提灯の明かりが、模様の形にうっすらこぼれる(弾けたら光がここを伸びる。印ではなく提灯の明かり)
    for (const l of g.lanterns) {
      if (l.flying) continue;
      this.drawShape(l.piece, l.tx, l.ty, g.reach(l.piece), 0, 0xffb060, 0.07);
    }
    // 光: 家の形どおりに、帯になって伸びる
    for (const b of g.blasts) this.drawBlast(b);

    // おばけの通った跡(どちらへ向かっているか読めるように)
    for (const gh of g.ghosts) {
      const tr = this.trails.get(gh.id);
      if (!tr || tr.length < 2) continue;
      for (let i = 1; i < tr.length; i++) {
        const a = (i / tr.length) * 0.35;
        this.fx.lineStyle(3 * (i / tr.length) + 0.5, gh.kind === 'oni' ? 0x60e0b0 : gh.kind === 'kasa' ? 0xb080ff : 0xc8d8ff, a);
        this.fx.lineBetween(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1]);
      }
    }
    void dt;
  }

  /** 光の形(中心から from〜to px の所)を塗る */
  private drawShape(piece: Piece, x: number, y: number, to: number, from: number, col: number, a: number, widen = 1) {
    const g = this.game2, fx = this.glowFx, w = (g.P.lightWidth / 2) * widen;
    if (to <= from) return;
    fx.fillStyle(col, a);
    const seg = (dx: number, dy: number) => {
      // 中心から (dx, dy) の向きに from〜to
      const x0 = x + dx * from, y0 = y + dy * from, x1 = x + dx * to, y1 = y + dy * to;
      const l = Math.min(x0, x1) - (dx ? 0 : w), t = Math.min(y0, y1) - (dy ? 0 : w);
      fx.fillRoundedRect(l, t, Math.abs(x1 - x0) + (dx ? 0 : w * 2), Math.abs(y1 - y0) + (dy ? 0 : w * 2), Math.min(8, w));
    };
    switch (piece) {
      case 'vline': seg(0, -1); seg(0, 1); break;
      case 'hline': seg(-1, 0); seg(1, 0); break;
      case 'up': seg(0, -1); break;
      case 'down': seg(0, 1); break;
      case 'cross': seg(0, -1); seg(0, 1); seg(-1, 0); seg(1, 0); break;
      case 'area': fx.fillCircle(x, y, to); break;
    }
  }

  /** 光の帯: 先頭がふくらんで明るく、後ろは薄れる */
  private drawBlast(b: Blast) {
    const g = this.game2;
    const L = g.reach(b.piece), band = g.band;
    const head = Math.min(L, b.ext), tail = Math.max(0, b.ext - band);
    if (head <= tail) return;
    const fade = b.ext > L ? Math.max(0, 1 - (b.ext - L) / band) : 1;
    this.drawShape(b.piece, b.x, b.y, head, tail, 0xffb050, 0.3 * fade, 1.35);
    this.drawShape(b.piece, b.x, b.y, head, tail, 0xfff0c0, 0.45 * fade, 0.9);
    this.drawShape(b.piece, b.x, b.y, head, Math.max(tail, head - band * 0.4), 0xffffff, 0.55 * fade, 0.55);
    if (tail <= 0) { this.glowFx.fillStyle(0xfff6d8, 0.5 * fade); this.glowFx.fillCircle(b.x, b.y, 12); }
  }

  private drawGhost(s: Phaser.GameObjects.Image, gh: Ghost, time: number) {
    const bob = Math.sin(time * 3 + gh.id) * 3;
    let sx = 1, sy = 1;
    const appear = Math.min(1, gh.age / 0.6);
    let alpha = appear * (gh.kind === 'fuwa' ? 0.8 + 0.2 * Math.sin(time * 4 + gh.id) : 1);
    if (gh.haunt) { alpha *= 0.55 + 0.3 * Math.sin(time * 9 + gh.id); sx *= 0.8; sy *= 0.8; }
    // 下がった提灯に見とれたおばけは提灯のまわりを回る / 前がつかえたおばけは足踏みする
    const orbit = time * 3 + gh.id;
    let ox = 0, oy = 0;
    if (gh.caught) { ox = Math.cos(orbit) * 12; oy = Math.sin(orbit) * 7 - 5; }
    else if (gh.stopped) { ox = Math.sin(time * 18 + gh.id) * 2; sy *= 0.92 + 0.08 * Math.abs(Math.sin(time * 9 + gh.id)); }
    else if (gh.haunt) { ox = Math.sin(time * 7 + gh.id) * 8; oy = -10; }
    s.setPosition(gh.x + ox, gh.y + oy + bob).setScale(sx * 0.62, sy * 0.62).setAlpha(alpha).setFlipX(gh.face < 0);
    // 唐傘は折れるたびに傘を傾ける / 鬼火は揺らめく
    s.setAngle(gh.kind === 'kasa' ? gh.zig * 14 : gh.kind === 'oni' ? Math.sin(time * 8 + gh.id) * 6 : 0);
  }
}
