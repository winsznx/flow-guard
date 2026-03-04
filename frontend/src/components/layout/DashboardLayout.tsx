import { useState, useEffect, ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { WalletDropdown } from '../ui/WalletDropdown';

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Professional Dashboard Layout
 *
 * DESIGN:
 * - White background (#FFFFFF) throughout
 * - Clean, minimal SaaS aesthetic
 * - NO footer in dashboard (footer is for landing only)
 * - Professional sidebar with proper spacing
 * - Top bar with wallet dropdown
 * - Sidebar state persisted in localStorage
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  // Initialize sidebar state from localStorage, default to true
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('flowguard-sidebar-open');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Persist sidebar state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('flowguard-sidebar-open', JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />

      {/* Main content area with topbar and internal scroll */}
      <div
        className={`flex-1 h-full flex flex-col transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'
          }`}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b border-border/60 bg-surface/90 px-3 py-3 backdrop-blur-md md:px-6 md:py-4">
          <div className="flex items-center justify-between lg:justify-end">
            <button
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surfaceAlt text-textSecondary transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <WalletDropdown />
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full bg-background pb-8 md:pb-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
