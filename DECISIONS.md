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

## 2026-10-06 — 反射神経ゲームにしない: 回る時間・弾数の制限・撃ち落としの自動化

人間の指摘:「タイミングを狙うのではなく、ただの反射神経練習になっていないか」。
原因は (1) 提灯を通り抜ける一瞬を狙うゲームだった (2) 撃ち放題で考えずに連打できた (3) 影法師を落とすのが「着く瞬間に押す」反射だった。
→ おばけは提灯のまわりを約 3 秒回る(猶予が秒単位)、刻ごとの弾数を決める(1 つで何体巻き込むか考える)、
飛行中に押せば着いたら自動で割れる(位置と向きを読む勝負に)。
確認: tools/sim.mjs に「指が動くまでの遅れ(lag)」を追加。遅れに対して成績が滑らかに下がるか(段差がないか)を見る。
その過程で、誰も呼べない提灯が枠を塞ぐ問題が bot で見つかり、bot に「寄らない提灯は割って片付ける」を足した。

## 2026-10-07 — ミサイルコマンドの「直感・予測・選択」を、1 つのルールと絵の中の出来事で移す

人間の評価: 絵柄とルールの置き換えは狙い通りだが、ミサイルコマンドの直感的・予測的・選択的な遊びを失い、早押しになっている。
テスターの声: 家がやられる時に中の人が騒いで逃げ出す演出があれば HP だと分かる / 全方向から来て軌道が読みにくい / 猶予があるとテンポが変わる。
採ったこと(要素は増やさず、合体させる):
- 「おばけは灯りに寄る」1 つに統一。家に向かう理由も、提灯に曲がる理由も同じ。
- 出所は刻ごとに場所の変わる墓場(刻の前から見える)。道はまっすぐ。種類の違いは進み方の癖だけ。
- 提灯は一定の間で自動で弾ける(割りどきの早押しをなくす)。押せば早めに弾ける。
- 弾は軒先に下がった提灯(HUD の数字の代わり)。家が消えると弾も消える(ミサイルコマンドの基地)。
- 家の HP は中の人の騒ぎと逃げ出しで見せる。騒いでいる間が猶予(ワーニングの代わり)。助けに行くか、群れを狙うかの選択になる。
- 家並みは毎回変わる。
確かめ方: tools/sim.mjs で (1) 先読みしない bot(NOLEAD=1)が明らかに負けること = 予測が効く、
(2) 指の遅れ(lag)を 1 秒入れても大きく負けないこと = 反射神経ではない、を見る。

## 2026-10-07 — 縦持ちのスマホでは画面を 90 度回す

アプリ内ブラウザは向きを縦に固定することがあり、「横にしても横画面にならない」と言われた。
触る端末で縦長の時は、ゲームの入れ物を CSS で 90 度回して全面に出す(src/ui/orient.ts)。縮尺は自前、タップ座標も変換する。
「横向きにすると大きく遊べます」の案内は不要になったので消した。

## 2026-10-08 — CI からブラウザ確認を外し、確認に軽重を付ける

人間の依頼「チェックを最低限にして早く」。CI 約 76 秒のうち 45 秒がブラウザの取り込みと自動プレイ確認で、AI が push 前に手元で回す確認と二重だった。
CI は build・記録再生・bot の確認だけにした(約 30 秒)。ブラウザ確認は描画・入力・シーンを変えた時だけ手元で回す(AGENTS.md「確認の軽重」)。
公開キットの画像は、手元で撮ったスクショを kit/assets/ に置く。
