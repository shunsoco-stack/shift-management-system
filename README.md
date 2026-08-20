# シフト管理システム

従業員の希望提出、曜日・時間帯ごとの必要人数、勤務条件、Conflict、管理者の調整、確定、公開を一つの業務Workflowとして扱うWebシステムです。単にカレンダーへ人を置くのではなく、割当の根拠と確認すべき問題を可視化し、人が最終判断して公開するところまでを実装しています。

- 作品カテゴリ: **業務システム**
- サブカテゴリ: **シフト・人員配置**
- 登録不要Demo: `/demo`
- 公開URL: [shift-management-system.kinjo653222.chatgpt.site](https://shift-management-system.kinjo653222.chatgpt.site)
- GitHub URL: [shunsoco-stack/shift-management-system](https://github.com/shunsoco-stack/shift-management-system)

> [!IMPORTANT]
> Conflictは勤務条件との不一致候補を見つけるための支援情報です。本システムは法令準拠を完全に保証するものではなく、店舗ルール、雇用契約、実際の勤務状況を踏まえた管理者の確認が必要です。

## Overview

実装は、すぐ試せるブラウザ内Demoと、Cloudflare D1へ永続化するサーバーAPIの二層で構成しています。

| Surface | 実装内容 |
| --- | --- |
| `/` | シフト表、人員不足、Workflowを紹介するSSRランディングページ |
| `/demo` | 12名の架空スタッフで、従業員と管理者の一連の操作を体験できるクライアントDemo |
| `/api/*` | D1、Demo session、server-side Role判定、入力検証、監査記録を持つ業務API |
| `src/domain/*` | 人員充足、Conflict、自動割当、Workflow、Role、Auditを扱う副作用のないドメインロジック |
| `drizzle/0000_shift_management.sql` | D1テーブル、初期Demoデータ、追記専用Audit、Published保護を含むmigration |

Demo UIはversion付きkeyの`localStorage`から検証済み状態を復元し、変更を継続保存します。同時に`/api/demo/session`からHttpOnly sessionを取得し、希望提出、必要人数、割当、状態遷移をD1へbest-effortで同期します。接続または同期に失敗した場合だけ、同梱データとReact Context / `localStorage`によるLocal Demoへ自動フォールバックし、現在の接続状態を画面へ表示します。D1 APIは`DB` bindingとmigrationが必要で、Cloudflare runtime内で未設定なら`503 DB_BINDING_MISSING`、未初期化なら`503 DB_NOT_INITIALIZED`を返します。

実装済みAPI:

- Demo session: `/api/demo/session`
- 期間・状態遷移・改訂: `/api/shift-periods`、`/api/shift-periods/transition`、`/api/shift-periods/revise`
- 希望・必要人数・割当: `/api/shift-requests`、`/api/staffing-requirements`、`/api/shift-assignments`
- Draft自動作成: `/api/shift-assignments/auto`
- Conflict / Audit: `/api/conflicts`、`/api/audit-logs`

## Shift Workflow

```text
従業員
  ↓
月間希望を入力・提出
  ↓
管理者が提出済み / 未提出を確認
  ↓
曜日・時間帯ごとの必要人数と比較
  ↓
決定論的アルゴリズムでDraft案を作成
  ↓
人員不足・過剰配置・Conflictを再計算
  ↓
管理者が勤務枠を追加・編集・削除
  ↓
Draft → Review → Confirmed → Published
  ↓
従業員が公開済みシフトを確認
```

従業員は月間カレンダーから、各日の`出勤可能`、`希望休`、開始・終了希望時間、備考を入力します。希望提出期限は期間Recordに保持し、期限後も保存・提出はできますが、画面とAPI応答の両方で警告します。

管理者画面では、提出人数、未提出人数、不足時間、Conflict件数、確定状況をDashboardへ集約しています。週間シフト表は縦に従業員、横に日付を置き、各日を12:00〜15:00、15:00〜18:00、18:00〜22:00の必要人数と比較します。勤務枠はセルを選択して開始、終了、休憩を編集する方式です。Drag & Dropは安定性を優先して採用していません。

前進時の状態遷移は`Draft → Review → Confirmed → Published`の順番に限定しています。D1では`Review → Draft`と`Confirmed → Review`も許可し、Published revisionは直接変更できません。管理者は専用APIでPublishedから新しいDraft revisionを作成できます。クライアントDemoでは確定・公開後の割当変更をReviewへ戻し、誰が、いつ、どの勤務枠を、どう変更したかを履歴へ追加します。

## Staffing Requirement

必要人数は`曜日 + 開始時刻 + 終了時刻 + 必要人数`で保持します。Demoには全曜日について次の3枠があり、管理者は曜日別に0〜12名の範囲で増減できます。D1 APIの入力範囲は0〜99名です。

| 時間帯 | 用途例 |
| --- | --- |
| 12:00〜15:00 | ランチ帯 |
| 15:00〜18:00 | 午後帯 |
| 18:00〜22:00 | ディナー帯 |

人員差はAIへ問い合わせず、TypeScriptの通常コードで計算します。

```text
difference = assignedCount - requiredCount

difference < 0  → 不足（例: -2名）
difference = 0  → 充足
difference > 0  → 余剰
```

同じ従業員に重複した割当があっても、人員数では一人として数えます。Demo UIでは必要枠全体をカバーする割当を集計し、差が`+2名`以上の枠を過剰配置として強調します。サーバー側は30分単位で比較し、`2名以上`または必要人数の`50%以上`の余剰を大幅な過剰配置候補として扱います。過剰配置を自動削除する処理はありません。

集計値には不足時間、不足人分、不足枠数、過剰時間があり、Dashboardとシフト表は同じ割当から再計算されます。

## Conflict Detection

割当変更時にConflictを再計算し、自動修正せず一覧へ残します。

| Conflict | 検出内容 |
| --- | --- |
| 希望休への配置 | `希望休`として提出した日への割当 |
| 希望時間外 | 開始が希望より早い、または終了が希望より遅い割当 |
| 同時間帯の重複 | 同じ従業員・同じ日に重なる複数の勤務枠 |
| 最大勤務時間 | 従業員または期間の設定上限を超える勤務 |
| 最低休憩 | 6時間を超える勤務に対して登録休憩が45分未満の候補 |
| 最低勤務間隔 | 前回勤務終了から次回開始までが設定値未満の候補 |
| 連勤 | 設定された最大連続勤務日数を超える候補 |
| 不正な時間帯 | 終了が開始以前、または不正な休憩区間 |
| 人員不足 / 大幅な過剰配置 | 必要人数と割当人数の差 |

Conflictは重要度で絞り込めます。勤務枠の編集パネルにも該当候補を表示し、保存後に全体を再計算します。チェック結果は管理判断を支援するものであり、法律、就業規則、労使協定、個別契約への適合を断定しません。

## Auto Scheduling

自動作成はAIではなく、同じ入力から同じ結果を得られる決定論的グリーディ法です。

1. 日付と必要人数枠を時刻順に並べる
2. 提出済み希望だけを候補にする
3. 希望休と希望時間外の候補を除く
4. 重複割当と最大勤務時間超過の候補を除く
5. サーバー側では最大連勤日数を超える候補も除く
6. 既割当時間が少ない人、当日の割当が少ない人、従業員IDの順で選ぶ
7. 隣接する時間帯を一つの勤務枠へまとめる
8. 埋められない枠は不足として残す
9. 作成結果を必ず`Draft`にし、Conflictを再評価する

クライアントDemoは提出希望、希望時間、重複、日次勤務上限を割当前に確認し、休憩、勤務間隔、連勤などは作成後のConflict確認へ残します。サーバー側は設定された連勤上限も候補除外に使います。全体最適化ではなく説明可能な貪欲割当であり、人の確認と調整を省略しません。

## Role

画面上のRoleは`従業員`と`管理者`です。D1では値を`employee`と`manager`で保持し、Demo UI内部では`employee`と`admin`を使います。

| 操作 | 従業員 | 管理者 |
| --- | :---: | :---: |
| 自分の希望を参照・編集・提出 | ✓ | — |
| 他の従業員の希望を参照 | — | ✓ |
| 他人の希望を代理編集 | — | — |
| 必要人数を参照・変更 | — | ✓ |
| 全員の割当を参照・変更 | — | ✓ |
| 自分の確定・公開シフトを参照 | ✓ | ✓ |
| 自動作成、Conflict、状態遷移 | — | ✓ |
| Audit Logを参照 | — | ✓ |

D1 APIはリクエストごとにHttpOnly Demo sessionを解決し、server-sideでRoleと従業員所有権を確認します。従業員用の割当APIは自分のRecordだけに絞り、期間がConfirmedまたはPublishedになるまで返しません。クライアントDemoのRole切替は作品体験のためのUIであり、本人確認を伴う認証境界ではありません。

## Data Model

Cloudflare D1 / SQLite向けに次のテーブルを実装しています。

| Table | 主な責務 |
| --- | --- |
| `users` | 表示名、`employee` / `manager` Role、有効状態 |
| `employees` | Userとの対応、従業員番号、雇用区分、表示色 |
| `shift_periods` | 対象月、revision、提出期限、Workflow状態、公開日時 |
| `shift_requests` | 従業員・日付ごとの出勤可否、希望時刻、備考、提出状態 |
| `shift_assignments` | 従業員・日付・時刻・休憩・manual/auto由来 |
| `staffing_requirements` | 期間、曜日、時間帯、必要人数 |
| `constraints` | 日次上限、最低休憩、最低勤務間隔、最大連勤日数 |
| `audit_logs` | actor、Role、操作、対象、before/after、correlation ID、revision |
| `demo_sessions` | token hash、User、Role、従業員対応、失効日時 |

`shift_periods`の`period_key + revision`、希望の`period + employee + date`、必要人数の`period + weekday + time range`には一意制約があります。外部キーとCHECK制約に加え、migrationのtriggerでAudit Logの更新・削除とPublished revisionの直接変更・削除を拒否します。

## Demo Mode

`/demo`は登録不要で、固定基準日の再現可能な架空データを使います。

- 対象期間: 2026年9月
- 希望提出期限: 2026年8月20日 23:59
- 架空スタッフ: 12名
- 初期提出状況: 10名提出済み / 2名未提出
- 管理対象週: 2026年9月7日〜13日
- Role: 従業員 / 管理者

推奨Demo手順:

1. 従業員へ切り替え、未提出者を選ぶ
2. 月間カレンダーで出勤可能、希望休、希望時間、備考を変更する
3. 期限超過警告を確認して希望を提出する
4. 管理者へ切り替え、提出人数と未提出者を確認する
5. 必要人数を変更し、不足・過剰の再計算を確認する
6. 自動作成でDraft案を生成する
7. シフト表とConflict一覧から勤務枠を調整する
8. Draft → Review → Confirmed → Publishedへ進める
9. 従業員へ戻り、今日・今週・今月の公開済みシフトを確認する
10. 変更履歴でactor、時刻、対象、before/afterを確認する

Demoはブラウザ状態を即時更新して`localStorage`へ保存し、利用可能な場合はHttpOnly Demo sessionを使って希望提出、必要人数、割当、状態遷移をD1へbest-effort同期します。再読込時は保存値のshapeを検証して復元し、壊れた保存値は安全に初期Demoへ戻します。API接続不可または同期失敗時もLocal Demoへ切り替わるため、Workflowを完走できます。`Demoを初期化`すると同梱の初期状態へ戻ります。

同期はポートフォリオDemoの耐障害性を優先した一方向のbest-effort処理で、リアルタイム共同編集やD1からの競合解決ではありません。画面の公開Role chooserは本番認証ではなく、Local fallback時の状態と履歴も改ざん耐性を持ちません。D1で受理された操作にはserver-side Role、所有権、追記専用Auditが適用されます。

## Security

実装済みのサーバー側対策:

- Demo sessionはserver-issued tokenを発行し、D1にはSHA-256 hashだけを保存
- Cookieは`HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`、HTTPS時は`Secure`
- session有効期限は7日で、無効・期限切れは401
- Roleと所有権を全業務APIでserver-side確認
- 従業員は自分の希望だけを更新でき、管理者も本人希望の代理編集は不可
- 文字列長、件数、日付、時刻、数値範囲、期間内日付をAPI境界で検証
- 変更とAuditをD1 batchへまとめ、before/afterとactorを記録
- Audit LogはDB triggerで更新・削除を禁止
- Published revisionと関連RecordはDB triggerで直接変更・削除を禁止
- JSON応答は`Cache-Control: no-store`

Demo Modeは誰でも従業員または管理者Demoを開始できる公開Role chooserです。発行済みsessionのRole偽装はserver-side照合で防ぎますが、本番の本人確認ではありません。パスワード、MFA、企業ディレクトリ連携、CSRF token、rate limit、組織分離、通知、法令判定は実装していません。本番導入時は実認証、tenant境界、監査保管方針、session失効、CSRF対策、rate limit、backup、運用監視を追加してください。

## Testing

Vitestで、要求された業務ロジックを単体・統合テストしています。

| 対象 | 主なテスト |
| --- | --- |
| 希望提出 | 本人所有権、DraftからSubmitted、期限超過警告、Audit |
| 人員不足計算 | 必要人数対割当人数、重複従業員除外、日付上書き、休憩区間、不足・余剰集計 |
| Conflict | 希望休、希望時間外、重複、最大勤務、最低休憩、勤務間隔、連勤、不正区間 |
| シフト変更 | 追加・更新・削除、before/after、確定・公開後のReview revision |
| 自動割当 | 決定性、提出済み希望、manual/locked保持、勤務上限、未充足枠、Draft固定 |
| 確定・公開 | 状態スキップ拒否、Confirmed/Published metadata |
| Role | 本人希望、全員シフト、必要人数、AuditのPermission |
| Audit Log | actor、Role、日時、対象、revision、before/after |
| Domain integration | 希望 → 不足 → 自動案 → Conflict → 修正 → 確定 → 公開 → 改訂 |
| Rendered output | SSRランディング、作品名、主要コピー、Demo導線、専用Asset |

```bash
npm test
npm run test:rendered
npm run lint
npm run typecheck
npm run build
```

`npm run verify`はlint、typecheck、Vitest、production buildを順番に実行します。Rendered HTMLテストはbuildを含むため、別途`npm run test:rendered`で実行します。ブラウザ確認項目は[`docs/MANUAL_QA.md`](docs/MANUAL_QA.md)にまとめています。

## Build

必要環境:

- Node.js 22.13.0以上
- npm

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run verify
npm run test:rendered
```

主要技術:

- Vinext 1.0.0-beta.2 / App Router互換
- React 19.2.6
- TypeScript 5.9.3
- Cloudflare Workers / D1
- Drizzle ORM 0.45.2 / SQLite schema
- Tailwind CSS 4.2.1のPostCSS pipelineと製品固有CSS
- Vitest 4.1 / Node Test Runner

D1 APIをローカルで使う場合は、`.openai/hosting.json`の`DB` bindingを有効にし、`drizzle/0000_shift_management.sql`を対象D1へ適用してください。Migration未適用でもランディングとブラウザ内Demoは動作しますが、`/api/*`は永続化できません。Schema変更後のmigration生成には`npm run db:generate`を使用します。

D1取得は`cloudflare:workers`のruntime envを使います。API確認はCloudflare Vite pluginを含む`npm run dev`またはSites / Cloudflare deploymentで行ってください。Cloudflare pluginを通さない素のNode runtimeからAPI routeを直接実行する構成は対象外です。

## Deployment

`worker/index.ts`をentry pointとするCloudflare Worker / Sites向け構成です。`.openai/hosting.json`はD1 binding名を`DB`として宣言しています。

1. `npm run verify`と`npm run test:rendered`を完了する
2. 配置先でD1 databaseを作成し、binding名`DB`を設定する
3. `drizzle/0000_shift_management.sql`を適用する
4. Vinext build成果物をCloudflare Worker / Sitesへ公開する
5. 公開先でCookieの`Secure`属性、Role拒否、migration、Demo fallbackを再確認する
6. 実在する公開URLとrepository URLをこのREADMEとポートフォリオへ反映する

| Link | Status |
| --- | --- |
| 公開URL | [shift-management-system.kinjo653222.chatgpt.site](https://shift-management-system.kinjo653222.chatgpt.site) |
| GitHub URL | [shunsoco-stack/shift-management-system](https://github.com/shunsoco-stack/shift-management-system) |

架空URL、`#`、既存repositoryの無関係なremoteは掲載しません。ポートフォリオ掲載用のコピー、画像候補、完全版プロンプトは[`docs/PORTFOLIO.md`](docs/PORTFOLIO.md)を参照してください。
