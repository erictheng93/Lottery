<script setup lang="ts">
import type { GameInfo } from '@/api';

defineProps<{
  games: GameInfo[];
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <div class="relative inline-block">
    <select
      :value="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      aria-label="選擇遊戲"
      class="bg-gray-100 dark:bg-base-800 text-gray-800 dark:text-gray-200 text-sm font-bold rounded-lg border border-gray-200 dark:border-white/[0.08]
             px-3 py-1.5 pr-8 appearance-none cursor-pointer
             hover:border-accent/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30
             transition-all duration-200"
    >
      <option
        v-for="g in games"
        :key="g.id"
        :value="g.id"
        class="bg-white dark:bg-base-900 text-gray-800 dark:text-gray-200"
      >
        {{ g.name }}
      </option>
    </select>
    <svg
      class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-gray-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  </div>
</template>
