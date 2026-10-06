# itch.io × iPhone で HTML5 ゲームを動かすための実践ノート

Galaxtris（tetrishoot）で、「itch.io の iPhone だけ動かない」を数日かけて潰したときの記録。
**次回作の1日目からこの通りにやれば、あの数日は丸ごと省ける。**

読む人：MUKKII（ゲームデザイナー／Web プラットフォームの専門家ではない）と、
このリポジトリを触る将来の AI アシスタント。

> 📦 **他プロジェクトへ持ち出すなら → [WEB-GAME-RULES.md](./WEB-GAME-RULES.md)**
> こちらは約16KB の短縮版で、このゲーム固有の話を全部落とした汎用ルールだけ。
> 本書（約61KB）は「なぜそうなのか・実測値・経緯」を残した詳細版なので、
> 常時読み込ませず、原因を追うときだけ開く。

書き方のルール：

- 「itch.io の公式ドキュメントに書いてあること」と「自分たちが実機・計測で確かめたこと」を必ず区別する。
- 推測は推測と書く。断定は計測値か公式ドキュメントの裏がある場合だけ。

---

## 0. 結論だけ先に（3行）

1. **入力リスナーは `window` だけに付けてはいけない。** itch.io のモバイル埋め込みでは
   `window` に一切イベントが届かないことが実機で確認された（計測値 `D0 M0 U0 X0 T0 C1`）。
   canvas / container / body / html / document / window の**6系統に登録して重複排除**する。
2. **butler で更新しても `index.html` の URL は変わらない。**
   だから端末と CDN に古い `index.html` が居座り、「直したのに直らない」が延々続く。
   **BUILD ID の画面表示 ＋ `version.json` による自動リロード**を最初から入れる。
3. **スマホにはコンソールが無い。** だから**画面に生イベント数を描く**。
   これが無い間は全部が推測で、入ったのは推測に基づく的外れな修正だけだった。

---

## 1. itch.io のプラットフォーム事実（ここで一番時間を溶かした）

### 1-1. モバイルでは必ず「Run game」ボタンが出て、必ずフルスクリーンで起動する

出典：itch.io 公式ドキュメント（HTML5 ゲームの埋め込み設定の説明）。

- プロジェクト設定の **「Automatically start on page load」** は、
  **モバイルでは設計上無視される**。モバイルは常に「Run game」を挟み、
  常に itch.io 側のフルスクリーン・モバイルランナーで起動する。
- **つまり「Run game ボタンが出ている＝設定が反映されていない／デプロイが失敗した」ではない。**

> ❌ 我々がやってしまった判断ミス：
> 「デプロイしたのにまだ Run game が出る＝古いままだ」と読んでしまい、
> 実際には反映済みのビルドを何度も押し直していた。
> **デプロイが効いたかどうかを、このボタンの有無で判断してはいけない。**
> 判断材料は後述の画面内 BUILD ID ただ一つ。

### 1-2. アカウント設定がプロジェクト設定を上書きする（PC のみ）

出典：itch.io 公式ドキュメント（アカウント設定）。

- アカウント単位の **「Require a click to run HTML5 game embeds」**（HTML5 埋め込みの実行に
  クリックを必須にする）は、**プロジェクト側の自動起動設定を上書きする**。
- これは**デスクトップ側の話**。モバイルは 1-1 の通り、そもそも常にクリックを挟む。
- 自分のアカウントでこれが ON だと、**プロジェクト設定を何度直しても自分の目には変化が無い**。
  デプロイの検証を自分のアカウントでやっている場合の落とし穴。

### 1-3. 「Mobile friendly」のチェックは、外れていても警告が出るだけ

出典：itch.io 公式ドキュメント。

- 「Mobile friendly」を外すと、**モバイルのプレイヤーに「この作品はモバイル向けではない」という
  警告が出るだけ**で、**ゲームの実行自体はブロックされない**。
- なので「モバイルで動かないのは Mobile friendly のせいでは？」という線は、
  最初に消していい。実際、我々もここを疑って時間を使ったが無関係だった。

### 1-4. ★最重要★ butler の channel push は「1つの upload に build を積む」方式

出典：butler 自身のログ出力＋ itch.io のチャンネル仕様。我々のデプロイでも実際にそうなっていた。

```yaml
# /home/user/tetrishoot/.github/workflows/publish-itch.yml:55-56
./butler-bin/butler push dist "${ITCH_TARGET}:${ITCH_CHANNEL}" \
  --userversion "${GITHUB_SHA::7}"
```

`ITCH_TARGET: mukkii/galaxtris` / `ITCH_CHANNEL: html5`（同ファイル :19-20）。

何が起きるか：

- 同じチャンネルへの push は、**同じ upload を使い回して build を積み上げる**。
- 結果、**配信される `index.html` の URL がデプロイ前後で変わらない。**
- Vite が吐く JS は `assets/index-<hash>.js` のようにハッシュ付きなので、
  JS 自体はキャッシュされても安全……**のはずだった。**
  ところが **`index.html` が古いままだと、そこから参照される JS ハッシュも古いまま**になる。
- つまり「古い `index.html` が端末や CDN に1枚残っているだけで、
  何をどれだけ直して push しても、その端末では永遠に古い JS が動き続ける」。

**これが「何度『直した』と言っても何も変わらなかった」の正体。**
入力まわりの修正が効いているかどうかすら判定できない状態で、
効いていない前提の別の修正を重ねていた。

→ 対策は §6（`version.json` による自動キャッシュ復旧）。

---

## 2. ★THE INPUT RULE★ 入力リスナーは複数のターゲットに登録する

### 2-1. 実機で取れた決定的な数字

`06911b0` / `6767ffe` の調査で、端末画面に出した診断表示がこれ：

```
BUILD 2026-09-15 02:06 b777ac4
D0 M0 U0 X0 T0 C1 - click 127,605 R412x551
```

読み方（凡例は §5）：

| 表示 | 意味 | この時の解釈 |
| --- | --- | --- |
| `T0` | touchstart の生イベント数 = 0 | **タッチが1件も届いていない** |
| `D0` | pointerdown の生イベント数 = 0 | **ポインタも1件も届いていない** |
| `C1` | ネイティブ click = 1 | 届いたのは DOM ボタンの click ただ1つ |
| `R412x551` | canvas の実表示サイズ | **レイアウトと座標変換は正常**（＝そこは犯人ではない） |

つまりこの環境では、**タッチ／ポインタ系のイベントがゲームまで一切配送されていなかった。**
タイトル画面だけ開始できていたのは、保険で入れていた透明ボタン `#title-tap-layer` の
**ネイティブ click だけが唯一届いていた**から。ゲーム中はその層を隠していたので、
移動もショットも完全に不能だった。

最初は「アプリ内ブラウザ（X / LINE など）固有では？」と疑ったが、
**本物の Safari で開いても同じくプレイ中に動かせない**という報告が来た。
→ アプリ内ブラウザ固有ではなく、**itch.io 埋め込み全般で `window` にイベントが届かない**状態。

### 2-2. 答えは隣の作品が持っていた

同じ iPhone・同じ itch.io 埋め込みで**ずっと問題なく動いていた別作品「weed（コンブゲーム）」**を見たら、
リスナーを **canvas 要素に直接**付けていた。

```js
// /home/user/mukkii-game/weed/game.js:164-169
canvas.addEventListener('touchstart', guardGameTouch, {passive:false});
canvas.addEventListener('touchmove',  guardGameTouch, {passive:false});
canvas.addEventListener('pointerdown', e => { ... });
canvas.addEventListener('pointermove', e => { ... });
canvas.addEventListener('pointerup',     e => pointerEnd(e));
canvas.addEventListener('pointercancel', e => pointerEnd(e,true));
```

