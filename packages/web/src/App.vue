<script setup lang="ts">
import StatsBar from '@/components/StatsBar.vue';
import OmissionCards from '@/components/OmissionCards.vue';
import DrawTable from '@/components/DrawTable.vue';
</script>

<template>
  <div class="min-h-screen bg-base-950">
    <!-- Subtle gradient overlay -->
    <div class="fixed inset-0 pointer-events-none bg-gradient-to-b from-accent/[0.02] via-transparent to-transparent" />

    <div class="relative max-w-3xl mx-auto px-4 py-6 space-y-4">
      <!-- Header -->
      <header class="flex items-center gap-3 mb-2">
        <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
          </svg>
        </div>
        <div>
          <h1 class="text-base font-bold text-gray-200 leading-tight">WG視訊539 B</h1>
          <p class="text-xs text-gray-600">即時開獎統計</p>
        </div>
      </header>

      <StatsBar />
      <OmissionCards />
      <DrawTable />
    </div>
  </div>
</template>
