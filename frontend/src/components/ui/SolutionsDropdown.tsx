import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Coins, Users, PieChart, Gift, Vote, Lightbulb, Sparkles, PlayCircle } from 'lucide-react';

interface Solution {
  name: string;
  href: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const solutions: Solution[] = [
  {
    name: 'Vesting',
    href: '/vesting',
    description: 'Release tokens on a fixed schedule',
    icon: Coins,
  },
  {
    name: 'Payroll',
    href: '/payroll',
    description: 'Pay your team automatically',
    icon: Users,
  },
  {
    name: 'Budgeting',
    href: '/budgeting',
    description: 'Set spending limits that enforce themselves',
    icon: PieChart,
  },
  {
    name: 'Grants Info',
    href: '/grants-info',
    description: 'Fund projects with accountability',
    icon: Gift,
  },
  {
    name: 'Governance',
    href: '/governance-info',
    description: 'Make treasury decisions as a group',
    icon: Vote,
  },
  {
    name: 'Use Cases',
    href: '/use-cases',
    description: 'Real-world FlowGuard scenarios',
    icon: Lightbulb,
  },
  {
    name: 'How it works',
    href: '/how-it-works',
    description: 'From smart contract to wallet',
    icon: Sparkles,
  },
  {
    name: 'Demo',
    href: '/demo',
    description: 'See FlowGuard in action',
    icon: PlayCircle,
  },
];

export function SolutionsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="flex items-center gap-1 text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors py-2"
      >
        Solutions
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-0 w-80 bg-surface border border-border rounded-2xl shadow-2xl py-4 z-50">
          {solutions.map((solution) => {
            const Icon = solution.icon;
            return (
              <Link
                key={solution.name}
                to={solution.href}
                onClick={() => setIsOpen(false)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-surfaceAlt transition-colors group"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-textPrimary group-hover:text-primary transition-colors">
                    {solution.name}
                  </h3>
                  <p className="text-xs text-textMuted mt-0.5">
                    {solution.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
