# Lottery Stats

Lottery Stats 是一個彩票開獎統計工具。前端和 API 部署在 Cloudflare Pages，資料抓取獨立跑在 Windows VPS 的 Docker 容器，避免正式 Cloudflare Worker egress 被來源站封鎖。

## Architecture

```text
Cloudflare Pages
  packages/web
  - Vue/Vite frontend
  - Pages Functions API
  - D1 reads and protected ingest writes

Windows VPS + Docker
  packages/scraper
  - fetches https://open-lat.inja777.com every minute
  - posts normalized draw data to /api/internal/ingest

Cloudflare D1
  - draw_results
  - stats_cache
  - scrape_log
```

The scraper is intentionally outside Cloudflare. Pages Functions must not fetch the source site; they only query D1 and accept authenticated ingest requests.

## Packages

```text
packages/
  core/       Shared game config, API handlers, stats, ingest logic, D1 schema
  web/        Vue frontend + Cloudflare Pages Functions
  scraper/    VPS Docker scraper
  worker/     Legacy Worker code kept for reference; not the recommended deploy path
```

## Local Setup

```bash
bun install
bun run test
```

Run the Pages app locally:

```bash
bun run db:init:local
bun run dev
```

`bun run dev` builds `packages/web` and starts `wrangler pages dev` with the local D1 binding.

## Cloudflare Pages Deploy

From the repo root:

```bash
bun run db:init:remote
cd packages/web
wrangler pages secret put INGEST_SECRET --project-name lottery-pages
cd ../..
bun run pages:deploy
```

Use the same `INGEST_SECRET` value in Cloudflare Pages and the VPS Docker scraper.

## Windows VPS Docker Deploy

See [docs/windows-vps-docker.md](docs/windows-vps-docker.md).

Fast path on the Windows VPS:

```powershell
.\scripts\deploy-scraper-windows.ps1 `
  -IngestUrl "https://your-pages-domain.pages.dev/api/internal/ingest" `
  -IngestSecret "same-long-random-secret-as-pages" `
  -NoPrompt
```

Or double-click:

```text
scripts\deploy-scraper-windows.cmd
```

The first run creates `packages/scraper/.env`, builds the Docker image, and starts a `lottery-scraper` container with `restart: unless-stopped`.

## API

- `GET /api/games`
- `GET /api/stats?game=wg539b&range=100`
- `GET /api/draws?game=wg539b&limit=30&offset=0&date=2026-03-05`
- `GET /api/health`
- `POST /api/internal/ingest`

`/api/internal/ingest` requires:

```http
Authorization: Bearer <INGEST_SECRET>
Content-Type: application/json
```

Payload:

```json
{
  "game_id": "wg539b",
  "draws": [
    {
      "period_id": "20260619001",
      "draw_time": "2026-06-19T12:00:00",
      "numbers": [1, 12, 23, 34, 45],
      "raw_data": {}
    }
  ]
}
```

## Useful Commands

```bash
bun run test
bun run pages:deploy
bun run db:init:remote
bun run --filter scraper once
```

Windows VPS logs:

```powershell
docker logs -f lottery-scraper
```
