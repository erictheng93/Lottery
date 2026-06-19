# Windows VPS Docker Deployment

This project runs the scraper outside Cloudflare so the source site sees the VPS IP, not Cloudflare Worker egress.

## Prerequisites

1. Install Docker Desktop or Docker Engine with the Compose plugin on the Windows VPS.
2. Clone or copy this repository to the VPS.
3. Deploy the Cloudflare Pages app and set the Pages secret `INGEST_SECRET`.

## One-Click Deploy

Double-click:

```text
scripts\deploy-scraper-windows.cmd
```

On first run, the script asks for:

- `INGEST_URL`: `https://your-pages-domain.pages.dev/api/internal/ingest`
- `INGEST_SECRET`: the same secret configured in Cloudflare Pages

Then it writes `packages/scraper/.env`, builds the Docker image, and starts the container in the background.

## One-Command Deploy

From PowerShell at the repo root:

```powershell
.\scripts\deploy-scraper-windows.ps1 `
  -IngestUrl "https://your-pages-domain.pages.dev/api/internal/ingest" `
  -IngestSecret "same-long-random-secret-as-pages" `
  -NoPrompt
```

To change the saved config:

```powershell
.\scripts\deploy-scraper-windows.ps1 -Reconfigure
```

## Verify

```powershell
docker ps --filter "name=lottery-scraper"
docker logs -f lottery-scraper
```

Expected log events:

```json
{"event":"cycle_start","started_at":"..."}
{"event":"game_ingested","game_id":"wg539b","source_items":5,"result":{"inserted":1,"skipped":4,"errors":0,"total":5}}
```

## Stop Or Restart

```powershell
cd packages\scraper
docker compose down
docker compose up -d --build
```

The container uses `restart: unless-stopped`, so it should come back automatically after Docker starts.
