// プレイ画面。ゲームの中身(src/game/logic.ts)を 1/60 秒刻みで進め、その state を絵にするだけ。
// 入力はタップ(src/ui/taps.ts)→ 次の step に渡す。同じ入力列を Recorder に残す(?replay= で再現)。
import Phaser from 'phaser';
import { Game, DT, W, H, GRID, CELLS, cellX, cellY, cellCol, cellRow, cellAt, encodeTaps, decodeTaps, type Ghost, type GameEvent } from '../game/logic';
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
import { STAGES, stageSeed, stageOfSeed, type Stage } from '../game/stages';
import { lang } from '../core/i18n';
import { Recorder, Player, replayFromUrl } from '../core/replay';
import { isMuted, toggleMuted } from '../core/audio';

const GHOST_TEX = { fuwa: 'g_fuwa', oni: 'g_oni', kasa: 'g_kasa', kirai: 'g_kirai' } as const;
/** 軒先の提灯の位置(家の中心から) */
const HANG: ReadonlyArray<[number, number]> = [[-25, -2], [25, -2], [-25, 12]];

export class Play extends Phaser.Scene {
  private game2!: Game;
  private acc = 0;
  private pending: Array<[number, number]> = [];
  private rec!: Recorder;
  private player: Player | null = null;
  private bot: Bot | null = null;
  private stageNo = -1;
  private stage: Stage | null = null;
  private example: Array<[number, number, number]> | null = null;
  private exIdx = 0;
  private hitstop = 0;
  private ended = false;
  private offTap: (() => void) | null = null;

  private gSprites = new Map<number, Phaser.GameObjects.Image>();
  private lSprites = new Map<number, { body: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; label: Phaser.GameObjects.Image }>();
  private wSprites = new Map<number, { body: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }>();
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

