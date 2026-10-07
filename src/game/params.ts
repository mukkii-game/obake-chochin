// ゲームの中身が使う数値を tuning から 1 か所で読む。bot のシミュレーションでも同じものを使う。
import { tune } from '../core/tuning';

export function readParams() {
  return {
    pieceSet: tune<string>('piece.set'),
    wallCount: tune('maze.walls'),
    maxLanterns: tune('lantern.max'),
    ammoPerHouse: tune('lantern.perHouse'),
    flySpeed: tune('lantern.speed'),
    lureN: tune('lure.n'),
    capture: tune('lure.capture'),
    lineRange: tune('light.line'),
    areaRange: tune('light.area'),
    lightSpeed: tune('light.speed'),
    lightHold: tune('light.hold'),
    wispDelay: tune('wisp.delay'),
    wispReach: tune<boolean>('wisp.reach'),
    relightAt: tune('chain.relightAt'),
    basePts: tune('score.base'),
    hauntTime: tune('house.haunt'),
    ghostSpeed: tune('ghost.speed'),
    speedRamp: tune('ghost.speedRamp'),
    waveBase: tune('wave.base'),
    waveGrow: tune('wave.grow'),
    salvoGap: tune('wave.gap'),
    salvoGapMin: tune('wave.gapMin'),
    convoyGap: tune('wave.convoy'),
    portalEvery: tune('wave.portalEvery'),
    waveBonus: tune('wave.bonus'),
    ammoBonus: tune('wave.ammoBonus'),
  };
}
export type Params = ReturnType<typeof readParams>;
