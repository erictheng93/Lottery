# 即時開獎統計系統 - 產品需求文檔 (PRD)

> 版本: v2.0 | 最後更新: 2026-03-05

---

## 1. 專案背景

針對即時開獎平台 (WG視訊539 B)，提供用戶關於數字「遺漏值 (Omission/Gap)」與「出現頻率」的數據可視化工具。幫助用戶判斷哪些數字（個位數 0-9）最久未出現，輔助決策。

**數據來源：** `https://open-lat.inja777.com/nowopen/WN2WSJLHC`

---

## 2. 數據採集對象

每一期需要收集以下三個欄位：

| 欄位 | 範例 | 說明 |
|------|------|------|
| 期數 (period_id) | `20260305190` | 唯一標識符 |
| 開獎時間 (draw_time) | `2026-03-05 17:51:47` | 該期開獎時間 |
| 五個開獎號碼 | `30, 12, 33, 27, 22` | 五個兩位數號碼 |

**個位數提取規則：** 每個號碼僅取個位數 (n % 10)

```
期數 20260305190 → 號碼 [30, 12, 33, 27, 22] → 個位數 [0, 2, 3, 7, 2]
期數 20260305119 → 號碼 [36, 23, 04, 24, 39] → 個位數 [6, 3, 4, 4, 9]
```

---

## 3. 源站 API 端點（逆向工程結果）

源站為 Laravel 架構，使用 jQuery AJAX 短輪詢（每 5 秒）。**無需瀏覽器模擬，可直接用 HTTP 請求抓取。**

### 3.1 CSRF Token 獲取

源站使用 Laravel CSRF 保護，所有 POST 請求需攜帶 `_token`。

**獲取方式：** GET 請求首頁 HTML，解析 `<input type="hidden" id="_token" value="...">` 取得。

同時需保留回應中的 `XSRF-TOKEN` Cookie，後續請求攜帶。

Token 有效期未知，建議每 10-15 分鐘重新獲取一次。

---

### 3.2 端點一：`POST /ajax_info`（最新一期）

**用途：** 獲取當前最新一期的開獎結果與倒計時。

**請求參數：**

| 參數 | 值 | 說明 |
|------|------|------|
| `playkey` | `WN2WSJLHC` | 彩種標識 (WG視訊539 B) |
| `ptype` | `LHC` | 彩種類型 |
| `_token` | `<CSRF Token>` | 從首頁 HTML 解析獲得 |

**回應範例：**

```json
{
  "lotname": "WG視訊539 B",
  "nowPeriod": "20260305191",
  "openlotNumber": ["22", "12", "26", "06", "18"],
  "donePeriod": 191,
  "restPeriod": 72,
  "nextOpenlot": "20260305192",
  "nextTime": 159
}
```

**回應欄位說明：**

| 欄位 | 類型 | 說明 |
|------|------|------|
| `lotname` | string | 彩種名稱 |
| `nowPeriod` | string | 當前最新期數 |
| `openlotNumber` | string[] | 五個開獎號碼（字串格式） |
| `donePeriod` | number | 今日已開期數 |
| `restPeriod` | number | 今日剩餘期數 |
| `nextOpenlot` | string | 下一期期數 |
| `nextTime` | number | 距下期開獎剩餘秒數 |

---

### 3.3 端點二：`POST /ajax_other_info`（批量歷史數據）

**用途：** 獲取多期開獎記錄列表，支援期數範圍和日期篩選。

#### 模式 A：自動刷新（默認）

**請求參數：**

| 參數 | 值 |
|------|------|
| `playkey` | `WN2WSJLHC` |
| `page` | `nowopen` |
| `type` | `openlot` |
| `_token` | `<CSRF Token>` |

返回默認 60 期數據。

#### 模式 B：指定範圍/日期

**請求參數：**

| 參數 | 值 | 說明 |
|------|------|------|
| `playkey` | `WN2WSJLHC` | 彩種標識 |
| `page` | `nowopen` | 頁面類型 |
| `range` | `30` / `60` / `100` | 期數範圍 |
| `date` | `2026-03-05` 或 `""` | 日期篩選（空字串為今天） |
| `type` | `range` | 固定值 |
| `_token` | `<CSRF Token>` | CSRF 令牌 |

**回應結構：**

```json
{
  "playkey": "WN2WSJLHC",
  "isData": "1",
  "ptype": "LHC",
  "isDP": "0",
  "initlist": "<JSON string>",
  "dbcount": "<JSON string>",
  "longcount": "<JSON string>"
}
```

> 注意：`initlist`、`dbcount`、`longcount` 是 **JSON 字串**，需二次 `JSON.parse()`。

**`initlist` 單項結構（每期一筆）：**

