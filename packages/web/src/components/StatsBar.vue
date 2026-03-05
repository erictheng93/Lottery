<script setup lang="ts">
import { ref } from 'vue';
import { useStats } from '@/composables/useStats';
import StatsPopover from './StatsPopover.vue';

const { range, data, loading } = useStats();
const showPopover = ref(false);
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function onEnter() {
  if (hideTimeout) clearTimeout(hideTimeout);
  showPopover.value = true;
}

function onLeave() {
  hideTimeout = setTimeout(() => {
    showPopover.value = false;
  }, 200);
}

function onTap() {
  showPopover.value = !showPopover.value;
}
</script>

<template>
  <div
    class="relative"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <!-- Bar -->
    <button
      @click="onTap"
      class="w-full glass rounded-xl px-5 py-3.5 flex items-center gap-3 cursor-pointer
             hover:border-accent/20 transition-all duration-300 group"
    >
      <!-- Pulse dot -->
      <span class="relative flex h-2.5 w-2.5 shrink-0">
        <span
          v-if="!loading"
          class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/60"
        />
        <span class="relative inline-flex rounded-full h-2.5 w-2.5" :class="loading ? 'bg-gray-600' : 'bg-accent'" />
      </span>

      <template v-if="data">
        <span class="text-sm text-gray-400">遺漏最大</span>
        <span class="font-mono font-bold text-lg tabular-nums" :class="
          data.summary.most_omitted_gap >= 20
            ? 'text-gap-high'
            : data.summary.most_omitted_gap >= 10
              ? 'text-gap-mid'
              : 'text-accent'
        ">
          {{ data.summary.most_omitted_digit }}
        </span>
        <span class="text-sm text-gray-500">
          已
          <span class="font-mono font-semibold text-gray-300">{{ data.summary.most_omitted_gap }}</span>
          期未出現
        </span>
        <span class="ml-auto text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
          {{ showPopover ? '收起' : 'hover 看全部' }}
        </span>
      </template>
      <template v-else-if="loading">
        <span class="text-sm text-gray-500">載入中...</span>
      </template>
    </button>

    <!-- Popover -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="showPopover && data"
        class="absolute z-50 top-full left-0 mt-2"
      >
        <StatsPopover
          :details="data.details"
          :range="range"
          :total-periods="data.summary.total_periods"
          @update:range="range = $event"
        />
      </div>
    </Transition>
  </div>
</template>
