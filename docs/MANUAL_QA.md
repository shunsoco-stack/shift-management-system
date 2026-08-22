# シフト管理システム Manual QA

自動テストを補完する、完成Workflowの手動確認手順です。DesktopとMobileでは登録不要Demo、API RoleではD1経路を分けて確認します。

## 1. 前提と記録

```bash
npm install
npm run dev
```

確認開始前に次を記録してください。

- 実施日時とCommit hash
- OS / Browser / Browser version
- 表示幅とDevice Pixel Ratio
- D1利用時のmigration適用先
- Console errorとNetwork errorの有無

`/demo`の「Demoを初期化」から同梱状態へ戻します。初期値は2026年9月、架空スタッフ12名、提出済み10名、未提出2名、現在状態Draftです。Sidebarの接続表示が`Server Role 接続済み`、`Server Role 接続中`、`Local Demo fallback`のどれかも記録します。

## 2. Desktop E2E Workflow

推奨幅は1440 × 900です。

### 2.1 ランディング

1. `/`を開く
2. HeaderとHeroの名称を確認する
3. 「登録なしでDemoを開始」を選ぶ

期待結果:

- 名称がすべて「シフト管理システム」
- Heroに希望、必要人数、Conflict、確定・公開の価値が表示される
- シフト表Previewに不足`-2名`と過剰の例がある
- `/demo`へ遷移し、Console errorや404 Assetがない

### 2.2 従業員の希望提出

1. Role切替で「従業員」を選ぶ
2. 従業員selectから初期未提出者の「吉田 凛」または「山田 直樹」を選ぶ
3. Dashboardの「9月の希望」が未提出であることを確認する
4. 「希望シフト提出」を開く
5. 9月8日を選び「出勤可能」、開始`18:00`、終了`22:00`、備考を入力する
6. 別の日を「希望休」にする
7. 「希望を提出」を選ぶ

期待結果:

- 月間カレンダーに出勤可能、希望休、未設定の凡例と件数がある
- 選択した日だけ入力内容が更新される
- 希望休では時刻入力がdisabledになる
- 備考は120文字以内で文字数が表示される
- 提出期限「8月20日（木）23:59」と期限超過警告が表示される
- 提出後に成功Toastが出て、Dashboardは「提出済み」になる
- 希望を編集すると提出状態がDraft相当へ戻り、再提出できる
- Backend接続時はemployee session取得後、希望Draft保存と提出がD1へ同期される
- API失敗時も画面操作は失われず、接続表示がLocal fallbackへ変わる

### 2.3 管理者の提出確認

1. Roleを「管理者」へ戻す
2. Dashboardの希望提出数を確認する
3. 「希望提出状況」を開く
4. 直前に提出した従業員を選ぶ

期待結果:

- 提出数が10 / 12から11 / 12へ増える
- 未提出数が2名から1名へ減る
- 選択した従業員の第2週の希望時間と備考が表示される
- 期限超過Noticeと提出済み件数が同時に表示される
- Role切替後はmanager Demo sessionへ切り替わり、既存CookieのRole値をClientが任意指定して認可を迂回できない

### 2.4 必要人数と不足・過剰

1. 「必要人数設定」を開く
2. 任意の曜日・時間帯で`＋`を1回選ぶ
3. 表右端の不足状態を確認する
4. 「シフト作成」を開き、同じ曜日・時間帯を確認する
5. 必要人数を下げ、過剰配置表示も確認する

期待結果:

- 曜日×3時間帯のstepperが0〜12名で動く
- 必要人数変更直後に不足件数が通常コードで再計算される
- シフト表下部に`割当 / 必要`と差分が表示される
- 不足は負数、差が+2名以上の枠は過剰として表示される
- 過剰配置の割当が自動削除されない
- 変更履歴に変更前 / 変更後が追加される
- Backend接続中は350ms debounce後に必要人数と割当setがD1へbest-effort同期される

### 2.5 Draft自動作成

1. Dashboardまたはシフト作成画面で「シフト案を自動作成」/「自動作成」を選ぶ
2. 週間シフト表を確認する
3. 不足、人員過剰、Conflictの件数を確認する
4. 同じ初期状態へResetし、もう一度自動作成する

期待結果:

- 結果の状態は必ずDraft
- 自動割当へ`AUTO`ラベルが付く
- 提出済みの出勤可能時間内を優先する
- 日次勤務上限と重複を超える候補を割当前に除く
- 埋められない時間帯は不足のまま残る
- 自動作成後にConflictが再計算される
- 同じ初期状態と入力では同じ割当になる
- UIまたは説明に「通常コード」「AI不使用」「管理者確認」が示される
- 全体最適化を保証する表現がない

