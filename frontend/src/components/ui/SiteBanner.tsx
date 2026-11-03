import { ArrowUpRight, Icon } from './Icon';
import { cx } from './cx';
import { ACTIONS, MOMENTS } from '../../copy/common';
import { NETWORK_COPY } from '../../copy/network';
import { APP_SITE_URL } from '../../utils/publicUrls';

export type SiteBannerProps = { kind: 'test-network' | 'sample-data' };

const KIND = {
  'test-network': { look: 'bg-warning-tint text-warning-ink', line: MOMENTS.testNetwork },
  'sample-data': { look: 'bg-info-tint text-info-ink', line: NETWORK_COPY.sampleDataBanner },
} as const;

export function SiteBanner({ kind }: SiteBannerProps) {
  const { look, line } = KIND[kind];

  return (
    <div className={cx('flex min-h-control-md w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-center text-small', look)}>
      <p>{line}</p>
      {kind === 'test-network' ? (
        <a
          href={APP_SITE_URL}
          data-inline
          className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
        >
          {ACTIONS.goToMainApp}
          <Icon icon={ArrowUpRight} size={16} />
        </a>
      ) : null}
    </div>
  );
}
