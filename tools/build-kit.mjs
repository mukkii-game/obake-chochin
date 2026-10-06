// 公開キットを作る。
//
// 狙い(会議室 topics/05 の決定): 各サイトへの投稿は半自動でよい。ただし
// 「毎回、素材を探して文面を整え直す」時間を消す。ビルドのたびに、iPhone
// から開ける 1 ページへ、ZIP・画像・日英の文面・投稿画面へのリンク・
// 投稿状況を全部まとめる。
//
// 使い方: node tools/build-kit.mjs [dist] [publish.json]
// 出力  : <dist>/kit/index.html (画像は <dist>/kit/assets/ へ複写)
//
// 依存なし。どのゲームリポジトリへ持って行っても publish.json だけで動く。
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] || 'dist';
const SPEC = process.argv[3] || 'publish.json';
const KIT = path.join(DIST, 'kit');
const ASSET_SRC = path.join('kit', 'assets');
// 起動確認(tools/check.mjs)が毎回撮るスクショ。人間が kit/assets に置かなくても画像が出る。
const SHOT_SRC = path.join('tools', 'out');

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const text = (id) => spec.texts.find((t) => t.id === id);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 素材を集める。無ければ無いでページは出る(その旨を出す)。
fs.mkdirSync(path.join(KIT, 'assets'), { recursive: true });
let media = [];
if (fs.existsSync(ASSET_SRC)) {
  media = fs.readdirSync(ASSET_SRC)
    .filter((f) => /\.(png|jpe?g|gif|webm|mp4)$/i.test(f))
    .sort();
  for (const f of media) fs.copyFileSync(path.join(ASSET_SRC, f), path.join(KIT, 'assets', f));
}
if (fs.existsSync(SHOT_SRC)) {
  for (const f of fs.readdirSync(SHOT_SRC).filter((f) => /\.(png|webm)$/i.test(f)).sort()) {
    const name = `shot-${f}`;
    fs.copyFileSync(path.join(SHOT_SRC, f), path.join(KIT, 'assets', name));
    media.push(name);
  }
}
const images = media.filter((f) => /\.(png|jpe?g|gif)$/i.test(f));
const videos = media.filter((f) => /\.(webm|mp4)$/i.test(f));

// ZIP は CI(または手元)が dist/kit へ置く。無い時はリンクを出さない。
const zipHref = spec.zipName && fs.existsSync(path.join(KIT, spec.zipName)) ? spec.zipName : null;

const built = new Date().toISOString().slice(0, 16).replace('T', ' ');

const textBlock = (t) => `
      <div class="t" data-id="${esc(t.id)}">
        <div class="thead"><span>${esc(t.label)}</span><button class="copy" type="button">コピー</button></div>
        <pre class="body">${esc(t.body)}</pre>
      </div>`;

const siteCard = (s) => {
  const blocks = (s.use || []).map(text).filter((t) => t && t.body && t.body.trim()).map(textBlock).join('');
  return `
  <section class="site" data-site="${esc(s.id)}">
    <h2>${esc(s.label)}${s.auto ? ' <span class="auto">自動</span>' : ''}</h2>
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
    <p class="row">
      <a class="btn" href="${esc(s.uploadUrl)}" target="_blank" rel="noopener">投稿ページを開く</a>
      ${zipHref && !s.auto ? `<a class="btn" href="${esc(zipHref)}" download>ZIP</a>` : ''}
    </p>
    <label class="status">状態
      <select class="st">
        <option value="todo">未投稿</option>
        <option value="posted">投稿済み</option>
        <option value="live">公開確認済み</option>
      </select>
    </label>
    <label class="status">公開URL
      <input class="url" type="url" inputmode="url" placeholder="公開されたら貼る(文面の {{URL}} に入ります)">
    </label>
    ${blocks}
  </section>`;
};

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>公開キット — ${esc(spec.title)}</title>
<style>
:root{color-scheme:dark;--bg:#12141a;--card:#1b1f28;--line:#2c323f;--fg:#e8ecf3;--sub:#9aa5b8;--acc:#5aa9ff}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);
 font:15px/1.7 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:17px;margin:0 0 8px}
