import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helpText?: string;
}

/**
 * Textarea component following FlowGuard Sage palette design system
 *
 * DESIGN RULES:
 * - Uses ONLY Sage palette colors via Tailwind tokens
 * - Border: border (brand300 #A1BC98), error state uses primary (brand700 #778873)
 * - Text: textPrimary, error text uses primary for consistency
 * - NO border-gray-300, border-red-500, or text-red-600
 */
export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  helpText,
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
      <textarea
        className={`w-full px-4 py-2 rounded-md transition-colors
          ${error ? 'border-2 border-primary' : 'border border-border'}
          bg-surface text-textPrimary
          focus:ring-2 focus:ring-focusRing focus:border-primary
          placeholder:text-textMuted
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-primary font-medium">{error}</p>
      )}
      {helpText && !error && (
        <p className="mt-1 text-sm text-textMuted">{helpText}</p>
      )}
    </div>
  );
};
