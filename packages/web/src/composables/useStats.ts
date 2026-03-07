import { ref, watch, onMounted, onUnmounted } from 'vue';
import { fetchStats, type StatsResponse } from '@/api';

const POLL_INTERVAL = 30_000;

/** Number of digits drawn per game (539 = 5, change for other games) */
export const DRAW_COUNT = 5;

// Shared state — singleton across all components
const range = ref(100);
const data = ref<StatsResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;
let subscribers = 0;

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchStats(range.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function startPolling() {
  stopPolling();
  timer = setInterval(load, POLL_INTERVAL);
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    stopPolling();
  } else {
    load();
    startPolling();
  }
}

watch(range, () => load());

export function useStats() {
  onMounted(() => {
    subscribers++;
    if (subscribers === 1) {
      load();
      startPolling();
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
  });

  onUnmounted(() => {
    subscribers--;
    if (subscribers === 0) {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  });

  return { range, data, loading, error };
}
