# DECISIONS.md

Durable design decisions. Append briefly; do not rewrite history.

## 2026-08-29 — Vite, TypeScript and npm are the web baseline

The template uses a framework-free Vite + TypeScript starter and a committed npm
lockfile. Product repositories can add a UI framework when the product needs one.

## 2026-08-29 — CI is delegated to a pinned reusable workflow

`.github/workflows/ci.yml` calls
`mukkii-game/ai-dev-infra/.github/workflows/verify-web.yml@v1`. The central
workflow owns type checking, unit tests, the production build, Chromium E2E and
the `web-build` artifact. The protected `v1` tag prevents silent CI drift.

## 2026-08-29 — Repository administration is a human boundary

The Merge Guard enables native auto-merge for ordinary same-repository pull
requests only. It fails closed for forks, incomplete API results and any change
that touches or renames `.github/**`. It never checks out or executes pull
request code.

## 2026-08-29 — Pages publishes the artifact CI verified

The Pages workflow downloads only the triggering CI run's `web-build` artifact
and never checks out, installs, rebuilds or executes repository code. It handles
both bot auto-merges and human merges, proves the artifact matches the current
`main`, and rechecks `main` immediately before deployment.

## 2026-08-29 — Vite output is portable across project-site paths

Vite `base` is `./`, so the same CI artifact works under
`https://mukkii-game.github.io/REPOSITORY_NAME/` without rebuilding.

## 2026-08-30 — Infrastructure v2 centralizes Guard and Pages

CI, Merge Guard and Pages are small callers of the protected `ai-dev-infra@v2`
workflows. The template test suite verifies their exact references, permissions
and concurrency settings because those caller-owned settings cannot be enforced
inside a reusable workflow.

## 2026-09-14 — Rebuilt as the Phaser 4 game template

Replaced the framework-free starter and its PR / merge-guard / central-CI
plumbing with a Phaser 4 game template: direct push to main, one Pages
workflow with a Playwright smoke check, one manual itch.io workflow, and a
small `src/core` layer (save, i18n, audio, input, demo, meta). Rationale in
mukkii-game/Perfect_Dev_Environment decisions of 2026-09-13.

## 2026-10-06 — おばけ提灯: 中身と描画を分け、絵と音はすべて手続き生成

ゲームの中身は `src/game/logic.ts`(1/60 秒固定刻み、seed とタップ列だけで決まる)。Play シーンは state を絵にするだけ。
bot も中身だけを回す(`tools/sim.mjs` を CI で実行し、決定性と記録→再生の一致を確かめる)。
素材探しの時間を消すため、絵は Canvas2D、音は WebAudio 合成で全部コード内に描く(外部素材ゼロ)。
画面は横長の巻物にするため 960×540。タップは canvas/コンテナ/body/document に多重登録して重複排除(`src/ui/taps.ts`)。

## 2026-10-06 — 置くだけの提灯をやめ、「飛ばす → 広がって縮む光」に作り直した

人間の評価:「ちょうどいいタイミングと位置を狙う感覚が無い。提灯の周りのタイマーは軌跡より直感的でない」。
提灯をタップ地点に即出現させていたため先読みが要らず、残り時間は提灯の周りの弧で示していた。
→ 家から飛ばして着弾まで時間をかける(先読み)、灯りの半径そのものを残り時間にする(縮む光)、
割った光もミサイルコマンドの爆発と同じ「広がって・留まって・縮む」形にし、印を押せば着弾即割りも選べるようにした。
おばけの通った跡と唐傘の着地予告を描き、動きを読めるようにした。

## 2026-10-06 — 「捕まえて回す」をやめ、「先頭が着く直前に割る」にした

人間の評価(2 回目):「ちょうどいい所と時に爆発させて複数巻き込む感覚になっていない。浅く雑で、タイマーも分からない」。
灯りに触れたおばけを捕まえて回し続けていたため、狙いが雑でも当たり、割る時機も自由だった。
→ 呼ばれたおばけは提灯へ向かってくるだけ、最初の 1 体が着いたら提灯は食われる。割れる範囲の輪を常に描き、
輪の中のおばけに印と「×n」を出す。タイマーは「先頭のおばけとの距離」なので画面を見れば分かる。
おばけは刻ごとの波・群れで来るようにし、まとめて巻き込む好機を作った。
bot で 1 回割るごとの巻き込み数を測る(tools/sim.mjs の perBreak / multi3Rate)。

## 2026-10-06 — サインを全部外し、「通り抜ける一瞬に割る」にした

人間の評価(3 回目):「食われた、が分からない。タイマーサインはかっこ悪いので NG。ミサイルコマンドは爆発の大きさ・軌跡・移動速度だけで、頭で攻略を考えられた」。
→ 「×n」「赤く震える輪」「育つ輪」「目くらみの星」「着地点の輪」「食われた」「途中のヒント文」を廃止。
提灯は時間切れなし・食われない。灯りに入ったおばけは提灯を通り抜けていくので、重なるのは一瞬。
成仏の光は常に同じ大きさ・長さ。読む材料は、提灯の速さ、灯りの明るさ、おばけの動き、爆発の大きさだけ。
