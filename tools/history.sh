#!/usr/bin/env bash
# これまでの版を遊べるように: tools/history.txt の各版(番号 sha 説明)をビルドして、history ブランチに置く。
# main の公開(build-and-deploy.yml)が history ブランチを /history/ に載せる。
# 版を足す時: tools/history.txt に 1 行足して `bash tools/history.sh` → history ブランチを push。
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
TMP=$(mktemp -d); OUT="$TMP/out"; mkdir -p "$OUT"
git worktree add -q --detach "$TMP/wt" HEAD
ln -s "$ROOT/node_modules" "$TMP/wt/node_modules"
while read -r n sha label; do
  (cd "$TMP/wt" && git checkout -q "$sha" && rm -rf dist && npm run build >/dev/null 2>&1 && cp -r dist "$OUT/$n-$sha") && echo "ok $n $sha" || echo "FAIL $n $sha"
done < tools/history.txt
git worktree remove --force "$TMP/wt"
python3 - "$OUT" tools/history.txt <<'PY'
import sys, subprocess, html
out, lst = sys.argv[1], sys.argv[2]
rows = []
for line in open(lst, encoding='utf-8'):
    n, sha, label = line.rstrip('\n').split(' ', 2)
    date = subprocess.check_output(['git', 'log', '-1', '--format=%ad', '--date=format:%-m/%-d %H:%M', sha], text=True).strip()
    rows.append(f'<li><a href="./{n}-{sha}/"><span class="n">{n}</span><span class="l">{html.escape(label)}</span><span class="d">{date} · {sha}</span></a></li>')
css = (':root{color-scheme:dark}body{margin:0;background:#0d0b18;color:#f3ead8;font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif}'
       'main{max-width:760px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 6px}p{color:#b9b0c8;font-size:14px;line-height:1.6;margin:0 0 18px}'
       'ol{list-style:none;padding:0;margin:0}li a{display:grid;grid-template-columns:2.4em 1fr;gap:2px 10px;padding:10px 12px;margin:0 0 6px;border-radius:10px;background:#1a1630;color:inherit;text-decoration:none}'
       'li a:hover{background:#26204a}.n{grid-row:span 2;font-weight:700;color:#ffd27a;font-size:18px;align-self:center}.l{font-size:15px}.d{font-size:12px;color:#8f86a6}'
       '.now{display:inline-block;margin:0 0 18px;padding:8px 14px;border-radius:999px;background:#ffd27a;color:#1a1408;font-weight:700;text-decoration:none}')
open(f'{out}/index.html', 'w', encoding='utf-8').write(
    f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>おばけ提灯の歩み</title><style>{css}</style></head>'
    f'<body><main><h1>おばけ提灯の歩み</h1><p>これまでの版を、そのとき公開していた形のまま遊べます(古い版ほど遊び方が違います)。記録(最高得点など)は今の版と同じ所に保存されます。</p>'
    f'<a class="now" href="../">いまの版で遊ぶ</a><ol>{"".join(rows)}</ol></main></body></html>')
PY
echo "できた: $OUT  → history ブランチの中身をこれで置き換えて push する"
