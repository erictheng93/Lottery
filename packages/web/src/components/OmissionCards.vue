<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useStats } from '@/composables/useStats';

const props = defineProps<{ game: string }>();
const { data, loading } = useStats(toRef(props, 'game'));

/** For each position, the most omitted digit (details[0]) */
const positionCards = computed(() => {
  if (!data.value) return [];
  return data.value.positions.map((pos) => ({
    position: pos.position,
    top: pos.details[0], // most omitted digit for this position
    allDigits: [...pos.details].sort((a, b) => a.digit - b.digit),
  }));
});

function gapTier(gap: number): 'high' | 'mid' | 'normal' {
  if (gap >= 20) return 'high';
  if (gap >= 10) return 'mid';
  return 'normal';
}

function gapClass(gap: number): string {
  if (gap >= 20) return 'text-gap-high font-bold';
  if (gap >= 10) return 'text-gap-mid font-semibold';
  return 'text-gray-300';
}

// Per-card toggle state
const activeCard = ref<number | null>(null);

function onCardTap(position: number) {
  activeCard.value = activeCard.value === position ? null : position;
}
</script>

<template>
  <div class="glass rounded-xl px-5 py-4 overflow-visible relative z-10">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-xs font-semibold text-gray-500 tracking-wide uppercase">
        各球遺漏最久
      </h2>
      <span v-if="data" class="text-[10px] text-gray-600 font-mono">
        {{ data.total_periods }} 期
      </span>
    </div>

    <!-- Loading skeleton -->
    <div v-if="!data && loading" class="flex justify-center gap-3">
      <div
        v-for="i in 5"
        :key="i"
        class="flex-1 max-w-[88px] h-[104px] rounded-xl bg-base-800 animate-pulse"
      />
    </div>

    <!-- Cards -->
    <div v-else-if="data" class="flex justify-center gap-3 overflow-visible">
      <div
        v-for="(card, i) in positionCards"
        :key="card.position"
        class="omission-card relative flex-1 max-w-[88px] rounded-xl border px-2 py-3
               flex flex-col items-center gap-2 transition-all duration-300 hover:scale-[1.04] cursor-pointer"
        :class="{
          'bg-gap-high/[0.06] border-gap-high/20 hover:border-gap-high/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]': gapTier(card.top.current_gap) === 'high',
          'bg-gap-mid/[0.06] border-gap-mid/20 hover:border-gap-mid/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]': gapTier(card.top.current_gap) === 'mid',
          'bg-accent/[0.04] border-white/[0.06] hover:border-accent/20 hover:shadow-[0_0_20px_rgba(34,211,238,0.06)]': gapTier(card.top.current_gap) === 'normal',
        }"
        :style="{ animationDelay: `${i * 60}ms` }"
        @click="onCardTap(card.position)"
      >
        <!-- Position label -->
        <span class="text-[9px] text-gray-600 uppercase tracking-wide">第{{ card.position }}球</span>

        <!-- Digit -->
        <span
          class="font-mono text-2xl font-extrabold leading-none tabular-nums"
          :class="{
            'text-gap-high': gapTier(card.top.current_gap) === 'high',
            'text-gap-mid': gapTier(card.top.current_gap) === 'mid',
            'text-gray-200': gapTier(card.top.current_gap) === 'normal',
          }"
        >
          {{ card.top.digit }}
        </span>

        <!-- Divider -->
        <div
          class="w-5 h-px"
          :class="{
            'bg-gap-high/20': gapTier(card.top.current_gap) === 'high',
            'bg-gap-mid/20': gapTier(card.top.current_gap) === 'mid',
            'bg-white/[0.08]': gapTier(card.top.current_gap) === 'normal',
          }"
        />

        <!-- Gap info -->
        <div class="flex flex-col items-center gap-0.5">
          <span class="text-[10px] text-gray-600 uppercase tracking-wide">遺漏</span>
          <span
            class="font-mono text-base font-bold tabular-nums leading-none"
            :class="{
              'text-gap-high': gapTier(card.top.current_gap) === 'high',
              'text-gap-mid': gapTier(card.top.current_gap) === 'mid',
              'text-accent': gapTier(card.top.current_gap) === 'normal',
            }"
          >
            {{ card.top.current_gap }}
          </span>
        </div>

        <!-- Tap hint -->
        <span class="text-[9px] text-gray-600 leading-none">
          {{ activeCard === card.position ? '收起' : '點擊展開' }}
        </span>

        <!-- Per-card popover -->
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-1"
        >
          <div
            v-if="activeCard === card.position"
            class="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 card-popover glass rounded-xl border border-white/[0.08] shadow-2xl shadow-black/40 p-3 w-[260px]"
            @click.stop
          >
            <!-- Last seen info for this position's most omitted digit -->
            <div class="mb-2 pb-2 border-b border-white/[0.06] text-center">
              <div class="text-[10px] text-gray-500 tracking-wide mb-1">
                第{{ card.position }}球 · 數字
                <span class="font-mono font-bold text-accent">{{ card.top.digit }}</span>
                最後開出
              </div>
              <span class="font-mono text-sm text-gray-300">{{ card.top.last_seen_period ?? '—' }}</span>
            </div>

            <!-- Popover header -->
            <div class="text-[10px] text-gray-500 uppercase tracking-wide mb-2 text-center">
              第{{ card.position }}球遺漏統計 ({{ data.total_periods }} 期)
            </div>

            <!-- Digit rows 0-9 -->
            <div class="flex flex-col gap-1">
              <div
                v-for="d in card.allDigits"
                :key="d.digit"
                class="flex items-center gap-1.5 py-0.5 rounded px-1 transition-colors"
                :class="d.digit === card.top.digit ? 'bg-accent/10' : 'hover:bg-white/[0.03]'"
              >
                <span
                  v-if="d.last_seen_period"
                  class="font-mono text-[9px] text-gray-600 w-[72px] text-right truncate"
                  :title="d.last_seen_period"
                >
                  {{ d.last_seen_period }}
                </span>
                <span v-else class="font-mono text-[9px] text-gray-700 w-[72px] text-right">—</span>
                <span
                  class="font-mono text-xs font-bold w-4 text-center"
                  :class="gapClass(d.current_gap)"
                >
                  {{ d.digit }}
                </span>
                <div class="flex-1 h-1 rounded-full bg-base-700 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    :class="
                      d.current_gap >= 20 ? 'bg-gap-high'
                        : d.current_gap >= 10 ? 'bg-gap-mid'
                        : 'bg-accent/40'
                    "
                    :style="{ width: `${Math.min((d.current_gap / (card.top.current_gap || 1)) * 100, 100)}%` }"
                  />
                </div>
                <span class="font-mono text-[11px] tabular-nums w-5 text-right" :class="gapClass(d.current_gap)">
                  {{ d.current_gap }}
                </span>
              </div>
            </div>
          </div>
        </Transition>
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
