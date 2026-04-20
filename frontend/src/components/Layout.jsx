import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Footer from './shared/Footer';
import SKUSlideOver from './SKUSlideOver';
import CategorySlideOver from './CategorySlideOver';
import CustomerSlideOver from './CustomerSlideOver';
import GlobalChatBar from './GlobalChatBar';
import CommoditySlideOver from './CommoditySlideOver';
import QuoteDetailSlideOver from './phase45/QuoteDetailSlideOver';
import InsightSlideOver from './phase45/InsightSlideOver';
import { AnimatedGridPattern } from './ui/AnimatedGridPattern';
import { useUI } from '../context/UIContext';
import { useChat } from '../context/ChatContext';
import { buildContextMessage, buildContextLabel } from '../utils/pageContextResolver';
import { startSession, trackPageEnter } from '../utils/tracker';

export default function Layout() {
  const location = useLocation();
  const { sidebarCollapsed, slideOver, selectedItem, clearSelection } = useUI();
  const { setPageContext, setPageContextLabel } = useChat();
  const sessionStarted = useRef(false);

  // Start tracking session once
  useEffect(() => {
    if (!sessionStarted.current) {
      sessionStarted.current = true;
      startSession();
    }
  }, []);

  // Track page changes
  useEffect(() => {
    trackPageEnter(location.pathname);
  }, [location.pathname]);

  // Clear selection on page navigation
  useEffect(() => { clearSelection(); }, [location.pathname, clearSelection]);

  // Update AI chat context on route/slideOver/selection changes
  useEffect(() => {
    setPageContext(buildContextMessage(location.pathname, slideOver, selectedItem));
    setPageContextLabel(buildContextLabel(location.pathname, slideOver, selectedItem));
  }, [location.pathname, slideOver, selectedItem, setPageContext, setPageContextLabel]);

  // Pass sidebar width as CSS variable for the chat bar positioning
  const sidebarWidth = sidebarCollapsed ? 80 : 256;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f9fa', '--sidebar-width': `${sidebarWidth}px` }}>
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        {/* Animated grid background with subtle vignette */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <AnimatedGridPattern
            width={48}
            height={48}
            numSquares={40}
            maxOpacity={0.15}
            duration={4}
            repeatDelay={1}
            className="text-slate-300 fill-slate-300/20 stroke-slate-300/20 [mask-image:radial-gradient(ellipse_85%_85%_at_50%_50%,white_30%,transparent_100%)]"
          />
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto relative z-10">
          {/* Page wrapper — keyed by pathname so React remounts on route change.
              The previous version used AnimatePresence with mode="wait" + an
              opacity 0 → 1 enter animation. On heavy pages (AI Insights) the
              enter animation could fail to start, leaving the wrapper stuck at
              opacity 0 and the page invisible until a hard refresh. We render
              the page immediately at full opacity — no fade-in, no fade-out —
              which is more reliable and visually indistinguishable. */}
          <div key={location.pathname} className="min-w-0">
            <Outlet />
            <Footer />
          </div>
        </div>
        {/* Global AI Chat Bar */}
        <GlobalChatBar />
      </main>
      {/* Slide-over panels */}
      <SKUSlideOver />
      <CategorySlideOver />
      <CustomerSlideOver />
      <CommoditySlideOver />
      <QuoteDetailSlideOver />
      <InsightSlideOver />
    </div>
  );
}
