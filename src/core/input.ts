// キー + ポインタ + ゲームパッドを 1 つの状態に統合する薄い層。
// 画面左半分のドラッグ = 移動、右半分のタップ = ボタン(過去作 4 本で同形)。
import Phaser from 'phaser';
import { unlock } from './audio';

export interface InputState {
  left: boolean; right: boolean; up: boolean; down: boolean;
  /** 押した瞬間だけ true(1 フレーム) */
  action: boolean;
  /** 左半面ドラッグの水平量(-1..1) */
  axisX: number;
}

export class UnifiedInput {
  state: InputState = { left: false, right: false, up: false, down: false, action: false, axisX: 0 };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private actionQueued = false;
  private dragStart: { x: number; id: number } | null = null;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.keys = kb.addKeys('W,A,S,D,SPACE,ENTER,Z,X') as Record<string, Phaser.Input.Keyboard.Key>;
      kb.on('keydown', (e: KeyboardEvent) => {
        unlock();
        if (['Space', 'Enter', 'KeyZ', 'KeyX'].includes(e.code)) this.actionQueued = true;
      });
    }
    scene.input.addPointer(2);
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlock();
      if (p.x < scene.scale.width / 2) this.dragStart = { x: p.x, id: p.id };
      else this.actionQueued = true;
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.dragStart && p.id === this.dragStart.id) this.dragStart = null;
    });
  }

  /** scene.update() の先頭で呼ぶ */
  update() {
    const s = this.state;
    const c = this.cursors, k = this.keys;
    const pad = this.scene.input.gamepad?.getPad(0);
    s.left = !!(c?.left.isDown || k?.A.isDown || (pad && (pad.left || pad.leftStick.x < -0.4)));
    s.right = !!(c?.right.isDown || k?.D.isDown || (pad && (pad.right || pad.leftStick.x > 0.4)));
    s.up = !!(c?.up.isDown || k?.W.isDown || (pad && (pad.up || pad.leftStick.y < -0.4)));
    s.down = !!(c?.down.isDown || k?.S.isDown || (pad && (pad.down || pad.leftStick.y > 0.4)));
    if (pad && (pad.A || pad.B)) this.actionQueued = true;

    s.axisX = 0;
    if (this.dragStart) {
      const p = this.scene.input.manager.pointers.find(q => q.id === this.dragStart!.id);
      if (p && p.isDown) s.axisX = Phaser.Math.Clamp((p.x - this.dragStart.x) / 60, -1, 1);
    }
    s.action = this.actionQueued;
    this.actionQueued = false;
  }
}