### 2.6 Conflictと人による調整

1. 「Conflict」を開く
2. 「すべて」「重要」「確認」のfilterを切り替える
3. 希望休または希望時間外の項目から「シフト表で調整」を選ぶ
4. Conflictのある勤務枠を選ぶ
5. 開始・終了・休憩を希望に沿う値へ変更し保存する
6. 追加buttonから勤務枠を作成し、終了を開始以前にして保存を試す
7. 正しい値へ直して保存し、必要なら削除も確認する

期待結果:

- Conflictは希望休、希望時間外、重複、最大勤務、休憩、勤務間隔、連勤から該当候補を表示する
- 重要度filterの件数と一覧が一致する
- 「法令準拠を完全に保証しない」注意書きがある
- Editorに本人の提出希望と現在のConflictが表示される
- 不正な時間範囲はinline errorとなり保存されない
- 保存後にConflict、人員不足、過剰が再計算される
- 自動修正や自動削除は行われない
- 追加、更新、削除が変更履歴へ残る
- Drag & Dropを示すhandleや未動作のgestureがない

### 2.7 Review / Confirmed / Published

1. シフト表またはDashboardのWorkflowを開く
2. `Reviewへ進む`を選ぶ
3. `シフトを確定`を選ぶ
4. `従業員へ公開`を選ぶ

期待結果:

- 状態が`Draft → Review → Confirmed → Published`の順で進む
- 現在状態がStatus pill、Workflow rail、Sidebarへ一貫して表示される
- Publishedで前進buttonがdisabledになる
- 各遷移が変更履歴へactor、時刻、before、after付きで追加される
- Backend接続時は同じ順序の遷移だけがD1で受理される
- Backend同期失敗時はLocal fallbackへ変わり、UIのWorkflowは継続できる

### 2.8 公開後の従業員表示

1. Published後にRoleを「従業員」へ切り替える
2. 「自分のシフト」を開く
3. 「今日」「今週」「今月」を切り替える
4. 複数の従業員をselectで切り替える

期待結果:

- 公開済みsnapshotだけが表示され、管理者のDraft編集内容は直接見えない
- 今日、今週、今月で対象日と勤務合計が切り替わる
- 他人のシフトはselectでDemo人物を明示的に切り替えたときだけ表示される
- 勤務がない期間には空状態が表示される
- 「法令準拠を保証しない」注記がある

### 2.9 確定後変更とAudit

1. 管理者へ戻す
2. ConfirmedまたはPublished相当の状態で勤務枠を編集する
3. 「変更履歴」を開く

期待結果:

- Client Demoでは状態がReviewへ戻る
- 変更履歴に管理者、操作時刻、従業員と日付、変更前時間・休憩、変更後時間・休憩が表示される
- Published D1 revisionへの同期は409で拒否され、UIはLocal fallbackへ切り替わる
- D1で継続編集する場合は`/api/shift-periods/revise`から新しいDraft revisionを作る
- 新revisionは希望、必要人数、割当、制約をcopyし、元Published revisionを変更しない

## 3. Mobile QA

390 × 844と320px幅の両方で確認します。

1. `/demo`を開く
2. 上部のRole切替と従業員selectを操作する
3. 下部navからDashboard、シフト、希望提出を移動する
4. 希望カレンダーで日を選び、時刻と備考を入力して提出する
5. 管理者でシフト表を横scrollする
6. 勤務枠を開き、下から出るEditorで保存・取消・削除を確認する
7. Conflict一覧、必要人数表、Audit表をscrollして確認する
8. 端末のSafe Areaがある場合は下部navとToastを確認する

期待結果:

- Sidebarが下部navへ置き換わり、現在地が文字と色で分かる
- Role切替、主要CTA、従業員selectがviewport外へ出ない
- 希望カレンダーが横にはみ出さず、320pxでも日を選べる
- シフト表は表全体を潰さず横scrollでき、スタッフ列と時間が判読できる
- Editorはbottom sheetになり、画面高を超える内容は内部scrollできる
- Toastは下部navと重ならない
- 横方向のページ全体scroll、切れたCTA、意図しないzoom、操作不能なhover-only UIがない
- MobileでSidebarの接続表示が見えない場合も、接続失敗で主要操作が停止しない

## 4. Keyboard / Accessibility QA

MouseやTouchを使わずに確認します。

