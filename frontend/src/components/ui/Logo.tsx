import React, { useId } from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  variant?: 'default' | 'compact';
  className?: string;
  showTagline?: boolean;
}

// FlowGuard Logo Component
// Hexagon + Arrow Loop design: Tech structure meets continuous flow
// Brand colors: Black inside, Light Green/Lemon outside
export const Logo: React.FC<LogoProps> = ({ 
  variant = 'default', 
  className = '',
  showTagline = false 
}) => {
  const isCompact = variant === 'compact';
  const gradientId = useId();

  return (
    <Link to="/" className={`inline-flex items-center gap-2 ${className}`}>
      {/* Icon: Hexagon with flowing arrow loop */}
      <svg
        width={isCompact ? 32 : 40}
        height={isCompact ? 32 : 40}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Hexagon outer frame - light green/lemon gradient */}
        <path
          d="M20 4L8 10L8 18L20 36L32 18L32 10L20 4Z"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          fill="none"
        />
        
        {/* Flowing arrow loop inside hexagon - black */}
        <path
          d="M20 14 C 16.5 14, 14 16.5, 14 20 C 14 23.5, 16.5 26, 20 26 C 23.5 26, 26 23.5, 26 20 C 26 16.5, 23.5 14, 20 14"
          stroke="#000000"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Arrow head pointing in flow direction - black */}
        <path
          d="M23 17 L 20 20 L 17 17"
          stroke="#000000"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Gradient definitions */}
        <defs>
          {/* Light green/lemon gradient for hexagon */}
          <linearGradient id={gradientId} x1="8" y1="4" x2="32" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="50%" stopColor="#d1fae5" />
            <stop offset="100%" stopColor="#fef3c7" />
          </linearGradient>
        </defs>
      </svg>

      {/* Typography: Flow{Treasury} */}
      <div className="flex flex-col">
        <span className={`font-bold text-gray-900 leading-tight ${isCompact ? 'text-xl' : 'text-2xl'}`}>
          Flow
          <span className="text-gray-600 font-normal">{'{Treasury}'}</span>
        </span>
        {showTagline && (
          <span className="text-xs text-gray-500 mt-0.5">On-chain treasury management</span>
        )}
      </div>
    </Link>
  );
};

// Alternative logo variants
export const LogoIcon: React.FC<{ size?: number; className?: string }> = ({ 
  size = 40, 
  className = '' 
}) => {
  const gradientId = useId();
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Hexagon outer frame - light green/lemon gradient */}
      <path
        d="M20 4L8 10L8 18L20 36L32 18L32 10L20 4Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.5"
        fill="none"
      />
      
      {/* Flowing arrow loop inside hexagon - black */}
      <path
        d="M20 14 C 16.5 14, 14 16.5, 14 20 C 14 23.5, 16.5 26, 20 26 C 23.5 26, 26 23.5, 26 20 C 26 16.5, 23.5 14, 20 14"
        stroke="#000000"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Arrow head pointing in flow direction - black */}
      <path
        d="M23 17 L 20 20 L 17 17"
        stroke="#000000"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      <defs>
        {/* Light green/lemon gradient for hexagon */}
        <linearGradient id={gradientId} x1="8" y1="4" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="50%" stopColor="#d1fae5" />
          <stop offset="100%" stopColor="#fef3c7" />
        </linearGradient>
      </defs>
    </svg>
  );
};

// Text-only logo variant
export const LogoText: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <Link to="/" className={`font-bold text-gray-900 ${className}`}>
      Flow
      <span className="text-gray-600 font-normal">{'{Treasury}'}</span>
    </Link>
  );
};
