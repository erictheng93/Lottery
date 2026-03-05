# Lottery Stats - 即時開獎統計系統

即時開獎數據的「個位數遺漏值」統計與可視化工具。自動抓取 WG視訊539 B 開獎數據，計算數字 0-9 的出現頻率與遺漏期數，幫助用戶快速辨識最久未出現的號碼。

## 功能特性

- **自動數據抓取** — Cloudflare Workers Cron 每分鐘檢測，新期數自動入庫
- **遺漏值統計** — 計算 0-9 每個數字的出現頻率、當前遺漏、歷史最大遺漏
- **多範圍切換** — 支援 30 / 60 / 100 期統計範圍
- **頂部統計欄** — 默認顯示遺漏最大的數字，Hover 展開完整統計表
- **響應式設計** — 桌面 Hover、移動端觸摸點擊

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | Vue 3 (Composition API) + Vite + Tailwind CSS |
| 後端 | Cloudflare Workers (TypeScript) |
| 數據庫 | Cloudflare D1 (SQLite) |
| 快取 | Cloudflare KV |
| 部署 | Cloudflare Pages (前端) + Workers (API & Scraper) |

## 專案結構

```
lottery/
├── packages/
│   ├── web/                  # Vue 3 前端
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── StatsBar.vue        # 頂部統計欄
│   │   │   │   ├── StatsPopover.vue    # Hover 浮窗
│   │   │   │   └── DrawTable.vue       # 開獎列表
│   │   │   ├── composables/
│   │   │   │   └── useStats.ts         # 統計數據請求邏輯
│   │   │   ├── App.vue
│   │   │   └── main.ts
│   │   ├── index.html
│   │   ├── tailwind.config.js
│   │   └── vite.config.ts
│   │
│   └── worker/               # Cloudflare Workers
│       ├── src/
│       │   ├── index.ts              # Worker 入口 (API 路由)
│       │   ├── scraper.ts            # 數據抓取邏輯
│       │   ├── stats.ts              # 統計計算邏輯
│       │   └── db/
│       │       └── schema.sql        # D1 建表語句
│       └── wrangler.toml             # Workers 配置
│
├── PRD.md                    # 產品需求文檔
└── README.md
```

## 系統架構

```
源站 (/ajax_info)          Cloudflare                        用戶瀏覽器
      │                 ┌──────────────────┐
      │  fetch()        │  Scraper Worker  │
      │◄────────────────│  (Cron 每1分鐘)  │
      │                 │       │          │
      │                 │       ▼          │
      │                 │  ┌────────┐      │
      │                 │  │   D1   │      │         ┌──────────┐
      │                 │  └────┬───┘      │         │  Vue SPA │
      │                 │       │          │  fetch   │ (CF Pages)│
      │                 │       ▼          │◄────────│          │
      │                 │  API Worker      │────────►│ StatsBar │
      │                 │  /api/stats      │  JSON   │ Popover  │
      │                 │  /api/draws      │         └──────────┘
      │                 │  /api/health     │
      │                 └──────────────────┘
```

## 快速開始

### 前置要求

- Node.js >= 18
- pnpm
- Cloudflare 帳號 + Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 安裝

```bash
pnpm install
```

### 建立 D1 數據庫

```bash
# 建立數據庫
wrangler d1 create lottery-db

# 執行建表 (將輸出的 database_id 填入 wrangler.toml)
wrangler d1 execute lottery-db --file=packages/worker/src/db/schema.sql
```

### 建立 KV 命名空間

```bash
wrangler kv namespace create CSRF_CACHE
# 將輸出的 id 填入 wrangler.toml
```

### 本地開發

```bash
# 啟動 Worker (含 D1 本地模擬)
cd packages/worker
wrangler dev

# 啟動前端
cd packages/web
pnpm dev
```

### 部署

```bash
# 部署 Worker
cd packages/worker
wrangler deploy

# 部署前端
cd packages/web
pnpm build
wrangler pages deploy dist
```

## API 接口

### `GET /api/stats?range=100`

統計摘要，返回 0-9 每個數字的頻率與遺漏值。

```json
{
  "summary": {
    "most_omitted_digit": 4,
    "most_omitted_gap": 25,
    "total_periods": 100
  },
  "details": [
    { "digit": 4, "frequency": 38, "current_gap": 25, "max_gap": 32 },
    { "digit": 9, "frequency": 39, "current_gap": 8,  "max_gap": 18 }
  ],
  "latest_period": "20260305190",
  "last_update": "2026-03-05T09:56:44Z"
}
```

### `GET /api/draws?limit=30&offset=0&date=2026-03-05`

開獎列表（分頁）。

```json
{
  "draws": [
    {
      "period_id": "20260305190",
      "draw_time": "2026-03-05T17:51:47",
      "numbers": [30, 12, 33, 27, 22],
      "digits": [0, 2, 3, 7, 2]
    }
  ],
  "total": 191,
  "has_more": true
}
```

### `GET /api/health`

系統健康檢查。

```json
{
  "status": "ok",
  "last_scrape_time": "2026-03-05T17:52:00Z",
  "last_period": "20260305190",
  "total_records": 12580
}
```

## 統計邏輯說明

每個兩位數開獎號碼取個位數 (n % 10)，統計數字 0-9：

```
期數 20260305190 → 號碼 [30, 12, 33, 27, 22] → 個位數 [0, 2, 3, 7, 2]
```

| 指標 | 說明 |
|------|------|
| 頻率 (Frequency) | N 期內該數字出現的總次數 |
| 當前遺漏 (Current Gap) | 距離該數字最後一次出現已過的期數 |
| 最大遺漏 (Max Gap) | 歷史上該數字最長連續未出現的期數 |

## License

Private - All rights reserved.
