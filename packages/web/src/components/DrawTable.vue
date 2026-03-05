<script setup lang="ts">
import { useDraws } from '@/composables/useDraws';

const { draws, total, hasMore, offset, loading, prevPage, nextPage } = useDraws();

function digitColor(d: number, digits: number[]): string {
  // Highlight digits that appear more than once in same draw
  const count = digits.filter((x) => x === d).length;
  if (count > 1) return 'text-accent font-bold';
  return 'text-gray-300';
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
    <div class="px-5 py-3.5 border-b border-white/[0.04] flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-400 tracking-wide uppercase">
        開獎記錄
        <span class="text-gray-600 font-normal ml-1.5">{{ total }} 筆</span>
      </h2>
      <div class="flex items-center gap-2 text-xs">
        <button
          @click="prevPage"
          :disabled="offset === 0"
          class="px-3 py-1.5 rounded-md font-medium transition-all duration-200
                 disabled:text-gray-700 disabled:cursor-not-allowed
                 text-gray-400 hover:text-gray-200 hover:bg-base-700"
        >
          上一頁
        </button>
        <button
          @click="nextPage"
          :disabled="!hasMore"
          class="px-3 py-1.5 rounded-md font-medium transition-all duration-200
                 disabled:text-gray-700 disabled:cursor-not-allowed
                 text-gray-400 hover:text-gray-200 hover:bg-base-700"
        >
          下一頁
        </button>
      </div>
    </div>

    <!-- Loading bar -->
    <div v-if="loading" class="h-0.5 bg-base-800 overflow-hidden">
      <div class="h-full w-1/3 bg-accent/50 animate-pulse rounded-full" />
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-gray-500 text-xs uppercase tracking-wider border-b border-white/[0.04]">
            <th class="text-left px-5 py-2.5 font-medium">期數</th>
            <th class="text-left px-3 py-2.5 font-medium">時間</th>
            <th class="text-center px-3 py-2.5 font-medium">開獎號碼</th>
            <th class="text-center px-5 py-2.5 font-medium">個位數</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="draw in draws"
            :key="draw.period_id"
            class="border-t border-white/[0.03] hover:bg-white/[0.015] transition-colors"
          >
            <td class="px-5 py-2.5 font-mono text-gray-400 tabular-nums text-xs">
              {{ draw.period_id }}
            </td>
            <td class="px-3 py-2.5 font-mono text-gray-500 tabular-nums text-xs">
              {{ formatTime(draw.draw_time) }}
            </td>
            <td class="px-3 py-2.5 text-center">
              <div class="flex items-center justify-center gap-1.5">
                <span
                  v-for="(num, i) in draw.numbers"
                  :key="i"
                  class="inline-flex items-center justify-center w-8 h-7
                         rounded-md bg-base-700/60 font-mono text-xs text-gray-300 tabular-nums"
                >
                  {{ String(num).padStart(2, '0') }}
                </span>
              </div>
            </td>
            <td class="px-5 py-2.5 text-center">
              <div class="flex items-center justify-center gap-1">
                <span
                  v-for="(d, i) in draw.digits"
                  :key="i"
                  class="inline-flex items-center justify-center w-6 h-6
                         rounded-full font-mono text-xs font-semibold tabular-nums
                         bg-accent/[0.08] ring-1 ring-accent/10"
                  :class="digitColor(d, draw.digits)"
                >
                  {{ d }}
                </span>
              </div>
            </td>
          </tr>
          <tr v-if="draws.length === 0 && !loading">
            <td colspan="4" class="px-5 py-10 text-center text-gray-600">
              暫無數據
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
