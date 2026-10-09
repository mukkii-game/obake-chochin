// プレイ画面。ゲームの中身(src/game/logic.ts)を 1/60 秒刻みで進め、その state を絵にするだけ。
// 入力はタップ(src/ui/taps.ts)→ 次の step に渡す。同じ入力列を Recorder に残す(?replay= で再現)。
import Phaser from 'phaser';
import { Game, DT, W, H, PLAY, HOUSE_R, GROUND_Y, encodeTaps, decodeTaps, type Ghost, type GameEvent, type Blast, type Piece, type GhostKind } from '../game/logic';
import { readParams } from '../game/params';
import { Bot } from '../game/bot';
import { snd, bgmStart, bgmStop, bgmIntensity, preloadSfx, sayObake, sayDay, beatPos, cry, ouch, bgmRate } from '../game/sound';
import { txt, pop, dayName, waveLabel, hourName } from '../game/view';
import { dayOf, waveInDay, WAVES_PER_DAY, WAVE_NAMES } from '../game/waves';
import { PAPER } from '../game/art';
import { onTap, onAim, onCancel } from '../ui/taps';
import { DemoDriver, expose } from '../core/demo';
import { t, lang } from '../core/i18n';
import { save, load } from '../core/save';
import { tune } from '../core/tuning';
import { startSeed } from '../core/rng';
import { Recorder, Player, replayFromUrl } from '../core/replay';
import { isMuted, toggleMuted, pauseAudio } from '../core/audio';

const GHOST_TEX = { fuwa: 'g_fuwa', oni: 'g_oni', kasa: 'g_kasa', big: 'g_big', giant: 'g_giant', kaze: 'g_kaze', inazuma: 'g_kaze', mega: 'g_mega' } as const;
const GHOST_TINT: Partial<Record<GhostKind, number>> = { big: 0xffd6ea, giant: 0xd8c8ff, kaze: 0xfff09a, inazuma: 0x9ff0ff, mega: 0xffe0a0 };
const GHOST_GLOW = { fuwa: 0x8fb4ff, oni: 0x40e0a0, kasa: 0xb070ff, big: 0xff9ec8, giant: 0xb090ff, kaze: 0xffe060, inazuma: 0x60e0ff, mega: 0xffc060 } as const;
/** 軒先の提灯の位置(家の中心から) */
/** 残りの提灯: 家の右下に、少し重ねて横に並べる(数が一目でわかるように) */
const HANG: ReadonlyArray<[number, number]> = [[0, 14], [0, 17], [0, 14]];
/** 家の絵の大きさ */
const HOUSE_SCALE = 1.05;

/** 光の色(外側, 芯)。光ごとに順に変える */
const BLAST_COLS: Array<[number, number]> = [[0xff6fa0, 0xffc0d8], [0xffb030, 0xffe08a], [0x40c8ff, 0xa8ecff], [0x70e060, 0xc8ffb0], [0xa070ff, 0xd8c0ff]];
/** 弾けた真ん中の、にじむ大きな粒の数(連爆ほど多い) */
const big0 = (n: number) => Math.min(3 + n * 3, 22); // 白く飛びすぎないよう少なめから。コンボで増えて、重なるほど白くなる

