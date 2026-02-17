import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

/**
 * Select component following FlowGuard Sage palette design system
 *
 * DESIGN RULES:
 * - Uses ONLY Sage palette colors via Tailwind tokens
 * - Border: border (brand300 #A1BC98), error state uses primary (brand700 #778873)
 * - Text: textPrimary, error text uses primary for consistency
 * - NO border-gray-300, border-red-500, or text-red-600
 */
export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className = '',
  ...props
}) => {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-textPrimary mb-2">
          {label}
        </label>
      )}
      <select
        className={`w-full px-4 py-2 rounded-md transition-colors
          ${error ? 'border-2 border-primary' : 'border border-border'}
          bg-surface text-textPrimary
          focus:ring-2 focus:ring-focusRing focus:border-primary
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-primary font-medium">{error}</p>
      )}
    </div>
  );
};
