import React from 'react';
import { AssetIcon } from './AssetIcon';
import { Button } from './Button';
import { FIELD_CONTROL, FIELD_HEIGHT, Field, type FieldBase } from './Field';
import { cx } from './cx';
import type { Asset } from './types';
import { LABELS } from '../../copy/common';
import { assetDecimals, assetUnit, formatAmount } from '../../copy/format';

export type AmountInputProps = FieldBase & {
  label: string;
  asset: Asset;
  value: string;
  onChange: (v: string) => void;
  /** 'base' applies to tokens only. BCH is always typed in BCH. */
  unit?: 'display' | 'base';
  balance?: string | null;
  onUseMax?: () => void;
  helper?: string;
  error?: string;
  id?: string;
  className?: string;
};

const BASE_UNIT_SUFFIX = 'smallest units';
const BASE_UNIT_HELPER = "Enter the amount in the token's smallest unit. For a token with 2 decimals, 100 means 1.00.";
const USE_MAX = 'Use max';

function suffixPadding(suffix: string, withIcon: boolean): string {
  if (suffix.length <= 4) return withIcon ? 'pr-20' : 'pr-14';
  if (suffix.length <= 8) return withIcon ? 'pr-28' : 'pr-20';
  return 'pr-32';
}

function acceptsInput(next: string, decimals: number, baseUnits: boolean): boolean {
  if (baseUnits || decimals === 0) return /^\d*$/.test(next);
  return new RegExp(`^\\d*(?:\\.\\d{0,${decimals}})?$`).test(next);
}

function balanceLine(balance: string | null | undefined, asset: Asset, baseUnits: boolean): string | null {
  if (balance === undefined) return null;
  if (balance === null) return LABELS.balanceUnavailable;
  const amount = baseUnits ? formatAmount(safeBigInt(balance), asset) : formatAmount(balance, asset);
  return amount ? `You have ${amount}` : LABELS.balanceUnavailable;
}

function safeBigInt(value: string): bigint | null {
  return /^\d+$/.test(value.trim()) ? BigInt(value.trim()) : null;
}

export function AmountInput({
  label,
  asset,
  value,
  onChange,
  unit = 'display',
  balance,
  onUseMax,
  helper,
  error,
  name,
  disabled,
  required,
  onBlur,
  id,
  className,
}: AmountInputProps) {
  const baseUnits = unit === 'base' && asset.kind === 'token';
  const decimals = assetDecimals(asset);
  const suffix = baseUnits ? BASE_UNIT_SUFFIX : assetUnit(asset);
  const have = balanceLine(balance, asset, baseUnits);
  const helperText = helper ?? (baseUnits ? BASE_UNIT_HELPER : undefined);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value.replace(/,/g, '.').trim();
    if (acceptsInput(next, decimals, baseUnits)) onChange(next);
  };

  return (
    <Field label={label} helper={helperText} error={error} id={id} className={className}>
      {({ id: fieldId, describedBy, invalid }) => (
        <>
          <div className="relative">
            <input
              id={fieldId}
              name={name}
              type="text"
              inputMode={baseUnits || decimals === 0 ? 'numeric' : 'decimal'}
              autoComplete="off"
              value={value}
              onChange={handleChange}
              onBlur={onBlur}
              disabled={disabled}
              required={required}
              aria-describedby={[`${fieldId}-unit`, describedBy].filter(Boolean).join(' ')}
              aria-invalid={invalid || undefined}
              className={cx(FIELD_CONTROL, FIELD_HEIGHT.regular, 'text-right', suffixPadding(suffix, !baseUnits))}
            />
            <span
              id={`${fieldId}-unit`}
              className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 text-body text-ink-muted"
            >
              {baseUnits ? null : <AssetIcon asset={asset} size="sm" />}
              {suffix}
            </span>
          </div>
          {have ? (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-small text-ink-secondary">{have}</span>
              {onUseMax && balance && !disabled ? (
                <Button variant="ghost" size="sm" onClick={onUseMax}>
                  {USE_MAX}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Field>
  );
}
