# HANDOFF(引き継ぎ)

<!-- セッション終了時に AI が更新。別の AI が読んで続きを始められる内容にする。 -->

## 現状
- 雛形のまま。Play シーンは動くサンプル。

## 次の一手
- SPEC.md を書いて Play シーンを作品に置き換える。

## ユーザーが次にやる手順(v1 受け入れ)
1. このブランチ(claude/game-template-v1)を main にマージする(GitHub で PR を作らず、`git merge` か GitHub 上の Compare → Merge)。
2. repo の Settings → Pages → Build and deployment → Source を「GitHub Actions」にする。
3. Actions の「Build and Deploy (Pages)」が緑になり、https://mukkii-game.github.io/web-app-template/ で雛形が動くのを確認。
4. Settings → General → 「Template repository」にチェック。以後「Use this template」で新作を生やせる。
5. itch.io に出す時は repo secret `BUTLER_API_KEY` を入れ、Actions の「Publish to itch.io」で `user/slug` を指定して実行。

## この環境で確認できたこと(2026-09-14)
- `npm ci` → `tsc --noEmit` → `vite build` → `node tools/check.mjs`(自動プレイでスコア増加、コンソールエラーなし、スクショ 3 枚)→ `node tools/record.mjs`(webm 録画)まで通った。
- 未確認: CI 上での実行、itch.io への実 push、`tools/promo.sh`(ffmpeg がこの環境に無い)。

## 既知の問題
- ローカルで Playwright のブラウザ版が合わない時は `PW_CHROMIUM=/path/to/chrome node tools/check.mjs` で既存の Chromium を指定できる。
- Phaser が 1.6MB あり Vite が警告を出すが、動作に問題はない(manualChunks で分離済み)。

## 全体に共有したい気づき
<!-- 他の作品でも踏みそうな罠・効いた手だけ。この作品だけの話は「既知の問題」へ。
     1 件ずつ 5 項目で: 症状 → 原因 → 修正 → どう確かめたか → 未確認な点。日付を付ける。
     会議室が毎日回収し、雛形の docs/knowledge/ に取り込む。取り込まれたものは消さなくてよい。 -->
