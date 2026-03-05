<script setup lang="ts">
import type { DigitDetail } from '@/api';

defineProps<{
  details: DigitDetail[];
  range: number;
  totalPeriods: number;
}>();

const emit = defineEmits<{
  'update:range': [value: number];
}>();

const ranges = [30, 60, 100] as const;

function gapClass(gap: number): string {
  if (gap >= 20) return 'text-gap-high font-bold';
  if (gap >= 10) return 'text-gap-mid font-semibold';
  return 'text-gray-300';
}

function gapBarWidth(gap: number, maxInList: number): string {
  if (maxInList === 0) return '0%';
  return `${Math.min((gap / maxInList) * 100, 100)}%`;
}
</script>

<template>
  <div class="glass rounded-xl shadow-2xl shadow-black/40 p-5 w-[420px] max-w-[92vw] slide-up">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-gray-400 tracking-wide uppercase">
        個位數統計
        <span class="text-accent ml-1">({{ totalPeriods }} 期)</span>
      </h3>
      <div class="flex gap-1">
        <button
          v-for="r in ranges"
          :key="r"
          @click="emit('update:range', r)"
          :class="[
            'px-2.5 py-1 text-xs rounded-md font-mono font-semibold transition-all duration-200',
            range === r
              ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
              : 'text-gray-500 hover:text-gray-300 hover:bg-base-700',
          ]"
        >
          {{ r }}期
        </button>
      </div>
    </div>

    <table class="w-full text-sm">
      <thead>
        <tr class="text-gray-500 text-xs uppercase tracking-wider">
          <th class="text-left py-2 font-medium">數字</th>
          <th class="text-right py-2 font-medium">出現</th>
          <th class="text-right py-2 font-medium pr-3">當前遺漏</th>
          <th class="text-left py-2 font-medium pl-1 w-24"></th>
          <th class="text-right py-2 font-medium">最大遺漏</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(d, i) in details"
          :key="d.digit"
          class="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors"
          :style="{ animationDelay: `${i * 30}ms` }"
        >
          <td class="py-2.5">
            <span
              class="inline-flex items-center justify-center w-7 h-7 rounded-lg font-mono font-bold text-sm"
              :class="
                d.current_gap >= 20
                  ? 'bg-gap-high/15 text-gap-high'
                  : d.current_gap >= 10
                    ? 'bg-gap-mid/15 text-gap-mid'
                    : 'bg-base-700 text-gray-300'
              "
            >
              {{ d.digit }}
            </span>
          </td>
          <td class="text-right font-mono text-gray-400 tabular-nums">
            {{ d.frequency }}
          </td>
          <td class="text-right pr-3 font-mono tabular-nums" :class="gapClass(d.current_gap)">
            {{ d.current_gap }}
            <span v-if="d.current_gap === 0" class="text-[10px] text-accent/60 ml-0.5">本期</span>
          </td>
          <td class="pl-1">
            <div class="h-1.5 rounded-full bg-base-700 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="
                  d.current_gap >= 20
                    ? 'bg-gap-high'
                    : d.current_gap >= 10
                      ? 'bg-gap-mid'
                      : 'bg-accent/40'
                "
                :style="{ width: gapBarWidth(d.current_gap, details[0]?.current_gap ?? 1) }"
              />
            </div>
          </td>
          <td class="text-right font-mono text-gray-500 tabular-nums">
            {{ d.max_gap }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
