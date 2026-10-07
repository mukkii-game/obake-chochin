// ゲームの中身が使う数値を tuning から 1 か所で読む。bot のシミュレーションでも同じものを使う。
import { tune } from '../core/tuning';

export function readParams() {
  return {
    maxLanterns: tune('lantern.max'),
    ammoPerHouse: tune('lantern.perHouse'),
    flySpeed: tune('lantern.speed'),
    fuse: tune('lantern.fuse'),
    tapR: tune('lantern.tapR'),
    lureR: tune('lure.r'),
    repelR: tune('kirai.r'),
    blastR: tune('blast.r'),
    blastDur: tune('blast.dur'),
    chainR: tune('chain.radius'),
    chainDelay: tune('chain.delay'),
    chainDur: tune('chain.dur'),
    relightAt: tune('chain.relightAt'),
    basePts: tune('score.base'),
    wispLife: tune('wisp.life'),
    wispPop: tune('wisp.pop'),
    hauntTime: tune('house.haunt'),
    ghostSpeed: tune('ghost.speed'),
    speedRamp: tune('ghost.speedRamp'),
    hopDist: tune('ghost.hopDist'),
    zigLeg: tune('ghost.zigLeg'),
    waveBase: tune('wave.base'),
    waveGrow: tune('wave.grow'),
    salvoGap: tune('wave.gap'),
    salvoGapMin: tune('wave.gapMin'),
    portalEvery: tune('wave.portalEvery'),
    waveBonus: tune('wave.bonus'),
    ammoBonus: tune('wave.ammoBonus'),
  };
}
export type Params = ReturnType<typeof readParams>;
