import { ref, computed, watch, onMounted, onUnmounted, type Ref } from 'vue';
import { fetchDraws, type DrawsResponse } from '@/api';

const PAGE_SIZE = 30;
const POLL_INTERVAL = 30_000;

export function useDraws(game: Ref<string>) {
  const draws = ref<DrawsResponse['draws']>([]);
  const total = ref(0);
  const hasMore = ref(false);
  const offset = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;

  const currentPage = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1);
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetchDraws(game.value, PAGE_SIZE, offset.value);
      draws.value = res.draws;
      total.value = res.total;
      hasMore.value = res.has_more;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(() => {
      if (offset.value === 0) load();
    }, POLL_INTERVAL);
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
      if (offset.value === 0) load();
      startPolling();
    }
  }

  function prevPage() {
    if (offset.value <= 0) return;
    offset.value = Math.max(0, offset.value - PAGE_SIZE);
    load();
  }

  function nextPage() {
    if (!hasMore.value) return;
    offset.value += PAGE_SIZE;
    load();
  }

  function goToPage(page: number) {
    if (page < 1 || page > totalPages.value) return;
    offset.value = (page - 1) * PAGE_SIZE;
    load();
  }

  watch(game, () => {
    offset.value = 0;
    draws.value = [];
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

  return { draws, total, hasMore, offset, loading, error, currentPage, totalPages, prevPage, nextPage, goToPage, reload: load };
}
