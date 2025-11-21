import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

/**
 * Button component following FlowGuard design system
 * Colors: Sage gold (#b2ac88) primary, Forest green (#4b6e48) accent
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', children, className = '', ...props }, ref) => {
    const baseStyles = 'font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 inline-flex items-center justify-center font-body';

    const variants = {
      primary: 'bg-[#b2ac88] text-gray-900 dark:text-gray-900 hover:bg-[#9a9470] hover:shadow-md hover:-translate-y-0.5 focus:ring-[#b2ac88]',
      secondary: 'bg-[#898989] text-white hover:bg-[#6a6a6a] hover:shadow-md hover:-translate-y-0.5 focus:ring-[#898989]',
      accent: 'bg-[#4b6e48] text-white hover:bg-[#3a5537] hover:shadow-md hover:-translate-y-0.5 focus:ring-[#4b6e48]',
      outline: 'border-2 border-[#b2ac88] text-gray-900 dark:text-gray-100 bg-transparent hover:bg-[#b2ac88] hover:text-gray-900 dark:hover:text-gray-900 hover:shadow-md focus:ring-[#b2ac88]',
    };

    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
