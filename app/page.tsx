import Link from "next/link";
import Image from "next/image";

const rows = [
  { name: "佐藤 彩", role: "ホール", shifts: ["10:00–15:00", "休", "12:00–18:00", "18:00–22:00", "休"] },
  { name: "田中 健", role: "キッチン", shifts: ["12:00–18:00", "15:00–22:00", "休", "12:00–18:00", "18:00–22:00"] },
  { name: "鈴木 美咲", role: "ホール", shifts: ["休", "12:00–18:00", "15:00–22:00", "休", "12:00–18:00"] },
];

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="brand" href="/" aria-label="シフト管理システム ホーム">
          <Image className="brand-icon" src="/brand/shift-management-system-icon.svg" width={34} height={34} alt="" priority />
          <span>シフト管理システム</span>
        </Link>
        <nav aria-label="メインナビゲーション">
          <a href="#workflow">機能</a>
          <Link className="header-cta" href="/demo">Demoを試す</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> 店舗の人員配置を、ひとつの流れに</p>
          <h1 id="hero-title">希望から公開まで、<br /><em>迷わないシフト作成。</em></h1>
          <p className="hero-lead">
            従業員の希望、時間帯ごとの必要人数、勤務条件を一画面で比較。
            不足とConflictを確認しながら、根拠のあるシフト案を作成できます。
          </p>
          <div className="hero-actions">
            <Link className="primary-action" href="/demo">登録なしでDemoを開始 <span aria-hidden="true">→</span></Link>
            <a className="text-action" href="#workflow">Workflowを見る</a>
          </div>
          <dl className="hero-facts">
            <div><dt>12名</dt><dd>架空スタッフ</dd></div>
            <div><dt>30分</dt><dd>配置チェック単位</dd></div>
            <div><dt>AI不使用</dt><dd>割当計算</dd></div>
          </dl>
        </div>

        <div className="schedule-window" aria-label="シフト表と人員不足のプレビュー">
          <div className="window-bar"><span /><span /><span /><b>9月 第2週</b><button type="button">自動作成</button></div>
          <div className="preview-summary">
            <div><small>提出状況</small><strong>10 / 12名</strong></div>
            <div className="alert-stat"><small>不足時間</small><strong>6.5時間</strong></div>
            <div><small>Conflict</small><strong>3件</strong></div>
          </div>
          <div className="mini-schedule" role="table" aria-label="週間シフト表">
            <div className="schedule-head" role="row">
              <span role="columnheader">スタッフ</span><span role="columnheader">月 8</span><span role="columnheader">火 9</span><span role="columnheader">水 10</span><span role="columnheader">木 11</span><span role="columnheader">金 12</span>
            </div>
            {rows.map((row) => (
              <div className="schedule-row" role="row" key={row.name}>
                <span role="rowheader"><b>{row.name}</b><small>{row.role}</small></span>
                {row.shifts.map((shift, index) => <span className={shift === "休" ? "off" : "shift"} role="cell" key={`${shift}-${index}`}>{shift}</span>)}
              </div>
            ))}
            <div className="coverage-row" role="row">
              <span role="rowheader"><b>必要人数との差</b><small>12:00–15:00</small></span>
              <span role="cell">充足</span><span className="shortage" role="cell">−2名</span><span role="cell">充足</span><span className="excess" role="cell">+2名</span><span className="shortage" role="cell">−1名</span>
            </div>
          </div>
          <div className="window-note"><span aria-hidden="true">!</span><p><b>火曜 12:00〜15:00 は2名不足</b><small>必要3名に対して、割当は1名です</small></p><button type="button">確認する</button></div>
        </div>
      </section>

      <section className="workflow-strip" id="workflow" aria-label="シフト作成Workflow">
        {[
          ["01", "希望提出"], ["02", "必要人数と比較"], ["03", "自動配置"],
          ["04", "Conflict確認"], ["05", "確定・公開"],
        ].map(([number, label], index) => (
          <div key={number}><small>{number}</small><b>{label}</b>{index < 4 && <span aria-hidden="true">→</span>}</div>
        ))}
      </section>
    </main>
  );
}
