import Phaser from 'phaser';
import { expose } from '../core/demo';
import { META } from '../core/meta';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    // 作品の素材はここで this.load.image(...) 等。雛形は素材なし。
  }
  create() {
    expose('version', META.version);
    expose('scene', 'Boot');
    this.scene.start('Title');
  }
}
