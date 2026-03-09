<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { fetchGames, type GameInfo } from '@/api';
import GameSelector from '@/components/GameSelector.vue';
import StatsBar from '@/components/StatsBar.vue';
import OmissionCards from '@/components/OmissionCards.vue';
import DrawTable from '@/components/DrawTable.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';


const DEFAULT_GAME = 'wg539b';

const games = ref<GameInfo[]>([]);
const currentGame = ref(DEFAULT_GAME);

function readGameFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('game') || DEFAULT_GAME;
}

function writeGameToUrl(gameId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('game', gameId);
  window.history.replaceState({}, '', url.toString());
}

watch(currentGame, (gameId) => {
  writeGameToUrl(gameId);
});

window.addEventListener('popstate', () => {
  currentGame.value = readGameFromUrl();
});

onMounted(async () => {
  currentGame.value = readGameFromUrl();
  try {
    games.value = await fetchGames();
  } catch {
    games.value = [{ id: DEFAULT_GAME, name: 'WG視訊539 B', numCount: 5 }];
  }
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-base-950 text-gray-800 dark:text-gray-200 transition-colors duration-300">
    <div class="hidden md:block fixed inset-0 pointer-events-none bg-gradient-to-b from-accent/[0.05] via-transparent to-transparent dark:from-accent/[0.02]" />

    <div class="relative max-w-3xl mx-auto px-2 md:px-4 py-4 md:py-6 space-y-3 md:space-y-4">

      <header class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
          </div>
          <div>
            <GameSelector
              v-if="games.length > 0"
              v-model="currentGame"
              :games="games"
            />
            <p class="text-xs text-gray-400 dark:text-gray-600 mt-0.5">即時開獎統計</p>
          </div>
        </div>
        <ThemeToggle />
      </header>


      <StatsBar :game="currentGame" />
      <OmissionCards :game="currentGame" />
      <DrawTable :game="currentGame" />
    </div>
  </div>
</template>
