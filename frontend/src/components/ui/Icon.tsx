import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';

export type { LucideIcon } from 'lucide-react';

export {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpFromLine,
  ArrowUpRight,
  Award,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardPaste,
  Copy,
  Ellipsis,
  FileCheck,
  Gift,
  Globe,
  House,
  Info,
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  MenuIcon,
  Milestone,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Target,
  TriangleAlert,
  Upload,
  Users,
  Vault,
  Vote,
  Wallet,
  Waves,
  X,
} from 'lucide-react';

export type IconProps = { icon: LucideIcon; size?: 16 | 20 | 24; label?: string };

const SIZE = {
  16: 'size-4',
  20: 'size-5',
  24: 'size-6',
} as const;

const STROKE_WIDTH = 1.75;

export function Icon({ icon: Glyph, size = 20, label }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={STROKE_WIDTH}
      focusable="false"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      className={cx('shrink-0', SIZE[size])}
    />
  );
}