`window` にも付けてはいるが、**それは解放（up / cancel / blur）の取りこぼし対策としてだけ**：

```js
// /home/user/mukkii-game/weed/game.js:170
addEventListener('pointerup',     e => pointerEnd(e));
addEventListener('pointercancel', e => pointerEnd(e,true));
addEventListener('blur', () => { pointer=null; pointers=[]; ... });
```

**主系統は canvas、window は保険。** これが最初から正解だった。

### 2-3. 現在の実装：6系統 ＋ 重複排除

`/home/user/tetrishoot/src/core/Input.ts:516-565`

```ts
// ★★ 登録先を canvas / document / window の3系統に増やす ★★
//   実機（itch.io の埋め込み + iPhone）では window に付けたリスナーが
//   capture フェーズでも一切発火しなかった（計測値 D0 M0 U0 X0 T0）。
//   一方、同じ端末・同じ埋め込みで動いている別作品 weed は
//   リスナーを canvas 要素に直接付けている。
//   どこか1つでも届けば操作できるよう、要素・document・window の順に登録し、
//   最初に受け取った系統だけが処理する（alreadyHandled で二重処理を防ぐ）。
const container = this.canvas.parentElement;
const targets: { t: EventTarget | null; tag: string }[] = [
  { t: this.canvas,               tag: 'c' },
  { t: container,                 tag: 'g' },
  { t: document.body,             tag: 'b' },
  { t: document.documentElement,  tag: 'h' },
  { t: document,                  tag: 'd' },
  { t: window,                    tag: 'w' },
];

for (const { t, tag } of targets) {
  if (!t) continue;
  t.addEventListener('touchstart',  makeTouchDown(tag) as EventListener, { passive: false, capture: true });
  t.addEventListener('touchmove',   makeTouchMove(tag) as EventListener, { passive: false, capture: true });
  t.addEventListener('touchend',    makeTouchEnd()    as EventListener, { passive: false, capture: true });
  t.addEventListener('touchcancel', makeTouchEnd()    as EventListener, { passive: false, capture: true });
  if (hasPointerEvents) {
    t.addEventListener('pointerdown',   makePointerDown(tag) as EventListener, { capture: true });
    t.addEventListener('pointermove',   makePointerMove(tag) as EventListener, { capture: true });
    t.addEventListener('pointerup',     makePointerUp()      as EventListener, { capture: true });
    t.addEventListener('pointercancel', makePointerCancel()  as EventListener, { capture: true });
  }
  // PointerEvent 非対応環境は mouse 系で同じことをする（同ファイル :550-564）
}
```

**なぜ canvas だけではダメか**（Input.ts:524-526 のコメント）：
タイトル中は透明タップ層（§4-4）が canvas の上に乗っていて、
**イベントの `target` がそちらになるため canvas のリスナーでは拾えない**。
だから両方の先祖である `#game-container` / `body` / `html` も登録先に含める。

### 2-4. 重複排除のパターン（これが無いと6重に処理される）

`/home/user/tetrishoot/src/core/Input.ts:431-438`

```ts
// ★ 同じイベントを複数の登録先で二重処理しないための印。
//   最初に届いた登録先だけが処理し、残りは素通りする。
const alreadyHandled = (e: Event): boolean => {
  const ev = e as Event & { __gxSeen?: boolean };
  if (ev.__gxSeen) return true;
  ev.__gxSeen = true;
  return false;
};
```

**仕組み：** DOM イベントオブジェクトは伝播中ずっと同一インスタンス。
そこに独自プロパティ（`__gxSeen`）を立てておけば、
「canvas → container → body → html → document → window」のどこで最初に捕まえたかに関わらず、
**処理は1回だけ**になる。各ハンドラの先頭が必ずこれ：

```ts
const makeTouchDown = (tag: string) => (e: TouchEvent) => {
  if (alreadyHandled(e)) return;
  this.evtTouch++;            // ← 生イベント数（フィルタ前）を数える
  ...
};
```

**二重の保険：** さらに `onPointerDown` の先頭にも同一 ID の二重登録防止がある。

```ts
// src/core/Input.ts:164
if (this.pointers.has(id)) return; // 同一IDの二重登録を防止（window/canvas 両取り対策）
```

### 2-5. capture フェーズで登録する

全リスナーが `{ capture: true }`（Input.ts:427-428 のコメント）。
**バブリング前に誰かが `stopPropagation()` しても必ず先に届く**ため。
itch.io のモバイルランナーは iframe の中で独自の DOM を被せているので、
バブリング頼みにする理由が無い。

### 2-6. 経路タグ（どの系統で届いたか）

`tag` は `c`(canvas) / `g`(container) / `b`(body) / `h`(html) / `d`(document) / `w`(window)。
`srcTag` に `'T' + tag`（Touch）、`'P' + tag`（Pointer のタッチ）、`'M' + tag`（マウス）として入り、
**端末上の診断表示にそのまま出る**（例：`Tc` = canvas に touch が届いた、`Td` = document 経由）。

> これがあると、次回同じ症状が出たときに**「どの系統だけが生きているか」が端末画面で即わかる**。
> 実際、window / document を握りつぶした環境をヘッドレスで再現し、
> タグがそれぞれ `Td` / `Th` に切り替わって動作継続することを確認済み（`6767ffe`）。

---

## 3. Touch Events と Pointer Events：iOS のクロスオリジン iframe ではどちらを主にするか

### 結論：**タッチは Touch Events を主系統に。Pointer Events はマウス用に残す。**

この結論に至るまでに**一度 Pointer Events に全面移行して失敗し、戻している。**
その往復に無駄な時間を使った。次回は最初からこの形にすること。

### 3-1. 行き（`b36ede4`）：Touch Events → Pointer Events へ全面移行

旧実装は `activeTouchId` の一方向ラッチだった：

```
最初に触れた指の identifier を保持し、touchend が来るまで新しい指を一切受け付けない
→ if (this.activeTouchId !== null) return;
```

iOS Safari の**クロスオリジン iframe（itch.io の `html-classic.itch.zone` 埋め込み）**では、
親ページにジェスチャーを奪われると **`touchend` / `touchcancel` が iframe 内へ配送されないことがある**。
すると `activeTouchId` が永久に残り、以降 `touchstart` も `mousedown` もすべて弾かれ、
**「タイトルは表示されるがタップしても一切反応しない」＝完全な入力デッドロック**になる。
（同じ端末でも GitHub Pages のトップレベル表示では親ページが無いので再現しない。）

→ `pointerId` をキーにした `Map` 管理に変え、
**「古い状態が新しい入力をブロックする」経路そのものを無くした。** この構造変更自体は正しい。

### 3-2. 帰り（`b0e2860`）：タッチだけ Touch Events に戻す

Pointer Events 一本にしたら、iOS + itch.io で新しい症状が出た：

> 「タイトルのタップは効くのに、ゲーム中の移動もショットも効かない」
> 同じビルドを GitHub Pages で開くと**同じ端末で正常に遊べる**。

これは **WebKit が「スクロールし得る親ページを持つ iframe」で
`pointerdown` の直後に `pointercancel` を投げてくる挙動**と症状が完全に一致する：

| 症状 | 理由 |
| --- | --- |
| タイトルは効く | `justMouseDown` が1回立てば開始できる |
| 移動が効かない | `pointermove` が来ないので仮想スティックが倒れない |
| ショットが効かない | `pointerdown` で立てた `shoot` が**同じフレーム内の `pointercancel` で降ろされる** |

