import { ROLE_LINES } from '../../copy/common';

export type RoleTagProps = { role: 'recipient' | 'sender' | 'signer' | 'viewer' };

export function RoleTag({ role }: RoleTagProps) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-pill bg-neutral-tint px-2.5 text-caption text-neutral-ink">
      {ROLE_LINES[role]}
    </span>
  );
}