```json
{
  "preDrawCode": ["30", "12", "33", "27", "22"],
  "preDrawIssue": "20260305190",
  "preDrawTime": "2026-03-05<br>17:51:47",
  "Color": ["g", "g", "g", "g", "r"],
  "Zodiac": ["牛", "羊", "狗", "龍", "雞"],
  "TNumS3": ["22", "27", "70", "03", "270"],
  "SDBS": { "sin": 2, "dou": 3, "big": 4, "sma": 1 },
  "SUM": { "SUM": 124, "SD": 1, "DS": 0 }
}
```

| 欄位 | 說明 |
|------|------|
| `preDrawCode` | 五個開獎號碼 |
| `preDrawIssue` | 期數 |
| `preDrawTime` | 開獎時間（含 `<br>` 需清理） |
| `Color` | 號碼顏色（r/g/b） |
| `Zodiac` | 生肖 |
| `TNumS3` | 台號+特三 |
| `SDBS` | 單雙大小統計 |
| `SUM` | 總和+單雙+大小 |

**我們只需要 `preDrawCode`、`preDrawIssue`、`preDrawTime` 三個欄位。**

---

## 4. 核心功能需求

### F1: 自動化數據抓取 (Scraper Worker)

**目標：** 每 5 分鐘自動檢測並存儲新的開獎結果。

**實現方式：**

- 使用 Cloudflare Workers **Cron Triggers**，每 **1 分鐘** 執行一次。
- 使用 `fetch()` 直接調用源站 API（**不需要 Playwright / Browser Rendering**）。
- CSRF Token 快取策略：每 10 分鐘重新獲取。

**抓取流程：**

```
Cron 觸發 (每1分鐘)
  │
  ├─ 從 KV 讀取快取的 CSRF Token
  │   └─ 若過期 → GET 首頁 HTML → 解析 _token → 存入 KV
  │
  ├─ POST /ajax_info → 取得 nowPeriod + openlotNumber
  │
  ├─ 查詢 D1：該 period_id 是否已存在？
  │   ├─ 已存在 → 跳過
  │   └─ 不存在 → INSERT INTO draw_results
  │
  └─ 完成
```

**異常處理：**

| 場景 | 處理方式 |
|------|----------|
| CSRF Token 失效 | 重新 GET 首頁獲取新 Token |
| 源站無回應 / 5xx | 記錄錯誤日誌，下次 Cron 自動重試 |
| 期數跳號 | 記錄警告日誌，不影響後續寫入 |
| 重複寫入 | 由 `UNIQUE(period_id)` 約束保護 |

**初始數據回填：**

首次部署時，使用 `/ajax_other_info` (模式 B) 批量拉取最近 100 期 + 過去數天的歷史數據回填。

---

### F2: 數字遺漏統計邏輯 (Backend Logic)

**處理對象：** 每個開獎號碼的個位數（n % 10），統計數字 0-9。

**統計範圍：** 支援 30 / 60 / 100 期切換（默認 100 期）。

**計算指標：**

| 指標 | 定義 | 範例 |
|------|------|------|
| 頻率 (Frequency) | 該數字在 N 期內出現的總次數 | 數字 7 在 100 期內出現 42 次 |
| 當前遺漏 (Current Gap) | 該數字距離最後一次出現已經過了多少期 | 數字 4 已經 15 期沒出現 |
| 歷史最大遺漏 (Max Gap) | 歷史上該數字最長的連續未出現期數 | 數字 9 曾經最久 32 期沒出現 |

**計算範例：**

```
最近 5 期個位數序列：
期190: [0, 2, 3, 7, 2]
期189: [5, 9, 2, 5, 1]
期188: [6, 4, 3, 5, 0]
期187: [2, 8, 1, 8, 7]
期186: [1, 5, 7, 5, 2]

數字 4 → 最後出現在期188 → 當前遺漏 = 2 期
數字 9 → 最後出現在期189 → 當前遺漏 = 1 期
數字 6 → 最後出現在期188 → 當前遺漏 = 2 期
```

**計算時機：**

- 每次新期數寫入 D1 後，觸發統計重算。
- 結果寫入 `stats_cache` 表，設定 TTL。
- API 查詢時優先讀快取，若過期則即時計算。

---

### F3: 前端數據展示 (UI/UX)

**頂部統計欄位（新增組件）：**

```
┌──────────────────────────────────────────────┐
│  遺漏最大: 數字 4 (已 25 期未出現)  [hover 看全部]  │
└──────────────────────────────────────────────┘
```

| 行為 | 說明 |
|------|------|
| 默認顯示 | 當前遺漏值最大的數字 + 遺漏期數 |
| Hover (桌面) | 彈出浮窗，顯示 0-9 完整統計表 |
| 點擊 (移動端) | 同上，觸摸點擊代替 Hover |

