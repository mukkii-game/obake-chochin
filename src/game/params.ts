// ゲームの中身が使う数値を tuning から 1 か所で読む。bot のシミュレーションでも同じものを使う。
import { tune } from '../core/tuning';

export function readParams() {
  return {
    pieceSet: tune<string>('piece.set'),
    maxLanterns: tune('lantern.max'),
    ammoPerHouse: tune('lantern.perHouse'),
    regenTime: tune('lantern.regen'),
    flySpeed: tune('lantern.speed'),
    hangTime: tune('lantern.hang'),
    damCap: tune('ghost.dam'),
    lineRange: tune('light.line'),
    areaRange: tune('light.area'),
    lightSpeed: tune('light.speed'),
    lightHold: tune('light.hold'),
    relightAt: tune('chain.relightAt'),
    basePts: tune('score.base'),
    hauntTime: tune('house.haunt'),
    ghostSpeed: tune('ghost.speed'),
    speedRamp: tune('ghost.speedRamp'),
    zigLen: tune('ghost.zig'),
    curveStart: tune('ghost.curveStart'),
    curveTurn: tune('ghost.curveTurn'),
    waveBonus: tune('wave.bonus'),
  };
}
export type Params = ReturnType<typeof readParams>;