const R2 = Math.SQRT1_2;
/** 斜めの帯の 4 隅: 中心から向き (dx, dy) に a〜b、幅 ±w */
function stripPts(x: number, y: number, dx: number, dy: number, a: number, b: number, w: number) {
  const px = -dy * w, py = dx * w;
  return [
    new Phaser.Math.Vector2(x + dx * a + px, y + dy * a + py), new Phaser.Math.Vector2(x + dx * b + px, y + dy * b + py),
    new Phaser.Math.Vector2(x + dx * b - px, y + dy * b - py), new Phaser.Math.Vector2(x + dx * a - px, y + dy * a - py),
  ];
}

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
  private houseImgs: Array<{ img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; hang: Phaser.GameObjects.Image[]; lamps: Phaser.GameObjects.Image[]; key: string; peeks: Phaser.GameObjects.Image[]; back: Phaser.GameObjects.Shape; aura: Phaser.GameObjects.Image; wisps: Phaser.GameObjects.Image[] }> = [];
  /** 家に入り込んだおばけ(家ごと)と、入ったおばけの id(跳ね返る絵を出さない) */
  private peek: Array<GhostKind[] | undefined> = [];
  private entered = new Set<number>();
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
  private shownScore = 0;
  private scorePunch = false;
  private rushId = -1;
  private feverFx!: Phaser.GameObjects.Rectangle;
  private comboText?: Phaser.GameObjects.Text;
  private fullShown = false;
  private flashUntil = new Map<number, number>();
  private hoverHouse = -1;
  private aimTag!: Phaser.GameObjects.Text;
  private lastDmgShown = 1;
  private continues = 0;
  private paused = false;
  private pauseMenu: Phaser.GameObjects.Container | null = null;
  private pauseItems: Phaser.GameObjects.Text[] = [];
  private pauseSel = 0;
  private pauseOff: (() => void) | null = null;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeTick = 0;
  private slotFx!: Phaser.GameObjects.Graphics;
  private jet!: Phaser.GameObjects.Particles.ParticleEmitter;
  private prevPos = new Map<number, [number, number]>();
  private bloom!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 狙いから連爆する提灯の id(前の 1 コマで決めたもの) */
  private chainTargets = new Set<number>();
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireworks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireworksBig!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 光が通った後の、ゆっくり消える余韻 */
  private afterglow: Array<{ piece: Piece; x: number; y: number; t: number; grow: number }> = [];
  private tipShown = new Set<string>();
  private trails = new Map<number, Array<[number, number]>>();

  constructor() { super('Play'); }

  /** data.continueWave: コンティニュー(その日の頭のウェーブから。スコアは 0 から)。continues: これまでのコンティニュー回数 */
  create(data?: { continueWave?: number; continues?: number }) {
    expose('scene', 'Play');
    this.continues = data?.continues ?? 0;
    this.paused = false; this.pauseMenu = null; this.pauseOff = null; this.time.paused = false;
    this.ended = false; this.acc = 0; this.pending = []; this.hitstop = 0; this.nightK = 0; this.afterglow = []; this.banners = []; this.bubbles = []; this.talked = new Set();
    this.gSprites.clear(); this.peek = []; this.entered.clear(); this.gGlows.clear(); this.lSprites.clear(); this.houseImgs = []; this.portalImgs = []; this.trails.clear();

    const replay = replayFromUrl();
    const seed = replay ? replay.seed : startSeed();
    this.player = replay ? new Player(replay) : null;
    // ?wave=4 でそのウェーブから(確かめ用)。コンティニューはその日の頭から
    const urlWave = Math.max(0, Math.min(8, (Number(new URLSearchParams(location.search).get('wave')) || 1) - 1));
    const startWave = replay ? replay.wave ?? 0 : data?.continueWave ?? urlWave;
    this.rec = new Recorder(seed, startWave);
    this.game2 = new Game(seed, readParams(), startWave);
    this.bot = DemoDriver.enabled && !replay ? new Bot(0.8, seed) : null;
    expose('seed', seed); expose('score', 0);

    this.add.image(0, 0, 'bg').setOrigin(0);
    // 夕方から始まり、刻が進むほど暗くなって夜になる
    this.dusk = this.add.image(0, 0, 'dusk').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
    this.moon = this.add.image(0, 0, 'moon_0').setAlpha(0);
    this.hi = load().best;
    this.selFx = this.add.graphics().setDepth(27);
    this.buildHouseImgs();
    this.fx = this.add.graphics().setDepth(5);
    this.slotFx = this.add.graphics().setDepth(4.5);
    // あせる時間: 画面がうっすら赤く脈打つ
    this.feverFx = this.add.rectangle(W / 2, H / 2, W, H, 0xff3050).setBlendMode(Phaser.BlendModes.ADD).setDepth(40).setAlpha(0);
    this.glowFx = this.add.graphics().setDepth(19).setBlendMode(Phaser.BlendModes.ADD);

    this.sparks = this.add.particles(0, 0, 'dot', {
      lifespan: 900, speed: { min: 20, max: 110 }, angle: { min: 200, max: 340 }, gravityY: -40,
      scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xfff2b0, 0xffd27a, 0xff9ec8],
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
      tint: [0xff5e8a, 0xffd23f, 0x5ee0ff, 0x9dff7a, 0xc77dff, 0xff9f40],
    }).setDepth(31);
    this.jet = this.add.particles(0, 0, 'glow', {
      lifespan: { min: 220, max: 380 }, speed: { min: 5, max: 20 }, angle: { min: 0, max: 360 },
      scale: { start: 0.16, end: 0.02 }, alpha: { start: 0.75, end: 0 }, blendMode: 'ADD', emitting: false,
    }).setDepth(14);
    this.prevPos.clear();
    this.smoke = this.add.particles(0, 0, 'glow', {
      lifespan: { min: 550, max: 800 }, speed: { min: 4, max: 14 }, angle: { min: 0, max: 360 }, gravityY: -14,
      scale: { start: 0.12, end: 0.42 }, alpha: { start: 0.32, end: 0 }, tint: [0xe8dcf0, 0xffd8b0, 0xd0c8e0], emitting: false,
    }).setDepth(9);
    // にじむ花火: ふんわりした大きな色の粒が、にじみながら飛んで消える
    this.bloom = this.add.particles(0, 0, 'glow', {
      lifespan: { min: 800, max: 1500 }, speed: { min: 30, max: 150 }, angle: { min: 0, max: 360 }, gravityY: 22,
      scale: { start: 0.4, end: 0.08 }, alpha: { start: 0.42, end: 0 }, blendMode: 'ADD', emitting: false,
      tint: [0xff5e8a, 0xffc23f, 0x4ed8ff, 0x8dff6a, 0xb57dff, 0xff8f40],
    }).setDepth(30);
    this.shards = this.add.particles(0, 0, 'shard', {
      lifespan: 700, speed: { min: 80, max: 220 }, gravityY: 300, rotate: { min: 0, max: 360 },
      scale: { start: 1, end: 0.4 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(31);

    // HUD(巻物の上の縁に)
    // HUD: 左にスコア(入るたびに跳ねる)、真ん中に刻、右にハイスコアと音
    this.scoreText = this.add.text(PAPER.x0 + 8, 18, '', txt(28)).setOrigin(0, 0.5).setDepth(50);
    this.watchText = this.add.text(W / 2, 18, '', txt(24, '#e8d6ff')).setOrigin(0.5).setDepth(50);
    this.hiText = this.add.text(PAPER.x1 - 84, 18, '', txt(22, '#ffb0e0')).setOrigin(1, 0.5).setDepth(50);
    const mute = this.add.text(PAPER.x1 - 8, 4, isMuted() ? '♪×' : '♪', txt(24, '#cfe')).setOrigin(1, 0).setDepth(50);
    this.shownScore = 0; this.scorePunch = false; this.rushId = -1; this.comboText = undefined; this.fullShown = false;
    this.aimTag = this.add.text(0, 0, '', pop(15, '#fff0d0', { strokeThickness: 4 })).setOrigin(0.5).setDepth(63).setVisible(false);
    if (this.player) this.add.text(W / 2, H - 22, t('replaying'), txt(14, '#aaf')).setOrigin(0.5).setDepth(50);
    else if (this.bot) this.add.text(W / 2, H - 22, t('demo'), txt(14, '#aaf')).setOrigin(0.5).setDepth(50);

    // ポーズ: ESC か、右上の II
    const pauseBtn = this.add.text(PAPER.x1 - 44, 4, 'II', txt(22, '#cfe')).setOrigin(1, 0).setDepth(50);
    void pauseBtn;
    this.input.keyboard?.on('keydown-ESC', () => { if (this.paused) this.resume(); else this.pause(); });
    this.offTap = onTap((x, y) => {
      if (this.paused) { this.pauseTap(x, y); return; }
      if (x > PAPER.x1 - 76 && x < PAPER.x1 - 34 && y < 34) { this.pause(); return; }
      // 右上の音ボタン
      if (x > PAPER.x1 - 34 && y < 34) { toggleMuted(); mute.setText(isMuted() ? '♪×' : '♪'); if (isMuted()) bgmStop(); else bgmStart(); }
    });
    // 投げるのは「離した所」。押している間(マウスは動かすだけでも)、投げた時の光の範囲と、連爆するかが見える。
    // 家を押して、そのまま投げたい所まで動かして離すと、その家から投げる
    this.offAim = onAim((phase, x, y) => {
      if (this.player || this.ended || this.bot || this.paused) { this.aimDown = null; this.aim = null; return; }
      const g = this.game2;
      if (phase === 'down') {
        if (x > PAPER.x1 - 76 && y < 34) { this.aimDown = null; return; }
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
      if (this.player || this.ended || this.bot || this.paused || g.selected < 0) return;
      const h = g.houses[g.selected];
      this.pending.push([h.x, h.y]);
    });
    this.events.once('shutdown', () => { this.offTap?.(); this.offTap = null; this.offAim?.(); this.offAim = null; offCancel(); bgmStop(); pauseAudio(false); });

    bgmStart();
    preloadSfx();
    this.updateHud();
  }

  update(_time: number, deltaMs: number) {
    if (this.paused) return;
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

  /** 家の絵を建てる(日が変わると家の数が変わるので建て直す) */
  private buildHouseImgs() {
    for (const o of this.houseImgs) { o.img.destroy(); o.glow.destroy(); o.hang.forEach((x) => x.destroy()); o.lamps.forEach((x) => x.destroy()); o.back.destroy(); o.aura.destroy(); o.wisps.forEach((x) => x.destroy()); o.peeks.forEach((x) => x.destroy()); }
    this.houseImgs = []; this.peek = [];
    for (const h of this.game2.houses) {
      const glow = this.add.image(h.x, h.y + 6, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.55);
      // 家の形 = この家から投げる提灯の光の形(縦の楼は縦、長屋は横)
      // 家の形はどれも同じ(撃てる光の形は軒先の提灯で分かる)。ひと回り大きく
      const key = 'house_hline';
      const img = this.add.image(h.x, h.y + 22, `${key}_lit`).setOrigin(0.5, 0.92).setScale(HOUSE_SCALE).setDepth(2);
      // 軒先の提灯 1 つ: この家から投げる光の形(数は数えない)
      const hang = [this.add.image(h.x + 48, h.y + HANG[0][1], `lantern_${h.piece}`).setScale(0.62).setDepth(4)];
      // 窓の向こうの暗がり(暗い家の窓は穴なので、その後ろに置く)
      const back = this.add.rectangle(h.x, h.y + 22 + (50 - 66.24) * HOUSE_SCALE, 48 * HOUSE_SCALE, 22 * HOUSE_SCALE, 0x15131c);
      back.setDepth(1.5).setVisible(false);
      // のっとられた家の青い魂のオーラと人魂(灯りのついた家・提灯の暖かい色と対比)
      const aura = this.add.image(h.x, h.y - 6, 'glow').setTint(0x4f7dff).setBlendMode(Phaser.BlendModes.ADD).setDepth(2.6).setVisible(false);
      const wisps = [0, 1, 2].map(() => this.add.image(h.x, h.y, 'wisp').setTint(0x8fd8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(2.7).setScale(0.55).setVisible(false));
      // 家の前の小さな灯り(あと何匹入られたらやられるか)。1 匹入るごとに 1 つ消える
      const nl = this.game2.P.houseHp;
      const lamps = nl > 1 ? Array.from({ length: nl }, (_, k) => this.add.image(h.x + (k - (nl - 1) / 2) * 15, h.y + 36, 'glow')
        .setTint(0xffc860).setBlendMode(Phaser.BlendModes.ADD).setScale(0.16).setDepth(4.5)) : [];
      this.houseImgs.push({ img, glow, hang, lamps, key, back, aura, wisps, peeks: [] });
    }
  }

  /** ポーズ: 止めて、戻る / この日のはじめから / タイトルへ を出す */
  private pause() {
    if (this.paused || this.ended) return;
    this.paused = true;
    this.aim = null; this.aimDown = null;
    snd.ui();
    pauseAudio(true);
    this.tweens.pauseAll(); this.time.paused = true;
    const g = this.game2;
    const c = this.add.container(0, 0).setDepth(200);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x0a0614, 0.7));
    c.add(this.add.text(W / 2, 150, t('paused'), pop(44, '#ffe27a')).setOrigin(0.5));
    const items = [t('resume'), `${dayName(dayOf(g.wave))}${t('restartDay')}`, t('toTitle')];
    this.pauseItems = items.map((s, i) => {
      const o = this.add.text(W / 2, 250 + i * 64, s, pop(26, '#fff6d8')).setOrigin(0.5);
      c.add(o); return o;
    });
    c.add(this.add.text(W / 2, 450, t('pauseHelp'), txt(14, '#bfb0d8')).setOrigin(0.5));
    this.pauseMenu = c;
    this.pauseSel = 0; this.markPause();
    const kb = this.input.keyboard;
    const nav = (e: KeyboardEvent) => {
      if (!this.paused) return;
      if (e.key === 'ArrowUp' || e.key === 'w') { this.pauseSel = (this.pauseSel + 2) % 3; this.markPause(); }
      else if (e.key === 'ArrowDown' || e.key === 's') { this.pauseSel = (this.pauseSel + 1) % 3; this.markPause(); }
      else if (e.key === 'Enter' || e.key === ' ') this.pick(this.pauseSel);
    };
    kb?.on('keydown', nav);
    this.pauseOff = () => kb?.off('keydown', nav);
  }
  private markPause() {
    this.pauseItems.forEach((o, i) => o.setColor(i === this.pauseSel ? '#ffe27a' : '#fff6d8').setScale(i === this.pauseSel ? 1.12 : 1));
  }
  private pauseTap(x: number, y: number) {
    const i = this.pauseItems.findIndex((o) => Phaser.Geom.Rectangle.Contains(Phaser.Geom.Rectangle.Inflate(o.getBounds(), 30, 12), x, y));
    if (i >= 0) this.pick(i);
  }
  private pick(i: number) {
    const g = this.game2;
    if (i === 0) { this.resume(); return; }
    this.resume(false);
    if (i === 1) this.scene.start('Play', { continueWave: dayOf(g.wave) * WAVES_PER_DAY, continues: this.continues });
    else this.scene.start('Title');
  }
  private resume(sound = true) {
    if (!this.paused) return;
    this.paused = false;
    this.pauseOff?.(); this.pauseOff = null;
    this.pauseMenu?.destroy(); this.pauseMenu = null;
    this.tweens.resumeAll(); this.time.paused = false;
    pauseAudio(false);
    if (sound) snd.ui();
    this.acc = 0;
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
      watch: g.wave, seconds: Math.floor(g.t), replay: this.rec.toString(), cleared: g.cleared, formations: g.formations, continues: this.continues,
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
        if (e.house >= 0) snd.lock(); else snd.unlock();
        break;
      case 'light':
        snd.place();
        this.sparks.explode(8, e.x, e.y);
        break;
      case 'deny': {
        snd.deny();
        // 画面に置ける数がいっぱい: その場に「3こまで!」
        // 「3こまで!」は 1 回だけ(置ける数が空くまで、もう出さない)
        if (e.full && !this.fullShown) {
          this.fullShown = true;
          const o = this.add.text(Phaser.Math.Clamp(e.x, 120, W - 120), Phaser.Math.Clamp(e.y - 30, 70, H - 80), t('maxOnField').replace('{n}', String(e.full)), pop(24, '#ffb0b0')).setOrigin(0.5).setDepth(62).setScale(0.4);
          this.tweens.add({ targets: o, scale: 1, duration: 180, ease: 'Back.Out' });
          this.tweens.add({ targets: o, angle: { from: -6, to: 6 }, yoyo: true, repeat: 2, duration: 90 });
          this.tweens.add({ targets: o, y: o.y - 18, alpha: 0, delay: 700, duration: 350, onComplete: () => o.destroy() });
        }
        break;
      }
      case 'ignite':
        this.sparks.explode(6, e.x, e.y - 6);
        break;
      case 'break': {
        snd.break(e.n);
        this.shards.explode(8, e.x, e.y);
        this.sparks.explode(10, e.x, e.y);
        this.bloom.explode(big0(e.n), e.x, e.y);
        // 花火: 光が伸びるのに合わせて、形の上の各所で火の粉が開く
        const piece = this.lanternPieceAt(e.x, e.y);
        const g = this.game2;
        // 連爆するほど、花火が大きく・多く・色とりどりに
        const big = e.n >= 2;
        const per = big ? Math.min(3 + e.n * 2, 14) : 3;
        for (const [px, py] of g.shapePoints(piece, e.x, e.y).filter((_, k) => k % (big ? 2 : 3) === 0)) {
          const d = Math.hypot(px - e.x, py - e.y);
          this.time.delayedCall((d / g.P.lightSpeed) * 1000, () => { (big ? this.fireworksBig : this.fireworks).explode(per, px, py); this.bloom.explode(big ? 2 : 1, px, py); });
        }
        if (big) {
          // 真ん中で大きな菊の花火 + 少し揺れる
          this.fireworksBig.explode(Math.min(8 + e.n * 7, 56), e.x, e.y);
          this.cameras.main.shake(90 + e.n * 20, 0.002 + Math.min(e.n, 6) * 0.0008);
          const ring = this.add.image(e.x, e.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint([0xff7eb6, 0xffd23f, 0x5ee0ff, 0x9dff7a][e.n % 4]).setScale(0.3).setDepth(29);
          this.tweens.add({ targets: ring, scale: 2.2 + e.n * 0.3, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => ring.destroy() });
        }
        this.afterglow.push({ piece, x: e.x, y: e.y, t: this.time.now, grow: e.grow });
        // コンボで強くなった: 「パワー 2!」(力が上がった時だけ)
        if (e.dmg > 1 && e.dmg !== this.lastDmgShown) this.popup(e.x, e.y - 30, `${t('power')} ${e.dmg}!`, e.dmg >= 3 ? '#ff9ec8' : '#9ff0ff', 18 + e.dmg * 3);
        this.lastDmgShown = e.n === 1 ? 1 : e.dmg;
        break;
      }
      case 'purify': {
        snd.purify(e.n);
        // やられた: 声と同じ言葉を吹き出しで(声が重なって鳴らない時は、種類ごとの言葉)
        const said = cry(e.n);
        this.say(e.x, e.y - 34, said ? t(`cry_${said}`) : t(`cry_kind_${e.kind}`), '#ffd0e8', true);
        this.sparks.explode(5, e.x, e.y);
        this.popup(e.x, e.y - 14, `${e.pts}`, e.n >= 3 ? '#ffe27a' : '#f3e6c8', 13 + Math.min(e.n, 8));
        if (e.n >= 2) this.showChain(e.n, e.x, e.y);
        break;
      }
      case 'chainEnd':
        snd.chainEnd(e.n);
        if (e.bonus > 0) this.combo(e.n, e.bonus, e.x, e.y);
        if (e.n >= 6) { this.hitstop = tune<number>('juice.hitstop'); this.cameras.main.shake(180, 0.006); }
        break;
      case 'formation':
        snd.relight();
        this.banner(`${t('formation')}!  +${e.bonus}`, e.x, e.y + 95, '#ffb0e0', 26);
        this.cameras.main.shake(160, 0.004);
        break;
      case 'clear':
        break;
      case 'hurt': {
        // 大きなおばけに光が当たった: 白く光って、かわいい悲鳴と一言
        snd.hurt();
        if (ouch()) { const w = t('ouch').split('|'); this.say(e.x + 18, e.y - 46, w[Math.floor(this.time.now / 97) % w.length], '#ffd0e8', true); }
        this.sparks.explode(14, e.x, e.y);
        this.popup(e.x, e.y - 40, e.dmg > 1 ? `-${e.dmg}!` : '!', '#ffb0e0', 30 + (e.dmg - 1) * 6);
        const big = this.game2.ghosts.find((q) => (q.kind === 'big' || q.kind === 'giant' || q.hp > 1) && Math.hypot(q.x - e.x, q.y - e.y) < 2);
        const sp = big ? [big.id, this.gSprites.get(big.id)!] as const : undefined;
        if (sp && sp[1] && big) { sp[1].setTint(0xffffff); this.flashUntil.set(big.id, this.time.now + 140); }
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
      case 'enter':
        // 仲間も同じ家へ入っていく(窓の中が、にぎやかになる)
        this.entered.add(e.ghost);
        (this.peek[e.house] ??= []).push(e.kind);
        snd.catch();
        break;
      case 'houseHit': {
        // 1 匹入った: 家の前の灯りが 1 つ消える(小さな ごーん)。家はまだ平気
        this.entered.add(e.ghost);
        snd.houseHit();
        this.cameras.main.shake(140, tune<number>('juice.shake') * 0.5);
        this.puff(e.x, e.y);
        const lp = this.houseImgs[e.house]?.lamps[e.hp];
        if (lp) { this.sparks.explode(8, lp.x, lp.y); this.tweens.add({ targets: lp, scale: { from: 0.4, to: 0.16 }, duration: 400 }); }
        break;
      }
      case 'houseOut':
        // おばけは家に入り込んだ(跳ね返らない): 窓から顔を出す。大きいのは目だけ見える
        if (e.ghost !== undefined) this.entered.add(e.ghost);
        this.peek[e.house] = [e.kind ?? 'fuwa'];
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
          // 日のはじめに、画面に置ける提灯の数(日が変わると 1 つ増える)
          const up = this.add.text(W / 2, H / 2 + 84, (dayOf(e.n) === 0 ? t('maxUp').replace('{n}', String(this.game2.maxOnField)) : t('reachUp')), pop(22, '#9ff0ff')).setOrigin(0.5).setDepth(56).setAlpha(0);
          this.tweens.add({ targets: up, alpha: 1, yoyo: true, hold: 1800, duration: 300, delay: 400, onComplete: () => up.destroy() });
        }
        if (first) {
          // 日のはじめ: かわいい声で「いちにちめ、むかえぼん!」→「おばけが、くるぞー!」
          sayDay(dayOf(e.n));
          this.time.delayedCall(1900, () => sayObake());
          const v = this.add.text(W / 2, H / 2 + 34, t('obakeComing'), txt(30, '#fff6c0', { strokeThickness: 7 })).setOrigin(0.5).setDepth(56).setScale(0.4);
          this.tweens.add({ targets: v, scale: 1, duration: 260, ease: 'Back.Out' });
          this.tweens.add({ targets: v, angle: { from: -4, to: 4 }, yoyo: true, repeat: 3, duration: 160 });
          this.tweens.add({ targets: v, alpha: 0, delay: 1600, duration: 400, onComplete: () => v.destroy() });
        }
        // 日の始まりは日付を大きく、ほかは「ウェーブ 2/3」
        const s = this.add.text(W / 2, H / 2 - 64, first ? `${dayName(dayOf(e.n))}  ${hourName(0)}` : hourName(waveInDay(e.n)), first ? pop(46, '#ffe27a') : pop(32, '#e8d6ff')).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(0.6);
        this.tweens.add({ targets: s, scale: 1, duration: 300, ease: 'Back.Out' });
        this.tweens.add({ targets: s, alpha: 1, yoyo: true, hold: first ? 1300 : 800, duration: 400, onComplete: () => s.destroy() });
        // ウェーブの題(何が来るか)。総力戦は赤く大きく、揺らして
        // 日のはじめ(日付と置ける数を出す時)は題を出さない(にぎやかすぎるので)
        const nm = first ? undefined : WAVE_NAMES[e.n];
        if (nm) {
          const last = e.n === WAVE_NAMES.length - 1;
          const tt = this.add.text(W / 2, H / 2 - 14, lang() === 'ja' ? nm.ja : nm.en, pop(last ? 40 : 24, last ? '#ff7e9e' : '#ffe9c0')).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(0.6);
          this.tweens.add({ targets: tt, alpha: 1, scale: 1, duration: 300, delay: 150, ease: 'Back.Out' });
          this.tweens.add({ targets: tt, alpha: 0, delay: first ? 1900 : 1400, duration: 400, onComplete: () => tt.destroy() });
          if (last) { this.cameras.main.shake(500, 0.006); this.tweens.add({ targets: tt, angle: { from: -5, to: 5 }, yoyo: true, repeat: 5, duration: 120, delay: 300 }); }
        }
        break;
      }
      case 'waveEnd': {
        snd.relight();
        const s = this.add.text(W / 2, H / 2 - 20, `${t('waveClear')}  +${e.bonus}`, txt(28, '#ffe27a')).setOrigin(0.5).setDepth(55).setAlpha(0);
        this.tweens.add({ targets: s, alpha: 1, yoyo: true, hold: 1100, duration: 350, onComplete: () => s.destroy() });
        break;
      }
      case 'fever': {
        // あせる時間: 曲が速くなり、おばけも速く(拍も速くなるので弾み方も速くなる)
        bgmRate(e.on ? this.game2.P.feverMult : 1);
        if (e.on) {
          snd.watch();
          const f = this.add.text(W / 2, H / 2 - 30, t('fever'), pop(40, '#ff7e9e')).setOrigin(0.5).setDepth(60).setScale(0.3);
          this.tweens.add({ targets: f, scale: 1, duration: 220, ease: 'Back.Out' });
          this.tweens.add({ targets: f, angle: { from: -6, to: 6 }, yoyo: true, repeat: 4, duration: 110 });
          this.tweens.add({ targets: f, alpha: 0, delay: 1300, duration: 400, onComplete: () => f.destroy() });
          this.cameras.main.shake(300, 0.004);
        }
        break;
      }
      case 'houses':
        // 次の日の家(数が変わる)を建て直す
        this.buildHouseImgs();
        break;
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

  /** コンボの瞬間: 倒すたびに「2コンボ!」「3コンボ!」…と、その場で勢いよく弾む(数が増えるほど大きく、色が変わる) */
  /** コンボの瞬間: 1 つの文字を書き換えていく(2コンボ → 3コンボ…)。増やさず、その場で弾んで色が変わる */
  private showChain(n: number, x: number, y: number) {
    const cols = ['#fff3c0', '#ffe27a', '#9ff0ff', '#b8ffb0', '#ffb0e0', '#c8a0ff'];
    const size = Math.min(26 + n * 2.5, 52);
    let o = this.comboText;
    if (!o || !o.active) {
      o = this.add.text(Phaser.Math.Clamp(x, 120, W - 120), Phaser.Math.Clamp(y - 48, 60, H - 60), '', pop(size, cols[n % cols.length], { strokeThickness: 6 })).setOrigin(0.5).setDepth(61);
      this.comboText = o;
    }
    this.tweens.killTweensOf(o);
    o.setText(`${n}${t('combo')}!`).setFontSize(size).setColor(cols[n % cols.length]).setAlpha(1).setScale(1.5).setAngle(n % 2 ? -8 : 8);
    // 新しく倒した所の方へ少し寄る(遠くへ飛ばない)
    const tx = Phaser.Math.Clamp(Phaser.Math.Linear(o.x, x, 0.35), 120, W - 120), ty = Phaser.Math.Clamp(Phaser.Math.Linear(o.y, y - 48, 0.35), 60, H - 60);
    this.tweens.add({ targets: o, x: tx, y: ty, scale: 1, angle: 0, duration: 170, ease: 'Back.Out' });
    this.tweens.add({ targets: o, y: ty - 30, alpha: 0, delay: 750, duration: 400, ease: 'Quad.In', onComplete: () => { o!.destroy(); if (this.comboText === o) this.comboText = undefined; } });
    if (n >= 4) this.cameras.main.shake(80, 0.002 + Math.min(n, 10) * 0.0004);
  }



  /** 灯りが消えた家から、家の人が逃げ出す(小さなドット絵が、画面の端まで走っていく) */
  private flee(x: number, y: number) {
    const cries = t('screams').split('|');
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? 1 : -1;
      const p = this.add.image(x, y - 4, 'px_run0').setDepth(26).setFlipX(dir < 0).setScale(1.6).setAlpha(0);
      // びっくりして家から大きく跳び出す(家より高く)→ 着地して走って逃げる
      const landX = x + dir * (40 + (i >> 1) * 28), groundY = y + 10;
      const jumpH = 185 + (i >> 1) * 45 + (i % 2) * 22, delay = i * 130, up = 690, down = 630; // 高く、ゆっくり(見やすく)
      this.tweens.add({ targets: p, alpha: 1, duration: 60, delay });
      this.tweens.add({ targets: p, x: landX, duration: up + down, delay, ease: 'Linear' });
      this.tweens.add({ targets: p, angle: dir * 360, duration: up + down, delay, ease: 'Quad.Out' });
      this.tweens.add({ targets: p, y: y - jumpH, duration: up, delay, ease: 'Quad.Out', onComplete: () => {
        this.tweens.add({ targets: p, y: groundY, duration: down, ease: 'Quad.In', onComplete: () => run() });
      } });
      // 叫び声: 文字(頭の上で揺れる)と、合成の声。人ごとに少しずつずらす
      const kind = i % 3, cry = cries[i % cries.length];
      const lift = 26 + (i >> 1) * 16;
      const bubble = this.add.text(x, y - 40, cry, txt(i % 2 ? 17 : 19, i % 2 ? '#ffe0e0' : '#fff6c0', { strokeThickness: 4 })).setOrigin(0.5).setDepth(57).setAlpha(0);
      this.tweens.add({ targets: bubble, alpha: 1, delay: delay + 60, duration: 120, hold: 1900, yoyo: true, onComplete: () => bubble.destroy() });
      snd.scream(kind, i * 0.13 + 0.05, 1 + (i - 1.5) * 0.06);
      const follow = this.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (!p.active || !bubble.active) { follow.remove(); return; }
        bubble.setPosition(p.x, p.y - lift + Math.sin(this.time.now / 60 + i) * 2).setAngle(Math.sin(this.time.now / 80 + i) * 8);
      } });
      const run = () => {
        if (!p.active) return;
        p.setAngle(0).setScale(1.15);
        const toX = dir > 0 ? W + 20 : -20;
        const dur = (Math.abs(toX - p.x) / (80 + i * 12)) * 1000;
        this.tweens.add({ targets: p, x: toX, duration: dur, ease: 'Linear', onComplete: () => p.destroy() });
        // 2 コマで走る + 少し跳ねる
        this.time.addEvent({ delay: 120, repeat: Math.ceil(dur / 120) + 3, callback: () => {
          if (!p.active) return;
          p.setTexture(p.texture.key === 'px_run0' ? 'px_run1' : 'px_run0'); p.y = groundY - (p.texture.key === 'px_run1' ? 2 : 0);
        } });
      };
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
    // その瞬間の「N コンボ!」は倒すたびに出しているので、締めはボーナスの点を大きく
    const head = this.add.text(xx, yy, `+${bonus}`, pop(size, cols[n % cols.length])).setOrigin(0.5).setDepth(62).setScale(0.2).setAngle(-8);
    const sub = this.add.text(xx, yy + size * 0.8, t('chainBonus'), pop(Math.round(size * 0.45), '#fff3c0')).setOrigin(0.5).setDepth(62).setScale(0).setAlpha(0);
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
    // お月さまの顔は日ごとに変わる(8/13 にこにこ → 8/14 わくわく → 8/15 大笑い)。拍に合わせてちょっと揺れる
    const moonKey = `moon_${Math.min(2, dayOf(nextW))}`;
    if (this.moon.texture.key !== moonKey) this.moon.setTexture(moonKey);
    this.moon.setPosition(PAPER.x1 - 110 - k * 140, 130 - this.nightK * 66).setScale(0.8).setAlpha(Math.min(1, this.nightK * 1.6))
      .setAngle(Math.sin(beatPos(time) * Math.PI / 2) * 6);

    this.slotFx.clear();
    this.feverFx.setAlpha(g.fever ? 0.05 + 0.04 * Math.abs(Math.sin(beatPos(time) * Math.PI)) : 0);
    if (g.lanterns.length < g.maxOnField) this.fullShown = false;
    g.houses.forEach((h, i) => {
      const o = this.houseImgs[i];
      // おばけが入り込んだ家: 中の人が騒いで灯りが揺れ、家が震える(消えるまでの間が、そのまま助けに行ける猶予)
      const panic = h.haunt > 0;
      const flick = panic ? (Math.sin(time * 37 + i) + Math.sin(time * 23)) > 0.3 : true;
      o.img.setTexture(`${o.key}_${h.lit && flick ? 'lit' : 'dark'}`);
      o.img.setPosition(h.x + (panic ? Math.sin(time * 60) * 1.5 : 0), h.y + 22);
      o.glow.setVisible(h.lit).setAlpha(panic ? (flick ? 0.5 : 0.15) : 0.45 + 0.1 * Math.sin(time * 3 + i));
      o.img.setScale(HOUSE_SCALE * (1 + h.flash * 0.25));
      // 入り込んだおばけ: 暗くなった家の窓から顔を出して、ゆらゆら(大きいのは目だけ)
      const pk = this.peek[i];
      // 暗い家: 窓は穴になっていて、後ろの暗がりが見える。入り込んだおばけは大きさそのまま窓の向こうにいて、
      // 窓から見える所だけ見える(大きいおばけは目のあたりだけ)
      const wy = o.back.y;
      o.back.setVisible(!h.lit);
      // のっとられた家: 家を覆う青白い魂がゆらゆら、まわりを人魂が回る
      o.aura.setVisible(!h.lit);
      if (!h.lit) {
        o.aura.setPosition(h.x + Math.sin(time * 0.9 + i) * 3, h.y - 10 + Math.sin(time * 1.4 + i) * 4)
          .setScale(1.35 + 0.12 * Math.sin(time * 2.2 + i), 1.6 + 0.15 * Math.sin(time * 1.7 + i)).setAlpha(0.45 + 0.15 * Math.sin(time * 3.1 + i));
        o.wisps.forEach((w, k) => {
          const a = time * (0.9 + k * 0.25) + (k * Math.PI * 2) / 3 + i;
          w.setVisible(true).setPosition(h.x + Math.cos(a) * 34, h.y - 14 + Math.sin(a) * 16 - Math.abs(Math.sin(time * 2 + k)) * 6)
            .setAlpha(0.55 + 0.35 * Math.sin(time * 4 + k + i)).setFlipX(Math.cos(a + Math.PI / 2) < 0);
        });
      } else o.wisps.forEach((w) => w.setVisible(false));
      const list = !h.lit && pk ? pk : [];
      if (h.lit) this.peek[i] = undefined;
      list.forEach((kind, j) => {
        const k = kind === 'big' ? 1.35 : kind === 'giant' ? 1.03 : 1;
        let im = o.peeks[j];
        if (!im) { im = this.add.image(h.x, wy, GHOST_TEX[kind]).setDepth(1.6 - j * 0.001); o.peeks[j] = im; }
        // 何匹も入ったら、窓の中で横に並んでゆらゆら
        const n = list.length, spread = Math.min(16, 40 / Math.max(1, n - 1));
        const sc = 0.66 * k, px = h.x + (j - (n - 1) / 2) * spread + Math.sin(time * 1.3 + i + j) * 4, py = wy + 2 + Math.sin(time * 2.1 + i + j * 1.7) * 2.5;
        im.setTexture(GHOST_TEX[kind]).setScale(sc).setTint(GHOST_TINT[kind] ?? 0xffffff).setPosition(px, py).setVisible(true);
        // 窓の外にはみ出す所は切る(おばけは窓からしか見えない)
        const b = o.back.getBounds(), fw = im.frame.width, fh = im.frame.height;
        const cx0 = Math.max(0, (b.x - px) / sc + fw / 2), cy0 = Math.max(0, (b.y - py) / sc + fh / 2);
        const cx1 = Math.min(fw, (b.right - px) / sc + fw / 2), cy1 = Math.min(fh, (b.bottom - py) / sc + fh / 2);
        if (cx1 > cx0 && cy1 > cy0) im.setCrop(cx0, cy0, cx1 - cx0, cy1 - cy0); else im.setVisible(false);
      });
      for (let j = list.length; j < o.peeks.length; j++) o.peeks[j].setVisible(false);
      // 軒先の提灯: この家の光の形を見せるだけ(数は数えない)
      o.lamps.forEach((lp, k) => {
        const on = h.lit && k < h.hp;
        // 残り 1 つになったら、最後の灯りが心細くまたたく
        lp.setVisible(h.lit).setTint(on ? 0xffc860 : 0x404058).setAlpha(on ? (h.hp === 1 ? 0.55 + 0.45 * Math.sin(time * 9) : 1) : 0.5);
      });
      o.hang.forEach((hg, k) => hg.setVisible(h.lit).setY(h.y + HANG[k][1] + Math.sin(time * 2 + k * 1.3 + i) * 1.2));
    });
    // 選んだ家: 家の人が提灯を掲げて待つ(家のマスの縁がほんのり明るい)
    this.selFx.clear();
    // カーソルを寄せた家: 押すと選ばれる(薄い輪が点滅)/ 選んだ家に寄せると、押すと外れる(はっきりした輪のまま点滅)
    const hover = this.aim && !this.ended ? g.houses.findIndex((h) => h.lit && Math.hypot(h.x - this.aim!.x, h.y - this.aim!.y) < HOUSE_R * 1.3) : -1;
    const ring = (i: number, a: number) => {
      const h = g.houses[i], r = 40 + 3 * Math.sin(time * 6);
      this.selFx.lineStyle(9, 0xff7eb6, 0.25 * a); this.selFx.strokeCircle(h.x, h.y - 10, r + 4);
      this.selFx.lineStyle(4, 0xff7eb6, 0.95 * a); this.selFx.strokeCircle(h.x, h.y - 10, r);
      this.selFx.lineStyle(2, 0xffffff, 0.8 * a); this.selFx.strokeCircle(h.x, h.y - 10, r - 4);
      this.selFx.fillStyle(0xff7eb6, 0.95 * a);
      const ay = h.y - r - 14 + 3 * Math.sin(time * 8);
      this.selFx.fillTriangle(h.x - 8, ay, h.x + 8, ay, h.x, ay + 10);
    };
    const blink = Math.sin(time * 12) > 0 ? 1 : 0;
    // 選んだ家: 色つきの太い輪で囲む(この家から続けて投げられる)。下に小さな矢印
    if (g.selected >= 0) ring(g.selected, hover === g.selected ? (blink ? 1 : 0.15) : 1);
    if (hover >= 0 && hover !== g.selected) ring(hover, blink ? 0.4 : 0.1);
    // 押すとどうなるかを一言: 選んでいない家は「発射位置ロック!」、選んだ家は「ロック解除!」
    this.hoverHouse = hover;
    if (hover >= 0) {
      const h = g.houses[hover];
      this.aimTag.setText(hover === g.selected ? t('unlock') : t('lock')).setColor(hover === g.selected ? '#ffd0e0' : '#ff9ec8')
        .setPosition(h.x, h.y - 66).setVisible(true).setAlpha(blink ? 1 : 0.6);
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
          s.glow.setTint(0xffd0a0).setScale(1.1).setAlpha(0.8);
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
      // 速いおばけ: 進む向きの反対へ、噴き出すような光の粒(上下に動いても自然に)
      if (gh.kind === 'kaze' || gh.kind === 'inazuma') {
        const pv = this.prevPos.get(gh.id);
        if (pv) {
          const vx = gh.x - pv[0], vy = gh.y - pv[1], d = Math.hypot(vx, vy);
          if (d > 0.3 && (Math.floor(time * 60) + gh.id) % 2 === 0) {
            this.jet.setParticleTint(gh.kind === 'kaze' ? 0xffe070 : 0x70e8ff);
            this.jet.emitParticleAt(gh.x - (vx / d) * 16, gh.y - (vy / d) * 16, 1);
          }
        }
        this.prevPos.set(gh.id, [gh.x, gh.y]);
      }
      // 最後の一匹: 急ぎだす時に一言
      if (g.rush() > 1 && this.rushId !== gh.form && !gh.dead) { this.rushId = gh.form; this.say(gh.x, gh.y - 34, t('rush'), '#ffb0b0', true, s); }
      // ときどき、種類ごとのセリフをしゃべる(画面にたくさん出すぎないよう 3 つまで)
      if (!gh.haunt && !gh.caught && gh.y > 70 && gh.age > 1.4 + (gh.id % 4) * 1.7 && !this.talked.has(gh.id) && this.bubbles.filter((b) => b.active).length < 3) {
        this.talked.add(gh.id);
        if (gh.id % 2 === 0 || gh.kind === 'big' || gh.kind === 'giant' || gh.kind === 'mega') {
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
      this.prevPos.delete(id);
      // やられた: 目が ＞＜(唐傘は ×)になって、くるっと回りながらぴょんと跳ね、昇って消える
      if (this.entered.has(id)) {
        // 家に入った: くるっと回らず、すうっと窓へ吸い込まれる
        this.entered.delete(id);
        // 大きさはそのまま、家の後ろ(窓の向こう)へ入る。あとは窓から一部だけ見える
        // (飛んでいた絵は消し、窓の向こうの絵に引き継ぐ。窓の外にはみ出さないように)
        s.destroy();
        continue;
      }
      const ko = `${s.texture.key.replace(/_(worry|cry)$/, '')}_ko`;
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
      if (linked[i]) this.outlineShape(l.piece, l.tx, l.ty, 0xffffff, 0.22, 1.5);
    });
    // 狙い: 離せばここへ飛ぶ。どの家の形の光が、どこまで届くか。連爆する提灯も、ほんのり光る
    if (this.aim && !this.ended) {
      const { x, y } = this.aim;
      const from = this.aim.from >= 0 ? this.aim.from : g.selected >= 0 && g.canThrow(g.selected) ? g.selected : g.launchHouse(x, y);
      const onHouse = g.houses.some((h) => Math.hypot(h.x - x, h.y - y) < HOUSE_R);
      const inField = x > PLAY.x0 && x < PLAY.x1 && y > PLAY.y0 && y < PLAY.y1 && !onHouse;
      const low = inField && y > GROUND_Y, full = g.lanterns.length >= g.maxOnField;
      // カーソルを見ているだけで分かるように: 置けない所・いっぱいの時は赤い × と一言、置ける時は「あと N」
      if (this.hoverHouse >= 0) { /* 家の一言(ロック / 解除)を出している */ }
      else if (low) this.aimTag.setVisible(false); // 家より下: 何も出さない(投げられないだけ)
      else if (inField && full) {
        // いっぱい: × や文字は出さない。置き場所の大きさの枠が点滅するだけ(下で描く)
        this.aimTag.setVisible(false);
      } else if (inField && from >= 0) {
        this.aimTag.setText(`${t('left')} ${g.maxOnField - g.lanterns.length}`).setColor('#fff0d0').setPosition(x + 30, y + 18).setVisible(true).setAlpha(0.6);
      } else this.aimTag.setVisible(false);
      const fullBlink = full && Math.sin(time * 30) < 0; // いっぱい: 速く点滅
      if (from >= 0 && inField && !low && !fullBlink) {
        const piece = g.houses[from].piece, me = { piece, tx: x, ty: y };
        const ok = !full;
        this.drawShape(piece, x, y, g.reach(piece), 0, ok ? 0xfff0c0 : 0x8080a0, 0.035);
        this.softEdge(piece, x, y, ok ? 0xfff0c0 : 0x8080a0, 0.07);
        // 連爆する提灯: 真っ白にはっきり光る(輪郭も白く脈打つ)。ここに置けばつながる、が一目でわかる
        const pulse = 0.5 + 0.5 * Math.sin(time * 10);
        // まだ飛んでいる提灯も、着く所で判定して光らせる(コンボになりうる所が先に分かる)
        // もう弾けはじめた提灯(誘爆の火が付いたもの)には、いま投げてもつながらない
        for (const l of g.lanterns) if (l.fuseLit === undefined && g.touches(me, l)) {
          this.chainTargets.add(l.id);
          this.drawShape(l.piece, l.tx, l.ty, g.reach(l.piece), 0, 0xffffff, 0.07 + 0.05 * pulse);
          this.outlineShape(l.piece, l.tx, l.ty, 0xffffff, 0.45 + 0.4 * pulse, 2.5);
        }
        // どの家から飛ぶか: 家がほんのり明るい
        const h = g.houses[from];
        // 家を選んでいない時は、飛び出す家から狙いまで細い点線(さりげなく)
        if (this.aim.from < 0 && g.selected < 0) {
          const d = Math.hypot(x - h.x, y - (h.y - 20)), n = Math.floor(d / 9);
          this.fx.fillStyle(0xfff0d0, 0.35);
          for (let i = 1; i < n; i++) this.fx.fillCircle(h.x + ((x - h.x) * i) / n, h.y - 20 + ((y - h.y + 20) * i) / n, 1.2);
        }
        this.glowFx.fillStyle(0xffe0a0, 0.12); this.glowFx.fillCircle(h.x, h.y, 30);
      }
    }
    if (!this.aim || this.ended) this.aimTag.setVisible(false);
    // 余韻: 光が通った形が、花火のあとのようにゆっくり薄れて消える
    const now = this.time.now;
    this.afterglow = this.afterglow.filter((a) => now - a.t < 1800);
    for (const a of this.afterglow) {
      const k = 1 - (now - a.t) / 1800;
      this.drawShape(a.piece, a.x, a.y, g.reach(a.piece) * a.grow, 0, 0xffc890, 0.12 * k * k, 1 + (a.grow - 1) * 0.5);
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
    // 斜め: 向き (dx, dy) に from〜to、幅 w の帯(四角形を回したもの)
    const diag = (dx: number, dy: number) => fx.fillPoints(stripPts(x, y, dx, dy, from, to, w), true);
    switch (piece) {
      case 'vline': seg(0, -1); seg(0, 1); break;
      case 'hline': seg(-1, 0); seg(1, 0); break;
      case 'up': seg(0, -1); break;
      case 'down': seg(0, 1); break;
      case 'cross': seg(0, -1); seg(0, 1); seg(-1, 0); seg(1, 0); break;
      case 'area': fx.fillCircle(x, y, to); break;
      case 'dr': diag(R2, -R2); diag(-R2, R2); break;
      case 'dl': diag(-R2, -R2); diag(R2, R2); break;
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
        case 'dr': fx.strokePoints(stripPts(x, y, R2, -R2, -L, L, w), true, true); break;
        case 'dl': fx.strokePoints(stripPts(x, y, -R2, -R2, -L, L, w), true, true); break;
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
      case 'dr': fx.strokePoints(stripPts(x, y, R2, -R2, -L, L, w), true, true); break;
      case 'dl': fx.strokePoints(stripPts(x, y, -R2, -R2, -L, L, w), true, true); break;
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
    const L = g.reach(b.piece) * b.grow, band = g.band, wid = 1 + (b.grow - 1) * 0.5;
    const head = Math.min(L, b.ext), tail = Math.max(0, b.ext - band);
    if (head <= tail) return;
    const fade = b.ext > L ? Math.max(0, 1 - (b.ext - L) / band) : 1;
    // 真っ白にしない: 光ごとに色を変え(桃・金・水・若草・藤)、芯も淡い色。主役は色とりどりの粒(花火)
    const [outer, inner] = BLAST_COLS[b.id % BLAST_COLS.length];
    this.drawShape(b.piece, b.x, b.y, head, tail, outer, 0.2 * fade, 1.35 * wid);
    this.drawShape(b.piece, b.x, b.y, head, tail, inner, 0.22 * fade, 0.8 * wid);
    if (tail <= 0) { this.glowFx.fillStyle(inner, 0.25 * fade); this.glowFx.fillCircle(b.x, b.y, 12); }
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
    // 大入道・大大入道: 大きさはそのまま。力が減るほど顔と色が変わる(焦る → もうやられそう。数字は出さない)
    const k = gh.kind === 'big' ? 1.35 : gh.kind === 'giant' ? 1.03 : gh.kind === 'mega' ? 1 : 1;
    if (gh.kind === 'big' || gh.kind === 'giant' || gh.kind === 'mega') {
      const max = gh.kind === 'big' ? this.game2.P.bigHp : gh.kind === 'giant' ? this.game2.P.giantHp : this.game2.P.megaHp, r = gh.hp / max;
      const stage = r > 0.67 ? 0 : r > 0.34 ? 1 : 2;
      const key = stage === 0 ? GHOST_TEX[gh.kind] : `${GHOST_TEX[gh.kind]}_${stage === 1 ? 'worry' : 'cry'}`;
      if (s.texture.key !== key) s.setTexture(key);
      const tints = gh.kind === 'big' ? [0xffd6ea, 0xffb48a, 0xff7a7a] : gh.kind === 'giant' ? [0xd8c8ff, 0xffa8d0, 0xff7070] : [0xffe0a0, 0xffb070, 0xff6a6a];
      if ((this.flashUntil.get(gh.id) ?? 0) < this.time.now) s.setTint(tints[stage]);
    }
    s.setPosition(gh.x + ox, gh.y + oy + bob * k).setScale(sx * 0.66 * k, sy * 0.66 * k).setAlpha(alpha).setFlipX(gh.face < 0);
    // 唐傘は折れるたびに傘を傾ける / 鬼火は揺らめく
    s.setAngle((gh.kind === 'kasa' ? gh.face * 10 : 0) + Math.sin((bp * Math.PI) / 2 + (gh.id % 2) * Math.PI) * 8);
  }
}
