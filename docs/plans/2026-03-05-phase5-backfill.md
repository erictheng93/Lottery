# Phase 5: Historical Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `/ajax_other_info` batch fetching to backfill 100 historical draw records into D1.

**Architecture:** Add a `backfill()` function in scraper.ts that calls the source site's `/ajax_other_info` endpoint (模式 B), parses the double-JSON response (`initlist`), and batch-inserts records into `draw_results`. Expose via `GET /api/trigger-backfill?range=100`.

**Tech Stack:** Cloudflare Workers (TypeScript), Hono, D1

---

### Task 1: Add types for ajax_other_info response

**Files:**
- Modify: `packages/worker/src/types.ts`

**Step 1:** Add `AjaxOtherInfoResponse` and `InitListItem` interfaces based on PRD spec.

**Step 2:** Verify types compile: `cd packages/worker && npx tsc --noEmit`

**Step 3:** Commit.

---

### Task 2: Add backfill function to scraper

**Files:**
- Modify: `packages/worker/src/scraper.ts`

**Step 1:** Add `fetchHistoricalDraws()` — POST to `/ajax_other_info` with range param.

**Step 2:** Add `backfill(env, range)` — calls fetchHistoricalDraws, parses initlist (double JSON.parse), loops records, inserts new ones into D1 (skip existing via INSERT OR IGNORE).

**Step 3:** Verify types compile.

**Step 4:** Commit.

---

### Task 3: Add /api/trigger-backfill endpoint

**Files:**
- Modify: `packages/worker/src/index.ts`

**Step 1:** Add `GET /api/trigger-backfill?range=100` route that calls `backfill()`.

**Step 2:** Return JSON with inserted count and skipped count.

**Step 3:** Verify types compile.

**Step 4:** Commit.

---

### Task 4: Deploy and run backfill

**Step 1:** Deploy worker: `cd packages/worker && npx wrangler deploy`

**Step 2:** Trigger backfill: `curl <worker-url>/api/trigger-backfill?range=100`

**Step 3:** Verify data: `curl <worker-url>/api/health` — check total_records.

**Step 4:** Verify frontend shows data.
