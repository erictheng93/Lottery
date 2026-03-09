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
  <select
    :value="modelValue"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    class="bg-base-800 text-gray-200 text-sm font-bold rounded-lg border border-white/[0.08]
           px-3 py-1.5 pr-8 appearance-none cursor-pointer
           hover:border-accent/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30
           transition-all duration-200"
    style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239ca3af%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>'); background-repeat: no-repeat; background-position: right 8px center;"
  >
    <option
      v-for="g in games"
      :key="g.id"
      :value="g.id"
      class="bg-base-900 text-gray-200"
    >
      {{ g.name }}
    </option>
  </select>
</template>
