import { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  // ── Sidebar collapse ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  // ── Slide-over panel ──
  // type: 'sku' | 'category' | null
  // id: SKU code or category name
  const [slideOver, setSlideOver] = useState({ type: null, id: null });

  // ── Selected item (lightweight click awareness for AI chat) ──
  // { type: 'sku'|'category'|'customer'|'model', id, label, data }
  const [selectedItem, setSelectedItem] = useState(null);
  const selectItem = useCallback((item) => setSelectedItem(item), []);
  const clearSelection = useCallback(() => setSelectedItem(null), []);

  const openSKUDetail = useCallback((skuCode) => {
    setSlideOver({ type: 'sku', id: skuCode });
  }, []);

  const openCategoryDetail = useCallback((categoryName) => {
    setSlideOver({ type: 'category', id: categoryName });
  }, []);

  const closeSlideOver = useCallback(() => {
    setSlideOver({ type: null, id: null });
  }, []);

  return (
    <UIContext.Provider value={{
      sidebarCollapsed,
      toggleSidebar,
      setSidebarCollapsed,
      slideOver,
      openSKUDetail,
      openCategoryDetail,
      closeSlideOver,
      selectedItem,
      selectItem,
      clearSelection,
    }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
