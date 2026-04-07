import { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  // ── Sidebar collapse ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  // ── Slide-over panel with history stack for breadcrumb navigation ──
  // type: 'sku' | 'category' | 'customer' | null
  // id: SKU code, category name, or customer ID
  const [slideOver, setSlideOver] = useState({ type: null, id: null });
  const [panelHistory, setPanelHistory] = useState([]);

  // ── Selected item (lightweight click awareness for AI chat) ──
  const [selectedItem, setSelectedItem] = useState(null);
  const selectItem = useCallback((item) => setSelectedItem(item), []);
  const clearSelection = useCallback(() => setSelectedItem(null), []);

  const openSKUDetail = useCallback((skuCode) => {
    setSlideOver(prev => {
      // Push current panel to history if there is one (max 2 levels)
      if (prev.type && prev.id) {
        setPanelHistory(h => [...h.slice(-1), { type: prev.type, id: prev.id }]);
      }
      return { type: 'sku', id: skuCode };
    });
  }, []);

  const openCategoryDetail = useCallback((categoryName) => {
    setSlideOver(prev => {
      if (prev.type && prev.id) {
        setPanelHistory(h => [...h.slice(-1), { type: prev.type, id: prev.id }]);
      }
      return { type: 'category', id: categoryName };
    });
  }, []);

  const openCustomerDetail = useCallback((customerId) => {
    setSlideOver(prev => {
      if (prev.type && prev.id) {
        setPanelHistory(h => [...h.slice(-1), { type: prev.type, id: prev.id }]);
      }
      return { type: 'customer', id: customerId };
    });
  }, []);

  const goBackPanel = useCallback(() => {
    setPanelHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setSlideOver({ type: prev.type, id: prev.id });
      return h.slice(0, -1);
    });
  }, []);

  const closeSlideOver = useCallback(() => {
    setSlideOver({ type: null, id: null });
    setPanelHistory([]);
  }, []);

  return (
    <UIContext.Provider value={{
      sidebarCollapsed,
      toggleSidebar,
      setSidebarCollapsed,
      slideOver,
      panelHistory,
      openSKUDetail,
      openCategoryDetail,
      openCustomerDetail,
      goBackPanel,
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
