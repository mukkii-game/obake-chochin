// プレイ画面。ゲームの中身(src/game/logic.ts)を 1/60 秒刻みで進め、その state を絵にするだけ。
// 入力はタップ(src/ui/taps.ts)→ 次の step に渡す。同じ入力列を Recorder に残す(?replay= で再現)。
import Phaser from 'phaser';
import { Game, DT, W, H, PLAY, HOUSE_R, encodeTaps, decodeTaps, type Ghost, type GameEvent, type Blast, type Piece, type GhostKind } from '../game/logic';
import { readParams } from '../game/params';
import { Bot } from '../game/bot';
import { snd, bgmStart, bgmStop, bgmIntensity, preloadSfx, sayObake, beatPos, cry } from '../game/sound';
import { txt, pop, dayName, waveLabel } from '../game/view';
import { dayOf, waveInDay } from '../game/waves';
import { PAPER } from '../game/art';
import { onTap, onAim, onCancel } from '../ui/taps';
import { DemoDriver, expose } from '../core/demo';
import { t } from '../core/i18n';
import { save, load } from '../core/save';
import { tune } from '../core/tuning';
import { startSeed } from '../core/rng';
import { Recorder, Player, replayFromUrl } from '../core/replay';
import { isMuted, toggleMuted } from '../core/audio';

