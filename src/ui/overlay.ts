// 画面の隅の BUILD ID、?debug=1 の生イベント表示、version.json による古いキャッシュの自動リロード、
// いずれもゲーム本体とは独立(失敗しても遊べる)。縦持ちの時は src/ui/orient.ts が画面を回す。
import { META, query } from '../core/meta';
import { tapStats, lastTap } from './taps';

export function installOverlay() {
  const tag = document.createElement('div');
  tag.textContent = `b:${META.buildId}`;
  tag.style.cssText = 'position:fixed;left:4px;bottom:2px;font:10px monospace;color:rgba(255,255,255,.28);pointer-events:none;z-index:50';
  document.body.append(tag);

  if (query.has('debug')) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:4px;top:4px;font:11px monospace;color:#0f0;background:rgba(0,0,0,.6);padding:4px;pointer-events:none;z-index:60;white-space:pre';
    document.body.append(box);
    let frames = 0, fps = 0, last = performance.now();
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last > 1000) { fps = frames; frames = 0; last = now; }
      box.textContent = `fps ${fps}\n` + Object.entries(tapStats).map(([k, v]) => `${k} ${v}`).join('\n')
        + `\nlast ${lastTap.src} ${lastTap.x},${lastTap.y}`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  checkVersion();
}

/** 公開先の version.json と違う BUILD なら、1 回だけ読み直す(itch.io の古い index.html 対策) */
function checkVersion() {
  if (META.sha === 'local') return;
  try {
    const probe = new URL('version.json', document.baseURI);
    probe.searchParams.set('_', String(Date.now()));
    fetch(probe.toString(), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.build || d.build === META.buildId) return;
        const here = new URL(location.href);
        if (here.searchParams.get('v') === d.build) return; // 無限リロード防止
        here.searchParams.set('v', d.build);
        location.replace(here.toString());
      })
      .catch(() => {});
  } catch { /* 無視 */ }
}
