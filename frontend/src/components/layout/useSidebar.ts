import { create } from 'zustand';

/** Stored as a bare JSON boolean (`true` = expanded) so Settings and older builds read the same value. */
export const SIDEBAR_OPEN_KEY = 'flowguard-sidebar-open';

function readSidebarOpen(): boolean {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_OPEN_KEY);
    return saved === null ? true : JSON.parse(saved) !== false;
  } catch {
    return true;
  }
}

function writeSidebarOpen(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify(open));
  } catch {
    // Storage can be blocked. The sidebar still works; the choice just isn't remembered.
    return;
  }
}

interface SidebarState {
  /** True when the wide-screen sidebar shows labels, false when it shows icons only. */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useSidebar = create<SidebarState>()((set, get) => ({
  open: readSidebarOpen(),
  setOpen: (open) => {
    writeSidebarOpen(open);
    set({ open });
  },
  toggle: () => get().setOpen(!get().open),
}));
