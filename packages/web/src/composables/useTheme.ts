import { ref, onMounted, watch } from 'vue';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const theme = ref<Theme>('dark'); // Default to dark as per existing design

  const toggleTheme = () => {
    theme.value = theme.value === 'light' ? 'dark' : 'light';
  };

  const applyTheme = (newTheme: Theme) => {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', newTheme);
  };

  onMounted(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      theme.value = savedTheme;
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme.value = 'light';
    }
    applyTheme(theme.value);
  });

  watch(theme, (newTheme) => {
    applyTheme(newTheme);
  });

  return {
    theme,
    toggleTheme,
  };
}
