import { ButtonLink } from './ButtonLink';
import { ArrowLeft } from './Icon';

export type BackLinkProps = { to: string; label: string };

export function BackLink({ to, label }: BackLinkProps) {
  return (
    <ButtonLink to={to} variant="ghost" size="sm" leadingIcon={ArrowLeft}>
      {label}
    </ButtonLink>
  );
}
