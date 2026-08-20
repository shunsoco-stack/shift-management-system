# ポートフォリオ掲載仕様・完全版プロンプト

この資料は、完成したWebアプリ「シフト管理システム」を既存ポートフォリオへ掲載するための事実確認済み原稿と実装プロンプトです。掲載時点で実コードと実アプリを再監査し、未実装の表現を追加しないでください。

## 確認状況

| 項目 | 確認結果 |
| --- | --- |
| 完成アプリ | `shift-management-system`内のランディング、`/demo`、D1 APIを確認 |
| README | `README.md`にWorkflow、技術、制約、Build、Deploymentを記載 |
| package.json | 作品固有名、Node要件、lint / typecheck / test / build scriptを確認 |
| 専用アイコン | `public/brand/shift-management-system-icon.svg`と`public/favicon.svg`を確認 |
| OG画像 | `public/og.png`を確認 |
| 公開URL | `公開後更新` |
| GitHub URL | `公開後更新`。親repositoryの既存remoteは別作品を指すため流用禁止 |
| 実スクリーンショット | `公開後更新`。完成アプリから撮影し、存在確認後にだけ作品データへ登録 |

## 掲載メタデータ

- 作品名: **シフト管理システム**
- Slug候補: `shift-management-system`
- カテゴリ: **業務システム**
- サブカテゴリ: **シフト・人員配置**
- 種別: 操作可能なWeb業務システムDemo
- メイン画像第一候補: **シフト表 + 人員不足**
- 専用アイコン: **Calendar + People + Clock**
- Live Demo: `公開後更新`
- Source Code: `公開後更新`

### タグライン

希望から公開まで、迷わないシフト作成。

### カード用短文

従業員の希望、時間帯ごとの必要人数、勤務条件を比較し、不足・Conflictを確認しながらDraft作成から確定・公開まで進めるシフト管理システム。

### 詳細紹介文

「シフト管理システム」は、従業員の月間希望提出から、管理者による必要人数との比較、決定論的アルゴリズムでのDraft作成、Conflict確認、人による調整、確定、公開までを一つにつなぐWeb業務システムです。曜日・時間帯別に必要人数を設定し、割当人数との差を`-2名`のように通常コードで算出します。希望休、希望時間外、重複、勤務上限、休憩、勤務間隔、連勤を確認候補として可視化し、自動修正せず管理者が最終判断します。

### 解決する課題

- 希望提出と実際の割当が別ファイルになり、転記と確認に時間がかかる
- 「何人いるか」は見えても「何人必要か」と比較できない
- 不足、過剰、希望休、時間外、重複を確定直前まで見落とす
- 自動作成の結果が根拠不明で、人がレビューできない
- 確定後の変更者、時刻、対象、before/afterが残らない
- 従業員へDraftが見え、確定前の予定として誤認される

## 掲載する実装済み機能

1. 月間希望提出
   - 出勤可能、希望休、開始・終了希望時間、備考
   - 提出済み / 未提出と期限超過警告

2. 曜日・時間帯別の必要人数
   - 12:00〜15:00、15:00〜18:00、18:00〜22:00
   - 管理者による曜日別の増減

3. 不足・過剰配置の通常コード計算
   - 必要人数、割当人数、差分
   - 不足時間と不足枠
   - 大幅な過剰配置は可視化だけ行い、自動削除しない

4. 決定論的な自動作成
   - 提出済み希望、希望時間、必要人数、勤務上限を使う
   - 勤務量とIDで安定した候補順を作る
   - 結果は常にDraft
   - AI不使用

5. Conflict Detection
   - 希望休、希望時間外、重複、最大勤務、最低休憩、最低勤務間隔、連勤
   - 自動修正せず、人が最終判断
   - 法令準拠を保証しない

6. 管理者の週間シフト表
   - 縦に12名の従業員、横に7日
   - 勤務枠の追加、時間・休憩の編集、削除
   - Drag & Dropではなく安定した選択式エディタ

7. 状態と公開
   - Draft → Review → Confirmed → Published
   - 従業員画面は公開済みsnapshotだけを今日 / 今週 / 今月で表示

8. DashboardとAudit
   - 提出済み / 未提出、人員不足時間、Conflict件数、確定状況
   - 次回勤務、今週勤務、希望提出状況
   - actor、日時、対象、before/after

9. RoleとBackend
   - D1上の`employee` / `manager`
   - HttpOnly Demo sessionとserver-side Role / 所有権判定
   - Published保護、新Draft revision、追記専用AuditのDB trigger
   - D1へのbest-effort同期と、接続不可時も主要Workflowを試せるLocal Demo fallback

## 技術情報