1. `/demo`で最初に`Tab`を押し、Skip linkを表示して`Enter`する
2. Role切替、Sidebar nav、Dashboard cardを`Tab`と`Enter`で操作する
3. 希望カレンダーの日付button、出勤可能 / 希望休、時刻、備考、提出を操作する
4. 必要人数の増減buttonとシフト表の勤務枠を操作する
5. 勤務枠Editorを開き、`Escape`で閉じる
6. Editorを再度開き、各fieldと保存 / 取消 / 削除へ移動する
7. Conflict filterと今日 / 今週 / 今月のsegmentを操作する
8. OSのReduced Motion、Reduced Transparency、High Contrast相当を有効にする

期待結果:

- Skip linkから`#demo-main`へ移動できる
- すべてのbutton、link、select、input、textareaに可視focusがある
- 現在地は`aria-current`、toggleは`aria-pressed`、日付は`aria-selected`で伝わる
- Iconだけのbuttonに具体的なaccessible nameがある
- Toastは`role="status"`、入力errorは`role="alert"`
- Dialogは`role="dialog"`、`aria-modal="true"`、見出しとの関連を持つ
- `Escape`でEditorを閉じられる
- 色だけで不足、過剰、Conflict、状態を伝えず文字labelがある
- Reduced Motionでは大きな移動・animationが実質停止する
- Reduced Transparencyではglass背景がsolidになる
- High Contrastではborderとfocusが明瞭になる

記録すべき注意点:

- Dialogの初期focus、focus trap、閉じた後のfocus復帰は実ブラウザで必ず確認し、失敗した場合はAccessibility defectとして扱う
- `role="grid"`内の日付移動は通常のTab順であり、Arrow key型gridとしては実装されていない
- 200% zoomと400% zoomでも主要Workflowを別途確認する

## 5. API Role / D1 QA

この章は`DB` bindingへ`drizzle/0000_shift_management.sql`を適用したCloudflare runtimeで実施します。`vinext dev`またはSites / Cloudflare deploymentを使用し、Cloudflare pluginを通さない素のNode runtimeでAPI routeを直接実行しません。Cookie jarを管理者用と従業員用で分けてください。

### 5.1 Session

| 操作 | 期待 |
| --- | --- |
| Cookieなしで`GET /api/shift-periods` | `401 UNAUTHENTICATED` |
| `POST /api/demo/session`へ`{"role":"manager"}` | 201、manager actor、7日有効Cookie |
| `POST /api/demo/session`へ`{"role":"employee","employeeId":"emp-001"}` | 201、employee actorとemployeeId |
| HTTPSのSet-Cookie | `HttpOnly; SameSite=Lax; Secure; Path=/` |
| `DELETE /api/demo/session` | D1 session削除、CookieのMax-Age=0 |
| 改変tokenまたは期限切れtoken | 401 |

D1の`demo_sessions.token_hash`が生tokenではなく64桁SHA-256 hexであることも確認します。

### 5.2 Role matrix

| API操作 | Employee | Manager |
| --- | --- | --- |
| 期間一覧 | 200 | 200 |
| 自分の希望取得 | 200 | 200（指定従業員または全員） |
| 自分の希望保存・提出 | 200 | 403 |
| 別従業員の希望更新 | 403 / actor本人へ固定 | 403 |
| 必要人数参照・更新 | 403 | 200 |
| Draft / Reviewの割当参照 | 403 | 200 |
| Confirmed / Publishedの自分の割当参照 | 200、自分だけ | 200、全員 |
| 割当追加・更新・削除 | 403 | 200 |
| 自動Draft作成 | 403 | 200 |
| Conflict取得 | 403 | 200 |
| 状態遷移 / Published改訂 | 403 | 200 |
| Audit取得 | 403 | 200 |

各拒否がUI非表示だけでなく、API自身の403であることを確認します。

### 5.3 Validation / Workflow / Audit

1. 希望の終了時刻を開始以前にして400を確認する
2. 期間外日付、重複日付、長すぎる備考を送って400を確認する
3. 重なる必要人数枠を送って400を確認する
4. `Draft → Confirmed`のskipを送り409を確認する
5. `Draft → Review → Confirmed → Published`を順に実行する
6. Published期間の割当、希望、必要人数を変更し409を確認する
7. Publishedから`POST /api/shift-periods/revise`を実行し、新Draft revisionを確認する
8. Managerで`GET /api/audit-logs?periodId=...`を取得する
9. D1でAudit行のUPDATE / DELETEを試し、trigger拒否を確認する

期待結果:

