import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  Vote,
  DollarSign,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Globe,
  Repeat,
  Gift,
  X,
  Server,
} from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

/**
 * Sidebar component for dashboard navigation
 *
 * DESIGN RULES:
 * - Uses ONLY Sage palette colors (#F1F3E0, #D2DCB6, #A1BC98, #778873)
 * - All colors via Tailwind classes from globals.css tokens
 * - NO bg-white, text-ink, border-black, gray-*, etc.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  isOpen = true,
  onToggle,
  isMobileOpen = false,
  onMobileClose
}) => {
  const location = useLocation();
  // On mobile, if the menu is open, we treat it as "expanded" regardless of desktop preference
  const resolvedOpen = isOpen || isMobileOpen;

  const navItems = [
    { path: '/streams', icon: Inbox, label: 'Vesting' }, // Vesting product
    { path: '/payments', icon: Repeat, label: 'Payments' }, // Recurring payments product
    { path: '/airdrops', icon: Gift, label: 'Airdrops' }, // Mass distribution product
    { path: '/vaults', icon: LayoutDashboard, label: 'Treasuries' },
    { path: '/vaults/create', icon: PlusCircle, label: 'Create Treasury' },
    { path: '/proposals', icon: FileText, label: 'Proposals' },
    { path: '/budgets', icon: DollarSign, label: 'Budget Plans' },
    { path: '/governance', icon: Vote, label: 'Governance' },
    { path: '/docs', icon: BookOpen, label: 'Documentation' },
  ];

  const isActive = (path: string) => {
    if (path === '/vaults') {
      return location.pathname === '/vaults' || (location.pathname.startsWith('/vaults/') && location.pathname !== '/vaults/create');
    }
    return location.pathname === path;
  };

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 bg-surfaceAlt border-r border-border transition-all duration-300 z-50
        w-64 flex flex-col
        ${isOpen ? 'lg:w-64' : 'lg:w-20'}
        ${isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
      `}
    >
      <div className="flex flex-col h-full relative">
        {/* Header - Logo & Toggle */}
        <div className={`flex items-center h-20 transition-all duration-300 ${resolvedOpen ? 'px-4 justify-between' : 'px-0 justify-center'
          }`}>
          <Link to="/" className={`flex items-center gap-3 overflow-hidden ${resolvedOpen ? 'ml-0' : 'mx-auto'
            }`}>
            <img
              src="/assets/flow-logo.png"
              alt="FlowGuard"
              className="w-10 h-10 flex-shrink-0 object-contain"
            />
            <span
              className={`font-display font-bold text-xl text-textPrimary whitespace-nowrap transition-all duration-300 ${resolvedOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 pointer-events-none'
                }`}
            >
              FlowGuard
            </span>
          </Link>

          {/* Desktop Collapse Toggle */}
          {isOpen && (
            <button
              onClick={onToggle}
              className="hidden lg:flex p-1.5 rounded-lg hover:bg-brand-100 transition-all duration-300 flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5 text-textMuted" />
            </button>
          )}

          {/* Mobile Close Button */}
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-brand-100 transition-all duration-300 flex-shrink-0"
          >
            <X className="w-5 h-5 text-textMuted" />
          </button>
        </div>

        {/* Toggle button when collapsed (Desktop Only) */}
        {!isOpen && (
          <button
            onClick={onToggle}
            className="hidden lg:flex p-2 rounded-lg hover:bg-brand-100 transition-all duration-300 absolute bottom-6 left-1/2 -translate-x-1/2 bg-surfaceAlt border border-border shadow-sm"
          >
            <ChevronRight className="w-5 h-5 text-textMuted" />
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-2 overflow-y-auto mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={isMobileOpen ? onMobileClose : undefined}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 font-mono text-sm group relative overflow-hidden ${active
                  ? 'bg-accent text-textPrimary shadow-lg shadow-accent/20 font-bold'
                  : 'text-textMuted hover:bg-brand-100 hover:text-textPrimary'
                  } ${resolvedOpen ? 'justify-start' : 'justify-center'}`}
                title={!resolvedOpen ? item.label : undefined}
              >
                {/* Active indicator bar (visible when collapsed) */}
                {active && !resolvedOpen && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-textPrimary rounded-r-full" />
                )}

                <Icon className={`w-5 h-5 flex-shrink-0 transition-colors ${active ? 'text-textPrimary' : 'text-textMuted group-hover:text-textPrimary'
                  }`} />

                <span
                  className={`whitespace-nowrap transition-all duration-300 ${resolvedOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 pointer-events-none'
                    }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer info */}
        <div
          className={`p-6 border-t border-border bg-brand-100/50 transition-all duration-300 overflow-hidden ${resolvedOpen ? 'opacity-100 max-h-24' : 'opacity-0 max-h-0 pointer-events-none'
            }`}
        >
          <div className="text-xs font-mono text-textMuted">
            <p className="font-bold mb-1 text-textPrimary whitespace-nowrap">FlowGuard v1.0</p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
              <p className="whitespace-nowrap">BCH Chipnet</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
