import { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  // type: 'sku' | 'category' | 'customer' | 'commodity' | 'quote' | null
  const [slideOver, setSlideOver] = useState({ type: null, id: null, initialTab: null });
  const [panelHistory, setPanelHistory] = useState([]);

  const [selectedItem, setSelectedItem] = useState(null);
  const selectItem = useCallback((item) => setSelectedItem(item), []);
  const clearSelection = useCallback(() => setSelectedItem(null), []);

  const pushAndOpen = useCallback((next) => {
    setSlideOver(prev => {
      if (prev.type && prev.id) {
        setPanelHistory(h => [...h.slice(-1), prev]);
      }
      return next;
    });
  }, []);

  const openSKUDetail      = useCallback((skuCode, initialTab = null)     => pushAndOpen({ type: 'sku',       id: skuCode,     initialTab }), [pushAndOpen]);
  const openCategoryDetail = useCallback((categoryName, initialTab = null) => pushAndOpen({ type: 'category', id: categoryName, initialTab }), [pushAndOpen]);
  const openCustomerDetail = useCallback((customerId, initialTab = null)   => pushAndOpen({ type: 'customer', id: customerId,  initialTab }), [pushAndOpen]);
  const openCommodityDetail= useCallback((commodityId, initialTab = null)  => pushAndOpen({ type: 'commodity',id: commodityId, initialTab }), [pushAndOpen]);
  const openQuoteDetail    = useCallback((quoteId, initialTab = null)      => pushAndOpen({ type: 'quote',    id: quoteId,     initialTab }), [pushAndOpen]);

  const goBackPanel = useCallback(() => {
    setPanelHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setSlideOver(prev);
      return h.slice(0, -1);
    });
  }, []);

  const closeSlideOver = useCallback(() => {
    setSlideOver({ type: null, id: null, initialTab: null });
    setPanelHistory([]);
  }, []);

  return (
    <UIContext.Provider value={{
      sidebarCollapsed, toggleSidebar, setSidebarCollapsed,
      slideOver, panelHistory,
      openSKUDetail, openCategoryDetail, openCustomerDetail, openCommodityDetail, openQuoteDetail,
      goBackPanel, closeSlideOver,
      selectedItem, selectItem, clearSelection,
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
