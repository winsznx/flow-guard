import { useState } from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { SIDEBAR_OPEN_KEY, useSidebar } from '../components/layout/useSidebar';
import { Address } from '../components/ui/Address';
import { Amount } from '../components/ui/Amount';
import { Button } from '../components/ui/Button';
import { Code } from '../components/ui/Code';
import { CopyButton } from '../components/ui/CopyButton';
import { DetailList } from '../components/ui/DetailList';
import { LogOut } from '../components/ui/Icon';
import { NetworkCapsule } from '../components/ui/NetworkCapsule';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { Switch } from '../components/ui/Switch';
import { BUSY, LABELS, MOMENTS } from '../copy/common';
import { BUILD_NETWORK, NETWORK_HINT, NETWORK_LABEL } from '../copy/network';
import { SETTINGS } from '../copy/settings';
import { getWalletDisplayName } from '../connectors';
import { useWallet } from '../hooks/useWallet';
import type { WalletType } from '../types/wallet';

const BCH = { kind: 'bch' } as const;

type WalletNetwork = 'mainnet' | 'testnet' | 'chipnet';

function walletNetworkLabel(network: WalletNetwork): string {
  return network === 'mainnet' ? NETWORK_LABEL.mainnet : NETWORK_LABEL.chipnet;
}

function walletName(type: WalletType | null): string {
  return type ? getWalletDisplayName(type) : SETTINGS.unknownWallet;
}

/** The sidebar store keeps working when storage is blocked, so this checks whether the choice was saved. */
function choiceWasSaved(open: boolean): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_OPEN_KEY) === JSON.stringify(open);
  } catch {
    return false;
  }
}

function WalletPanel() {
  const wallet = useWallet();
  const [disconnecting, setDisconnecting] = useState(false);
  const [failed, setFailed] = useState(false);

  const disconnect = async () => {
    setDisconnecting(true);
    setFailed(false);
    try {
      await wallet.disconnect();
    } catch (error) {
      console.error('[SettingsPage] Disconnect failed:', error);
      setFailed(true);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Panel title={SETTINGS.walletTitle} description={SETTINGS.walletDescription}>
      <DetailList
        items={[
          { label: SETTINGS.address, value: wallet.address ? <Address value={wallet.address} /> : LABELS.notSet },
          { label: SETTINGS.connectedWith, value: walletName(wallet.walletType) },
          {
            label: SETTINGS.publicKey,
            value: wallet.publicKey ? (
              <span className="flex flex-col gap-1">
                <span className="flex items-start gap-2">
                  <Code>{wallet.publicKey}</Code>
                  <CopyButton value={wallet.publicKey} label={SETTINGS.copyPublicKey} />
                </span>
                <span className="text-small text-ink-muted">{SETTINGS.publicKeyLine}</span>
              </span>
            ) : (
              SETTINGS.noPublicKey
            ),
          },
          {
            label: SETTINGS.balance,
            value: wallet.balance ? <Amount value={wallet.balance.bch} asset={BCH} /> : LABELS.balanceUnavailable,
          },
        ]}
      />
      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-small text-ink-secondary">{SETTINGS.disconnectLine}</p>
        <div className="shrink-0">
          <Button
            variant="secondary"
            leadingIcon={LogOut}
            busy={disconnecting}
            busyLabel={BUSY.disconnecting}
            onClick={() => void disconnect()}
          >
            {SETTINGS.disconnectWallet}
          </Button>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-small text-danger-ink">
          {MOMENTS.disconnectFailed}
        </p>
      ) : null}
    </Panel>
  );
}

function NetworkPanel() {
  const wallet = useWallet();
  const walletNetwork = wallet.network === 'mainnet' ? 'mainnet' : 'chipnet';
  const mismatch = wallet.isConnected && walletNetwork !== BUILD_NETWORK;

  return (
    <Panel title={SETTINGS.networkTitle} action={<NetworkCapsule network={BUILD_NETWORK} />}>
      <p className="text-body text-ink-secondary">{SETTINGS.networkLine}</p>
      <p className="text-small text-ink-muted">{NETWORK_HINT[BUILD_NETWORK]}</p>
      {mismatch ? (
        <Notice tone="warning" title={SETTINGS.mismatchTitle}>
          {SETTINGS.mismatch(walletNetworkLabel(wallet.network), NETWORK_LABEL[BUILD_NETWORK])}
        </Notice>
      ) : null}
    </Panel>
  );
}

function DisplayPanel() {
  const open = useSidebar((state) => state.open);
  const setOpen = useSidebar((state) => state.setOpen);
  const [saveFailed, setSaveFailed] = useState(false);

  const change = (collapse: boolean) => {
    setOpen(!collapse);
    setSaveFailed(!choiceWasSaved(!collapse));
  };

  return (
    <Panel title={SETTINGS.displayTitle} description={SETTINGS.displayDescription}>
      <Switch
        label={SETTINGS.collapseSidebar}
        description={SETTINGS.collapseSidebarLine}
        checked={!open}
        onChange={change}
      />
      {saveFailed ? (
        <p role="alert" className="text-small text-danger-ink">
          {SETTINGS.saveFailed}
        </p>
      ) : null}
      <p className="border-t border-line pt-4 text-small text-ink-muted">
        <span className="text-label text-ink-secondary">{SETTINGS.notificationsTitle}. </span>
        {SETTINGS.notificationsLine}
      </p>
    </Panel>
  );
}

export default function SettingsPage() {
  return (
    <PageContainer width="reading">
      <PageHeader title={SETTINGS.title} description={SETTINGS.description} />
      <Stack>
        <WalletPanel />
        <NetworkPanel />
        <DisplayPanel />
      </Stack>
    </PageContainer>
  );
}
