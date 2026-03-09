import { ref, watch, onMounted, type Ref } from 'vue';
import { fetchDraws, type DrawsResponse } from '@/api';

const PAGE_SIZE = 30;

export function useDraws(game: Ref<string>) {
  const draws = ref<DrawsResponse['draws']>([]);
  const total = ref(0);
  const hasMore = ref(false);
  const offset = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  watch(game, () => {
    offset.value = 0;
    draws.value = [];
    load();
  });

  onMounted(() => load());

  return { draws, total, hasMore, offset, loading, error, prevPage, nextPage, reload: load };
}