- Error JSONは`error.code`と日本語messageを持つ
- 正常な変更とAudit insertが同じD1 batchで実行される
- Auditにactor、Role、action、entity、period、revision、before、after、timestampがある
- Published revisionは上書きされない
- 新revisionはDraftでrevision番号と`source_period_id`を持つ
- JSON応答が`Cache-Control: no-store`

### 5.4 Staffing / Conflict / Auto API

1. Managerで`GET /api/conflicts?periodId=period-2026-09-r1`を実行する
2. `coverage`のrequiredCount、assignedCount、deltaを手計算と比較する
3. 不足と大幅な過剰配置がConflictに含まれることを確認する
4. `POST /api/shift-assignments/auto`を実行する
5. responseの`draft`、`unresolved`、`explanation`、`conflictReport`を確認する

期待結果:

- 30分単位の必要人数対割当人数が通常コードで計算される
- 過剰配置は自動削除されない
- 希望休、希望時間外、重複、最大勤務、最低休憩、最低勤務間隔、連勤を検出できる
- disclaimerが法令適合を保証しないことを明記する
- Auto responseがAI不使用の決定論的greedyであると説明する
- Auto結果は必ずDraftで、埋められない枠を`unresolved`へ残す

## 6. Persistence / Fallback QA

### 6.1 localStorage restore

1. Local Demoを初期化する
2. 必要人数、希望、割当を変更し、Roleと画面も切り替える
3. Browserを再読込する
4. `localStorage` key `shift-management-system-demo-v2`を確認する

期待結果:

- 保存済みDemo stateがshape検証後に復元される
- 保存値がない、JSONが壊れている、必要fieldが欠ける場合は既知の初期Demoへ戻る
- SSR hydration errorがない
- 「Demoを初期化」後は初期12名、提出済み10名、Draftが保存される

### 6.2 Backend connected

1. Migration済みD1を接続して`/demo`を開く
2. 接続表示が`Server Role 接続済み`になるまで待つ
3. Employee希望を提出する
4. Managerで必要人数と割当を変更する
5. 状態を一段進める
6. NetworkとD1 Record / Auditを確認する

期待結果:

- HttpOnly sessionがRole / employee切替に応じて再発行される
- 希望提出、必要人数、割当、状態遷移がbest-effort同期される
- D1で受理されたmutationにAuditが追加される
- UIはNetwork待ちで入力をblockせず、Client stateへ即時feedbackを返す

### 6.3 Local fallback

1. D1 bindingまたはAPI接続を利用できない状態で`/demo`を開く
2. 接続表示が`Local Demo fallback`になることを確認する
3. 希望提出からPublishedまで完走する
4. Browserを再読込する

期待結果:

- D1 APIの有無にかかわらず主要Demoが操作できる
- 再読込後もlocalStorageから操作状態が復元される
- Browser DemoのRoleとLocal Auditが本番認証・改ざん耐性を持つように表示されない
- Cloudflare runtime内でbinding未設定は503 `DB_BINDING_MISSING`、table未作成は503 `DB_NOT_INITIALIZED`

## 7. Visual / Responsive / Asset QA

- [ ] `public/brand/shift-management-system-icon.svg`がCalendar + People + Clockに見える
- [ ] `public/favicon.svg`がBrowser tabで表示される
- [ ] `public/og.png`がmetadataの1792 × 896指定と一致する
- [ ] Light背景で本文、Status、Alertのcontrastが十分
- [ ] 1440、1024、768、390、320pxで主要情報が欠けない
- [ ] Button押下時に即時feedbackがあり、disabledは反応しない
- [ ] Sticky top barとMobile bottom navがcontentを隠さない
- [ ] Reduced Motion / Transparency / More Contrast media queryが反映される
- [ ] Layout shift、font崩れ、SVG欠落、404画像がない

## 8. Release Gate

次がすべて完了するまで公開完了としません。

```bash
npm run lint
npm run typecheck
npm test
npm run test:rendered
npm run build
```

- [ ] Desktop E2Eが希望提出から公開シフト確認まで通る
- [ ] Mobile 390px / 320pxで同じ主要Workflowを完了できる
- [ ] Keyboardで主要操作を完了できる
- [ ] API Role matrixをserver-sideで確認した
- [ ] Published保護、新revision、Audit triggerを確認した
- [ ] Backend接続とLocal fallbackの両方を確認した
- [ ] localStorage復元と壊れた保存値からの回復を確認した
- [ ] Console error、Hydration warning、Network 404がない
- [x] 公開URLの`/`と`/demo`が200で、作品名を返すことを確認した
- [x] GitHub URLが作品専用repositoryであることを確認した
- [x] 採用スクリーンショットが公開アプリから撮影され、架空Demoデータだけを含む
