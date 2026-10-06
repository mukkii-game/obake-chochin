// プレイ画面。ゲームの中身(src/game/logic.ts)を 1/60 秒刻みで進め、その state を絵にするだけ。
// 入力はタップ(src/ui/taps.ts)→ 次の step に渡す。同じ入力列を Recorder に残す(?replay= で再現)。
import Phaser from 'phaser';
import { Game, DT, W, H, EAT_R, GHOST_R, encodeTaps, decodeTaps, type Ghost, type GameEvent, type Lantern } from '../game/logic';
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

const GHOST_TEX = { fuwa: 'g_fuwa', zig: 'g_zig', hop: 'g_hop', kirai: 'g_kirai' } as const;

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
  private houseImgs: Array<{ img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }> = [];
  private fx!: Phaser.GameObjects.Graphics;
  private glowFx!: Phaser.GameObjects.Graphics;
  private moon!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private watchText!: Phaser.GameObjects.Text;
  private lanternIcons: Phaser.GameObjects.Image[] = [];
  private chainText!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private tipShown = new Set<string>();
  private trails = new Map<number, Array<[number, number]>>();

  constructor() { super('Play'); }

  create() {
    expose('scene', 'Play');
    this.ended = false; this.acc = 0; this.pending = []; this.hitstop = 0;
    this.gSprites.clear(); this.lSprites.clear(); this.wSprites.clear(); this.houseImgs = []; this.lanternIcons = []; this.trails.clear();
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
    for (const h of this.game2.houses) {
      const glow = this.add.image(h.x, h.y + 6, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setAlpha(0.55);
      const img = this.add.image(h.x, h.y, 'house_lit').setOrigin(0.5, 0.6);
      this.houseImgs.push({ img, glow });
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
    for (let i = 0; i < this.game2.P.maxLanterns; i++) {
      this.lanternIcons.push(this.add.image(PAPER.x1 - 110 - i * 22, 16, 'lantern').setScale(0.42).setDepth(50));
    }
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
      case 'arm':
        snd.arm();
        break;
      case 'light':
        snd.place();
        this.sparks.explode(8, e.x, e.y);
        this.tip('lightTip');
        break;
      case 'deny': {
        snd.deny();
        for (const ic of this.lanternIcons) this.tweens.add({ targets: ic, scale: 0.55, yoyo: true, duration: 90 });
        const x = this.add.text(e.x, e.y, '×', txt(26, '#ff8a80')).setOrigin(0.5).setDepth(40);
        this.tweens.add({ targets: x, alpha: 0, y: e.y - 14, duration: 500, onComplete: () => x.destroy() });
        break;
      }
      case 'break':
        snd.break(e.inside);
        this.shards.explode(14, e.x, e.y);
        this.sparks.explode(10 + e.inside * 2, e.x, e.y);
        this.cameras.main.flash(80, 255, 220, 160, false);
        break;
      case 'fade':
        this.puff(e.x, e.y);
        break;
      case 'eaten': {
        snd.burnout();
        this.puff(e.x, e.y);
        this.shards.explode(6, e.x, e.y);
        const s = this.add.text(e.x, e.y - 22, t('eaten'), txt(17, '#ff9c8a')).setOrigin(0.5).setDepth(40);
        this.tweens.add({ targets: s, y: e.y - 50, alpha: 0, duration: 1000, onComplete: () => s.destroy() });
        break;
      }
      case 'purify': {
        snd.purify(e.n);
        this.sparks.explode(5, e.x, e.y);
        const s = this.add.text(e.x, e.y - 12, `+${e.pts}`, txt(e.n >= 8 ? 20 : 15, e.n >= 8 ? '#ffe27a' : '#fff6dc')).setOrigin(0.5).setDepth(40);
        this.tweens.add({ targets: s, y: e.y - 44, alpha: 0, duration: 800, ease: 'Cubic.Out', onComplete: () => s.destroy() });
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
      case 'houseOut':
        snd.houseOut();
        this.cameras.main.shake(260, tune<number>('juice.shake'));
        this.puff(e.x, e.y);
        break;
      case 'relight': {
        snd.relight();
        const orb = this.add.image(e.from[0], e.from[1], 'wisp').setBlendMode(Phaser.BlendModes.ADD).setDepth(35);
        this.tweens.add({ targets: orb, x: e.x, y: e.y, duration: 700, ease: 'Sine.InOut', onComplete: () => { orb.destroy(); this.sparks.explode(16, e.x, e.y); } });
        const s = this.add.text(e.x, e.y - 40, t('relit'), txt(18, '#ffd27a')).setOrigin(0.5).setDepth(45);
        this.tweens.add({ targets: s, y: e.y - 64, alpha: 0, delay: 600, duration: 1200, onComplete: () => s.destroy() });
        break;
      }
      case 'spawn': {
        const tip = e.kind === 'kirai' ? 'kiraiTip' : e.kind === 'hop' ? 'hopTip' : e.kind === 'zig' ? 'zigTip' : '';
        if (tip) this.tip(tip);
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

  /** 初めての時だけ、画面下に一言 */
  private tip(key: string) {
    if (this.tipShown.has(key)) return;
    this.tipShown.add(key);
    const s = this.add.text(W / 2, H - 46, t(key), txt(16, '#e8d6ff')).setOrigin(0.5).setDepth(55);
    this.tweens.add({ targets: s, alpha: 0, delay: 3600, duration: 800, onComplete: () => s.destroy() });
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

  private puff(x: number, y: number) {
    const p = this.add.image(x, y, 'glow').setTint(0x404060).setAlpha(0.8).setDepth(25);
    this.tweens.add({ targets: p, scale: 1.6, alpha: 0, duration: 600, onComplete: () => p.destroy() });
  }

  private updateHud() {
    const g = this.game2;
    this.scoreText.setText(`${t('score')} ${g.score}`);
    this.watchText.setText(`${watchName(g.wave)}   ${t('houses')} ${g.litCount}/${g.houses.length}`);
    this.lanternIcons.forEach((ic, i) => ic.setAlpha(i < g.P.maxLanterns - g.lanterns.length ? 1 : 0.2));
    expose('score', g.score); expose('lanterns', g.lanterns.length);
  }

  /** state → 絵。スプライトは id ごとに使い回し、消えたものは捨てる */
  private render(dt: number) {
    const g = this.game2, P = g.P;
    const time = this.time.now / 1000;

    // 月は夜更けとともに巻物の上を右から左へ
    const k = Math.min(g.t / 180, 1);
    this.moon.setPosition(PAPER.x1 - 80 - k * (PAPER.x1 - PAPER.x0 - 160), 95 - Math.sin(k * Math.PI) * 30);

    g.houses.forEach((h, i) => {
      const o = this.houseImgs[i];
      o.img.setTexture(h.lit ? 'house_lit' : 'house_dark');
      o.glow.setVisible(h.lit).setAlpha(0.45 + 0.1 * Math.sin(time * 3 + i));
      o.img.setScale(1 + h.flash * 0.25);
    });

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
      s.body.setPosition(l.x, l.y);
      if (l.flying) {
        s.body.setScale(0.55).setAngle(Math.sin(time * 20 + l.id) * 10);
        s.glow.setPosition(l.x, l.y).setScale(0.5).setAlpha(0.6);
        s.label.setText('');
      } else {
        // 先頭のおばけが近いほど、提灯が震えて赤くなる(= 割りどきが迫っている)
        const eta = this.nearestLured(l);
        const danger = clamp01(1 - (eta - EAT_R) / 70);
        if (s.body.scale < 1) s.body.setScale(Math.min(1, s.body.scale + 0.12));
        s.body.setPosition(l.x + (danger > 0.3 ? Math.sin(time * 60) * 2.5 * danger : 0), l.y)
          .setAngle(Math.sin(time * 2 + l.id) * 4 + Math.sin(time * 40) * 8 * danger);
        if (danger > 0.5) s.body.setTint(0xffb0a0); else s.body.clearTint();
        const fadeK = clamp01((P.idleLife - l.idle) / 1.5);
        s.body.setAlpha(0.3 + 0.7 * fadeK);
        s.glow.setPosition(l.x, l.y).setScale((l.r * 2 / 128) * 1.3).setAlpha(0.42 * fadeK * (0.85 + 0.15 * Math.sin(time * 9 + l.id)));
        const n = g.insideCount(l);
        s.label.setPosition(l.x, l.y - l.r - 26).setText(n > 0 ? `×${n}` : '').setFontSize(n >= 4 ? 24 : 18).setColor(n >= 4 ? '#ffe27a' : '#fff0d0');
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
      const fade = Math.min(1, (P.wispLife - w.age) / 0.4);
      s.body.setPosition(w.x, w.y + Math.sin(time * 6 + w.id) * 2).setAlpha(fade).setScale(0.9 + 0.1 * Math.sin(time * 12 + w.id));
      s.glow.setPosition(w.x, w.y).setScale((P.wispLure * 2 / 128) * 1.1).setAlpha(0.25 * fade);
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
    // 飛んでいる提灯: 家からの軌跡(火の粉の線)と、行き先の印
    for (const l of g.lanterns) {
      if (!l.flying) continue;
      this.fx.lineStyle(2, 0xffb060, 0.75);
      this.fx.lineBetween(l.sx, l.sy, l.x, l.y);
      this.fx.lineStyle(5, 0xff8030, 0.18);
      this.fx.lineBetween(l.sx, l.sy, l.x, l.y);
      this.drawMark(l.tx, l.ty, l.armed, time);
    }
    // 灯った提灯: 呼び寄せる範囲(薄い点線)と、今割ったら巻き込む範囲(太い輪。待つほど育つ)
    for (const l of g.lanterns) {
      if (l.flying) continue;
      const n = 48;
      this.fx.lineStyle(1, 0xffc080, 0.22);
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2 + time * 0.2, a1 = ((i + 1) / n) * Math.PI * 2 + time * 0.2;
        this.fx.lineBetween(l.x + Math.cos(a0) * P.lureR, l.y + Math.sin(a0) * P.lureR, l.x + Math.cos(a1) * P.lureR, l.y + Math.sin(a1) * P.lureR);
      }
      // 呼ばれているおばけから提灯への糸
      for (const gh of g.ghosts) {
        if (gh.lure !== l.id) continue;
        this.fx.lineStyle(1, 0xffd0a0, 0.25);
        this.fx.lineBetween(gh.x, gh.y, l.x, l.y);
      }
      const grown = l.r >= P.burstMax - 0.5;
      const danger = clamp01(1 - (this.nearestLured(l) - EAT_R) / 70);
      this.fx.fillStyle(0xffe0a0, 0.07 + 0.05 * danger); this.fx.fillCircle(l.x, l.y, l.r);
      const col = danger > 0.5 ? 0xff7a5a : grown ? 0xffe27a : 0xffd090;
      this.fx.lineStyle(grown ? 3 : 2, col, 0.85);
      this.fx.strokeCircle(l.x, l.y, l.r);
      // 輪の中のおばけに印(今割れば巻き込める)
      for (const gh of g.ghosts) {
        if (Math.hypot(gh.x - l.x, gh.y - l.y) > l.r + GHOST_R) continue;
        this.fx.lineStyle(2, 0xfff2b0, 0.9);
        this.fx.strokeCircle(gh.x, gh.y, 15);
      }
    }
    // 成仏の光: 広がって、留まって、縮む
    this.glowFx.clear();
    for (const b of g.blasts) {
      if (b.delay > 0 || b.r <= 0) continue;
      this.glowFx.fillStyle(0xffb050, b.big ? 0.35 : 0.28); this.glowFx.fillCircle(b.x, b.y, b.r);
      this.glowFx.fillStyle(0xfff0c0, 0.35); this.glowFx.fillCircle(b.x, b.y, b.r * 0.7);
      this.glowFx.fillStyle(0xffffff, 0.3); this.glowFx.fillCircle(b.x, b.y, b.r * 0.35);
      this.glowFx.lineStyle(2, 0xffe08a, 0.7); this.glowFx.strokeCircle(b.x, b.y, b.r);
    }
    // 目がくらんでいるおばけ(頭の上を回る星)
    for (const gh of g.ghosts) {
      if (gh.stun <= 0) continue;
      for (let i = 0; i < 3; i++) {
        const a = time * 8 + (i * Math.PI * 2) / 3;
        this.fx.fillStyle(0xfff2b0, 0.9);
        this.fx.fillCircle(gh.x + Math.cos(a) * 12, gh.y - 18 + Math.sin(a) * 4, 2.2);
      }
    }
    // 唐傘の着地点の予告
    for (const gh of g.ghosts) {
      if (gh.kind !== 'hop' || gh.crouch <= 0) continue;
      const [lx, ly] = g.hopLanding(gh);
      this.fx.lineStyle(1.5, 0xc9a0ff, 0.3 + gh.crouch * 0.5);
      this.fx.strokeEllipse(lx, ly + 10, 26 * gh.crouch + 6, 10 * gh.crouch + 3);
      this.fx.lineStyle(1, 0xc9a0ff, 0.25 * gh.crouch);
      this.fx.lineBetween(gh.x, gh.y, lx, ly);
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

  /** 行き先の印(朱の丸に十字)。即割りの予約が入ると塗りつぶして脈打つ */
  private drawMark(x: number, y: number, armed: boolean, time: number) {
    const r = 9;
    if (armed) {
      const k = 1 + 0.2 * Math.sin(time * 20);
      this.fx.fillStyle(0xff4a30, 0.85); this.fx.fillCircle(x, y, r * k);
      this.fx.lineStyle(2, 0xffe0c0, 1); this.fx.lineBetween(x - r, y - r, x + r, y + r); this.fx.lineBetween(x - r, y + r, x + r, y - r);
    } else {
      this.fx.lineStyle(2, 0xff6040, 0.95); this.fx.strokeCircle(x, y, r);
      this.fx.lineBetween(x - r - 4, y, x + r + 4, y); this.fx.lineBetween(x, y - r - 4, x, y + r + 4);
    }
  }

  /** 呼び寄せたおばけのうち、提灯に一番近い距離 */
  private nearestLured(l: Lantern) {
    let d = Infinity;
    for (const gh of this.game2.ghosts) if (gh.lure === l.id) d = Math.min(d, Math.hypot(gh.x - l.x, gh.y - l.y));
    return d;
  }

  private drawGhost(s: Phaser.GameObjects.Image, gh: Ghost, time: number) {
    const bob = Math.sin(time * 3 + gh.id) * 3;
    let sx = 1, sy = 1;
    if (gh.kind === 'hop') {
      sy = 1 - gh.crouch * 0.3; sx = 1 + gh.crouch * 0.15;
      if (gh.dashT > 0) { sy = 1.2; sx = 0.85; }
    }
    const appear = Math.min(1, gh.age / 0.6);
    let alpha = appear * (gh.kind === 'fuwa' ? 0.8 + 0.2 * Math.sin(time * 4 + gh.id) : 1);
    if (gh.kind === 'kirai') alpha *= 0.92;
    s.setPosition(gh.x, gh.y + (gh.kind === 'hop' ? 0 : bob)).setScale(sx * 0.9, sy * 0.9).setAlpha(alpha).setFlipX(gh.face < 0);
    s.setAngle(gh.kind === 'zig' ? Math.sin(time * 8 + gh.id) * 8 : 0);
    if (gh.lure !== 0) s.setTint(0xffe6c0); else s.clearTint();
  }
}

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }
