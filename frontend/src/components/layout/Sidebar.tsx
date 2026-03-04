import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  Vote,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Repeat,
  Gift,
  X,
  Users,
  ShieldCheck,
  Settings,
  Clock,
  History,
} from 'lucide-react';
import { useAppMode } from '../../hooks/useAppMode';
import { MAIN_SITE_URL } from '../../utils/publicUrls';

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
  const { mode, setMode, toggleMode } = useAppMode();

  // On mobile, if the menu is open, we treat it as "expanded" regardless of desktop preference
  const resolvedOpen = isOpen || isMobileOpen;

  type NavItem = { path: string; icon: any; label: string; beta?: boolean };

  const userNavItems: NavItem[] = [
    { path: '/app', icon: LayoutDashboard, label: 'App Home' },
    { path: '/vaults', icon: LayoutDashboard, label: 'Treasuries' },
    { path: '/streams', icon: Inbox, label: 'Vesting' },
    { path: '/streams/activity', icon: Clock, label: 'Stream Activity' },
    { path: '/streams/batches', icon: History, label: 'Batch Runs' },
    { path: '/payments', icon: Repeat, label: 'Payments' },
    { path: '/airdrops', icon: Gift, label: 'Airdrops' },
    { path: '/proposals', icon: FileText, label: 'Proposals' },
    { path: '/budgets', icon: DollarSign, label: 'Budget Plans' },
    { path: '/governance', icon: Vote, label: 'Governance' },
  ];

  const daoNavItems: NavItem[] = [
    { path: '/app', icon: LayoutDashboard, label: 'App Home' },
    { path: '/vaults', icon: LayoutDashboard, label: 'Treasuries' },
    { path: '/app/dao/streams', icon: Inbox, label: 'Vesting', beta: true },
    { path: '/app/dao/stream-activity', icon: Clock, label: 'Stream Activity', beta: true },
    { path: '/app/dao/stream-batches', icon: History, label: 'Batch Runs', beta: true },
    { path: '/payments', icon: Repeat, label: 'Payments' },
    { path: '/airdrops', icon: Gift, label: 'Airdrops' },
    { path: '/proposals', icon: FileText, label: 'Proposals' },
    { path: '/app/dao/overview', icon: FileText, label: 'DAO Overview', beta: true },
    { path: '/app/dao/team', icon: Users, label: 'Team', beta: true },
    { path: '/app/dao/roles', icon: ShieldCheck, label: 'Roles', beta: true },
    { path: '/app/dao/treasury-policy', icon: Settings, label: 'Policy', beta: true },
  ];

  const filteredNavItems = mode === 'dao' ? daoNavItems : userNavItems;

  const isActive = (path: string) => {
    if (path === '/app') {
      return location.pathname === '/app';
    }
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
          <a
            href={MAIN_SITE_URL}
            onClick={isMobileOpen ? onMobileClose : undefined}
            className={`flex items-center gap-3 overflow-hidden ${resolvedOpen ? 'ml-0' : 'mx-auto'
              }`}
          >
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
          </a>

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

        {/* Mode Switcher */}
        {resolvedOpen ? (
          <div className="px-4 py-2 mt-4">
            <div className="bg-brand-100/50 p-1 rounded-xl flex items-center border border-border/50">
              <button
                onClick={() => setMode('user')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                  mode === 'user'
                    ? 'bg-surface shadow-sm text-textPrimary'
                    : 'text-textMuted hover:text-textPrimary'
                }`}
              >
                User
              </button>
              <button
                onClick={() => setMode('dao')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                  mode === 'dao'
                    ? 'border border-accent/20 bg-accent/10 text-accent'
                    : 'text-textMuted hover:text-textPrimary'
                }`}
              >
                DAO (Beta)
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto mt-4 px-2">
            <button
              onClick={toggleMode}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                mode === 'dao'
                  ? 'bg-accent/10 text-accent'
                  : 'border border-border bg-surfaceAlt text-textMuted'
              }`}
              title={`Switch Mode: Currently ${mode.toUpperCase()}`}
            >
              {mode === 'dao' ? <ShieldCheck className="w-5 h-5" /> : <Users className="w-5 h-5" />}
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-2 overflow-y-auto mt-2">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const isBeta = item.beta;

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
                  className={`whitespace-nowrap flex-1 flex items-center gap-2 transition-all duration-300 ${resolvedOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 pointer-events-none'
                    }`}
                >
                  {item.label}
                  {isBeta && (
                    <span className="ml-auto shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-sans uppercase tracking-wider text-textPrimary">
                      Beta
                    </span>
                  )}
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
