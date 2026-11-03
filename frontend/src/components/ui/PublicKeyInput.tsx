import { CheckedCodeInput, type CodeCheck } from './AddressInput';
import type { FieldBase } from './Field';

export type PublicKeyInputProps = FieldBase & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helper?: string;
  error?: string;
  onValidChange?: (valid: boolean) => void;
  id?: string;
  className?: string;
};

const COMPRESSED_KEY = /^0[23][0-9a-f]{64}$/i;

const COPY = {
  helper: "Ask the signer to copy it from their wallet. It's a long code that starts with 02 or 03.",
  invalid: 'Enter the full public key. It has 66 characters and starts with 02 or 03.',
  valid: 'Valid public key',
  paste: 'Paste public key',
} as const;

function checkPublicKey(raw: string): CodeCheck {
  const value = raw.trim();
  if (!COMPRESSED_KEY.test(value)) return { ok: false, message: COPY.invalid };
  return { ok: true, display: `${value.slice(0, 6)}…${value.slice(-6)}` };
}

export function PublicKeyInput({ helper = COPY.helper, ...rest }: PublicKeyInputProps) {
  return (
    <CheckedCodeInput {...rest} helper={helper} check={checkPublicKey} validLabel={COPY.valid} pasteLabel={COPY.paste} />
  );
}
