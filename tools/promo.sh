#!/usr/bin/env bash
# 録画(tools/out/play.webm)から宣伝動画を作る。ffmpeg 必須。
# 使い方: bash tools/promo.sh "タイトル" "Title in English" [bgm.mp3]
set -euo pipefail
TITLE_JA="${1:-Game}"; TITLE_EN="${2:-Game}"; BGM="${3:-}"
IN=tools/out/play.webm; OUT=tools/out
[ -f "$IN" ] || { echo "先に node tools/record.mjs"; exit 1; }
FONT=$(fc-list 2>/dev/null | grep -iE "NotoSansCJK|Noto Sans CJK|DejaVuSans" | head -1 | cut -d: -f1 || true)
DRAW="drawtext=text='${TITLE_JA} / ${TITLE_EN}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=24:box=1:boxcolor=black@0.5${FONT:+:fontfile=$FONT}"
for LEN in 15 60; do
  if [ -n "$BGM" ]; then
    ffmpeg -y -loglevel error -i "$IN" -i "$BGM" -t "$LEN" -vf "$DRAW" -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac "$OUT/promo-${LEN}s.mp4"
  else
    ffmpeg -y -loglevel error -i "$IN" -t "$LEN" -vf "$DRAW" -c:v libx264 -pix_fmt yuv420p -an "$OUT/promo-${LEN}s.mp4"
  fi
  echo "saved $OUT/promo-${LEN}s.mp4"
done
