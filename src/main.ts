import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { Play } from './scenes/Play';
import { Result } from './scenes/Result';
import { Ending } from './scenes/Ending';
import { installTuning } from './core/tuning';
import { installTaps } from './ui/taps';
import { installOverlay } from './ui/overlay';
import { installOrient } from './ui/orient';
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
  // 縮尺と向きは src/ui/orient.ts が決める(縦持ちのスマホでは 90 度回して全面に出す)
  scale: { mode: Phaser.Scale.NONE },
  input: { gamepad: false, activePointers: 3 },
  scene: [Boot, Title, Play, Ending, Result],
};

const game = new Phaser.Game(config);
game.events.once('ready', () => { installOrient(game); installTaps(game); });
installTuning();
installOverlay();
