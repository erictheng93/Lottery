# Lottery Stats - 即時開獎統計系統

即時開獎數據的「個位數遺漏值」統計與可視化工具。自動抓取多款遊戲的開獎數據，計算數字 0-9 的出現頻率與遺漏期數，幫助用戶快速辨識最久未出現的號碼。

## 功能特性

- **多遊戲支援** — 支援 WG視訊六合彩 (A/B) 及 WG視訊539 (A/B/C)，透過下拉選單切換
- **自動數據抓取** — Cloudflare Workers Cron 每分鐘檢測，所有遊戲以 `Promise.allSettled` 並行抓取
- **遺漏值統計** — 計算 0-9 每個數字的出現頻率、當前遺漏、歷史最大遺漏
- **各球遺漏卡片** — 每個球位獨立顯示最久未出現的數字，點擊展開完整 0-9 統計
- **深色/淺色主題** — 支援主題切換，深色模式優先設計
- **響應式設計** — 桌面與移動端自適應，觸摸友好的 44px 最小點擊區域
- **即時更新** — 30 秒輪詢，搭配 Page Visibility API 後台暫停節省流量

## 支援遊戲

| ID | 名稱 | 開獎號碼數 |
|----|------|-----------|
| `wglhca` | WG視訊六合彩 A | 7 |
| `wglhcb` | WG視訊六合彩 B | 7 |
| `wg539a` | WG視訊539 A | 5 |
| `wg539b` | WG視訊539 B (預設) | 5 |
| `wg539c` | WG視訊539 C | 5 |

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | Vue 3 (Composition API) + Vite + Tailwind CSS |
| 後端 | Cloudflare Workers (TypeScript) + Hono |
| 數據庫 | Cloudflare D1 (SQLite) |
| 快取 | Cloudflare KV |
| 套件管理 | Bun |
| 部署 | Cloudflare Pages (前端) + Workers (API & Scraper) |

## 專案結構

```
packages/
├── web/                        # Vue 3 前端 (Cloudflare Pages)
│   ├── src/
│   │   ├── components/
│   │   │   ├── GameSelector.vue      # 遊戲切換下拉選單
│   │   │   ├── StatsBar.vue          # 頂部統計欄（遺漏最大）
│   │   │   ├── OmissionCards.vue     # 各球遺漏卡片 + 展開統計表
│   │   │   ├── DrawTable.vue         # 開獎記錄列表（分頁）
│   │   │   └── ThemeToggle.vue       # 深色/淺色切換
│   │   ├── composables/
│   │   │   ├── useStats.ts           # 統計輪詢 (30s + Visibility API)
│   │   │   ├── useDraws.ts           # 開獎記錄分頁
│   │   │   └── useTheme.ts           # 主題管理
│   │   ├── api.ts                    # API 封裝
│   │   ├── App.vue
│   │   └── style.css                 # 主題 tokens + glass 效果
│   ├── tailwind.config.js
│   └── vite.config.ts
│
└── worker/                     # Cloudflare Worker (Scraper + API)
    ├── src/
    │   ├── index.ts                  # Hono 路由 + Cron handler
    │   ├── scraper.ts                # 多遊戲 CSRF 管理 + 抓取
    │   ├── stats.ts                  # 遺漏值計算引擎
    │   ├── types.ts                  # 遊戲配置 + 型別定義
    │   └── db/
    │       ├── schema.sql            # D1 建表語句
    │       └── migrate-v2.sql        # v1 → v2 遷移 (多遊戲)
    └── wrangler.toml
```

## 系統架構

```
源站 (/ajax_info)          Cloudflare                        用戶瀏覽器
      │                 ┌──────────────────┐
      │  fetch()        │  Scraper Worker  │
      │◄────────────────│  (Cron 每1分鐘)  │
      │  5 games //     │       │          │
      │                 │       ▼          │
      │                 │  ┌────────┐      │
      │                 │  │   D1   │      │         ┌──────────────┐
      │                 │  └────┬───┘      │         │   Vue SPA    │
      │                 │       │          │  fetch   │ (CF Pages)   │
      │                 │       ▼          │◄────────│              │
      │                 │  API (Hono)      │────────►│ GameSelector │
      │                 │  /api/games      │  JSON   │ StatsBar     │
      │                 │  /api/stats      │         │ OmissionCards│
      │                 │  /api/draws      │         │ DrawTable    │
      │                 │  /api/health     │         └──────────────┘
      │                 └──────────────────┘
```

## 快速開始

### 前置要求

- [Bun](https://bun.sh)
- Cloudflare 帳號 + Wrangler CLI

### 安裝與本地開發

```bash
# 安裝依賴
bun install

# 啟動 Worker (localhost:8787)
cd packages/worker
bun run db:init:local
bun run dev

# 啟動前端 (localhost:5173，自動代理 /api → :8787)
cd packages/web
bun run dev
```

兩個服務需同時啟動才能正常運作。

### 部署

```bash
# 部署 Worker
cd packages/worker && bun run deploy

# 部署前端
cd packages/web && bun run build && wrangler pages deploy dist
```

> 部署前需將 `wrangler.toml` 中的 placeholder ID 替換為實際的 D1 database 及 KV namespace ID。

### 資料庫遷移

```bash
# 全新安裝
cd packages/worker && bun run db:init:local

# 從 v1 (單遊戲) 升級至 v2 (多遊戲)
cd packages/worker && bun run db:migrate:local
```

## API 接口

### `GET /api/games`

列出所有支援遊戲。

### `GET /api/stats?game=wg539b&range=100`

指定遊戲的各球位遺漏統計。`range` 可選 `30 | 60 | 100`。

### `GET /api/draws?game=wg539b&limit=30&offset=0&date=2026-03-05`

指定遊戲的開獎記錄（分頁）。

### `GET /api/health`

系統健康檢查，含抓取成功率。

### `GET /api/trigger-scrape`

手動觸發全遊戲抓取（開發用）。

### `GET /api/trigger-backfill?game=wg539b&range=100`

指定遊戲的歷史批量匯入。`range` 可選 `30-100`。

## 統計邏輯

每個開獎號碼取個位數 (n % 10)，對每個球位獨立統計數字 0-9：

```
期數 20260305190 → 號碼 [30, 12, 33, 27, 22] → 個位數 [0, 2, 3, 7, 2]
                   第1球  第2球  第3球  第4球  第5球
```

| 指標 | 說明 |
|------|------|
| 頻率 (Frequency) | N 期內該數字出現的總次數 |
| 當前遺漏 (Current Gap) | 距離該數字最後一次出現已過的期數 |
| 最大遺漏 (Max Gap) | 歷史上該數字最長連續未出現的期數 |

## License

Private - All rights reserved.
