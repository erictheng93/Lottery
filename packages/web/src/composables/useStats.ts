import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue';
import { fetchStats, type StatsResponse } from '@/api';

const POLL_INTERVAL = 30_000;

export function useStats(game: Ref<string>) {
  const range = ref(100);
  const data = ref<StatsResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fetchStats(game.value, range.value);
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

  watch([range, game], () => {
    data.value = null;
    load();
  });

  onMounted(() => {
    load();
    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onUnmounted(() => {
    stopPolling();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { range, data, loading, error };
}