- Vinext 1.0.0-beta.2 / App Router互換
- React 19.2.6
- TypeScript 5.9.3
- Cloudflare Workers / D1
- Drizzle ORM 0.45.2 / SQLite
- Tailwind CSS 4.2.1 PostCSS pipeline + 製品固有CSS
- Vitest 4.1 / Node Test Runner
- SVG / PNG metadata assets

技術的な見せ場は、必要人数対割当人数をコードで再計算する集計、決定論的グリーディ割当、Conflictを自動修正と分離した設計、Workflowとrevision、server-side Role、before/afterを持つAuditです。

## Demo / 制約

- 2026年9月、架空スタッフ12名、提出済み10名 / 未提出2名の固定Demo
- 管理者の作成対象は9月7日〜13日の週間シフト
- ブラウザ内DemoのRole切替は本人確認を伴う認証ではない
- ブラウザ状態はversion付きkeyの`localStorage`へ保存・検証・復元する
- 希望提出、必要人数、割当、状態遷移をD1へbest-effort同期し、接続不可時はLocal Demoへフォールバックする
- UIはD1を信頼できる唯一の状態として再読込・競合解決する実装ではなく、リアルタイム共同編集でもない
- D1 API利用には`DB` bindingとmigration適用が必要
- D1 APIの対象runtimeはCloudflare plugin付き開発環境またはSites / Cloudflare deployment
- Drag & Dropは未実装。セル選択と編集パネルを採用
- 自動割当は説明可能な貪欲法で、全体最適化ではない
- 休憩は分数で保持し、休憩開始・終了位置はDemo UI / D1割当Recordに持たない
- メール、Push通知、外部カレンダー同期、給与計算、打刻は未実装
- Conflictは法令適合を保証せず、管理者の確認が必要
- 公開URL、GitHub URL、実スクリーンショットは公開後に更新

## 専用アイコン

元SVGは`public/brand/shift-management-system-icon.svg`です。緑の角丸カレンダーに人物と黄色の時計を重ね、Calendar + People + Clockを表現しています。Faviconは`public/favicon.svg`、PWA manifestも専用SVGを参照します。

推奨alt:

`カレンダー、スタッフ、時計を組み合わせたシフト管理システムのアイコン`

作品名が隣にあり、アイコンが装飾目的の場合は、重複読み上げを避けて空の`alt`または`aria-hidden="true"`を使ってください。

## スクリーンショット候補

すべて完成アプリを実際に表示して撮影します。Mock、合成、未実装機能、ブラウザの個人情報、開発ツール、ローカルpathを含めないでください。

| 優先 | 画像 | 撮影する実装済み状態 | alt | caption |
| ---: | --- | --- | --- | --- |
| 1 | シフト表 + 人員不足 | 管理者の週間シフト表。12名の勤務枠と下部の必要 / 割当 / 差が同時に見える | `従業員別の週間シフトと時間帯ごとの必要人数、割当人数、不足を表示する画面` | `希望を割当に変え、必要人数との差を同じ表で確認。` |
| 2 | 自動シフト案 | 自動作成直後。AUTOラベル、不足・過剰・Conflict、Draft状態が見える | `決定論的アルゴリズムで作成されたDraftシフト案` | `提出済み希望と必要人数から通常コードでDraft案を作成。` |
| 3 | Conflict一覧 | 重要 / 確認フィルター、希望休や時間外など複数候補が見える | `希望休、希望時間外、勤務条件のConflict候補を一覧表示する画面` | `自動修正せず、管理者が確認して勤務枠を調整。` |
| 4 | 希望提出 | 従業員の月間カレンダー、期限警告、日別編集フォームが見える | `出勤可能、希望休、希望時間、備考を入力する月間希望提出画面` | `従業員が月ごとの勤務希望を日別に提出。` |
| 5 | 管理Dashboard | 提出状況、不足時間、Conflict、確定状況、Workflowが見える | `希望提出、人員不足、Conflict、確定状況を表示する管理Dashboard` | `公開までに必要な判断材料を一画面に集約。` |
| 6 | Mobile | 390px前後。従業員の公開シフトまたは希望提出と下部navが見える | `スマートフォンで公開済みシフトと下部ナビゲーションを表示した画面` | `従業員は今日・今週・今月の公開シフトをMobileで確認。` |

推奨サイズ:

- Desktop: 1440 × 900、または既存ポートフォリオのカード比率
- 詳細画像: 1280 × 800以上
- Mobile: 390 × 844前後
- 高DPI撮影後はWebP / AVIFへ最適化し、元画像も保持

既存ポートフォリオが1画像だけに対応する場合は、第一候補の「シフト表 + 人員不足」を採用してください。

