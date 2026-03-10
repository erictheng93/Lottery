<script setup lang="ts">
import { toRef } from 'vue';
import { useDraws } from '@/composables/useDraws';

const props = defineProps<{ game: string }>();
const { draws, total, hasMore, offset, loading, error, reload, currentPage, totalPages, prevPage, nextPage, goToPage } = useDraws(toRef(props, 'game'));

/** Build a compact list of page numbers with ellipsis gaps */
function visiblePages(): (number | '...')[] {
  const tp = totalPages.value;
  const cp = currentPage.value;
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1);

  const pages: (number | '...')[] = [1];
  const start = Math.max(2, cp - 1);
  const end = Math.min(tp - 1, cp + 1);

  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < tp - 1) pages.push('...');
  pages.push(tp);
  return pages;
}

// Each digit 0-9 gets a unique background color with contrasting text
const digitStyles: Record<number, string> = {
  0: 'bg-red-500 ring-red-400/30 text-white',
  1: 'bg-orange-500 ring-orange-400/30 text-white',
  2: 'bg-amber-500 ring-amber-400/30 text-white',
  3: 'bg-yellow-400 ring-yellow-300/30 text-gray-900',
  4: 'bg-green-500 ring-green-400/30 text-white',
  5: 'bg-gray-500 ring-gray-400/30 text-white',
  6: 'bg-cyan-500 ring-cyan-400/30 text-white',
  7: 'bg-blue-500 ring-blue-400/30 text-white',
  8: 'bg-purple-500 ring-purple-400/30 text-white',
  9: 'bg-pink-500 ring-pink-400/30 text-white',
};

function digitStyle(d: number): string {
  return digitStyles[d] ?? 'bg-gray-200 ring-gray-300/30 text-gray-700';
}


function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
</script>

<template>
  <div class="glass rounded-xl overflow-hidden">
    <!-- Header -->
    <div class="px-3 sm:px-5 py-3 sm:py-3.5 border-b border-black/[0.03] dark:border-white/[0.04] flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-wide uppercase">
        開獎記錄
        <span class="text-gray-500 dark:text-gray-600 font-normal ml-1.5">{{ total }} 筆</span>
      </h2>

      <div class="flex items-center gap-1 sm:gap-1.5 text-xs">
        <!-- Prev -->
        <button
          @click="prevPage"
          :disabled="offset === 0"
          class="w-8 h-8 sm:w-7 sm:h-7 rounded-md font-medium transition-all duration-200 flex items-center justify-center
                 disabled:text-gray-300 dark:disabled:text-gray-700 disabled:cursor-not-allowed
                 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-base-700
                 active:bg-gray-200 dark:active:bg-base-600"
          title="上一頁"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Page numbers -->
        <template v-for="(p, i) in visiblePages()" :key="i">
          <span v-if="p === '...'" class="w-6 text-center text-gray-400 dark:text-gray-600 select-none">…</span>
          <button
            v-else
            @click="goToPage(p)"
            :class="[
              'w-8 h-8 sm:w-7 sm:h-7 rounded-md font-medium tabular-nums transition-all duration-200 flex items-center justify-center',
              p === currentPage
                ? 'bg-accent text-white shadow-sm shadow-accent/25'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-base-700 active:bg-gray-200 dark:active:bg-base-600'
            ]"
          >
            {{ p }}
          </button>
        </template>

        <!-- Next -->
        <button
          @click="nextPage"
          :disabled="!hasMore"
          class="w-8 h-8 sm:w-7 sm:h-7 rounded-md font-medium transition-all duration-200 flex items-center justify-center
                 disabled:text-gray-300 dark:disabled:text-gray-700 disabled:cursor-not-allowed
                 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-base-700
                 active:bg-gray-200 dark:active:bg-base-600"
          title="下一頁"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading bar -->
    <div v-if="loading" class="h-0.5 bg-gray-200 dark:bg-base-800 overflow-hidden">
      <div class="h-full w-1/3 bg-accent/50 animate-pulse rounded-full" />
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-gray-500 dark:text-gray-500 text-[10px] sm:text-xs uppercase tracking-wider border-b border-black/[0.03] dark:border-white/[0.04]">
            <th class="text-left px-2 sm:px-5 py-2 sm:py-2.5 font-medium whitespace-nowrap">期數</th>
            <th class="text-left px-1.5 sm:px-3 py-2 sm:py-2.5 font-medium whitespace-nowrap">時間</th>
            <th class="text-center px-1.5 sm:px-3 py-2 sm:py-2.5 font-medium whitespace-nowrap">開獎號碼</th>
            <th class="text-center px-2 sm:px-5 py-2 sm:py-2.5 font-medium whitespace-nowrap">個位數</th>
          </tr>

        </thead>

        <tbody>
          <tr
            v-for="draw in draws"
            :key="draw.period_id"
            class="border-t border-black/[0.02] dark:border-white/[0.03] hover:bg-black/[0.01] dark:hover:bg-white/[0.015] transition-colors"
          >
            <td class="px-2 sm:px-5 py-2 sm:py-2.5 font-mono text-gray-500 dark:text-gray-400 tabular-nums text-[10px] sm:text-xs whitespace-nowrap">
              {{ draw.period_id }}
            </td>
            <td class="px-1.5 sm:px-3 py-2 sm:py-2.5 font-mono text-gray-500 dark:text-gray-500 tabular-nums text-[10px] sm:text-xs whitespace-nowrap">
              {{ formatTime(draw.draw_time) }}
            </td>

            <td class="px-1.5 sm:px-3 py-2 sm:py-2.5 text-center">
              <div class="flex items-center justify-center gap-1 sm:gap-1.5 min-w-max">
                <span
                  v-for="(num, i) in draw.numbers"
                  :key="i"
                  class="inline-flex items-center justify-center w-6 h-5 sm:w-8 sm:h-7
                         rounded sm:rounded-md font-mono text-[10px] sm:text-xs tabular-nums ring-1"
                  :class="digitStyle(num % 10)"
                >
                  {{ String(num).padStart(2, '0') }}
                </span>


              </div>
            </td>
            <td class="px-2 sm:px-5 py-2 sm:py-2.5 text-center">
              <div class="flex items-center justify-center gap-0.5 sm:gap-1 min-w-max">
                <span
                  v-for="(d, i) in draw.digits"
                  :key="i"
                  class="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6
                         rounded-full font-mono text-[9px] sm:text-xs font-semibold tabular-nums
                         ring-1"
                  :class="digitStyle(d)"
                >
                  {{ d }}
                </span>
              </div>
            </td>

          </tr>
          <tr v-if="error">
            <td colspan="4" class="px-5 py-10 text-center">
              <p class="text-red-500 dark:text-red-400 mb-2">載入失敗</p>
              <button
                @click="reload"
                class="text-xs text-accent hover:text-accent/80 underline underline-offset-2 transition-colors"
              >
                重新載入
              </button>
            </td>
          </tr>
          <tr v-else-if="draws.length === 0 && !loading">
            <td colspan="4" class="px-5 py-10 text-center text-gray-500 dark:text-gray-600">
              暫無數據
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