> ⚠️ この WebKit 挙動そのものは**公式ドキュメントで確認したものではなく、
> 症状の一致からの推定**。ただし「Touch Events に戻したら直った」という結果は実機で確認済み。

**Touch Events は `preventDefault()` さえしていれば `touchmove` / `touchend` が確実に届く**ので、
`pointercancel` の影響を受けない。

### 3-3. 現在の形：Touch を主、Pointer をマウス専用にする

`/home/user/tetrishoot/src/core/Input.ts:95`

```ts
private touchEventsSeen = false; // 一度でも touchstart が来たら、タッチは Touch Events を正とする
```

`/home/user/tetrishoot/src/core/Input.ts:477-501`

```ts
const makePointerDown = (tag: string) => (e: PointerEvent) => {
  if (alreadyHandled(e)) return;
  this.evtDown++;
  if (isUiTarget(e.target)) return;
  const isTouch = e.pointerType !== 'mouse';
  if (isTouch && this.touchEventsSeen) return; // ← タッチは Touch Events 側の担当
  ...
};
```

**動的に決める**のがポイント。「iOS だから」「スマホだから」で分岐すると、
Touch Events を出さない環境や将来の端末で詰む。
**「まだ一度も touchstart を受けていない環境」でだけ Pointer をタッチとして働かせる。**
これなら二重入力にならず、Touch Events が来ない環境でも Pointer が拾う。

### 3-4. Touch Events を使うなら `preventDefault` は必須

```ts
// src/core/Input.ts:458
if (e.cancelable) e.preventDefault(); // これが無いと iOS はスクロールに持っていってしまう
```

`{ passive: false }` で登録しないと `preventDefault()` 自体が効かない（Input.ts:539-542）。
**ただし例外が1つある → §4-5。**

### 3-5. タップ1回で必ず1発撃てるようにする

`b0e2860` で追加。押した直後に解放イベントが来ても最低1発は出るよう、
発射条件に `justShoot` を足した。

```ts
// src/core/Input.ts:141-146
private syncShoot(): void {
  const on = this.keyShoot || this.pointerShoot;
  if (on && !this.shoot) this.justShoot = true;   // ← 立ち上がりを1フレーム保持
  this.shoot = on;
  this.isMouseDown = this.pointerShoot;
}
```

---

## 4. 交渉不可の堅牢性ルール（どれも実際に踏んだ地雷）

### 4-1. `requestAnimationFrame` の再登録は必ず `finally` で

`/home/user/tetrishoot/src/main.ts:169-200`

```ts
// ★ 重要：requestAnimationFrame の再登録は必ず finally で行う。
//   以前は update / draw の後ろに書いていたため、1回でも例外が飛ぶとループが二度と回らず、
//   「キャンバスには最後に描かれたタイトル画面が残ったまま、タップしても永久に無反応」
//   という、一見『入力が効かない』ようにしか見えない致命的な停止に陥っていた。
let loopErrorReported = false;
function gameLoop(currentTime: number): void {
  try {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    game.update(dt, input);
    game.draw(ctx);
    ...
  } catch (e) {
    if (!loopErrorReported) {          // 毎フレーム同じ例外で画面を埋めない
      loopErrorReported = true;
      showErrorOverlay(`[loop] ${e instanceof Error ? e.message : String(e)}`);
    }
  } finally {
    requestAnimationFrame(gameLoop);   // ← ここ
  }
}
```

**なぜ致命的か：** 画面は正常に見える（最後のフレームが残っている）ので、
「入力が効かない」としか見えない。**入力バグと完全に同じ症状**になる。
これがあったせいで、入力を疑う時間が伸びた。

### 4-2. フレーム毎の後始末も `finally` で

`/home/user/tetrishoot/src/core/GameManager.ts:316-326`

```ts
public update(dt: number, input: Input): void {
  this.lastInput = input;
  // ★ 早期 return や例外があっても「単発押し」フラグの後始末を必ず行う。
  //   ここを取りこぼすと justMouseDown 等が立ちっぱなしになり、
  //   毎フレーム押し続けたのと同じ状態になって操作不能に見える。
  try {
    this.updateInner(dt, input);
  } finally {
    input.resetPerFrame();
  }
}
```

`updateInner` の中には状態遷移による早期 `return` が多数ある。
**「単発押し（just系）フラグのクリアを、早期 return で飛ばしてはいけない。」**

### 4-3. 解放経路は多重化し、ウォッチドッグを置く

`/home/user/tetrishoot/src/core/Input.ts` の解放経路、全部：

| 経路 | 場所 |
| --- | --- |
| `pointerup` / `pointercancel` | :547-548 |
| `lostpointercapture`（canvas が手放した時だけ） | :569-571 |
| `touchend` / `touchcancel` | :541-542 |
| **`e.touches.length === 0` での全解放** | :474 |
| `blur` / `pagehide` | :575-576 |
| `visibilitychange`（hidden 時） | :577-579 |
| **6秒ウォッチドッグ** | :99-102, :267-284 |

特に2つ。

**(a) 指が1本も残っていなければ全解放する：**

```ts
// src/core/Input.ts:473-474
// 画面上に指が1本も残っていない＝取りこぼした指があっても、ここで確実に全解放できる
if (e.touches.length === 0) this.releaseAllPointers();
```

`TouchEvent.touches` は「今この瞬間に画面上にある全ての指」なので、
**取りこぼしがあっても真実を教えてくれる。** Pointer Events にはこれに相当するものが無い。

**(b) ウォッチドッグは「消す」のではなく「無効フラグを立てる」：**

```ts
// src/core/Input.ts:99-102
// ★ 最終防衛線：pointerup も touchend も届かなかった指を「無効」にするまでの時間（ms）。
//   指を表から消すのではなく stale フラグを立てるだけなので、
//   もし誤検知でも指を1pxでも動かせば（pointermove が来れば）その瞬間に操作が復帰する。
private static readonly POINTER_WATCHDOG_MS = 6000;
```

```ts
// src/core/Input.ts:267-284（抜粋）
private reapLostPointers(): void {
  const now = performance.now();
  let hasStick = false;
  for (const p of this.pointers.values()) {
    if (!p.stale && now - p.lastMoveAt > Input.POINTER_WATCHDOG_MS) p.stale = true;
    if (p.role === 'STICK' && !p.stale) hasStick = true;
  }
  ...
  // ここでは「切る」方向にしか働かせない（押していない弾が勝手に出るのを防ぐ）
  if (this.pointerShoot && !this.isFiringNow()) { this.pointerShoot = false; this.syncShoot(); }
}
```

**ウォッチドッグは常に「切る」方向にだけ働かせる。**
勝手に入力が入る方向に働くと、原因追跡が不可能になる。

（weed も同じことを 2 秒でやっている：`game.js:198`
`pointers = pointers.filter(p => clock - (p.lastEvent ?? p.time) < 2)`）

### 4-4. 最後の砦として「本物の DOM ボタン」を置く

`/home/user/tetrishoot/index.html:165-170`

```html
<!-- ★ 保険：タイトル画面の間だけ表示する透明ボタン。
     iOS Safari では <button> のネイティブ click がもっとも確実に届くため、
     万一 Pointer / Touch イベントが届かない環境でもゲームを開始できるようにする。
     ゲームが始まったら main.ts が hidden にして操作の邪魔をしない。
     ★ 既定は「表示」。万一 rAF ループが動かなくても最後の操作手段が必ず画面上に残るようにする。 -->
<button id="title-tap-layer" type="button" aria-label="タップしてスタート"></button>
```

