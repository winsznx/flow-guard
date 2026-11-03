import { Button } from './Button';
import { ButtonLink } from './ButtonLink';
import { Heading } from './Heading';
import { Panel } from './Panel';
import { ACTIONS, MOMENTS } from '../../copy/common';
import { CONNECT_TITLE } from '../../copy/nav';
import { useWalletModal } from '../../hooks/useWalletModal';

export type ConnectGateProps = { purpose: string };

const HELP_PATH = '/help';

export function ConnectGate({ purpose }: ConnectGateProps) {
  const openWalletModal = useWalletModal((state) => state.openModal);

  return (
    <Panel className="mx-auto w-full max-w-narrow">
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <Heading level="page" as="h1">
          {CONNECT_TITLE}
        </Heading>
        <p className="text-body text-ink-secondary">{purpose}</p>
        <Button variant="primary" size="lg" data-wallet-trigger onClick={openWalletModal}>
          {ACTIONS.connectWallet}
        </Button>
        <p className="text-small text-ink-secondary">
          {MOMENTS.newToBch}{' '}
          <ButtonLink variant="link" to={HELP_PATH}>
            {ACTIONS.getWallet}
          </ButtonLink>
        </p>
      </div>
    </Panel>
  );
}
