<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';

const { theme, toggleTheme } = useTheme();
</script>

<template>
  <button
    @click="toggleTheme"
    class="relative w-10 h-10 flex items-center justify-center rounded-xl bg-gray-200/60 dark:bg-base-800/50 border border-black/[0.06] dark:border-white/[0.06] hover:border-accent/30 transition-all duration-300 group overflow-hidden"
    :title="theme === 'light' ? '切換至深色模式' : '切換至淺色模式'"
  >
    <div class="relative w-5 h-5 transition-transform duration-500" :class="theme === 'light' ? 'rotate-90' : 'rotate-0'">
      <!-- Sun icon -->
      <svg
        v-if="theme === 'light'"
        class="w-full h-full text-amber-500 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
      </svg>
      <!-- Moon icon -->
      <svg
        v-else
        class="w-full h-full text-accent filter drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    </div>

    <!-- Interactive background effect -->
    <div class="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
  </button>
</template>