CSS（index.html:135-148）：`position:absolute; inset:0; z-index:9;`
（CRT 演出の 10/11 より下、canvas より上）、`background:transparent; border:0;`

`/home/user/tetrishoot/src/main.ts:160-165`

```ts
const tapLayer = document.getElementById('title-tap-layer') as HTMLButtonElement | null;
if (tapLayer) {
  tapLayer.addEventListener('click', (e) => { input.injectTap(e.clientX, e.clientY); });
}
```

`/home/user/tetrishoot/src/core/Input.ts:588-598`

```ts
public injectTap(clientX: number, clientY: number): void {
  this.evtClick++;
  if (performance.now() - this.lastPointerDownAt < 700) return; // 通常経路が生きているので不要
  const p = this.toCanvas(clientX, clientY);
  this.mouseX = p.x; this.mouseY = p.y;
  this.justMouseDown = true;
  this.pendingClickX = p.x; this.pendingClickY = p.y;
  this.lastEventLabel = `click ${Math.round(p.x)},${Math.round(p.y)}`;
}
```

**3つのポイント：**

1. **既定は「表示」。** rAF ループが死んでいても、最後の操作手段が必ず画面に残る。
2. **直前 700ms 以内に `pointerdown` を受けていたら無視する。** 通常経路が生きている環境での二重入力を防ぐ。
3. **タップ座標をそのままゲームへ渡す**ので、難易度行・ステージ行の選択もこの経路で動く。
   「ただ開始するだけのボタン」にしないこと。

（weed は最初から本物の DOM ボタンでゲームを開始していた：`game.js:329`
`$('#start-button').onclick = start;` ← **これが最初から効いていた理由の一つ。**）

### 4-5. ★その透明ボタンの上では `touchstart` を `preventDefault` してはいけない★

**iOS は `touchstart` を `preventDefault()` するとネイティブ `click` を発火しない。**
止めてしまうと、最後の保険そのものが死ぬ。

`/home/user/tetrishoot/src/core/Input.ts:398-405`

```ts
// ★ ここだけは touchstart の既定動作を止めない。
//   iOS は touchstart を preventDefault するとネイティブ click を発火しなくなるため、
//   止めてしまうと「タイトル画面の透明ボタン」という最後の保険が効かなくなる。
//   （スクロール抑止は CSS の touch-action:none 側で担保する）
const keepsNativeClick = (target: EventTarget | null): boolean => {
  const el = target as Element | null;
  return !!(el && typeof el.closest === 'function' && el.closest('#title-tap-layer'));
};
```

適用側（Input.ts:445）：

```ts
if (!keepsNativeClick(e.target) && e.cancelable) e.preventDefault();
```

**スクロール抑止は CSS 側に逃がす**（index.html:31, :43, :51, :147）：

```css
html, body        { touch-action: none; overscroll-behavior: none; overflow: hidden; }
#game-container   { touch-action: none; overscroll-behavior: none; }
canvas            { touch-action: none; }
#title-tap-layer  { touch-action: none; }
```

viewport meta（index.html:5）：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

### 4-6. デバッグ用オーバーレイに `pointer-events:none` を忘れない

`/home/user/tetrishoot/src/main.ts:14-18`

```ts
// ★ pointer-events:none は必須。これが無いとエラーバーが画面上部のタップを吸い込み、
//   「表示はされるがタップに反応しない」状態をデバッグ表示自身が作ってしまう。
box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;...;pointer-events:none;';
```

**デバッグ用の表示が新しいバグを生む**という最悪のパターン。実際にやらかした（`b777ac4`）。

### 4-7. 「何も起きないボタン」を画面上に置かない

iPhone Safari は要素のフルスクリーンに非対応（`document.fullscreenEnabled === false`）。
押しても何も起きないフルスクリーンボタンが右下＝**ショット領域に居座ってタップだけ食っていた。**

`/home/user/tetrishoot/src/main.ts:83-86`

```ts
const fullscreenSupported = !!document.fullscreenEnabled && typeof container.requestFullscreen === 'function';
if (fsBtn && !fullscreenSupported) fsBtn.style.display = 'none';
```

同じ理由で、**タイトル画面では「プレイ中 HUD 用の MUTE 当たり判定」を止めた**（`b777ac4`）。
画面上部に「押すと無音になるだけの見えない当たり判定」が生まれていた。

**教訓：不可視・無反応の当たり判定は、そのまま「入力が効かない」バグとして報告される。**

### 4-8. 自動フルスクリーンは iframe / タッチ環境ではやらない

`/home/user/tetrishoot/src/main.ts:114-129`

```ts
const isEmbeddedFrame = (() => {
  try { return window.self !== window.top; } catch { return true; }  // ← catch も true（クロスオリジンなら確実に iframe）
})();
const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const allowAutoFullscreen = !isEmbeddedFrame && !isCoarsePointer && fullscreenSupported;
```

iOS Safari は非対応、Android は iframe 側に `allowfullscreen` が無いと拒否する。
**`requestFullscreen()` の周辺で例外が飛ぶと、それを呼んでいるタッチイベントの処理ごと壊れる。**
itch.io はそもそもモバイルで自前のフルスクリーンランナーを使うので（§1-1）、ここは全部いらない。

### 4-9. クロスサイト・トラッキング防止で `localStorage` が例外を投げる

`bd99480` で対応。itch.io は他ドメイン iframe なので、Safari の ITP により
**`localStorage` へのアクセスが例外を投げることがある。**
無防備だと `GameManager` のコンストラクタが丸ごと失敗し、**ゲームが一切起動しない。**

→ **ハイスコア等の永続化は必ず `try/catch` で囲う。**
（weed も同様：`game.js:328` の `try { ... localStorage ... } catch { ... }`）

### 4-10. `AudioContext` の生成失敗を本体に巻き込まない／解除リスナーを外さない

`/home/user/tetrishoot/src/main.ts:71-78`

```ts
// ★ リスナーは外さない。iOS では着信・バックグラウンド復帰・最初の resume() 失敗などで
//   AudioContext が再び suspended に戻ることがあり、一度きりの解除だと無音のままになる。
const unlockAudio = () => sound.resumeAudio();
window.addEventListener('touchstart',  unlockAudio, { passive: true });
window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('click',       unlockAudio, { passive: true });
```

あわせて（`6f24234`）：**`AudioContext` の生成と mp3 のフェッチ・デコードはユーザー操作なしでも可能**
（操作を要求するのは `resume()` だけ）。
だからページ読み込み直後に前倒しして始める。ユーザーの初回クリックまで待つと、
タイトル操作から数秒後に「合成 BGM の後から本物の曲が割り込む」ように聞こえる。

### 4-11. 座標変換のフォールバック（0 を返すと全タッチが左半分になる）

`/home/user/tetrishoot/src/core/Input.ts:117-136`

```ts
private toCanvas(clientX: number, clientY: number): { x: number; y: number } {
  const rect = this.canvas.getBoundingClientRect();
  let left = rect.left, top = rect.top, width = rect.width, height = rect.height;
  if (width <= 0 || height <= 0) {
    // ★ 何らかの理由でレイアウトが壊れてキャンバスの実寸が取れない場合でも、
    //   左右ゾーン判定だけは成立するようビューポート基準にフォールバックする。
    //   （0 を返すと全タッチが左半分＝移動扱いになり「弾が出ない」状態になるため）
    left = 0; top = 0;
    width  = window.innerWidth  || this.canvas.width;
    height = window.innerHeight || this.canvas.height;
  }
  return {
    x: (clientX - left) * (this.canvas.width  / width),
    y: (clientY - top ) * (this.canvas.height / height),
  };
}
```

