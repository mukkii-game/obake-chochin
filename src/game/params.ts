// ゲームの中身が使う数値を tuning から 1 か所で読む。bot のシミュレーションでも同じものを使う。
import { tune } from '../core/tuning';

export function readParams() {
  return {
    pieceSet: tune<string>('piece.set'),
    maxLanterns: tune('lantern.max'),
    ammoPerHouse: tune('lantern.perHouse'),
    regenTime: tune('lantern.regen'),
    flySpeed: tune('lantern.speed'),
    fuse: tune('lantern.fuse'),
    catchR: tune('lantern.catch'),
    grabR: tune('lantern.grab'),
    queueGap: tune('ghost.queue'),
    lastRush: tune('ghost.last'),
    lineReach: tune('light.line'),
    lightWidth: tune('light.width'),
    areaReach: tune('light.area'),
    lightSpeed: tune('light.speed'),
    lightHold: tune('light.hold'),
    relightAt: tune('chain.relightAt'),
    basePts: tune('score.base'),
    ghostSpeed: tune('ghost.speed'),
    loopR: tune('ghost.loop'),
    bigHp: tune('ghost.bigHp'),
    bigPts: tune('score.big'),
    giantHp: tune('ghost.giantHp'),
    giantPts: tune('score.giant'),
    waveBonus: tune('wave.bonus'),
    chainBonus: tune('score.chain'),
    formBonus: tune('score.formation'),
  };
}
export type Params = ReturnType<typeof readParams>;