const GHOST_TEX = { fuwa: 'g_fuwa', oni: 'g_oni', kasa: 'g_kasa', big: 'g_big', giant: 'g_giant' } as const;
const GHOST_TINT: Partial<Record<GhostKind, number>> = { big: 0xffd6ea, giant: 0xd8c8ff };
const GHOST_GLOW = { fuwa: 0x8fb4ff, oni: 0x40e0a0, kasa: 0xb070ff, big: 0xff9ec8, giant: 0xb090ff } as const;
/** 軒先の提灯の位置(家の中心から) */
const HANG: ReadonlyArray<[number, number]> = [[32, -16], [32, -1], [32, 14]];

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
  private offAim: (() => void) | null = null;
  /** 狙っている所(押している間・マウスを動かしている間)。null = 狙っていない */
  private aim: { x: number; y: number; from: number } | null = null;
  private aimDown: { x: number; y: number; house: number } | null = null;

  private gSprites = new Map<number, Phaser.GameObjects.Image>();
  private gGlows = new Map<number, Phaser.GameObjects.Image>();
  private lSprites = new Map<number, { body: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }>();
  private houseImgs: Array<{ img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; hang: Phaser.GameObjects.Image[]; key: string }> = [];
  private selFx!: Phaser.GameObjects.Graphics;
  private portalImgs: Phaser.GameObjects.Image[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private glowFx!: Phaser.GameObjects.Graphics;
  private moon!: Phaser.GameObjects.Image;
  private dusk!: Phaser.GameObjects.Image;
  private hi = 0;
  private hiText!: Phaser.GameObjects.Text;
  private nightK = 0;
  private banners: Phaser.GameObjects.Text[] = [];
  private bubbles: Phaser.GameObjects.Text[] = [];
  private talked = new Set<number>();
  private scoreText!: Phaser.GameObjects.Text;
  private watchText!: Phaser.GameObjects.Text;
  private chainText!: Phaser.GameObjects.Text;
  private shownScore = 0;
  private scorePunch = false;
  private rushId = -1;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeTick = 0;
  /** 狙いから連爆する提灯の id(前の 1 コマで決めたもの) */
  private chainTargets = new Set<number>();
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireworks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireworksBig!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 光が通った後の、ゆっくり消える余韻 */
  private afterglow: Array<{ piece: Piece; x: number; y: number; t: number }> = [];
  private tipShown = new Set<string>();
  private trails = new Map<number, Array<[number, number]>>();

  constructor() { super('Play'); }

  create() {
    expose('scene', 'Play');
    this.ended = false; this.acc = 0; this.pending = []; this.hitstop = 0; this.nightK = 0; this.afterglow = []; this.banners = []; this.bubbles = []; this.talked = new Set();
    this.gSprites.clear(); this.gGlows.clear(); this.lSprites.clear(); this.houseImgs = []; this.portalImgs = []; this.trails.clear();

    const replay = replayFromUrl();
    const seed = replay ? replay.seed : startSeed();
    this.player = replay ? new Player(replay) : null;
    this.rec = new Recorder(seed);
    // ?wave=4 でその刻から(確かめ用)
    const startWave = Math.max(0, Math.min(9, (Number(new URLSearchParams(location.search).get('wave')) || 1) - 1));
    this.game2 = new Game(seed, readParams(), replay ? 0 : startWave);
    this.bot = DemoDriver.enabled && !replay ? new Bot(0.8, seed) : null;
    expose('seed', seed); expose('score', 0);

    this.add.image(0, 0, 'bg').setOrigin(0);
    // 夕方から始まり、刻が進むほど暗くなって夜になる
    this.dusk = this.add.image(0, 0, 'dusk').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
    this.moon = this.add.image(0, 0, 'moon').setAlpha(0);
    this.hi = load().best;
    this.selFx = this.add.graphics().setDepth(27);
    for (const h of this.game2.houses) {
      const glow = this.add.image(h.x, h.y + 6, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.55);
      // 家の形 = この家から投げる提灯の光の形(縦の楼は縦、長屋は横)
      const key = `house_${h.piece}`;
      const img = this.add.image(h.x, h.y + 22, `${key}_lit`).setOrigin(0.5, 0.92).setScale(0.8).setDepth(2);
      // 軒先に下がる提灯(この家から飛ばせる数。ミサイルコマンドの基地の弾)
      const hang = HANG.map(([dx, dy]) => this.add.image(h.x + dx, h.y + dy, `lantern_${h.piece}`).setScale(0.26).setDepth(3));
      this.houseImgs.push({ img, glow, hang, key });
    }
    this.fx = this.add.graphics().setDepth(5);
    this.glowFx = this.add.graphics().setDepth(19).setBlendMode(Phaser.BlendModes.ADD);

    this.sparks = this.add.particles(0, 0, 'dot', {
      lifespan: 900, speed: { min: 20, max: 110 }, angle: { min: 200, max: 340 }, gravityY: -40,
      scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xfff2b0, 0xffd27a, 0xffffff],
      blendMode: 'ADD', emitting: false,
    }).setDepth(30);
    // 花火: 光の形に沿って色とりどりの火の粉が広がり、ゆっくり落ちながら消える(余韻)
    this.fireworks = this.add.particles(0, 0, 'dot', {
      lifespan: { min: 1100, max: 1900 }, speed: { min: 25, max: 120 }, angle: { min: 0, max: 360 }, gravityY: 38,
      scale: { start: 0.9, end: 0.15 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false,
      tint: [0xffd27a, 0xff9ec8, 0x9ee8ff, 0xfff4c0, 0xc8a0ff],
    }).setDepth(30);
    // 連爆の花火: 大きく、速く、虹色に、長く残る
    this.fireworksBig = this.add.particles(0, 0, 'dot', {
      lifespan: { min: 1400, max: 2400 }, speed: { min: 60, max: 260 }, angle: { min: 0, max: 360 }, gravityY: 45,
      scale: { start: 1.6, end: 0.2 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false,
      tint: [0xff5e8a, 0xffd23f, 0x5ee0ff, 0x9dff7a, 0xc77dff, 0xffffff, 0xff9f40],
    }).setDepth(31);
    this.smoke = this.add.particles(0, 0, 'glow', {
      lifespan: { min: 550, max: 800 }, speed: { min: 4, max: 14 }, angle: { min: 0, max: 360 }, gravityY: -14,
      scale: { start: 0.12, end: 0.42 }, alpha: { start: 0.32, end: 0 }, tint: [0xe8dcf0, 0xffd8b0, 0xd0c8e0], emitting: false,
    }).setDepth(9);
    this.shards = this.add.particles(0, 0, 'shard', {
      lifespan: 700, speed: { min: 80, max: 220 }, gravityY: 300, rotate: { min: 0, max: 360 },
      scale: { start: 1, end: 0.4 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(31);

    // HUD(巻物の上の縁に)
    // HUD: 左にスコア(入るたびに跳ねる)、真ん中に刻、右にハイスコアと音
    this.scoreText = this.add.text(PAPER.x0 + 8, 18, '', txt(28)).setOrigin(0, 0.5).setDepth(50);
    this.watchText = this.add.text(W / 2, 18, '', txt(24, '#e8d6ff')).setOrigin(0.5).setDepth(50);
    this.hiText = this.add.text(PAPER.x1 - 50, 18, '', txt(22, '#ffb0e0')).setOrigin(1, 0.5).setDepth(50);
    const mute = this.add.text(PAPER.x1 - 8, 4, isMuted() ? '♪×' : '♪', txt(24, '#cfe')).setOrigin(1, 0).setDepth(50);
    this.shownScore = 0; this.scorePunch = false; this.rushId = -1;
    this.chainText = this.add.text(W / 2, H / 2, '', pop(40, '#fff3c0')).setOrigin(0.5).setDepth(60).setAlpha(0);
    if (this.player) this.add.text(W / 2, H - 22, t('replaying'), txt(14, '#aaf')).setOrigin(0.5).setDepth(50);
    else if (this.bot) this.add.text(W / 2, H - 22, t('demo'), txt(14, '#aaf')).setOrigin(0.5).setDepth(50);

    this.offTap = onTap((x, y) => {
      // 右上の音ボタン
      if (x > PAPER.x1 - 50 && y < 34) { toggleMuted(); mute.setText(isMuted() ? '♪×' : '♪'); if (isMuted()) bgmStop(); else bgmStart(); }
    });
    // 投げるのは「離した所」。押している間(マウスは動かすだけでも)、投げた時の光の範囲と、連爆するかが見える。
    // 家を押して、そのまま投げたい所まで動かして離すと、その家から投げる
    this.offAim = onAim((phase, x, y) => {
      if (this.player || this.ended || this.bot) return;
      const g = this.game2;
      if (phase === 'down') {
        if (x > PAPER.x1 - 50 && y < 34) { this.aimDown = null; return; }
        this.aimDown = { x, y, house: g.houses.findIndex((h) => Math.hypot(h.x - x, h.y - y) < HOUSE_R) };
      }
      if (phase === 'up') {
        const d = this.aimDown;
        this.aimDown = null; this.aim = null;
        if (!d || Number.isNaN(x)) return;
        if (d.house >= 0 && Math.hypot(x - d.x, y - d.y) > 30) { if (g.selected !== d.house) this.pending.push([d.x, d.y]); this.pending.push([x, y]); }
        else this.pending.push([x, y]);
        return;
      }
      if (phase === 'hover' || this.aimDown) {
        const from = this.aimDown && this.aimDown.house >= 0 ? this.aimDown.house : -1;
        this.aim = Number.isNaN(x) ? null : { x, y, from };
      }
    });
    this.input.keyboard?.on('keydown-M', () => { toggleMuted(); mute.setText(isMuted() ? '♪×' : '♪'); if (isMuted()) bgmStop(); else bgmStart(); });
    // 右クリック: 選んだ家を外す(記録に残るよう、その家を押したことにする)
    const offCancel = onCancel(() => {
      const g = this.game2;
      if (this.player || this.ended || this.bot || g.selected < 0) return;
      const h = g.houses[g.selected];
      this.pending.push([h.x, h.y]);
    });
    this.events.once('shutdown', () => { this.offTap?.(); this.offTap = null; this.offAim?.(); this.offAim = null; offCancel(); bgmStop(); });

    bgmStart();
    preloadSfx();
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
    if (g.cleared) snd.relight(); else snd.over();
    this.cameras.main.fadeOut(1400, 5, 3, 10);
    const res = {
      score: g.score, best, newBest: g.score > prev.best && g.score > 0, bestChain: g.bestChain, purified: g.purified,
      watch: g.wave, seconds: Math.floor(g.t), replay: this.rec.toString(), cleared: g.cleared, formations: g.formations,
    };
    // 3 日を凌いだらエンディングとスタッフロール、その後に結果
    this.time.delayedCall(1500, () => this.scene.start(g.cleared ? 'Ending' : 'Result', res));
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
      case 'light':
        snd.place();
        this.sparks.explode(8, e.x, e.y);
        break;
      case 'deny': {
        snd.deny();
        break;
      }
      case 'ignite':
        this.sparks.explode(6, e.x, e.y - 6);
        break;
      case 'break': {
        snd.break(e.n);
        this.shards.explode(8, e.x, e.y);
        this.sparks.explode(10, e.x, e.y);
        // 花火: 光が伸びるのに合わせて、形の上の各所で火の粉が開く
        const piece = this.lanternPieceAt(e.x, e.y);
        const g = this.game2;
        // 連爆するほど、花火が大きく・多く・色とりどりに
        const big = e.n >= 2;
        const per = big ? Math.min(5 + e.n * 3, 20) : 5;
        for (const [px, py] of g.shapePoints(piece, e.x, e.y).filter((_, k) => k % (big ? 2 : 3) === 0)) {
          const d = Math.hypot(px - e.x, py - e.y);
          this.time.delayedCall((d / g.P.lightSpeed) * 1000, () => (big ? this.fireworksBig : this.fireworks).explode(per, px, py));
        }
        if (big) {
          // 真ん中で大きな菊の花火 + 少し揺れる
          this.fireworksBig.explode(Math.min(20 + e.n * 10, 80), e.x, e.y);
          this.cameras.main.shake(90 + e.n * 20, 0.002 + Math.min(e.n, 6) * 0.0008);
          const ring = this.add.image(e.x, e.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint([0xff7eb6, 0xffd23f, 0x5ee0ff, 0x9dff7a][e.n % 4]).setScale(0.3).setDepth(29);
          this.tweens.add({ targets: ring, scale: 2.2 + e.n * 0.3, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => ring.destroy() });
        }
        this.afterglow.push({ piece, x: e.x, y: e.y, t: this.time.now });
        break;
      }
      case 'purify': {
        snd.purify(e.n);
        // やられた: 声と同じ言葉を吹き出しで(声が重なって鳴らない時は、種類ごとの言葉)
        const said = cry(e.n);
        this.say(e.x, e.y - 34, said ? t(`cry_${said}`) : t(`cry_kind_${e.kind}`), '#ffd0e8', true);
        this.sparks.explode(5, e.x, e.y);
        this.popup(e.x, e.y - 14, `${e.pts}`, e.n >= 3 ? '#ffe27a' : '#f3e6c8', 13 + Math.min(e.n, 8));
        if (e.n >= 3) this.showChain(e.n, e.x, e.y);
        break;
      }
      case 'chainEnd':
        snd.chainEnd(e.n);
        if (e.bonus > 0) this.combo(e.n, e.bonus, e.x, e.y);
        if (e.n >= 6) { this.hitstop = tune<number>('juice.hitstop'); this.cameras.main.shake(180, 0.006); }
        break;
      case 'formation':
        snd.relight();
        this.banner(`${t('formation')}!  +${e.bonus}`, e.x, e.y + 40, '#ffb0e0', 30);
        this.cameras.main.shake(160, 0.004);
        break;
      case 'clear':
        break;
      case 'hurt': {
        // 大入道に光が当たった: 白く光って、ひと回り小さくなる
        snd.hurt();
        this.sparks.explode(14, e.x, e.y);
        this.popup(e.x, e.y - 40, '!', '#ffb0e0', 30);
        const big = this.game2.ghosts.find((q) => (q.kind === 'big' || q.kind === 'giant') && Math.hypot(q.x - e.x, q.y - e.y) < 2);
        const sp = big ? [big.id, this.gSprites.get(big.id)!] as const : undefined;
        if (sp && sp[1] && big) { sp[1].setTint(0xffffff); this.time.delayedCall(140, () => { if (sp[1].active) sp[1].setTint(GHOST_TINT[big.kind] ?? 0xffffff); }); }
        break;
      }
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
        const first = waveInDay(e.n) === 0;
        if (first) {
          // 始まり: かわいい声で「おばけが、くるぞー!」
          sayObake();
          const v = this.add.text(W / 2, H / 2 + 10, t('obakeComing'), txt(30, '#fff6c0', { strokeThickness: 7 })).setOrigin(0.5).setDepth(56).setScale(0.4);
          this.tweens.add({ targets: v, scale: 1, duration: 260, ease: 'Back.Out' });
          this.tweens.add({ targets: v, angle: { from: -4, to: 4 }, yoyo: true, repeat: 3, duration: 160 });
          this.tweens.add({ targets: v, alpha: 0, delay: 1600, duration: 400, onComplete: () => v.destroy() });
        }
        // 日の始まりは日付を大きく、ほかは「ウェーブ 2/3」
        const s = this.add.text(W / 2, H / 2 - 64, first ? dayName(dayOf(e.n)) : `${t('wave')} ${waveInDay(e.n) + 1}/3`, first ? pop(46, '#ffe27a') : pop(32, '#e8d6ff')).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(0.6);
        this.tweens.add({ targets: s, scale: 1, duration: 300, ease: 'Back.Out' });
        this.tweens.add({ targets: s, alpha: 1, yoyo: true, hold: first ? 1300 : 800, duration: 400, onComplete: () => s.destroy() });
        break;
      }
      case 'waveEnd': {
        snd.relight();
        const s = this.add.text(W / 2, H / 2 - 20, `${t('waveClear')}  +${e.bonus}`, txt(28, '#ffe27a')).setOrigin(0.5).setDepth(55).setAlpha(0);
        this.tweens.add({ targets: s, alpha: 1, yoyo: true, hold: 1100, duration: 350, onComplete: () => s.destroy() });
        break;
      }
      case 'dayEnd': {
        // その晩を凌いだ: 家がみんな灯り直す
        snd.chainEnd(5);
        const d = this.add.text(W / 2, H / 2 + 30, `${dayName(e.day)}  ${t('daySurvived')}`, pop(34, '#ffb0e0')).setOrigin(0.5).setDepth(56).setScale(0.3);
        this.tweens.add({ targets: d, scale: 1, duration: 300, ease: 'Back.Out' });
        this.tweens.add({ targets: d, alpha: 0, delay: 2200, duration: 500, onComplete: () => d.destroy() });
        for (const h of this.game2.houses) this.fireworks.explode(12, h.x, h.y - 30);
        break;
      }
      case 'over':
        break;
    }
  }

  private showChain(n: number, x: number, y: number) {
    const c = this.chainText;
    c.setText(`${n} ${t('combo')}!`);
    c.setPosition(Phaser.Math.Clamp(x, 140, W - 140), Phaser.Math.Clamp(y - 70, 70, H - 60));
    c.setFontSize(Math.min(26 + n * 2, 60));
    c.setColor(n >= 15 ? '#ffb0e0' : n >= 8 ? '#ffe27a' : '#fff3c0');
    this.tweens.killTweensOf(c);
    c.setAlpha(1).setScale(1.3);
    this.tweens.add({ targets: c, scale: 1, duration: 140, ease: 'Back.Out' });
    this.tweens.add({ targets: c, alpha: 0, delay: 700, duration: 400 });
  }

  /** 灯りが消えた家から、家の人が逃げ出す(小さなドット絵が、画面の端まで走っていく) */
  private flee(x: number, y: number) {
    const cries = t('screams').split('|');
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? 1 : -1;
      const p = this.add.image(x + dir * 6, y + 10, 'px_run0').setDepth(26).setFlipX(dir < 0).setScale(1.15);
      const toX = dir > 0 ? W + 20 : -20;
      const dur = (Math.abs(toX - x) / (70 + i * 12)) * 1000;
      this.tweens.add({ targets: p, x: toX, duration: dur, delay: i * 180, ease: 'Linear', onComplete: () => p.destroy() });
      // 叫び声: 文字(頭の上で揺れる)と、合成の声。人ごとに少しずつずらす
      const kind = i % 3, cry = cries[i % cries.length];
      const lift = 22 + (i >> 1) * 16;
      const bubble = this.add.text(p.x, p.y - lift, cry, txt(i % 2 ? 15 : 17, i % 2 ? '#ffe0e0' : '#fff6c0', { strokeThickness: 4 })).setOrigin(0.5).setDepth(57).setAlpha(0);
      this.tweens.add({ targets: bubble, alpha: 1, delay: i * 180 + 60, duration: 120, hold: 900, yoyo: true, onComplete: () => bubble.destroy() });
      snd.scream(kind, i * 0.18 + 0.05, 1 + (i - 1.5) * 0.06);
      // 2 コマで走る + 少し跳ねる(叫びの文字も一緒に)
      this.time.addEvent({ delay: 120, repeat: Math.ceil(dur / 120) + 3, callback: () => {
        if (!p.active) return;
        p.setTexture(p.texture.key === 'px_run0' ? 'px_run1' : 'px_run0'); p.y = y + 10 - (p.texture.key === 'px_run1' ? 2 : 0);
        if (bubble.active) bubble.setPosition(p.x, p.y - lift + Math.sin(this.time.now / 60 + i) * 2).setAngle(Math.sin(this.time.now / 80 + i) * 8);
      } });
    }
  }

  /** おばけのセリフの吹き出し。follow を渡すとそのおばけに付いていく。cry = やられた声(少し大きく、跳ねて消える) */
  private say(x: number, y: number, s: string, color: string, cry: boolean, follow?: Phaser.GameObjects.Image) {
    const b = this.add.text(x, y, s, pop(cry ? 17 : 14, color, { strokeThickness: 5, backgroundColor: cry ? undefined : 'rgba(40,20,48,0.55)' })).setOrigin(0.5).setDepth(57).setScale(0.3);
    this.bubbles.push(b);
    this.tweens.add({ targets: b, scale: 1, duration: 200, ease: 'Back.Out' });
    if (cry) this.tweens.add({ targets: b, y: y - 30, angle: Phaser.Math.Between(-12, 12), duration: 900, ease: 'Quad.Out' });
    if (follow) {
      const ev = this.time.addEvent({ delay: 16, loop: true, callback: () => { if (follow.active && b.active) b.setPosition(follow.x, follow.y - 34); } });
      this.time.delayedCall(1700, () => ev.remove());
    }
    this.tweens.add({ targets: b, alpha: 0, delay: cry ? 650 : 1300, duration: 350, onComplete: () => b.destroy() });
  }

  /** コンボ!: 決めた所に、ぽんっと弾んで出る(数が多いほど大きく、色が変わる) */
  private combo(n: number, bonus: number, x: number, y: number) {
    const size = Math.min(34 + n * 3, 72);
    const cols = ['#ffe27a', '#ffb0e0', '#9ff0ff', '#b8ffb0'];
    const xx = Phaser.Math.Clamp(x, 160, W - 160), yy = Phaser.Math.Clamp(y - 20, 90, H - 90);
    const head = this.add.text(xx, yy, `${n} ${t('combo')}!`, pop(size, cols[n % cols.length])).setOrigin(0.5).setDepth(62).setScale(0.2).setAngle(-8);
    const sub = this.add.text(xx, yy + size * 0.8, `+${bonus}`, pop(Math.round(size * 0.6), '#fff3c0')).setOrigin(0.5).setDepth(62).setScale(0).setAlpha(0);
    this.tweens.add({ targets: head, scale: 1, angle: 0, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: head, angle: { from: -4, to: 4 }, duration: 160, yoyo: true, repeat: 2, delay: 260 });
    this.tweens.add({ targets: sub, scale: 1, alpha: 1, duration: 220, delay: 140, ease: 'Back.Out' });
    this.tweens.add({ targets: [head, sub], y: '-=28', alpha: 0, delay: 1150, duration: 450, onComplete: () => { head.destroy(); sub.destroy(); } });
    this.sparks.explode(Math.min(6 + n * 2, 30), xx, yy);
  }

  /** 得点の小さな数字が浮かんで消える */
  private popup(x: number, y: number, s: string, color: string, size: number) {
    const tx = this.add.text(x, y, s, txt(size, color)).setOrigin(0.5).setDepth(58);
    this.tweens.add({ targets: tx, y: y - 26, alpha: 0, duration: 900, ease: 'Quad.Out', onComplete: () => tx.destroy() });
  }

  /** 大きな得点(連鎖ボーナス・編隊全滅)。昔のゲームのように、はっきり出す */
  private banner(s: string, x: number, y: number, color: string, size: number) {
    // 同時に出た大きな文字は重ならないよう、下へずらして積む
    this.banners = this.banners.filter((b) => b.active);
    const yy = Phaser.Math.Clamp(y - 60, 80, H - 140) + this.banners.length * (size + 12);
    const tx = this.add.text(0, yy, s, txt(size, color, { strokeThickness: 6 })).setOrigin(0.5).setDepth(61).setScale(0.6);
    this.banners.push(tx);
    const half = tx.width / 2 + 80;
    tx.x = Phaser.Math.Clamp(x, half, W - half);
    this.tweens.add({ targets: tx, scale: 1, duration: 180, ease: 'Back.Out' });
    this.tweens.add({ targets: tx, y: tx.y - 20, alpha: 0, delay: 1100, duration: 500, onComplete: () => tx.destroy() });
  }

  private puff(x: number, y: number) {
    const p = this.add.image(x, y, 'glow').setTint(0x404060).setAlpha(0.8).setDepth(25);
    this.tweens.add({ targets: p, scale: 1.6, alpha: 0, duration: 600, onComplete: () => p.destroy() });
  }

  private updateHud() {
    const g = this.game2;
    // 表示のスコアは本当のスコアへ数え上がる。入った時は跳ねて光る(入った量が多いほど大きく)
    if (this.shownScore !== g.score) {
      const gain = g.score - this.shownScore;
      if (gain > 0 && !this.scorePunch) {
        this.scorePunch = true;
        const s = 1.15 + Math.min(gain / 400, 0.45);
        this.scoreText.setColor('#ffe27a').setScale(s);
        this.tweens.add({ targets: this.scoreText, scale: 1, duration: 220, ease: 'Back.Out', onComplete: () => { this.scorePunch = false; this.scoreText.setColor('#f3e6c8'); } });
      }
      this.shownScore = gain > 0 ? Math.min(g.score, this.shownScore + Math.max(1, Math.ceil(gain * 0.18))) : g.score;
    }
    this.scoreText.setText(`${t('score')} ${this.shownScore}`);
    this.watchText.setText(waveLabel(Math.min(g.wave, g.waveCount - 1)));
    this.hiText.setText(`${t('hiScore')} ${Math.max(this.hi, g.score)}`);
    expose('score', g.score); expose('lanterns', g.lanterns.length); expose('ammo', g.ammo);
  }

  /** state → 絵。スプライトは id ごとに使い回し、消えたものは捨てる */
  private render(dt: number) {
    const g = this.game2, P = g.P;
    const time = this.time.now / 1000;

    // 夕方 → 夜: 毎日 1 ウェーブ目は夕焼け、3 ウェーブ目で夜になる(次の日はまた夕方から)。月は暗くなるにつれて昇る
    const nextW = g.pause > 0 && g.begun ? g.wave + 1 : g.wave;
    const night = Math.min(1, (waveInDay(nextW) + (g.pause > 0 ? 0 : 0.6)) / 2.4);
    this.nightK += (night - this.nightK) * Math.min(1, dt * 0.5);
    this.dusk.setAlpha(1 - this.nightK);
    const k = this.nightK;
    this.moon.setPosition(PAPER.x1 - 80 - k * (PAPER.x1 - PAPER.x0 - 160), 120 - this.nightK * 66).setScale(0.6).setAlpha(this.nightK);

    g.houses.forEach((h, i) => {
      const o = this.houseImgs[i];
      // おばけが入り込んだ家: 中の人が騒いで灯りが揺れ、家が震える(消えるまでの間が、そのまま助けに行ける猶予)
      const panic = h.haunt > 0;
      const flick = panic ? (Math.sin(time * 37 + i) + Math.sin(time * 23)) > 0.3 : true;
      o.img.setTexture(`${o.key}_${h.lit && flick ? 'lit' : 'dark'}`);
      o.img.setPosition(h.x + (panic ? Math.sin(time * 60) * 1.5 : 0), h.y + 22);
      o.glow.setVisible(h.lit).setAlpha(panic ? (flick ? 0.5 : 0.15) : 0.45 + 0.1 * Math.sin(time * 3 + i));
      o.img.setScale(0.8 * (1 + h.flash * 0.25));
      o.hang.forEach((hg, k) => hg.setVisible(h.lit && k < h.ammo).setAngle(Math.sin(time * 1.5 + k + i) * 4));
    });
    // 選んだ家: 家の人が提灯を掲げて待つ(家のマスの縁がほんのり明るい)
    this.selFx.clear();
    if (g.selected >= 0) {
      // 選んだ家: 色つきの太い輪で囲む(この家から続けて投げられる)。下に小さな矢印
      const h = g.houses[g.selected], r = 34 + 3 * Math.sin(time * 6);
      this.selFx.lineStyle(9, 0xff7eb6, 0.25); this.selFx.strokeCircle(h.x, h.y - 4, r + 4);
      this.selFx.lineStyle(4, 0xff7eb6, 0.95); this.selFx.strokeCircle(h.x, h.y - 4, r);
      this.selFx.lineStyle(2, 0xffffff, 0.8); this.selFx.strokeCircle(h.x, h.y - 4, r - 4);
      this.selFx.fillStyle(0xff7eb6, 0.95);
      const ay = h.y - r - 14 + 3 * Math.sin(time * 8);
      this.selFx.fillTriangle(h.x - 8, ay, h.x + 8, ay, h.x, ay + 10);
    }

    // 提灯: 飛んでいる間は軌跡と行き先の印、灯ったら縮んでいく灯り
    const seenL = new Set<number>();
    for (const l of g.lanterns) {
      seenL.add(l.id);
      let s = this.lSprites.get(l.id);
      if (!s) {
        const glow = this.add.image(l.x, l.y, 'glow').setTint(0xff9a40).setBlendMode(Phaser.BlendModes.ADD).setDepth(8).setAlpha(0);
        // 提灯の形 = 光の形(縦長 / 横長 / 丸)
        const body = this.add.image(l.x, l.y, `lantern_${l.piece}`).setDepth(12).setScale(0.6);
        s = { body, glow };
        this.lSprites.set(l.id, s);
      }
      if (l.flying) {
        // ゆっくり弧を描いて飛ぶ。着いたら弾ける
        const k = l.flyT / l.flyDur;
        const arc = Math.sin(k * Math.PI) * Math.min(90, Math.hypot(l.tx - l.sx, l.ty - l.sy) * 0.35);
        s.body.setPosition(l.x, l.y - arc).setScale(0.6).setAngle(Math.sin(time * 14 + l.id) * 12);
        s.glow.setPosition(l.x, l.y - arc).setScale(0.5).setAlpha(0.6);
        // 煙の残像: 飛んだ後にふわっと残り、ふくらみながら古い所から消えていく
        if (this.smokeTick++ % 2 === 0) this.smoke.emitParticleAt(l.x + ((this.smokeTick * 7) % 5 - 2), l.y - arc + 4, 1);
      } else {
        // 置かれた提灯。いつも同じ時間で弾ける(弾ける前ほど火が大きくゆらぐだけ。数字は出さない)
        const k = Math.min(1, l.age / P.fuse);
        const sway = Math.sin(time * (2 + k * 16) + l.id) * (4 + k * 8);
        s.body.setPosition(l.x, l.y - 6).setAngle(sway).setScale(0.95 * (1 + k * k * 0.18));
        s.glow.setPosition(l.x, l.y).setScale(0.7 + k * 0.4).setAlpha(0.5 + (0.1 + k * 0.3) * Math.sin(time * (5 + k * 24) + l.id)).setTint(0xff9a40);
        if (l.fuseLit !== undefined) {
          // 誘爆の火が付いた: 白く膨らんで震え、すぐ弾ける
          s.body.setScale(1.15).setAngle(Math.sin(time * 60 + l.id) * 14);
          s.glow.setTint(0xffffff).setScale(1.3).setAlpha(1);
        } else if (this.chainTargets.has(l.id)) {
          // 狙いから連爆する提灯: 白い光が強く脈打つ
          const p = 0.5 + 0.5 * Math.sin(time * 10);
          s.glow.setTint(0xffffff).setScale(1 + 0.35 * p).setAlpha(0.75 + 0.25 * p);
          s.body.setScale(1.05 + 0.08 * p);
        }
      }
    }
    for (const [id, s] of this.lSprites) if (!seenL.has(id)) { s.body.destroy(); s.glow.destroy(); this.lSprites.delete(id); }

    // おばけ
    const seenG = new Set<number>();
    for (const gh of g.ghosts) {
      seenG.add(gh.id);
      let s = this.gSprites.get(gh.id);
      if (!s) {
        s = this.add.image(gh.x, gh.y, GHOST_TEX[gh.kind]).setDepth(15).setAlpha(0);
        const tint = GHOST_TINT[gh.kind]; if (tint) s.setTint(tint);
        this.gSprites.set(gh.id, s);
      }
      this.drawGhost(s, gh, time);
      // 最後の一匹: 急ぎだす時に一言
      if (g.rush() > 1 && this.rushId !== gh.id && !gh.dead) { this.rushId = gh.id; this.say(gh.x, gh.y - 34, t('rush'), '#ffb0b0', true, s); }
      // ときどき、種類ごとのセリフをしゃべる(画面にたくさん出すぎないよう 3 つまで)
      if (!gh.haunt && !gh.caught && gh.y > 70 && gh.age > 1.4 + (gh.id % 4) * 1.7 && !this.talked.has(gh.id) && this.bubbles.filter((b) => b.active).length < 3) {
        this.talked.add(gh.id);
        if (gh.id % 2 === 0 || gh.kind === 'big' || gh.kind === 'giant') {
          const lines = t(`talk_${gh.kind}`).split('|');
          this.say(gh.x, gh.y - 30, lines[gh.id % lines.length], '#fff6d8', false, s);
        }
      }
      // おばけのまわりの淡い光(種類ごとの色。暗い空でも動きが読める)
      let gl = this.gGlows.get(gh.id);
      if (!gl) { gl = this.add.image(gh.x, gh.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(14).setTint(GHOST_GLOW[gh.kind]); this.gGlows.set(gh.id, gl); }
      gl.setPosition(s.x, s.y + 2).setScale(0.42 + 0.04 * Math.sin(time * 3 + gh.id)).setAlpha(s.alpha * (gh.haunt ? 0.25 : 0.4));
    }
    for (const [id, gl] of this.gGlows) if (!seenG.has(id)) { gl.destroy(); this.gGlows.delete(id); }
    for (const [id, s] of this.gSprites) {
      if (seenG.has(id)) continue;
      this.gSprites.delete(id);
      // やられた: 目が ＞＜(唐傘は ×)になって、くるっと回りながらぴょんと跳ね、昇って消える
      const ko = `${s.texture.key}_ko`;
      if (this.textures.exists(ko)) s.setTexture(ko);
      const sc = s.scaleX;
      this.tweens.add({ targets: s, scaleX: sc * 1.25, scaleY: sc * 0.8, duration: 70, yoyo: true });
      this.tweens.add({ targets: s, y: s.y - 46, angle: s.angle + (id % 2 ? 360 : -360), duration: 650, ease: 'Quad.Out' });
      this.tweens.add({ targets: s, alpha: 0, scale: sc * 0.5, delay: 380, duration: 420, onComplete: () => s.destroy() });
    }

    this.fx.clear();
    // 飛んでいる提灯: 弧の軌跡と、行き先のマスの小さな × (下げる時は、吊るす鉤の輪)
    for (const l of g.lanterns) {
      if (!l.flying) continue;
      const tx = l.tx, ty = l.ty;
      const top = Math.min(90, Math.hypot(tx - l.sx, ty - l.sy) * 0.35);
      const k = l.flyT / l.flyDur;
      void top; void k; // 軌跡は線ではなく煙の残像(render の提灯の所で出す。古い所から薄れて消える)
      this.fx.lineStyle(2, 0xff6040, 0.9);
      this.fx.lineBetween(tx - 6, ty - 6, tx + 6, ty + 6);
      this.fx.lineBetween(tx - 6, ty + 6, tx + 6, ty - 6);
    }
    this.glowFx.clear();
    this.chainTargets.clear();
    // 置かれた提灯の光の範囲: うっすら塗り、縁がほんのり明るい(線は引かない)。
    // 範囲が重なって連爆する提灯どうしは、少しだけ明るく暖かい色になる
    const ls = g.lanterns;
    const linked = ls.map((a, i) => ls.some((b, j) => j !== i && g.touches(a, b)));
    ls.forEach((l, i) => {
      const L = g.reach(l.piece);
      const k = l.flying ? 0.5 : 1;
      this.drawShape(l.piece, l.tx, l.ty, L, 0, linked[i] ? 0xffc870 : 0xffb060, (linked[i] ? 0.05 : 0.025) * k);
      this.softEdge(l.piece, l.tx, l.ty, linked[i] ? 0xffd890 : 0xffb070, (linked[i] ? 0.08 : 0.04) * k);
      if (linked[i] && !l.flying) this.outlineShape(l.piece, l.tx, l.ty, 0xffffff, 0.22, 1.5);
    });
    // 狙い: 離せばここへ飛ぶ。どの家の形の光が、どこまで届くか。連爆する提灯も、ほんのり光る
    if (this.aim && !this.ended) {
      const { x, y } = this.aim;
      const from = this.aim.from >= 0 ? this.aim.from : g.selected >= 0 && g.canThrow(g.selected) ? g.selected : g.launchHouse(x, y);
      const inField = x > PLAY.x0 && x < PLAY.x1 && y > PLAY.y0 && y < PLAY.y1 && !g.houses.some((h) => Math.hypot(h.x - x, h.y - y) < HOUSE_R);
      if (from >= 0 && inField) {
        const piece = g.houses[from].piece, me = { piece, tx: x, ty: y };
        const ok = g.lanterns.length < P.maxLanterns;
        this.drawShape(piece, x, y, g.reach(piece), 0, ok ? 0xfff0c0 : 0x8080a0, 0.035);
        this.softEdge(piece, x, y, ok ? 0xfff0c0 : 0x8080a0, 0.07);
        // 連爆する提灯: 真っ白にはっきり光る(輪郭も白く脈打つ)。ここに置けばつながる、が一目でわかる
        const pulse = 0.5 + 0.5 * Math.sin(time * 10);
        for (const l of g.lanterns) if (!l.flying && g.touches(me, l)) {
          this.chainTargets.add(l.id);
          this.drawShape(l.piece, l.tx, l.ty, g.reach(l.piece), 0, 0xffffff, 0.07 + 0.05 * pulse);
          this.outlineShape(l.piece, l.tx, l.ty, 0xffffff, 0.45 + 0.4 * pulse, 2.5);
        }
        // どの家から飛ぶか: 家がほんのり明るい
        const h = g.houses[from];
        this.glowFx.fillStyle(0xffe0a0, 0.12); this.glowFx.fillCircle(h.x, h.y, 30);
      }
    }
    // 余韻: 光が通った形が、花火のあとのようにゆっくり薄れて消える
    const now = this.time.now;
    this.afterglow = this.afterglow.filter((a) => now - a.t < 1800);
    for (const a of this.afterglow) {
      const k = 1 - (now - a.t) / 1800;
      this.drawShape(a.piece, a.x, a.y, g.reach(a.piece), 0, 0xffc890, 0.12 * k * k);
    }
    // 光: 家の形どおりに、帯になって伸びる
    for (const b of g.blasts) this.drawBlast(b);

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

  /** 光の形の縁を、ほんのり明るく(線を引かず、太い光をうっすら重ねる) */
  private softEdge(piece: Piece, x: number, y: number, col: number, a: number) {
    const g = this.game2, fx = this.glowFx, w = g.P.lightWidth / 2, L = g.reach(piece);
    for (const [lw, k] of [[10, 0.35], [5, 0.6], [2, 1]] as const) {
      fx.lineStyle(lw, col, a * k);
      const box = (l: number, t: number, ww: number, hh: number) => fx.strokeRoundedRect(l, t, ww, hh, Math.min(10, w));
      switch (piece) {
        case 'vline': box(x - w, y - L, w * 2, L * 2); break;
        case 'hline': box(x - L, y - w, L * 2, w * 2); break;
        case 'up': box(x - w, y - L, w * 2, L + w); break;
        case 'down': box(x - w, y - w, w * 2, L + w); break;
        case 'cross': box(x - w, y - L * 0.7, w * 2, L * 1.4); box(x - L * 0.7, y - w, L * 1.4, w * 2); break;
        case 'area': fx.strokeCircle(x, y, L); break;
      }
    }
  }

  /** 光の形の輪郭(連爆の届く範囲を見せる) */
  private outlineShape(piece: Piece, x: number, y: number, col: number, a: number, lw: number) {
    const g = this.game2, fx = this.fx, w = g.P.lightWidth / 2, L = g.reach(piece);
    fx.lineStyle(lw, col, a);
    const box = (l: number, t: number, ww: number, hh: number) => fx.strokeRoundedRect(l, t, ww, hh, Math.min(8, w));
    switch (piece) {
      case 'vline': box(x - w, y - L, w * 2, L * 2); break;
      case 'hline': box(x - L, y - w, L * 2, w * 2); break;
      case 'up': box(x - w, y - L, w * 2, L + w); break;
      case 'down': box(x - w, y - w, w * 2, L + w); break;
      case 'cross': box(x - w, y - L * 0.7, w * 2, L * 1.4); box(x - L * 0.7, y - w, L * 1.4, w * 2); break;
      case 'area': fx.strokeCircle(x, y, L); break;
    }
  }

  /** 弾けた提灯の形(弾けた時にはもう消えているので、光から引く) */
  private lanternPieceAt(x: number, y: number): Piece {
    const b = this.game2.blasts.find((q) => Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1);
    return b ? b.piece : 'area';
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
    // 楽しそうに: BGM の拍に合わせてぴょこぴょこ弾み(拍で着地してつぶれる)、2 拍で左右にゆれる
    const bp = beatPos(time);
    const hop = Math.sin(Math.PI * (((bp % 1) + 1) % 1));
    const bob = -hop * 6;
    let sx = 1 + (1 - hop) * 0.1, sy = 1 - (1 - hop) * 0.1;
    const appear = Math.min(1, gh.age / 0.6);
    let alpha = appear * (gh.kind === 'fuwa' ? 0.8 + 0.2 * Math.sin(time * 4 + gh.id) : 1);
    if (gh.haunt) { alpha *= 0.55 + 0.3 * Math.sin(time * 9 + gh.id); sx *= 0.8; sy *= 0.8; }
    // 下がった提灯に見とれたおばけは提灯のまわりを回る / 前がつかえたおばけは足踏みする
    const orbit = time * 3 + gh.id;
    let ox = 0, oy = 0;
    if (gh.caught) { ox = Math.cos(orbit) * 12; oy = Math.sin(orbit) * 7 - 5; }
    else if (gh.stopped) { ox = Math.sin(time * 18 + gh.id) * 2; sy *= 0.92 + 0.08 * Math.abs(Math.sin(time * 9 + gh.id)); }
    else if (gh.haunt) { ox = Math.sin(time * 7 + gh.id) * 8; oy = -10; }
    // 大入道: 力が減るほど小さくなる(数字は出さない)
    const k = gh.kind === 'big' ? 0.6 + 0.25 * gh.hp : gh.kind === 'giant' ? 0.55 + 0.08 * gh.hp : 1;
    s.setPosition(gh.x + ox, gh.y + oy + bob * k).setScale(sx * 0.66 * k, sy * 0.66 * k).setAlpha(alpha).setFlipX(gh.face < 0);
    // 唐傘は折れるたびに傘を傾ける / 鬼火は揺らめく
    s.setAngle((gh.kind === 'kasa' ? gh.face * 10 : 0) + Math.sin((bp * Math.PI) / 2 + (gh.id % 2) * Math.PI) * 8);
  }
}