**浮窗內容：**

```
┌───────────────────────────────────┐
│ 個位數統計 (最近 100 期)           │
│                                   │
│ 數字  出現次數   當前遺漏  最大遺漏 │
│  0      48        3        12    │
│  1      52        1         8    │
│  2      61        0 (本期)   5    │
│  3      45        2        15    │
│  4      38       25 ← 最大  32    │
│  5      55        1         7    │
│  6      43        2        11    │
│  7      50        0 (本期)   9    │
│  8      47        4        14    │
│  9      39        8        18    │
│                                   │
│ 統計範圍: [30期] [60期] [100期]    │
└───────────────────────────────────┘
```

**排序規則：** 浮窗內依「當前遺漏」降序排列，遺漏最大的排最前。

**色彩標記：**
- 遺漏 >= 20 期：紅色高亮
- 遺漏 10-19 期：橙色
- 遺漏 < 10 期：正常色

---

## 5. 技術架構

### 5.1 總體架構

```
源站 API                    Cloudflare 生態圈                     用戶
─────────         ┌─────────────────────────────────────┐
                  │                                     │
/ajax_info   ◄────┤  Worker (Scraper)                   │
/ajax_other_info  │    ├─ Cron Trigger (每1分鐘)         │
                  │    ├─ fetch() 調用源站 API           │
                  │    └─ 寫入 D1                        │
                  │                                     │
                  │  D1 Database                        │
                  │    ├─ draw_results (原始數據)         │
                  │    └─ stats_cache (統計快取)          │
                  │                                     │
                  │  Worker (API)                       │     Vue 3 SPA
                  │    ├─ GET /api/stats                │ ◄── (Tailwind CSS)
                  │    ├─ GET /api/draws                │     部署在 CF Pages
                  │    └─ GET /api/health               │
                  │                                     │
                  │  KV Store                           │
                  │    └─ CSRF Token 快取               │
                  │                                     │
                  └─────────────────────────────────────┘
```

### 5.2 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| 前端 | Vue 3 (Composition API) + Vite + Tailwind CSS | SPA，部署到 CF Pages |
| 後端 API | Cloudflare Workers (TypeScript) | 提供統計數據接口 |
| 後端抓取 | Cloudflare Workers (TypeScript) + Cron Triggers | 定時抓取源站數據 |
| 數據庫 | Cloudflare D1 (SQLite) | 存儲開獎數據和統計快取 |
| 快取 | Cloudflare KV | 存儲 CSRF Token |
| 部署 | Cloudflare Pages + Workers | 統一管理 |

---

## 6. 數據庫設計 (Cloudflare D1)

