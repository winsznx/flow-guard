import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  loading?: boolean;
}

/**
 * Button component following FlowGuard Sage palette design system
 *
 * DESIGN RULES:
 * - Uses ONLY Sage palette colors (#F1F3E0, #D2DCB6, #A1BC98, #778873)
 * - All colors via Tailwind classes from globals.css tokens
 * - NO hardcoded hex values
 *
 * Variants:
 * - primary: Sage dark (brand700 #778873) bg, hover lighter
 * - secondary: Sage light (brand100 #D2DCB6) bg
 * - outline: Transparent with Sage border
 * - ghost: Transparent with hover Sage soft bg
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', children, className = '', disabled, loading, ...props }, ref) => {
    const baseStyles =
      'font-semibold rounded-md transition-all duration-200 ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-focusRing focus-visible:ring-offset-2 ' +
      'inline-flex items-center justify-center font-mono ' +
      'disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary:
        'bg-primary text-white hover:bg-primaryHover ' +
        'hover:shadow-md hover:-translate-y-0.5 active:translate-y-0',
      secondary:
        'bg-primarySoft text-textPrimary hover:bg-brand-300 ' +
        'hover:shadow-md hover:-translate-y-0.5 active:translate-y-0',
      outline:
        'border-2 border-border text-textPrimary bg-white ' +
        'hover:bg-surfaceAlt hover:border-borderHover ' +
        'hover:shadow-sm active:bg-primarySoft',
      ghost:
        'bg-transparent text-textSecondary hover:text-textPrimary ' +
        'hover:bg-surfaceAlt active:bg-primarySoft',
    };

    const sizes = {
      sm: 'px-3 py-2.5 text-sm min-h-[40px] md:min-h-[36px] md:py-2',
      md: 'px-4 py-3 text-sm md:text-base min-h-[44px] md:py-2.5 md:min-h-[40px]',
      lg: 'px-5 py-3.5 text-base md:px-6 md:text-lg md:py-3 min-h-[48px]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
