# PER・PSR 時系列計算の実装仕様

## 概要

Yahoo Finance APIを使用して、株価指標（PER・PSR）の時系列データを計算・表示する機能の実装仕様書です。

---

## データソース

### Yahoo Finance API (`yahoo-finance2`)

| データ | 取得可否 | 取得期間 | 使用モジュール |
|--------|----------|----------|----------------|
| 株価履歴 | ✅ | 過去5年分 | `chart()` |
| 年次純利益 | ✅ | 過去4年分 | `incomeStatementHistory` |
| 年次売上高 | ✅ | 過去4年分 | `incomeStatementHistory` |
| 四半期純利益 | ✅ | 直近4四半期 | `incomeStatementHistoryQuarterly` |
| 発行済株式数 | ✅ | 現在値のみ | `defaultKeyStatistics` |
| 過去のEPS | ❌ | - | - |

---

## 計算式

### PER（株価収益率）

```
PER = 時価総額 ÷ 純利益
    = (株価 × 発行済株式数) ÷ 純利益
```

**ポイント**: EPSを使う計算（`株価 ÷ EPS`）と数学的に同じ結果になります。

### PSR（株価売上高倍率）

```
PSR = 時価総額 ÷ 売上高
    = (株価 × 発行済株式数) ÷ 売上高
```

---

## 時系列計算のロジック

### 使用する純利益・売上高の決定

各データポイント（株価）の日付に応じて、使用する純利益・売上高を切り替えます。

```
┌─────────────────────────────────────────────────────────────┐
│  データポイントの年   │   使用する純利益データ              │
├─────────────────────────────────────────────────────────────┤
│  2024年〜現在        │   TTM（直近4四半期の合計）           │
│  2023年              │   2024年3月期の年次純利益            │
│  2022年              │   2023年3月期の年次純利益            │
│  2021年              │   2022年3月期の年次純利益            │
│  2020年              │   2021年3月期の年次純利益            │
└─────────────────────────────────────────────────────────────┘
```

### TTM（Trailing Twelve Months）

直近12ヶ月の純利益合計。四半期決算4回分を合算して算出。

```typescript
// 直近4四半期の純利益を合計
ttmNetIncome = quarterlyStatements
  .slice(0, 4)
  .reduce((sum, stmt) => sum + (stmt.netIncome ?? 0), 0);
```

### 決算期と暦年のマッピング

日本企業の多くは3月決算のため、以下のようにマッピングしています：

| 暦年のデータポイント | 対応する決算期 | 理由 |
|---------------------|---------------|------|
| 2023年6月の株価 | 2024年3月期 | 2023年4月〜2024年3月の業績 |
| 2022年6月の株価 | 2023年3月期 | 2022年4月〜2023年3月の業績 |

```typescript
// 暦年 → 決算年のマッピング
const fiscalYear = year + 1;
return annualNetIncomeMap.get(fiscalYear);
```

---

## 実装の流れ

```
1. 株価履歴を取得（chart API）
   ↓
2. 財務データを取得（quoteSummary API）
   - 年次損益計算書（過去4年分）
   - 四半期損益計算書（直近4四半期）
   ↓
3. 純利益マップを作成（年 → 純利益）
   ↓
4. 各株価データポイントに対して：
   - その年に対応する純利益/売上高を取得
   - 時価総額を計算（株価 × 発行株数）
   - PER/PSRを計算
   ↓
5. 結果を返却・保存
```

---

## 現在の実装状況

### 実装済み ✅

| 項目 | 状態 | 備考 |
|------|------|------|
| 実績PER（時系列） | ✅ | 年次純利益ベースで計算 |
| 実績PSR（時系列） | ✅ | 年次売上高ベースで計算 |
| 現在のPER | ✅ | TTMまたはYahoo API値 |
| 現在のPSR | ✅ | 最新売上高で計算 |

### 未実装 ❌

| 項目 | 状態 | 必要なデータ |
|------|------|-------------|
| 予想PER | ❌ | 会社予想の純利益 |
| 予想PSR | ❌ | 会社予想の売上高 |

---

## コード構成

### ファイル: `convex/yahooFinance.ts`

```typescript
// 主要な関数・変数

// 1. 年次純利益マップの作成
const annualNetIncomeMap = new Map<number, number>();
for (const stmt of annualStatements) {
  const fiscalYear = new Date(stmt.endDate).getFullYear();
  annualNetIncomeMap.set(fiscalYear, stmt.netIncome);
}

// 2. データポイントの年に対応する純利益を取得
const getNetIncomeForDate = (date: Date): number | null => {
  const year = date.getFullYear();
  if (year >= latestFiscalYear) {
    return ttmNetIncome;  // 直近年はTTM
  }
  const fiscalYear = year + 1;
  return annualNetIncomeMap.get(fiscalYear) ?? null;
};

// 3. PER/PSRの計算
const history = priceHistory.map((point) => {
  const marketCap = point.close * sharesOutstanding;
  const netIncomeForPeriod = getNetIncomeForDate(point.date);
  const per = marketCap / netIncomeForPeriod;
  // ...
});
```

---

## 注意事項

### 1. 純利益がマイナスの場合

純利益が赤字（マイナス）の場合、PERは計算されません（`undefined`）。
マイナスPERは一般的に意味を持たないため、表示をスキップしています。

### 2. 発行済株式数の変動

現在の実装では、発行済株式数は**現在の値**を過去にも適用しています。
株式分割・併合があった場合、過去のPER/PSRに影響する可能性があります。

### 3. 他サービスとの数値差異

バフェットコード等の金融情報サービスとは数値が異なる場合があります：

| 本システム | 他サービス |
|-----------|-----------|
| 実績純利益（過去の決算値） | 会社予想 or アナリスト予想 |
| Yahoo Finance API | 決算短信・有価証券報告書 |

---

## 今後の拡張案

### 予想PERの実装

予想純利益のデータソース候補：
1. Yahoo Finance API（`earningsTrend`モジュール）- 要調査
2. 決算短信PDFからの抽出
3. 外部API（株探等）

### UI表示の改善

- 計算方式の注釈表示
  - 例: 「※PERは年次純利益をもとに算出（実績ベース）」
- 実績PERと予想PERの切り替え機能