.sub{color:var(--sub);font-size:13px;margin:0 0 16px}
a{color:var(--acc)}
.btn{display:inline-block;padding:10px 14px;margin:0 8px 8px 0;border:1px solid var(--line);
 border-radius:10px;background:#232936;color:var(--fg);text-decoration:none;font-size:14px}
button.btn,button.copy{cursor:pointer;font-family:inherit}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin:0 0 14px}
.note{color:var(--sub);font-size:13px;margin:0 0 10px}
.row{margin:0 0 6px}
.auto{font-size:12px;color:#7fd18a;border:1px solid #33643c;border-radius:6px;padding:1px 6px;vertical-align:middle}
.status{display:block;font-size:13px;color:var(--sub);margin:0 0 8px}
select,input{width:100%;margin-top:4px;padding:9px;border-radius:8px;border:1px solid var(--line);
 background:#141821;color:var(--fg);font:inherit;font-size:14px}
.t{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}
.thead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;color:var(--sub)}
.copy{padding:6px 12px;border:1px solid var(--line);border-radius:8px;background:#232936;color:var(--fg);font-size:13px}
.copy.done{background:#1f4d2b;border-color:#2f7a42}
pre.body{white-space:pre-wrap;word-break:break-word;margin:6px 0 0;font:inherit;font-size:14px}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.shots a{display:block}
.shots img{width:100%;border-radius:8px;border:1px solid var(--line);display:block}
video{width:100%;max-height:46vh;background:#000;border-radius:8px;border:1px solid var(--line)}
footer{color:var(--sub);font-size:12px;text-align:center;padding:8px 0 24px}
[data-st=posted]{border-color:#5a4b1f}
[data-st=live]{border-color:#2f7a42}
</style>
</head>
<body>
<h1>公開キット — ${esc(spec.title)}</h1>
<p class="sub">${esc(built)} 版 / 作者 ${esc(spec.author || '')} ・
 <a href="../" >ゲームを開く</a></p>

<section>
  <h2>素材</h2>
  <p class="row">
    ${zipHref ? `<a class="btn" href="${esc(zipHref)}" download>配布用 ZIP</a>` : '<span class="note">ZIP は未同梱(CI が置きます)</span>'}
    <a class="btn" href="${esc(spec.playUrl)}" target="_blank" rel="noopener">公開中のページ</a>
  </p>
  ${videos.map((v) => `<video controls playsinline preload="metadata" src="assets/${esc(v)}"></video>
  <p class="row"><a class="btn" href="assets/${esc(v)}" download>動画を保存</a></p>`).join('')}
  ${images.length
    ? `<div class="shots">${images.map((f) =>
        `<a href="assets/${esc(f)}" target="_blank" rel="noopener"><img loading="lazy" src="assets/${esc(f)}" alt="${esc(f)}"></a>`).join('')}</div>
       <p class="note">長押しで保存できます。サムネイルは「シューティング中」か「ボス戦」が一番強い。</p>`
    : '<p class="note">画像は kit/assets/ に置くとここへ出ます。</p>'}
</section>

${spec.sites.map(siteCard).join('')}

<footer>この 1 ページで足りるようにしてあります。状態と URL はこの端末に保存されます。</footer>
<script>
const KEY = 'publish-kit:' + ${JSON.stringify(spec.slug)};
const PLAY = ${JSON.stringify(spec.playUrl || '')};
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
const state = load();

// {{URL}} は「そのサイトの公開URL」。まだ無ければ遊べる場所(Pages)を入れる。
function resolve(section, body) {
  const url = section.querySelector('.url').value.trim() || PLAY;
  return body.split('{{URL}}').join(url);
}

for (const section of document.querySelectorAll('.site')) {
  const id = section.dataset.site;
  const st = section.querySelector('.st');
  const url = section.querySelector('.url');
  const saved = state[id] || {};
  if (saved.st) st.value = saved.st;
  if (saved.url) url.value = saved.url;
  section.dataset.st = st.value;

  const put = () => {
    state[id] = { st: st.value, url: url.value };
    section.dataset.st = st.value;
    save(state);
  };
  st.addEventListener('change', put);
  url.addEventListener('change', put);

  for (const block of section.querySelectorAll('.t')) {
    const btn = block.querySelector('.copy');
    btn.addEventListener('click', async () => {
      const body = resolve(section, block.querySelector('.body').textContent);
      try {
        await navigator.clipboard.writeText(body);
      } catch {
        // iOS の一部やファイル直開きでは clipboard API が使えない。選択に落とす。
        const r = document.createRange();
        r.selectNodeContents(block.querySelector('.body'));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
      btn.textContent = 'コピーした';
      btn.classList.add('done');
      setTimeout(() => { btn.textContent = 'コピー'; btn.classList.remove('done'); }, 1600);
    });
  }
}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(KIT, 'index.html'), html);
console.log(`[kit] ${path.join(KIT, 'index.html')}`);
console.log(`[kit] サイト ${spec.sites.length} / 文面 ${spec.texts.length} / 画像 ${images.length} / 動画 ${videos.length} / ZIP ${zipHref || 'なし'}`);