**「入力は届いているのに、変換結果が全部 (0,0) 付近になる」は、
入力が届いていないのと区別がつかない。** だから診断表示に canvas 実寸（`R412x551`）を出す。

### 4-12. 新しい API はフォールバックを添える

`ctx.roundRect` 非対応環境向けのフォールバックを Bullet / Item に追加した（`b777ac4`）。
**キャンバス描画中に例外が飛ぶと §4-1 のループ停止に直結する。**

---

## 5. 端末だけで原因を割り出す診断表示（これが決め手だった）

**スマホには開発者コンソールが無い。Mac でのリモートデバッグ環境も無い。**
→ **画面に直接描く。** これを入れるまで、全部が推測だった。

### 5-1. 表示内容

`/home/user/tetrishoot/src/core/GameManager.ts:2375-2394`

```ts
private drawDeviceDebugLine(ctx: CanvasRenderingContext2D): void {
  const input = this.lastInput;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowBlur = 0;
  ctx.font = 'bold 12px monospace';                 // ← スマホで縮小されても読める太さ・大きさ
  ctx.fillStyle = 'rgba(140, 175, 205, 0.9)';
  ctx.fillText(`BUILD ${typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '?'}`, CANVAS_WIDTH / 2, 694);
  if (input) {
    ctx.fillText(
      `D${input.evtDown} M${input.evtMove} U${input.evtUp} X${input.evtCancel} ` +
      `T${input.evtTouch} C${input.evtClick} ${input.srcTag} ` +
      `${input.lastEventLabel} R${input.canvasRectLabel()}`,
      CANVAS_WIDTH / 2, 710
    );
  }
  ctx.restore();
}
```

### 5-2. 凡例（これを覚えておくこと）

```
BUILD 2026-09-15 02:06 b777ac4
D0 M0 U0 X0 T0 C1 Tc dn 127,605 R412x551
 │  │  │  │  │  │  │  └─ 直近イベント（種類＋キャンバス座標）
 │  │  │  │  │  │  └──── 経路タグ（T/P/M ＋ c/g/b/h/d/w）
 │  │  │  │  │  └─────── C = click        （DOM ボタンのネイティブ click）
 │  │  │  │  └────────── T = touchstart
 │  │  │  └───────────── X = pointercancel
 │  │  └──────────────── U = pointerup
 │  └─────────────────── M = pointermove / touchmove
 └────────────────────── D = pointerdown
                                              R = canvas の実表示サイズ
```

### 5-3. 読み方の早見表

| 見えたもの | 判定 |
| --- | --- |
| **BUILD が古い** | **キャッシュ問題。ここより先は全部無意味。§6 を見る。** |
| `D0 M0 U0 X0 T0 C0` | イベントが一切届いていない。リスナーの登録先を疑う（§2） |
| `D0 ... T0 C1` | **click しか届かない環境**。アプリ内ブラウザ等。代替操作へ（§5-5） |
| `D>0` だが `M0` | `pointermove` が来ない＝`pointercancel` されている疑い（§3-2） |
| `D>0 X>0` が同数 | **`pointerdown` の直後に `pointercancel`**。Touch Events へ切り替え（§3-3） |
| `T>0` で数字が伸びる | 入力は届いている。**バグはゲームロジック側** |
| `R0x0` | レイアウトが壊れている。座標変換が全滅（§4-11） |
| 経路タグが `Tc` 以外 | canvas には届いていない。多重登録が実際に効いている |

### 5-4. ★カウンタは必ず「フィルタ前の生イベント数」にする★

`b777ac4` で修正した罠：**以前はフィルタ後に数えていた**ため、
実際には届いているのに `0` と表示され、切り分けの役に立たなかった。

```ts
// src/core/Input.ts:440-443
const makeTouchDown = (tag: string) => (e: TouchEvent) => {
  if (alreadyHandled(e)) return;
  this.evtTouch++;              // ★ 生イベント数（フィルタ前）。ここより後で return しても数は増える
  if (isUiTarget(e.target)) return;
  ...
};
```

**診断カウンタは、ハンドラの最初の1行で増やす。** それ以外の場所で増やすと、
「届いていない」と「届いたが自分で捨てた」が区別できなくなる。

### 5-5. click しか届かない環境の自動検出と代替操作

`/home/user/tetrishoot/src/core/Input.ts:605-607`

```ts
public isClickOnlyEnvironment(): boolean {
  return this.evtClick > 0 && this.evtTouch === 0 && this.evtDown === 0;
}
```

**通常のスマホ／PC では最初の操作で `evtTouch` か `evtDown` が必ず増えるので、
この判定は絶対に成立しない。** だから常時有効にしておいて安全。

成立した場合（`6767ffe`）：

- 透明タップ層を**ゲーム中も出したまま**にする（main.ts:187-190）
- 左半分タップ＝その位置まで自機が移動（弾は出ない）／右半分タップ＝短く連射（0.35秒）
- 移動はキー入力と同じ速度・同じ経路（`moveVec`）を使うので挙動が一貫する
- 画面上部に案内：「アプリ内ブラウザのためタッチ操作が使えません／右上［…］→「Safari で開く」で快適に遊べます」

### 5-6. 今は常時表示ではない

`06911b0` で、通常プレイの邪魔にならないよう条件付きにした。

`/home/user/tetrishoot/src/core/GameManager.ts:2353-2367`

```ts
private shouldShowInputDiagnostics(): boolean {
  if (this.debugQueryForced === null) {
    let forced = false;
    try { forced = /[?&#]debug(=1)?\b/.test(window.location.search + window.location.hash); }
    catch { forced = false; }
    this.debugQueryForced = forced;
  }
  if (this.debugQueryForced) return true;
  // 異常時のみ：操作が始まっているのに、タッチもポインタも1件も届いていない
  const input = this.lastInput;
  return !!input && input.evtClick > 0 && input.evtTouch === 0 && input.evtDown === 0;
}
```

- `?debug=1` を付けたときは必ず表示
- **異常時は自動で表示**（代替操作の案内も同時に出るので、状況説明として意味がある）
- **BUILD 日時だけはタイトル画面の VER 行の下に常に小さく残す**（GameManager.ts:3083-3084）。
  §1-4 の理由で「今どのビルドが動いているか」は常に一目で確認できる必要がある。

---

## 6. キャッシュ自動復旧（`version.json` パターン）

§1-4 の問題への対策。**次回作では初日からこれを入れる。**

### 6-1. ビルド時に BUILD ID と `version.json` を出す

`/home/user/tetrishoot/vite.config.ts:4-44`

```ts
// ★ ビルド識別子（BUILD ID）
const buildId = (() => {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    return `${stamp} ${sha}`;
  } catch { return stamp; }
})();

export default defineConfig({
  base: './',                                   // GitHub Pages / itch.io 両対応（相対パス解決）
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    {
      // ★ 最新ビルド判定用の version.json を出力する。
      //   itch.io は butler で push しても index.html の URL が変わらないため
      //   （butler のログにある通り html5 チャンネルは1つの upload に build を積む方式）、
      //   端末やCDNに古い index.html が残ると、そこから参照されるハッシュ付きJSも
      //   古いままになり「直したはずなのに直らない」が延々と続く。
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) });
      },
    },
  ],
});
```

> `base: './'` は必須。itch.io は zip を任意のパス配下に展開するので、絶対パスだと全滅する。

### 6-2. 起動時に `no-store` で取りに行き、違えば `?v=` を付けて読み直す

`/home/user/tetrishoot/src/main.ts:33-58`

