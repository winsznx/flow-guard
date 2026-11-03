import { useLocation } from 'react-router-dom';
import { Logo } from '../components/layout/Logo';
import { PageContainer } from '../components/layout/PageContainer';
import { PageMeta } from '../components/seo/PageMeta';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Heading } from '../components/ui/Heading';
import { Check, Icon } from '../components/ui/Icon';
import { NetworkCapsule } from '../components/ui/NetworkCapsule';
import { Panel } from '../components/ui/Panel';
import { ACTIONS, MOMENTS } from '../copy/common';
import { CONNECT_SCREEN } from '../copy/home';
import { CONNECT_TITLE } from '../copy/nav';
import { BUILD_NETWORK } from '../copy/network';
import { useWalletModal } from '../hooks/useWalletModal';
import { MAIN_SITE_URL } from '../utils/publicUrls';

const HELP_PATH = '/help';
const EXPLORER_PATH = '/explorer';

export function SplitLoginScreen() {
  const { pathname } = useLocation();
  const openWalletModal = useWalletModal((state) => state.openModal);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <PageMeta title={CONNECT_TITLE} description={CONNECT_SCREEN.metaDescription} path={pathname} />
      <header className="border-b border-line">
        <div className="mx-auto flex h-header w-full max-w-page items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href={MAIN_SITE_URL} aria-label={CONNECT_SCREEN.logoLink} className="inline-flex min-h-touch items-center">
            <Logo />
          </a>
          <NetworkCapsule network={BUILD_NETWORK} />
        </div>
      </header>

      <main className="flex-1">
        <PageContainer width="narrow">
          <div className="flex flex-col gap-6 sm:pt-8">
            <Panel>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <Heading level="page" as="h1">
                    {CONNECT_TITLE}
                  </Heading>
                  <p className="text-body text-ink-secondary">{CONNECT_SCREEN.explainer}</p>
                </div>

                <Button variant="primary" size="lg" fullWidth data-wallet-trigger onClick={openWalletModal}>
                  {ACTIONS.connectWallet}
                </Button>

                <div className="flex flex-col gap-2 text-small text-ink-secondary">
                  <p>
                    {MOMENTS.newToBch}{' '}
                    <ButtonLink variant="link" to={HELP_PATH}>
                      {ACTIONS.getWallet}
                    </ButtonLink>
                  </p>
                  <p>
                    {CONNECT_SCREEN.lookAroundLead}{' '}
                    <ButtonLink variant="link" to={EXPLORER_PATH}>
                      {CONNECT_SCREEN.lookAround}
                    </ButtonLink>
                  </p>
                </div>

                <p className="border-t border-line pt-4 text-small text-ink-muted">{CONNECT_SCREEN.workspaceLine}</p>
              </div>
            </Panel>

            <section aria-label={CONNECT_SCREEN.factsLabel} className="flex flex-col gap-3 px-1">
              <ul className="flex flex-col gap-2">
                {CONNECT_SCREEN.facts.map((fact) => (
                  <li key={fact} className="flex items-start gap-2 text-small text-ink-secondary">
                    <span className="mt-0.5 shrink-0 text-ink-muted">
                      <Icon icon={Check} size={16} />
                    </span>
                    {fact}
                  </li>
                ))}
              </ul>
              <p className="text-small text-ink-muted">{CONNECT_SCREEN.networkFact}</p>
            </section>
          </div>
        </PageContainer>
      </main>
    </div>
  );
}
