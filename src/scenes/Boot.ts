import Phaser from 'phaser';
import { expose } from '../core/demo';
import { META } from '../core/meta';
import { makeArt } from '../game/art';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    // 絵はすべて src/game/art.ts で手続き的に描く。人間の絵(assets/mine/)に差し替える時はここで load する。
  }
  create() {
    expose('version', META.version);
    expose('scene', 'Boot');
    makeArt(this);
    this.scene.start('Title');
  }
}