```ts
// ★ 自動キャッシュ復旧：itch.io は butler で更新しても index.html の URL が変わらないため、
//   端末／CDN に古い index.html が残ると、そこから参照される古いハッシュ付きJSを
//   いつまでも実行し続けてしまう（「直したはずなのに直らない」の正体）。
//   起動時に version.json を no-store で取得し、自分のビルドIDと食い違っていたら
//   ?v=<新しいID> を付けて読み直す。URL が変わるので必ず新しい実体が取得される。
//   無限リロードを防ぐため、既に同じIDで読み直している場合は何もしない。
function checkForNewerBuild(): void {
  try {
    const probe = new URL('version.json', document.baseURI);
    probe.searchParams.set('_', String(Date.now()));          // ① URL 自体も毎回変える
    void fetch(probe.toString(), { cache: 'no-store' })        // ② それでも no-store を付ける
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { build?: string } | null) => {
        const latest = data && typeof data.build === 'string' ? data.build : null;
        if (!latest || latest === __BUILD_ID__) return;
        const here = new URL(window.location.href);
        if (here.searchParams.get('v') === latest) return;    // ③ すでに読み直し済み＝無限ループ防止
        here.searchParams.set('v', latest);
        window.location.replace(here.toString());
      })
      .catch(() => { /* オフライン等は無視 */ });
  } catch {
    /* 何があってもゲーム本体には影響させない */
  }
}
checkForNewerBuild();
```

**3つの必須ガード：**

1. `?_=<timestamp>` で `version.json` の URL 自体を毎回変える（`no-store` を無視する CDN 対策）
2. `{ cache: 'no-store' }`
3. **`?v=` が既に一致していたら何もしない。** これが無いと無限リロードになり、
   ゲームが永久に起動しなくなる。**一番危険な部分なので、ここだけは絶対に手を抜かない。**

さらに全体を `try { } catch { }` で包み、**この機能の失敗がゲーム本体を巻き込まないようにする。**

### 6-3. weed がやっていた、もっと簡単な方法

ビルドツールを使わない小規模な作品なら、**手書きのクエリ文字列で十分**。

```html
<!-- /home/user/mukkii-game/weed/index.html:11, :35 -->
<link rel="stylesheet" href="style.css?v=20260906-18" />
<script src="game.js?v=20260906-18"></script>
```

`?v=` を上げるたびに URL が変わるので、**古い `index.html` さえ取れれば**確実に新しい実体が降る。
weed が同じ iPhone・同じ itch.io でずっと安定していた理由の一つがこれ。

---

## 7. パフォーマンス：配列の `splice` が主犯だった

「スマホだと少し処理が遅い気がする」という**曖昧な体感報告**からスタートして、
**計測で犯人を確定させた**という話。

### 7-1. 修正前（CPU 1/4 速、540x720、deviceScaleFactor 2）

| 条件 | fps | update p50 | update p95 | draw p50 | 粒子数 |
| --- | --- | --- | --- | --- | --- |
| 9面 HARD | **17.2** | 28.60 ms | 146.90 ms | 4.30 ms | **11106** |
| 10面 HARD | **17.1** | 26.00 ms | 106.50 ms | 4.70 ms | |
| 8面 HARD | 29.3 | 8.80 ms | 67.20 ms | 4.10 ms | |

**重かったのは描画ではなく `update` 側。** draw はずっと 4ms 台で安定している。
CPU プロファイラで全体の **68.8% が `ParticleManager.update` に集中**していた。

### 7-2. 原因は2つ

1. **寿命切れのたびに `particles.splice(i, 1)` していた。**
   敵が大量に死んで粒子が同時に大量消滅する場面で、配列の詰め直しが **O(n²)** になる。
2. **粒子数に上限が無く、際限なく増え続けていた**（11,000個まで到達）。

### 7-3. 修正（`b777ac4`）

**(a) 1パス・コンパクション（O(n)、追加確保ゼロ）**

`/home/user/tetrishoot/src/effects/Particle.ts:188-209`

```ts
public update(dt: number): void {
  // ★ 性能対策：以前は寿命切れのたびに splice(i, 1) していたため、
  //   粒子が数千個あって同時に大量消滅する場面（＝敵が大量に死ぬ場面）で
  //   配列の詰め直しが O(n^2) になり、1フレーム 150ms 級のスパイクを起こしていた。
  //   生き残りを前から詰め直す1パス方式（O(n)・追加確保なし）に変更。
  //   ついでに画面外へ大きく飛び去った粒子もここで捨てる（描画されないため）。
  const arr = this.particles;
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += p.gravity * dt;
    p.alpha -= p.decay * dt;
    if (p.alpha > 0 && p.x > -60 && p.x < CANVAS_WIDTH + 60 && p.y > -60 && p.y < CANVAS_HEIGHT + 60) {
      if (w !== i) arr[w] = p;
      w++;
    }
  }
  arr.length = w;
  ...
}
```

**このパターンを覚えること。** 読み取りインデックス `i` と書き込みインデックス `w` を別々に進め、
最後に `arr.length = w` で切る。**新しい配列を作らないので GC も増えない。**

**(b) 上限を設けて emit 時にクランプ**

`/home/user/tetrishoot/src/effects/Particle.ts:32-42`

```ts
// ★ 性能対策：粒子数の上限。
//   9面HARDの実測では上限が無いと 11,000 個まで膨れ上がり、
//   update だけで 1フレーム 150ms を食って（スマホ想定のCPU 1/4 速度で）
//   完全に処理落ちしていた。見た目はこの程度で十分に派手なので上限を設ける。
private static readonly MAX_PARTICLES = 1100;

/** 上限を超えないよう、今から出せる個数を返す */
private roomFor(count: number): number {
  const room = ParticleManager.MAX_PARTICLES - this.particles.length;
  return room <= 0 ? 0 : (count < room ? count : room);
}
```

使い方（同 :98-100）：

```ts
public emitExplosion(x: number, y: number, color: string, count = 20, big = false): void {
  count = this.roomFor(count);
  if (count === 0) return;
  ...
}
```

**上限値の決め方：** 単発の爆発は最大でも約400個。9箇所同時爆発でも870個で上限に当たらない。
**つまり上限に当たるのは「もともと処理落ちしていた場面」だけ**なので、
**見た目は一切変わらない。** 上限は「普段は絶対に触れない高さ」に置く。

**(c) 描画側の状態変更コアレス**

同じ色・同じ不透明度が続く場合は `fillStyle` / `globalAlpha` の設定を省く（同 :226-228 以降）。
粒子1個ごとの `set` が地味に重い。

### 7-4. 修正後（同じ計測環境）

| 条件 | 結果 |
| --- | --- |
| **CPU 1/4 速** | 9面 / 10面 / 5面 / 8面 **すべて 60.0 fps**。update p50 **0.1〜0.5 ms**（約 1/57）、p95 0.8〜1.3 ms、draw p50 1.4〜2.3 ms |
| **CPU 1/6 速** | 9面 60.0 / 10面 53.7 / 5面 60.0 / 8面 58.8 fps。update p50 0.1〜0.8 ms、draw p50 1.9〜3.5 ms |

CPU 1/6 速・10面 HARD での V8 プロファイル：

```
81.7%  (idle)
12.9%  (program)   ← ブラウザ内部（ラスタライズ／コンポジット）
 1.3%  fillRect
 0.5%  ParticleManager.draw
 0.2%  GC
その他すべて 0.3% 未満
```

**JS のメインループの仕事は事実上ゼロになった。**
1/6 速で残る 18.4ms/frame（16.7ms 予算を少し超過＝54fps の正体）は、
**JS ではなくブラウザ内部の描画処理**。ここから先は JS 側でできることは少ない。

