# HANDOFF(引き継ぎ)

<!-- セッション終了時に AI が更新。別の AI が読んで続きを始められる内容にする。 -->

## 現状(2026-10-06)
- 「おばけ提灯」のパイロット版が遊べる状態。タイトル → プレイ → 結果 → もういちど、日英切替、音 ON/OFF、ベスト保存。
- 中身 `src/game/logic.ts` / bot `src/game/bot.ts` / 絵 `src/game/art.ts` / 音 `src/game/sound.ts` / 数値 `src/tuning.ts`(F2 で調整)。
- `?auto=1` デモ、`?seed=` 固定、`?replay=`(結果画面の「記録をコピー」で URL ごと取れる)、`?debug=1` 生イベント表示、`?lang=en`。
- 画面左下に BUILD ID。`dist/version.json` と照合し、古いキャッシュなら 1 回だけ読み直す。
- publish.json・og:*・public/og.png 埋め済み。

## 確認できたこと(この環境)
- `tsc --noEmit` / `npm run build` / `npm run test:replay` / `node tools/sim.mjs 20`(決定性・記録→再生の一致 OK。bot skill 0.8 で生存中央値 約 4.5 分)
- `node tools/check.mjs`(60 秒自動プレイ、コンソールエラーなし、スコア増加)
- Playwright で PC のクリックとスマホのタッチ(844×390, hasTouch)の両方で、提灯の設置・割りが効くこと。
- CI(Build and Deploy (Pages) run #4)は緑で、Pages への公開まで完了。
- 未確認: 実機スマホ、itch.io 埋め込み、公開ページを開いての目視(この環境から github.io に繋がらない)。

## 次の一手
- 人間が遊んで手触りを決める(F2 の値をコピーして AI に渡せば既定値にできる)。特に `lantern.life` `chain.radius` `spawn.rateGrow`。
- QUESTIONS.md の仮決めに答える(縦持ち版、燃え尽き時の挙動、夜明けで勝ちにするか)。
- 人間の絵を入れるなら assets/mine/ → Boot で同じテクスチャキーに読み替え。

## 既知の問題
- 上手いと 15 分以上続くことがある(大連鎖で家の灯りが戻るため)。
- スマホ縦持ちでは画面が小さい(横向き案内のみ)。
- 文字は端末の明朝体頼み(無い端末ではゴシックになる)。
- この環境の Playwright は既定のブラウザ版が無いので `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tools/check.mjs` で動かした。

## 全体に共有したい気づき
<!-- 他の作品でも踏みそうな罠・効いた手だけ。この作品だけの話は「既知の問題」へ。
     1 件ずつ 5 項目で: 症状 → 原因 → 修正 → どう確かめたか → 未確認な点。日付を付ける。
     会議室が毎日回収し、雛形の docs/knowledge/ に取り込む。取り込まれたものは消さなくてよい。 -->
- 2026-10-06 会議室: knowledge/start-from-reference.md, tables/genres.csv / 役立った(元ネタは「骨組みだけ」借りる判断の根拠になった)
- 2026-10-06 記録→再生がずれる罠: 症状 = 人間のタップを記録して再生すると結果がずれうる → 原因 = 記録は整数に丸めるのに、本番は小数座標で動かしていた / bot が中身と同じ乱数を使っていた → 修正 = 中身の入口(tap)で座標を丸める、bot には別の Rng を持たせる → 確かめ = tools/sim.mjs で bot 入力を記録→文字列→再生しスコアとフレームが一致 → 未確認 = 実機の長時間プレイ。
- 2026-10-06 雛形の check.mjs / record.mjs は viewport 540×720 固定。横長の作品では 960×540 等に直さないとスクショが小さく写る。
- 2026-10-06 Phaser 4 の Graphics で beginPath → arc → strokePath を点線のように繰り返すと、弧どうしが直線でつながって崩れた。lineBetween で区切って描けば正しく出る。
