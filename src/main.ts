import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { Play } from './scenes/Play';
import { Result } from './scenes/Result';
import { installTuning } from './core/tuning';

// 論理解像度。縦長スマホ向けなら 540x960、横長なら 960x540 に変える。
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 720;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#111111',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { gamepad: true, activePointers: 3 },
  scene: [Boot, Title, Play, Result],
};

new Phaser.Game(config);
installTuning();