### 7-5. 続き：描画側の残りを A/B で削った（`f1de495`）

「まだ少し遅い気がする」の残りを、CPU 1/6 速・DPR3（かなり古いスマホ相当）で
**描画要素を1つずつ切って交互に測る A/B** で切り分けた。

| 要素 | 切った時の改善 |
| --- | --- |
| CRT オーバーレイ2枚（走査線・ビネット） | **改善なし＝コストほぼゼロ** |
| 弾の `shadowBlur` | 約 0.5 ms |
| パーティクル上限 1100→400 | 約 0.4 ms |
| **星空（Starfield）全体** | **約 1.9 ms ← 残りの最大要因** |

さらに星空を3条件の交互測定で分解：

| 内訳 | コスト |
| --- | --- |
| 星100個の描画 | +0.02 ms（実質ゼロ） |
| **渦巻き銀河の描画** | **+1.07 ms ← 星空コストのほぼ全部** |

**対応：**

- 渦巻き銀河（ネビュラのグラデーション＋中心コア＋腕の星182個）は**中身が変化しない**ので、
  初回に一度だけオフスクリーンへ描き、毎フレームは回転付きの `drawImage` 1回だけにした
  （`src/core/Starfield.ts:148, :158, :216`）。
  以前は**毎フレーム「グラデーション2個の生成 ＋ `fillRect` 182回」**だった。
- 銀河が完全に画面外にある間は転送自体を省略。
- 星は色・またたきグループ順に並べ替えて生成し、描画ループでの `fillStyle` / `globalAlpha` 設定を
  「星ごと」から「連続した塊ごと」に削減。またたきの位相を8グループに集約（見た目は変わらない）。

  ```ts
  // src/core/Starfield.ts:49-50
  this.stars.sort((a, b) =>
    a.color === b.color ? a.twinkleGroup - b.twinkleGroup : (a.color < b.color ? -1 : 1)
  );
  ```

**結果：** 星空全体 1.93 ms → 1.28 ms（CPU 1/6 速・DPR3 時）。
実速度換算で約 0.2 ms/frame なので、**実機の iPhone では無視できる水準。**
見た目は一切変更なし。CRT 演出は実測でコストほぼゼロだったのでそのまま維持。

### 7-7. ★BGM は `setInterval` で鳴らしてはいけない（オーディオ時計で先読み予約する）★

作者からの報告：**「スマホの方が BGM が遅く感じる。気のせい？」**
→ **気のせいではなかった。そして、これは同時に「負荷メーター」でもあった。**

#### 何が起きていたか

チップチューンBGMは `setInterval` で1音ずつ鳴らしていた。

```ts
// 修正前 /home/user/tetrishoot/src/core/Sound.ts
this.bgmIntervalId = window.setInterval(() => {
  const now = this.ctx.currentTime;   // ← 「タイマーが起きた今」で鳴らしている
  osc.start(now);
  osc.stop(now + 0.13);
}, tempo);                             // tempo = 125ms（戦闘中）
```

`setInterval` は**メインスレッドが混んでいれば平気で遅れて起きる**。
そして起きた瞬間の時刻で鳴らしているので、**遅れがそのままテンポの乱れになる**。
描画が重いほど音楽がもたつく＝スマホほど遅く聞こえる、という理屈。

#### 実測（音符の間隔。本来はぴったり 125ms）

| | 負荷なし | CPU 1/10 速 |
|---|---|---|
| 修正前 | 中央値 121.9ms **ばらつき ±5.1ms**（119〜131ms） | 中央値 127.7ms **ばらつき ±18.5ms（70〜171ms）** |
| 修正後 | 125.0ms **±0.0ms**（125〜125ms） | 125.0ms **±0.0ms**（125〜125ms） |

負荷時に音符の間隔が **70ms〜171ms** まで暴れていた。平均は 125ms 付近のままなので
「平均テンポ」では見えないが、**揺れているものは人間の耳には「遅い・もたつく」と聞こえる**。

#### 正しいやり方：タイマーは「予約しに行くきっかけ」でしかない

Web Audio には**メインスレッドとは独立した正確な時計**（`ctx.currentTime`）がある。
`osc.start(t)` は未来の時刻 `t` を渡せる。だから、

- タイマーは短い間隔（40ms程度）で**起きるだけ**
- 起きたら「これから 0.18 秒先までに鳴るべき音」を**まとめて正確な時刻で予約する**
- 次の音の時刻は `nextNoteTime += beat` と**足し算で積む**（起きた時刻は一切使わない）

```ts
// 修正後 /home/user/tetrishoot/src/core/Sound.ts
const LOOKAHEAD = 0.18;                 // 何秒先まで予約しておくか
let nextNoteTime = ctx.currentTime + 0.06;

this.bgmIntervalId = window.setInterval(() => {
  // タブ復帰などで大きく取り残されたら現在時刻へ貼り直す（早送りで追いつかない）
  if (nextNoteTime < ctx.currentTime - 0.3) nextNoteTime = ctx.currentTime + 0.03;

  while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
    const at = nextNoteTime;            // ← 「起きた時刻」ではなく「予約時刻」
    osc.frequency.setValueAtTime(freq, at);
    osc.start(at);
    osc.stop(at + 0.13);
    nextNoteTime += beat;               // 足し算で積むので誤差が蓄積しない
  }
}, 40);                                 // 先読み幅より十分短い間隔
```

タイマーが 100ms 遅れて起きても、音は正確な時刻に予約済みなので**テンポは1ミリ秒も崩れない**。

> これは Web Audio では定番のパターンで、Chris Wilson の
> "A Tale of Two Clocks"（2013）という有名な解説記事がある。
> **知っていれば常識、知らなければまず気づけない類の知識。**

#### ついでに：爆発音の波形は毎回合成しない

爆発のたびに数万サンプルのノイズを JS ループで合成していた（1回あたり
12,000〜23,000 回の `Math.random`＋`Math.exp` と 50〜92KB の使い捨て配列）。
ボス撃破では 440ms のあいだに5連発するので、フレームの合間にまとまった処理とゴミが出る。
**波形は種類ごとに数パターンだけ作って使い回す**（複数から選ぶので音の繰り返しには聞こえない）。

#### 長いBGMを `decodeAudioData` しない

`trial` ブランチの `stage_bgm.mp3` は 8.3MB / 5分48秒。
これを `decodeAudioData` すると **PCM で約134MB の AudioBuffer** になり、
セッション中ずっと保持される。iPhone の WebView ではメモリ強制終了の危険域。
長尺BGMは `<audio>` 要素でストリーム再生するか、少なくとも
**本番（`main`）には載せない**（現状 itch.io へは `main` だけを送っているので影響は無い）。

---

### 7-6. 一般ルール

1. **大きい配列のループの中で `splice` しない。** 1パス・コンパクション（`i` と `w`）を使う。
2. **パーティクル等、無制限に増えうるものには必ず上限を設ける。**
   上限は「普段は絶対に触れない高さ」に置く（見た目を変えないため）。
3. **画面外に出たものは update の同じパスで捨てる。**
4. **毎フレーム作り直しているもの（グラデーション、パスなど）はキャッシュする。**
   中身が変化しない複雑な絵はオフスクリーンに焼いて `drawImage` 1回にする。
5. **描画の状態変更（`fillStyle` / `globalAlpha` / `shadowBlur`）はまとめる。** データを先にソートしておく。
6. **体感報告は必ず計測に変換してから直す。** 「重そうなところ」を勘で直すと、
   今回のように**描画を疑って update が犯人だった**という取り違えが起きる。