```sql
-- 開獎原始數據
CREATE TABLE draw_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id TEXT NOT NULL UNIQUE,           -- 期數, e.g., '20260305190'
    draw_time DATETIME NOT NULL,              -- 開獎時間
    num1 INTEGER NOT NULL,                    -- 號碼1 (e.g., 30)
    num2 INTEGER NOT NULL,                    -- 號碼2 (e.g., 12)
    num3 INTEGER NOT NULL,                    -- 號碼3 (e.g., 33)
    num4 INTEGER NOT NULL,                    -- 號碼4 (e.g., 27)
    num5 INTEGER NOT NULL,                    -- 號碼5 (e.g., 22)
    digits TEXT NOT NULL,                     -- 預計算個位數, e.g., '0,2,3,7,2'
    raw_data TEXT,                            -- 完整 JSON 備份（可選）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- draw_time 降序索引，用於「取最近 N 期」查詢
CREATE INDEX idx_draw_time_desc ON draw_results(draw_time DESC);

-- 統計快取
CREATE TABLE stats_cache (
    key TEXT PRIMARY KEY,                     -- e.g., 'omission_100', 'omission_60'
    value TEXT NOT NULL,                      -- JSON 字串
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME                       -- 過期時間
);

-- 抓取日誌（用於監控與除錯）
CREATE TABLE scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,                     -- 'success' | 'error' | 'skip'
    period_id TEXT,                           -- 成功時記錄期數
    message TEXT,                             -- 錯誤訊息或備註
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**設計說明：**

- `period_id UNIQUE` 自動創建索引，無需額外建 `idx_period_id`。
- `digits` 欄位預計算個位數，避免查詢時重複 `num % 10` 運算。
- `scrape_log` 用於追蹤抓取健康度。
- 數據持續累積不刪除，D1 免費額度 5GB 足夠存儲數年數據。

---

## 7. API 接口設計

### 7.1 `GET /api/stats?range=100`

獲取統計摘要。

**查詢參數：**

| 參數 | 必填 | 默認值 | 說明 |
|------|------|--------|------|
| `range` | 否 | `100` | 統計期數範圍: `30`, `60`, `100` |

**回應：**

```json
{
  "summary": {
    "most_omitted_digit": 4,
    "most_omitted_gap": 25,
    "total_periods": 100
  },
  "details": [
    { "digit": 4, "frequency": 38, "current_gap": 25, "max_gap": 32 },
    { "digit": 9, "frequency": 39, "current_gap": 8,  "max_gap": 18 },
    { "digit": 6, "frequency": 43, "current_gap": 5,  "max_gap": 11 },
    { "digit": 0, "frequency": 48, "current_gap": 3,  "max_gap": 12 },
    { "digit": 8, "frequency": 47, "current_gap": 3,  "max_gap": 14 },
    { "digit": 3, "frequency": 45, "current_gap": 2,  "max_gap": 15 },
    { "digit": 1, "frequency": 52, "current_gap": 1,  "max_gap": 8  },
    { "digit": 5, "frequency": 55, "current_gap": 1,  "max_gap": 7  },
    { "digit": 2, "frequency": 61, "current_gap": 0,  "max_gap": 5  },
    { "digit": 7, "frequency": 50, "current_gap": 0,  "max_gap": 9  }
  ],
  "latest_period": "20260305190",
  "last_update": "2026-03-05T09:56:44Z"
}
```

> `details` 按 `current_gap` 降序排列。

### 7.2 `GET /api/draws?limit=30&offset=0`

獲取開獎列表（分頁）。

**查詢參數：**

| 參數 | 必填 | 默認值 | 說明 |
|------|------|--------|------|
| `limit` | 否 | `30` | 每頁筆數，最大 100 |
| `offset` | 否 | `0` | 偏移量 |
| `date` | 否 | 今天 | 指定日期 `YYYY-MM-DD` |

**回應：**

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

### 7.3 `GET /api/health`

健康檢查。

**回應：**

```json
{
  "status": "ok",
  "last_scrape_time": "2026-03-05T17:52:00Z",
  "last_period": "20260305190",
  "total_records": 12580,
  "scrape_success_rate_24h": "99.6%"
}
```

---

## 8. 前端刷新策略

| 場景 | 策略 | 間隔 |
|------|------|------|
| 頁面首次加載 | 調用 `/api/stats` + `/api/draws` | 一次性 |
| 持續更新 | 短輪詢 `/api/stats` | 每 30 秒 |
| 用戶切換範圍 (30/60/100期) | 立即調用 `/api/stats?range=N` | 手動觸發 |
| 頁面不可見 (切換標籤) | 暫停輪詢 | Page Visibility API |
| 頁面重新可見 | 立即刷新一次，恢復輪詢 | - |

---

## 9. 非功能性需求

| 類別 | 要求 |
|------|------|
| **性能** | API 回應 < 200ms（利用 stats_cache 避免即時計算） |
| **響應式** | 統計浮窗適配桌面 Hover 和移動端觸摸點擊 |
| **可靠性** | 抓取失敗自動重試（下次 Cron），CSRF Token 自動刷新 |
| **數據完整性** | UNIQUE 約束防重複，scrape_log 追蹤成功率 |
| **安全性** | API 加入 CORS 限制，Rate Limiting（CF WAF） |
| **監控** | scrape_log 記錄每次抓取狀態，/api/health 暴露健康指標 |

---

## 10. 項目里程碑

| Phase | 內容 | 交付物 |
|-------|------|--------|
| **Phase 1** | D1 數據表建立 + Scraper Worker 開發 | 自動抓取穩定運行，數據持續寫入 D1 |
| **Phase 2** | 統計算法開發 + API Worker 開發 | /api/stats、/api/draws、/api/health 可用 |
| **Phase 3** | Vue 前端開發 + 統計組件 + Tailwind 樣式 | 頂部統計欄位 + Hover 浮窗 + 期數切換 |
| **Phase 4** | 集成測試 + 部署到 Cloudflare | 全鏈路穩定運行 |
| **Phase 5** | 歷史最大遺漏功能 + 數據回填 | 完整歷史統計能力 |

---

## 11. 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| 源站更換 API 結構 | 抓取失敗 | scrape_log 監控 + /api/health 告警 |
| 源站封鎖 Worker IP | 無法抓取 | 降低請求頻率；備選方案：使用 CF Browser Rendering |
| CSRF Token 機制變更 | 請求被拒 | Token 獲取邏輯抽象化，便於快速調整 |
| D1 性能瓶頸 | API 回應慢 | stats_cache 預計算 + Edge Cache |
