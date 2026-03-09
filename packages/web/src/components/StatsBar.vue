<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useStats } from '@/composables/useStats';

const props = defineProps<{ game: string }>();
const { data, loading } = useStats(toRef(props, 'game'));

const topOmission = computed(() => {
  if (!data.value) return null;
  let best: { position: number; digit: number; gap: number } | null = null;
  for (const pos of data.value.positions) {
    const top = pos.details[0];
    if (top && (!best || top.current_gap > best.gap)) {
      best = { position: pos.position, digit: top.digit, gap: top.current_gap };
    }
  }
  return best;
});
</script>

<template>
  <div class="glass rounded-xl px-5 py-3.5 flex items-center gap-3">
    <span class="relative flex h-2.5 w-2.5 shrink-0">
      <span
        v-if="!loading"
        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/60"
      />
      <span class="relative inline-flex rounded-full h-2.5 w-2.5" :class="loading ? 'bg-gray-600' : 'bg-accent'" />
    </span>

    <template v-if="data && topOmission">
      <span class="text-sm text-gray-400 dark:text-gray-400">遺漏最大</span>
      <span class="text-sm text-gray-500 dark:text-gray-500">
        第{{ topOmission.position }}球
      </span>
      <span class="font-mono font-bold text-lg tabular-nums" :class="
        topOmission.gap >= 20
          ? 'text-gap-high'
          : topOmission.gap >= 10
            ? 'text-gap-mid'
            : 'text-accent'
      ">
        {{ topOmission.digit }}
      </span>
      <span class="text-sm text-gray-500 dark:text-gray-500">
        已
        <span class="font-mono font-semibold text-gray-700 dark:text-gray-300">{{ topOmission.gap }}</span>
        期未出現
      </span>
    </template>

    <template v-else-if="loading">
      <span class="text-sm text-gray-500">載入中...</span>
    </template>
  </div>
</template>