  create(data: { stage?: number; example?: boolean } = {}) {
    expose('scene', 'Play');
    this.ended = false; this.acc = 0; this.pending = []; this.hitstop = 0;
    this.gSprites.clear(); this.lSprites.clear(); this.wSprites.clear(); this.houseImgs = []; this.portalImgs = []; this.trails.clear();
    this.tipShown.clear();

    const replay = replayFromUrl();
    // 面は seed で決まる(面の seed は負の数。?replay= でも同じ面が出る)
    const want = replay ? -1 : data.stage ?? -1;
    const seed = replay ? replay.seed : want >= 0 ? stageSeed(want) : startSeed();
    this.stage = stageOfSeed(seed);
    this.stageNo = this.stage ? STAGES.indexOf(this.stage) : -1;
    this.player = replay ? new Player(replay) : null;
    this.rec = new Recorder(seed);
    this.game2 = new Game(seed, readParams(), this.stage);
    this.example = this.stage && data.example && !replay ? [...this.stage.demo].sort((a, b) => a[0] - b[0]) : null;
    this.exIdx = 0;
    this.bot = DemoDriver.enabled && !replay && !this.example ? new Bot(0.8, Math.abs(seed)) : null;
    expose('seed', seed); expose('score', 0);

    this.add.image(0, 0, 'bg').setOrigin(0);
    this.moon = this.add.image(0, 0, 'moon').setAlpha(0.95);
    for (let n = 0; n < CELLS; n++) if (this.game2.blocks[n]) this.add.image(cellX(n), cellY(n), 'block').setDepth(1);
    this.drawWalls();
    this.selFx = this.add.graphics().setDepth(4);
    for (const h of this.game2.houses) {
      const glow = this.add.image(h.x, h.y + 6, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.55);
      // 家の形 = この家から投げる提灯の光の形(火の見櫓は上、提灯屋は下、蔵は周り)
      const key = `house_${h.piece}`;
      const img = this.add.image(h.x, h.y + GRID.cell / 2 - 2, `${key}_lit`).setOrigin(0.5, 0.92).setScale(0.9).setDepth(2);
      // 軒先に下がる提灯(この家から飛ばせる数。ミサイルコマンドの基地の弾)
      const hang = HANG.map(([dx, dy]) => this.add.image(h.x + dx, h.y + dy, 'lantern').setScale(0.26).setDepth(3));
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
    else if (this.example) this.add.text(W / 2, H - 22, t('watchingExample'), txt(14, '#aaf')).setOrigin(0.5).setDepth(50);
    else if (this.stage) this.add.text(W / 2, H - 22, this.stage.idea[lang()], txt(13, '#e8d6ff')).setOrigin(0.5).setDepth(50);
    else if (this.bot) this.add.text(W / 2, H - 22, t('demo'), txt(14, '#aaf')).setOrigin(0.5).setDepth(50);

    this.offTap = onTap((x, y) => {
      // 右上の音ボタン
      if (x > PAPER.x1 - 50 && y < 34) { toggleMuted(); mute.setText(isMuted() ? '♪×' : '♪'); if (isMuted()) bgmStop(); else bgmStart(); return; }
      if (this.player || this.example || this.ended) return;
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
      else if (this.example) {
        // 手本: tools/stage.mjs と同じ決まりで流す(同じ結果になる)
        taps = [];
        while (this.exIdx < this.example.length && this.example[this.exIdx][0] <= g.t + 1e-9) {
          const [, c, r] = this.example[this.exIdx++];
          const n = cellAt(c, r);
          taps.push([cellX(n), cellY(n)]);
        }
        if (this.pending.length) this.pending = [];
      }
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
    const best = this.stage ? prev.best : Math.max(prev.best, g.score);
    save({ best, played: prev.played + 1 });
    expose('replay', this.rec.toString());
    bgmStop();
    if (g.cleared) snd.relight(); else snd.over();
    this.cameras.main.fadeOut(1400, 5, 3, 10);
    let stars = 0;
    if (this.stage) {
      stars = (g.cleared ? 1 : 0) + (g.cleared && g.litCount === g.houses.length ? 1 : 0) + (g.cleared && g.bestChain >= this.stage.goal ? 1 : 0);
      if (!this.example && !this.player && !this.bot) {
        const st = load().stars;
        if (stars > (st[this.stage.key] ?? 0)) save({ stars: { ...st, [this.stage.key]: stars } });
      }
    }
    this.time.delayedCall(1500, () => this.scene.start('Result', {
      score: g.score, best, newBest: !this.stage && g.score > prev.best && g.score > 0, bestChain: g.bestChain, purified: g.purified,
      watch: g.wave, seconds: Math.floor(g.t), replay: this.rec.toString(),
      stage: this.stageNo, cleared: g.cleared, keptAll: g.litCount === g.houses.length, stars, example: !!this.example,
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

  /** マスの間の細い板塀(ドルアーガの壁)。毎回変わる。おばけ(歩くもの)も光も通さない */
  private drawWalls() {
    const g = this.game2, gr = this.add.graphics().setDepth(4);
    for (let n = 0; n < CELLS; n++) {
      const c = cellCol(n), r = cellRow(n);
      for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
        if (c + dc >= GRID.cols || r + dr >= GRID.rows) continue;
        if (!g.wallBetween(n, cellAt(c + dc, r + dr))) continue;
        const x = GRID.x0 + (c + dc) * GRID.cell, y = GRID.y0 + (r + dr) * GRID.cell;
        const [x1, y1, x2, y2] = dc ? [x, y, x, y + GRID.cell] : [x, y, x + GRID.cell, y];
        gr.lineStyle(7, 0x0c0a10, 0.9); gr.lineBetween(x1, y1, x2, y2);
        gr.lineStyle(4, 0xc09468, 1); gr.lineBetween(x1, y1, x2, y2);
        // 板の継ぎ目
        for (let k = 1; k < 4; k++) { const u = k / 4; gr.fillStyle(0x3a2a1a, 1); gr.fillRect(x1 + (x2 - x1) * u - 1.5, y1 + (y2 - y1) * u - 1.5, 3, 3); }
      }
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
    this.watchText.setText(this.stage ? `${this.stage.name[lang()]}  ${Math.min(g.wave + 1, g.waveCount)} / ${g.waveCount}` : watchName(g.wave));
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
      o.img.setPosition(h.x + (panic ? Math.sin(time * 60) * 1.5 : 0), h.y + GRID.cell / 2 - 2);
      o.glow.setVisible(h.lit).setAlpha(panic ? (flick ? 0.5 : 0.15) : 0.45 + 0.1 * Math.sin(time * 3 + i));
      o.img.setScale(0.9 * (1 + h.flash * 0.25));
      o.hang.forEach((hg, k) => hg.setVisible(h.lit && k < h.ammo).setAngle(Math.sin(time * 1.5 + k + i) * 6));
    });
    // 選んだ家: 家の人が提灯を掲げて待つ(家のマスの縁がほんのり明るい)
    this.selFx.clear();
    if (g.selected >= 0) {
      const h = g.houses[g.selected], s = GRID.cell / 2 - 2;
      this.selFx.lineStyle(3, 0xffd890, 0.55 + 0.3 * Math.sin(time * 6));
      this.selFx.strokeRoundedRect(h.x - s, h.y - s, s * 2, s * 2, 6);
    }
    this.portalImgs.forEach((p, i) => p.setAngle(Math.sin(time * 0.8 + i) * 3).setAlpha(0.75 + 0.2 * Math.sin(time * 2 + i)));

    // 提灯: 飛んでいる間は軌跡と行き先の印、灯ったら縮んでいく灯り
    const seenL = new Set<number>();
    for (const l of g.lanterns) {
      seenL.add(l.id);
      let s = this.lSprites.get(l.id);
      if (!s) {
        const glow = this.add.image(l.x, l.y, 'glow').setTint(0xff9a40).setBlendMode(Phaser.BlendModes.ADD).setDepth(8).setAlpha(0);
        const body = this.add.image(l.x, l.y, 'lantern').setDepth(12).setScale(0.55);
        // 提灯の模様 = 光の形。香・桂は投げた向きに回す(上向きが「前」)
        const label = this.add.image(l.x, l.y, `mark_${l.piece}`).setDepth(13);
        s = { body, glow, label };
        this.lSprites.set(l.id, s);
      }
      if (l.flying) {
        // ゆっくり弧を描いて飛ぶ(行き先は辻)
        const k = l.flyT / l.flyDur;
        const arc = Math.sin(k * Math.PI) * Math.min(90, Math.hypot(cellX(l.cell) - l.sx, cellY(l.cell) - l.sy) * 0.35);
        s.body.setPosition(l.x, l.y - arc).setScale(0.55).setAngle(Math.sin(time * 14 + l.id) * 12);
        s.glow.setPosition(l.x, l.y - arc).setScale(0.5).setAlpha(0.6);
        s.label.setPosition(l.x, l.y - arc + 1).setScale(0.4);
      } else {
        // 辻に下がった提灯。光は通りに沿ってこぼれる(弾けた時に光が走る道)
        if (s.body.scale < 1) s.body.setScale(Math.min(1, s.body.scale + 0.1));
        s.body.setPosition(l.x, l.y - 8).setAngle(Math.sin(time * 2 + l.id) * 5);
        s.label.setPosition(l.x, l.y - 7).setScale(0.62 * Math.min(1, s.body.scale)).setAngle(s.body.angle);
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
      const tx = cellX(l.cell), ty = cellY(l.cell);
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
    // 下がった提灯の明かりが、模様の形のマスにうっすらこぼれる(弾けたら光がここを埋める。印ではなく提灯の明かり)
    const cs = GRID.cell;
    for (const l of g.lanterns) {
      if (l.flying) continue;
      for (const q of g.shape(l.cell, l.piece)) {
        if (!q.d) continue;
        this.glowFx.fillStyle(0xffb060, 0.07 / q.d + 0.02);
        this.glowFx.fillRect(cellX(q.cell) - cs / 2 + 4, cellY(q.cell) - cs / 2 + 4, cs - 8, cs - 8);
      }
    }
    // 光: 家の形どおりにマスを順に埋めて、留まって、縮む。柱と板塀で止まる
    const band = g.band;
    for (const b of g.blasts) {
      for (const q of b.cells) {
        // 帯の先頭で明るくふくらみ、帯の後ろで薄れる
        const front = Math.max(0, Math.min(1, b.ext - q.d + 0.6));
        const back = Math.max(0, Math.min(1, q.d - (b.ext - band) + 0.4));
        const k = Math.min(front, back);
        if (k <= 0) continue;
        const x = cellX(q.cell), y = cellY(q.cell);
        const half = (cs / 2) * (0.35 + 0.65 * front);
        const layers: ReadonlyArray<[number, number, number]> = b.big ? [[1.15, 0xffb050, 0.28], [0.85, 0xfff0c0, 0.4], [0.45, 0xffffff, 0.5]] : [[1, 0xffc070, 0.25], [0.6, 0xfff0c0, 0.35]];
        for (const [m, col, a] of layers) { this.glowFx.fillStyle(col, a * k); this.glowFx.fillRoundedRect(x - half * m, y - half * m, half * m * 2, half * m * 2, 8); }
      }
    }

    // おばけの通った跡(どちらへ向かっているか読めるように)
    for (const gh of g.ghosts) {
      const tr = this.trails.get(gh.id);
      if (!tr || tr.length < 2) continue;
      for (let i = 1; i < tr.length; i++) {
        const a = (i / tr.length) * 0.35;
        this.fx.lineStyle(3 * (i / tr.length) + 0.5, gh.kind === 'kirai' ? 0x6a3a8a : gh.kind === 'oni' ? 0x60e0b0 : gh.kind === 'kasa' ? 0xb080ff : 0xc8d8ff, a);
        this.fx.lineBetween(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1]);
      }
    }
    void dt;
  }

  private drawGhost(s: Phaser.GameObjects.Image, gh: Ghost, time: number) {
    const bob = Math.sin(time * 3 + gh.id) * 3;
    let sx = 1, sy = 1;
    const appear = Math.min(1, gh.age / 0.6);
    let alpha = appear * (gh.kind === 'fuwa' ? 0.8 + 0.2 * Math.sin(time * 4 + gh.id) : 1);
    if (gh.kind === 'kirai') alpha *= 0.92;
    if (gh.haunt) { alpha *= 0.55 + 0.3 * Math.sin(time * 9 + gh.id); sx *= 0.8; sy *= 0.8; }
    // 罠にかかったおばけは提灯のまわりを回る(見とれている)
    const orbit = gh.caught > 0 ? time * 3 + gh.id : 0;
    const ox = gh.caught > 0 ? Math.cos(orbit) * 18 : gh.haunt ? Math.sin(time * 7 + gh.id) * 8 : 0;
    const oy = gh.caught > 0 ? Math.sin(orbit) * 10 - 6 : gh.haunt ? -10 : 0;
    s.setPosition(gh.x + ox, gh.y + oy + bob).setScale(sx * 0.82, sy * 0.82).setAlpha(alpha).setFlipX(gh.face < 0);
    // 唐傘は折れるたびに傘を傾ける / 鬼火は揺らめく
    s.setAngle(gh.kind === 'kasa' ? gh.zig * 14 : gh.kind === 'oni' ? Math.sin(time * 8 + gh.id) * 6 : 0);
  }
}