## 既存ポートフォリオ追加用・完全版プロンプト

```text
既存のポートフォリオサイトへ、完成済み作品「シフト管理システム」を追加してください。

作品名は必ず「シフト管理システム」とし、独自ブランド名や造語へ変更しないでください。

作品情報:
- Slug候補: shift-management-system
- カテゴリ: 業務システム
- サブカテゴリ: シフト・人員配置
- タグライン: 希望から公開まで、迷わないシフト作成。
- 種別: 操作可能なWeb業務システムDemo
- Live Demo URL: 公開後更新
- GitHub URL: 公開後更新
- 専用アイコン: shift-management-system/public/brand/shift-management-system-icon.svg
- Favicon: shift-management-system/public/favicon.svg
- メイン画像第一候補: シフト表 + 人員不足

最初に、追加先ポートフォリオと掲載元shift-management-systemを読み取り専用で監査してください。

追加先で確認すること:
1. package.json、framework、build / lint / typecheck / test command
2. 作品dataの型、必須field、slug、category、subcategory、tag、並び順
3. 作品Card、詳細page、modal、gallery、CTAの既存component
4. Category / Subcategory filter、件数、URL query、空状態
5. icon、thumbnail、galleryの保存場所、命名、比率、最適化
6. Demo URL / GitHub URLが未設定の場合の安全な表示方法
7. Desktop / Tablet / Mobile、Keyboard、Reduced Motionの既存規約

掲載元で確認すること:
1. README.md、package.json、app、src/domain、src/server、app/api、db、drizzle、tests
2. public/brand/shift-management-system-icon.svg、public/favicon.svg、public/og.png
3. 従業員希望、必要人数、不足・過剰、Conflict、自動作成、状態遷移、公開シフト、Auditの実動作
4. ブラウザ内DemoとD1 APIの境界
5. D1 Demo sessionのHttpOnly Cookieとserver-side Role / ownership
6. 実行時点のlint、typecheck、test、rendered test、build結果
7. 実在する公開URL、repository remote、撮影済み画像

掲載内容の根拠は、掲載時点の実コード、README、実際に操作した完成アプリ、成功した検証結果だけです。次を厳守してください。

- 実装されていない機能を追加しない
- 自動割当をAIと説明しない。決定論的な通常コードと明記する
- 自動作成結果は必ずDraftで、人が調整してから確定すると説明する
- Conflictを法令準拠保証と表現しない
- ブラウザ内Role切替を本番認証と表現しない
- D1同期を常時成功、双方向同期、共同編集、競合解決と表現しない。best-effort同期とLocal fallbackを区別する
- D1 APIのserver-side Roleとブラウザ内Demoの制約を区別する
- Drag & Dropを実装済みと書かない。セル選択式Editorと書く
- 公開URL、GitHub URL、画像を推測で作らない
- URL未確定時は#、example.com、localhost、別作品remoteを設定しない。CTAを非表示または準備中にする
- 未撮影画像を作品dataへ登録しない

カード用短文:
「従業員の希望、時間帯ごとの必要人数、勤務条件を比較し、不足・Conflictを確認しながらDraft作成から確定・公開まで進めるシフト管理システム。」

詳細紹介文:
「シフト管理システム」は、従業員の月間希望提出から、管理者による必要人数との比較、決定論的アルゴリズムでのDraft作成、Conflict確認、人による調整、確定、公開までを一つにつなぐWeb業務システムです。曜日・時間帯別に必要人数を設定し、割当人数との差を-2名のように通常コードで算出します。希望休、希望時間外、重複、勤務上限、休憩、勤務間隔、連勤を確認候補として可視化し、自動修正せず管理者が最終判断します。」

作品詳細では、次のWorkflowを中心に見せてください。

従業員
  ↓
希望提出
  ↓
管理者確認
  ↓
必要人数との比較
  ↓
決定論的なDraft自動作成
  ↓
不足・過剰・Conflict確認
  ↓
人による調整
  ↓
Draft → Review → Confirmed → Published
  ↓
従業員へ公開

主な特徴として、実動作を確認できた次の項目だけを掲載してください。
- 出勤可能、希望休、開始・終了希望時間、備考を持つ月間希望提出
- 期限設定と期限超過警告
- 曜日・時間帯ごとの必要人数
- 必要人数対割当人数、不足、過剰の通常コード計算
- 希望休、希望時間外、重複、最大勤務、最低休憩、最低勤務間隔、連勤のConflict
- 提出済み希望と必要人数を使う決定論的グリーディ割当
- 自動作成結果をDraftに固定し、未充足枠を残す設計
- 12名×7日の週間シフト表と選択式Editor
- Draft → Review → Confirmed → Published
- 従業員の今日 / 今週 / 今月の公開済みシフト
- 管理者 / 従業員Dashboard
- actor、日時、対象、before/afterを持つAudit
- D1、HttpOnly Demo session、server-side Role / ownership
- D1へのbest-effort同期、接続状態表示、接続不可時のLocal Demo fallback

専用アイコンはpublic/brand/shift-management-system-icon.svgを既存asset規則に合わせてcopyまたはimportしてください。縦横比と図柄を変更しないでください。作品名が隣にある装飾用途ではaltを空にし、単独表示では「カレンダー、スタッフ、時計を組み合わせたシフト管理システムのアイコン」のような具体的なaltを付けてください。

スクリーンショットは完成アプリから次の6種を撮影し、実在確認後にだけ登録してください。
1. シフト表 + 人員不足
2. 自動シフト案
3. Conflict一覧
4. 希望提出
5. 管理Dashboard
6. Mobile

第一候補は「シフト表 + 人員不足」です。縦に従業員、横に日付、下部に時間帯別の必要 / 割当 / 差が読める状態を撮影してください。画像には架空Demoデータだけを含め、ブラウザの個人情報、開発ツール、ローカルpath、Error、未実装UIを含めないでください。各画像へ固有alt、width / heightまたはaspect-ratio、responsive sizesを設定してください。

Demoの制約として次を明記してください。
- 2026年9月、架空スタッフ12名の固定データ
- ブラウザ内DemoのRole切替は実認証ではない
- D1 API利用にはDB bindingとmigrationが必要
- Browser stateはlocalStorageへ保存・検証・復元する
- 希望提出、必要人数、割当、状態遷移はD1へbest-effort同期し、失敗時はLocal fallbackへ切り替わる
- D1からの双方向再読込、リアルタイム共同編集、競合解決は未実装
- D1 APIはCloudflare runtime前提で、素のNode runtimeからの直接実行は対象外
- Drag & Drop、通知、給与、打刻、外部カレンダー同期は未実装
- 自動割当は全体最適化ではない
- Conflictは法令適合を保証しない

技術情報はpackage.jsonとimportを再確認して生成してください。確認時点の候補はVinext 1.0.0-beta.2、React 19.2.6、TypeScript 5.9.3、Cloudflare Workers / D1、Drizzle ORM 0.45.2、Tailwind CSS 4.2.1 PostCSS pipeline、製品固有CSS、Vitest 4.1、Node Test Runnerです。依存しているだけで未使用のlibraryは掲載しないでください。

Designは追加先のcomponent、typography、spacing、color、radius、shadow、focus、motionを再利用してください。本作品だけの別Design Systemを持ち込まないでください。明確な階層、具体的なlabel、即時の押下feedback、予測できる戻り道を保ち、色だけで状態を伝えないでください。すべてのCTAをKeyboardで操作できるようにし、focus-visibleを消さず、prefers-reduced-motionを尊重してください。

掲載元で次を実行し、実測結果だけを報告してください。
- npm run lint
- npm run typecheck
- npm test
- npm run test:rendered
- npm run build

追加先でも既存scriptに従ってlint、typecheck、test、buildを実行してください。Desktop 1440px、Tablet、Mobile 390pxと320px、Keyboard、Reduced Motion、外部link、画像404、console errorを確認してください。

公開URLとGitHub URLは現在「公開後更新」です。掲載作業時に実在URLを確認できた場合だけ設定し、HTTP status、作品名、遷移先を確認してください。未確定ならCTAを非表示または準備中にし、未設定と完了報告してください。

最後に、変更file、追加した作品data / category / subcategory、再利用component、採用copy、iconと画像path、Live / GitHub URL状態、検証command結果、Responsive / Keyboard / Reduced Motion結果、Known Limitationsを報告してください。
```

## 公開前チェック

- [ ] 公開URLを実際に開き、作品名とDemo Workflowを確認した
- [ ] GitHub URLがこの作品専用repositoryを指すことを確認した
- [ ] 6候補から実画面を撮影し、採用fileを記録した
- [ ] カードのカテゴリが「業務システム」、サブカテゴリが「シフト・人員配置」
- [ ] 専用SVGが表示され、altまたは装飾扱いが適切
- [ ] 自動割当をAIと誤記していない
- [ ] Conflictと法令対応を誇張していない
- [ ] Browser DemoとD1 APIのSecurity範囲を区別した
- [ ] Drag & Dropなど未実装機能を掲載していない
- [ ] 追加先と掲載元のlint / typecheck / test / buildを実行した
- [ ] Desktop / Tablet / Mobile / Keyboard / Reduced Motionを確認した
