import type { SVGProps } from 'react';

/**
 * X (formerly Twitter) social-mark SVG. Post-2023 rebrand glyph.
 * Use anywhere a lucide-react icon would go; same props (className, etc.).
 */
export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 1200 1227"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.795 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" />
    </svg>
  );
}
