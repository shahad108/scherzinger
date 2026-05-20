import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';

export function useDensity() {
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  return { density, setDensity };
}
