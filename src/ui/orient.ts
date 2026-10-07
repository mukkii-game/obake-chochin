// 画面の向きと大きさ。スマホを縦持ちで開いた時は、ゲームの画面を 90 度回して全面に出す。
// アプリ内ブラウザ(Claude・X・LINE など)は向きが縦に固定されることがあり、ページからは横向きにできないため。
// 縮尺は Phaser の FIT に任せず自前で決める(FIT は親の見た目の大きさを見るので、回すと縦長と誤解する)。
import Phaser from 'phaser';

let rotated = false;
/** いま 90 度回して表示しているか(タップ位置の変換に使う) */
export function isRotated() { return rotated; }

export function installOrient(game: Phaser.Game) {
  const box = document.getElementById('game-container')!;
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const layout = () => {
    const w = window.innerWidth, h = window.innerHeight;
    rotated = touch && h > w * 1.1;
    if (rotated) {
      box.style.cssText = `position:fixed;top:0;left:${w}px;width:${h}px;height:${w}px;`
        + 'transform-origin:0 0;transform:rotate(90deg);display:flex;align-items:center;justify-content:center';
    } else box.style.cssText = '';
    const aw = rotated ? h : w, ah = rotated ? w : h;
    game.scale.setZoom(Math.min(aw / game.scale.width, ah / game.scale.height));
  };
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 250));
  layout();
}
