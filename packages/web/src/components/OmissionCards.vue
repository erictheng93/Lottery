<script setup lang="ts">
import { computed } from 'vue';
import { useStats, DRAW_COUNT } from '@/composables/useStats';

const { data, loading } = useStats();

const topOmitted = computed(() => {
  if (!data.value) return [];
  return data.value.details.slice(0, DRAW_COUNT);
});

function gapTier(gap: number): 'high' | 'mid' | 'normal' {
  if (gap >= 20) return 'high';
  if (gap >= 10) return 'mid';
  return 'normal';
}
</script>

<template>
  <div class="glass rounded-xl px-5 py-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-xs font-semibold text-gray-500 tracking-wide uppercase">
        遺漏最久
      </h2>
      <span v-if="data" class="text-[10px] text-gray-600 font-mono">
        TOP {{ DRAW_COUNT }}
      </span>
    </div>

    <!-- Loading skeleton -->
    <div v-if="!data && loading" class="flex justify-center gap-3">
      <div
        v-for="i in DRAW_COUNT"
        :key="i"
        class="flex-1 max-w-[88px] h-[104px] rounded-xl bg-base-800 animate-pulse"
      />
    </div>

    <!-- Cards -->
    <div v-else-if="data" class="flex justify-center gap-3">
      <div
        v-for="(item, i) in topOmitted"
        :key="item.digit"
        class="omission-card flex-1 max-w-[88px] rounded-xl border px-2 py-3
               flex flex-col items-center gap-2 transition-all duration-300 hover:scale-[1.04]"
        :class="{
          'bg-gap-high/[0.06] border-gap-high/20 hover:border-gap-high/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]': gapTier(item.current_gap) === 'high',
          'bg-gap-mid/[0.06] border-gap-mid/20 hover:border-gap-mid/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]': gapTier(item.current_gap) === 'mid',
          'bg-accent/[0.04] border-white/[0.06] hover:border-accent/20 hover:shadow-[0_0_20px_rgba(34,211,238,0.06)]': gapTier(item.current_gap) === 'normal',
        }"
        :style="{ animationDelay: `${i * 60}ms` }"
      >
        <!-- Digit -->
        <span
          class="font-mono text-2xl font-extrabold leading-none tabular-nums"
          :class="{
            'text-gap-high': gapTier(item.current_gap) === 'high',
            'text-gap-mid': gapTier(item.current_gap) === 'mid',
            'text-gray-200': gapTier(item.current_gap) === 'normal',
          }"
        >
          {{ item.digit }}
        </span>

        <!-- Divider -->
        <div
          class="w-5 h-px"
          :class="{
            'bg-gap-high/20': gapTier(item.current_gap) === 'high',
            'bg-gap-mid/20': gapTier(item.current_gap) === 'mid',
            'bg-white/[0.08]': gapTier(item.current_gap) === 'normal',
          }"
        />

        <!-- Gap info -->
        <div class="flex flex-col items-center gap-0.5">
          <span class="text-[10px] text-gray-600 uppercase tracking-wide">遺漏</span>
          <span
            class="font-mono text-base font-bold tabular-nums leading-none"
            :class="{
              'text-gap-high': gapTier(item.current_gap) === 'high',
              'text-gap-mid': gapTier(item.current_gap) === 'mid',
              'text-accent': gapTier(item.current_gap) === 'normal',
            }"
          >
            {{ item.current_gap }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.omission-card {
  animation: cardIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
