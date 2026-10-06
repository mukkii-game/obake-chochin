import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { Play } from './scenes/Play';
import { Result } from './scenes/Result';
import { installTuning } from './core/tuning';
import { installTaps } from './ui/taps';
import { installOverlay } from './ui/overlay';
import { W, H } from './game/logic';

// 論理解像度。横長の巻物なので 960x540(16:9)
export const GAME_WIDTH = W;
export const GAME_HEIGHT = H;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0d0907',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { gamepad: false, activePointers: 3 },
  scene: [Boot, Title, Play, Result],
};

const game = new Phaser.Game(config);
game.events.once('ready', () => installTaps(game));
installTuning();
installOverlay();
