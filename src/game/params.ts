// ゲームの中身が使う数値を tuning から 1 か所で読む。bot のシミュレーションでも同じものを使う。
import { tune } from '../core/tuning';

export function readParams() {
  return {
    maxLanterns: tune('lantern.max'),
    attractR: tune('lantern.attract'),
    lanternLife: tune('lantern.life'),
    burstR: tune('lantern.burst'),
    burstPer: tune('lantern.burstPer'),
    tapR: tune('lantern.tapR'),
    orbitR: tune('lantern.orbit'),
    chainR: tune('chain.radius'),
    chainDelay: tune('chain.delay'),
    relightAt: tune('chain.relightAt'),
    basePts: tune('score.base'),
    wispLife: tune('wisp.life'),
    wispAttract: tune('wisp.attract'),
    wispPop: tune('wisp.pop'),
    ghostSpeed: tune('ghost.speed'),
    speedRamp: tune('ghost.speedRamp'),
    rate0: tune('spawn.rate0'),
    rateGrow: tune('spawn.rateGrow'),
    zigAt: tune('spawn.zigAt'),
    hopAt: tune('spawn.hopAt'),
    kiraiAt: tune('spawn.kiraiAt'),
    groupAt: tune('spawn.groupAt'),
  };
}
export type Params = ReturnType<typeof readParams>;