7. **A/B は「1つずつ切って交互に測る」。** まとめて切ると何が効いたか分からない。
8. **音の時刻はオーディオ時計で決める。** `setInterval` が起きた時刻で鳴らさない。
9. **BGM のテンポの乱れは、そのままメインスレッド負荷のメーター**として使える。
   「音楽がもたつく」という報告は、感想ではなく計測値として扱うこと。

---

## 8. 次回作チェックリスト（1日目からやること）

### 初期セットアップ（コードを書き始める前）

- [ ] `vite.config.ts` に `base: './'` を設定する（itch.io / GitHub Pages 両対応）
- [ ] `__BUILD_ID__`（日時 + git short SHA）を `define` で埋め込む
- [ ] `version.json` を emit するプラグインを入れる
- [ ] 起動直後に `checkForNewerBuild()` を呼ぶ（`?v=` 一致時は何もしない無限ループ防止を必ず入れる）
- [ ] タイトル画面の隅に BUILD ID を常時表示する
- [ ] `window.error` / `unhandledrejection` を拾って画面に出すオーバーレイを入れる
      （**`pointer-events:none` を忘れない**）

### 入力（ここが一番重要）

- [ ] リスナーは **canvas / container / body / html / document / window の6系統**に登録する
- [ ] `alreadyHandled(e)`（イベントに `__gxSeen` を立てる）で重複処理を排除する
- [ ] 全リスナーを **`{ capture: true }`** で登録する
- [ ] Touch 系は **`{ passive: false }`** で登録し、`preventDefault()` する
- [ ] **タッチの主系統は Touch Events。** Pointer はマウス用 ＋ 「まだ `touchstart` を
      一度も見ていない環境」限定で動的に切り替える（`touchEventsSeen` フラグ）
- [ ] 入力状態は **ID をキーにした `Map`** で持つ。**一方向ラッチを作らない**
      （古い状態が新しい入力をブロックする構造は絶対に作らない）
- [ ] 解放経路：`pointerup` / `pointercancel` / `lostpointercapture` /
      `touchend` / `touchcancel` / **`e.touches.length === 0` で全解放** /
      `blur` / `pagehide` / `visibilitychange` / **数秒のウォッチドッグ（stale フラグのみ、切る方向だけ）**
- [ ] `toCanvas()` に `rect.width <= 0` のフォールバックを入れる
- [ ] タップ1回で必ず反応するよう、立ち上がりフラグ（`justShoot` 等）を用意する

### 保険（DOM ボタン）

- [ ] タイトルに**透明な本物の `<button>`** を重ね、`click` でゲームへタップを流す
- [ ] **既定を「表示」にする**（rAF が死んでいても操作手段が残る）
- [ ] タップ座標をそのままゲームへ渡す（メニュー選択もこの経路で動くように）
- [ ] 直前 700ms 以内に `pointerdown` があれば無視（二重入力防止）
- [ ] **そのボタンの上では `touchstart` を `preventDefault` しない**
      （iOS が `click` を出さなくなる）。スクロール抑止は CSS の `touch-action:none` に任せる

### CSS / HTML

- [ ] viewport meta に `user-scalable=no, viewport-fit=cover`
- [ ] `html, body, #game-container, canvas` に `touch-action: none; overscroll-behavior: none;`
- [ ] `body` に `overflow: hidden`
- [ ] `user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;`
- [ ] **押しても何も起きないボタンを画面に置かない**（フルスクリーンボタン等は対応判定して隠す）
- [ ] **不可視の当たり判定を、その画面で使わないなら止める**

### ループと堅牢性

- [ ] `requestAnimationFrame` の再登録は **`finally`** で
- [ ] フレーム毎の入力リセットも **`finally`** で
- [ ] エラー表示は **最初の1回だけ**（毎フレーム出すと画面が埋まる）
- [ ] `localStorage` アクセスは全部 `try/catch`（itch.io は他ドメイン iframe。ITP で例外が飛ぶ）
- [ ] `AudioContext` の生成失敗を本体に巻き込まない。**解除リスナーは外さない**
- [ ] `AudioContext` 生成と音声デコードはページ読み込み直後に前倒しする（`resume()` だけが操作を要求）
- [ ] **iframe / タッチ環境では自動フルスクリーンを一切やらない**
- [ ] 新しい Canvas API（`roundRect` 等）にはフォールバックを添える

### 診断

- [ ] 生イベント数カウンタ `D/M/U/X/T/C` を**ハンドラの最初の1行で**増やす（フィルタ前）
- [ ] 経路タグ（`Tc` / `Td` / `Pw` / `Mb` …）を出す
- [ ] 直近イベントのキャンバス座標を出す
- [ ] canvas の実表示サイズ `R<w>x<h>` を出す
- [ ] `?debug=1` で強制表示。**異常時（`C>0 && T0 && D0`）は自動表示**
- [ ] `isClickOnlyEnvironment()` を用意し、成立時の代替操作と案内文を用意する

### パフォーマンス

- [ ] パーティクル等に**上限**を設ける。emit 時に残り枠へクランプ
- [ ] 配列の除去は**1パス・コンパクション**（ループ中の `splice` 禁止）
- [ ] 画面外のものは update の同じパスで捨てる
- [ ] 毎フレーム作り直しているグラデーション／複雑な静止画はキャッシュ・オフスクリーン化
- [ ] 描画状態の変更をまとめるため、描画データを色などでソートしておく

### デプロイと検証

- [ ] itch.io へは **`butler push dist <user>/<game>:html5`**（GitHub Actions 化推奨）
- [ ] デプロイ後の検証は **必ず端末画面の BUILD ID で行う**。
      **「Run game ボタンの有無」「フルスクリーンになるか」で判断しない**（モバイルでは常にそうなる）
- [ ] 自分のアカウント設定「Require a click to run HTML5 game embeds」の状態を把握しておく
      （PC での見え方がプロジェクト設定と食い違う原因）
- [ ] 実機で直らないときは、**まず `?v=<何か>` を手で付けてキャッシュを外して再確認**してから、
      コードを疑う
- [ ] itch.io 版と GitHub Pages 版の**両方で同じ端末で試す**。
      **片方だけ壊れる＝クロスオリジン iframe 固有の問題**と即断定できる。
      これが今回いちばん役に立った切り分けだった

---

## 9. 付録：症状から原因への逆引き

| 症状 | 最初に見るもの |
| --- | --- |
| 「itch.io だけ動かない、GitHub Pages なら動く」 | **クロスオリジン iframe 固有**。入力の登録先（§2）と Pointer/Touch（§3） |
| 「直したはずなのに何も変わらない」 | **BUILD ID を見る**（§1-4, §6） |
| 「タイトルは反応するがゲーム中は無反応」 | `pointercancel` を疑う（§3-2）。診断表示の `X` を見る |
| 「画面は出るが完全に無反応」 | **rAF ループが死んでいる可能性**（§4-1）。エラーオーバーレイを見る |
| 「一度効いたが、そのあと永久に無反応」 | **一方向ラッチ／状態デッドロック**（§3-1）。解放経路を見る（§4-3） |
| 「弾が出ない（移動はできる）」 | 座標変換が壊れて全タッチが左半分扱い（§4-11）。`R` を見る |
| 「画面の一部を押すと変なことが起きる」 | 不可視の当たり判定・無反応ボタン（§4-6, §4-7） |
| 「ゲームが一切起動しない」 | `localStorage` の例外（§4-9）。エラーオーバーレイを見る |
| 「スマホだと少し遅い」 | **勘で直さない。** 計測して A/B で切り分ける（§7） |
