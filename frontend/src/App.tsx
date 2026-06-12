import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { WalletModal } from './components/ui/WalletModal';
import { TransactionNoticeToast } from './components/ui/TransactionNoticeToast';
import { useWallet } from './hooks/useWallet';
import { useWalletModal } from './hooks/useWalletModal';
// Home stays eager-loaded so first paint on the marketing site is fast.
import Home from './pages/Home';
import { isAppHost, isExplorerHost } from './utils/publicUrls';

// All non-critical routes are lazy-loaded so they don't enter the initial
// JS bundle. Each `lazy()` call below corresponds to a separate chunk that
// downloads only when the route is visited. This cuts roughly half the
// landing-page payload (the solution pages, marketing pages, /updates blog,
// and DAO surfaces are large and rarely needed on first paint).
const VaultsPage = lazy(() => import('./pages/VaultsPage'));
const CreateVaultPage = lazy(() => import('./pages/CreateVaultPage'));
const VaultDetailPage = lazy(() => import('./pages/VaultDetailPage'));
const CreateProposalPage = lazy(() => import('./pages/CreateProposalPage'));
const ProposalsPage = lazy(() => import('./pages/ProposalsPage'));
const RequestDetailPage = lazy(() => import('./pages/RequestDetailPage'));
const BudgetPlansPage = lazy(() => import('./pages/BudgetPlansPage'));
const CreateBudgetPlanPage = lazy(() => import('./pages/CreateBudgetPlanPage'));
const GovernancePage = lazy(() => import('./pages/GovernancePage'));

const StreamsPage = lazy(() => import('./pages/StreamsPage'));
const StreamDetailPage = lazy(() => import('./pages/StreamDetailPage'));
const CreateStreamPage = lazy(() => import('./pages/CreateStreamPage'));
const BatchCreateStreamsPage = lazy(() => import('./pages/BatchCreateStreamsPage'));
const StreamBatchHistoryPage = lazy(() => import('./pages/StreamBatchHistoryPage'));
const StreamShapeGalleryPage = lazy(() => import('./pages/StreamShapeGalleryPage'));
const StreamActivityPage = lazy(() => import('./pages/StreamActivityPage'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const CreatePaymentPage = lazy(() => import('./pages/CreatePaymentPage'));
const PaymentDetailPage = lazy(() => import('./pages/PaymentDetailPage'));
const AirdropsPage = lazy(() => import('./pages/AirdropsPage'));
const CreateAirdropPage = lazy(() => import('./pages/CreateAirdropPage'));
const AirdropDetailPage = lazy(() => import('./pages/AirdropDetailPage'));
const BountiesPage = lazy(() => import('./pages/BountiesPage'));
const CreateBountyPage = lazy(() => import('./pages/CreateBountyPage'));
const BountyDetailPage = lazy(() => import('./pages/BountyDetailPage'));
const RewardsPage = lazy(() => import('./pages/RewardsPage'));
const CreateRewardPage = lazy(() => import('./pages/CreateRewardPage'));
const RewardDetailPage = lazy(() => import('./pages/RewardDetailPage'));
const GrantsPage = lazy(() => import('./pages/GrantsPage'));
const CreateGrantPage = lazy(() => import('./pages/CreateGrantPage'));
const GrantDetailPage = lazy(() => import('./pages/GrantDetailPage'));
const ClaimLinkPage = lazy(() => import('./pages/ClaimLinkPage'));
const ExplorerPage = lazy(() => import('./pages/ExplorerPage'));
const StatusPage = lazy(() => import('./pages/StatusPage'));

const VestingPage = lazy(() => import('./pages/solutions/VestingPage'));
const PayrollPage = lazy(() => import('./pages/solutions/PayrollPage'));
const BudgetingPage = lazy(() => import('./pages/solutions/BudgetingPage'));
const GrantsInfoPage = lazy(() => import('./pages/solutions/GrantsPage'));
const GovernanceInfoPage = lazy(() => import('./pages/solutions/GovernanceInfoPage'));

const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const UpdateDetailPage = lazy(() => import('./pages/UpdateDetailPage'));
const ChangelogPage = lazy(() => import('./pages/ChangelogPage'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const DisclaimerPage = lazy(() => import('./pages/DisclaimerPage'));

// Onboarding / trust / support surfaces (Phase 2 mainnet-readiness pages).
// All public except SettingsPage, which is an authenticated account surface.
const FaqPage = lazy(() => import('./pages/FaqPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const UseCasesPage = lazy(() => import('./pages/UseCasesPage'));
const DemoPage = lazy(() => import('./pages/DemoPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const AppShellPage = lazy(() => import('./pages/AppShellPage').then((m) => ({ default: m.AppShellPage })));
const DaoOverviewPage = lazy(() => import('./pages/dao/DaoOverviewPage').then((m) => ({ default: m.DaoOverviewPage })));
const DaoTeamPage = lazy(() => import('./pages/dao/DaoTeamPage').then((m) => ({ default: m.DaoTeamPage })));
const DaoRolesPage = lazy(() => import('./pages/dao/DaoRolesPage').then((m) => ({ default: m.DaoRolesPage })));
const DaoTreasuryPolicyPage = lazy(() => import('./pages/dao/DaoTreasuryPolicyPage').then((m) => ({ default: m.DaoTreasuryPolicyPage })));
const DaoStreamsPage = lazy(() => import('./pages/dao/DaoStreamsPage').then((m) => ({ default: m.DaoStreamsPage })));
const SplitLoginScreen = lazy(() => import('./pages/SplitLoginScreen').then((m) => ({ default: m.SplitLoginScreen })));

import { RouteFallback } from './components/ui/RouteFallback';

// Pre-warm every lazy route's chunk on browser idle so navigation feels
// instant. The first paint already shipped the main bundle; the network is
// quiet for a moment, perfect time to fetch the rest in the background.
function preloadAllLazyRoutes() {
  const importers = [
    () => import('./pages/VaultsPage'),
    () => import('./pages/CreateVaultPage'),
    () => import('./pages/VaultDetailPage'),
    () => import('./pages/CreateProposalPage'),
    () => import('./pages/ProposalsPage'),
    () => import('./pages/RequestDetailPage'),
    () => import('./pages/BudgetPlansPage'),
    () => import('./pages/CreateBudgetPlanPage'),
    () => import('./pages/GovernancePage'),
    () => import('./pages/StreamsPage'),
    () => import('./pages/StreamDetailPage'),
    () => import('./pages/CreateStreamPage'),
    () => import('./pages/BatchCreateStreamsPage'),
    () => import('./pages/StreamBatchHistoryPage'),
    () => import('./pages/StreamShapeGalleryPage'),
    () => import('./pages/StreamActivityPage'),
    () => import('./pages/PaymentsPage'),
    () => import('./pages/CreatePaymentPage'),
    () => import('./pages/PaymentDetailPage'),
    () => import('./pages/AirdropsPage'),
    () => import('./pages/CreateAirdropPage'),
    () => import('./pages/AirdropDetailPage'),
    () => import('./pages/BountiesPage'),
    () => import('./pages/CreateBountyPage'),
    () => import('./pages/BountyDetailPage'),
    () => import('./pages/RewardsPage'),
    () => import('./pages/CreateRewardPage'),
    () => import('./pages/RewardDetailPage'),
    () => import('./pages/GrantsPage'),
    () => import('./pages/CreateGrantPage'),
    () => import('./pages/GrantDetailPage'),
    () => import('./pages/ExplorerPage'),
    () => import('./pages/StatusPage'),
    () => import('./pages/AppShellPage'),
    () => import('./pages/dao/DaoOverviewPage'),
    () => import('./pages/dao/DaoStreamsPage'),
    () => import('./pages/dao/DaoTeamPage'),
    () => import('./pages/dao/DaoRolesPage'),
    () => import('./pages/dao/DaoTreasuryPolicyPage'),
  ];
  const schedule =
    typeof window !== 'undefined' && 'requestIdleCallback' in window
      ? (cb: () => void) => (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(cb, { timeout: 5000 })
      : (cb: () => void) => setTimeout(cb, 1500);
  schedule(() => {
    // Fire-and-forget; failures are silent because the route still works on demand.
    importers.forEach((imp) => {
      imp().catch(() => {});
    });
  });
}

function App() {
  const wallet = useWallet();
  const { isOpen, closeModal } = useWalletModal();
  const location = useLocation();
  const onAppHost = isAppHost();
  const onExplorerHost = isExplorerHost();

  // Scroll to top on route change
  useEffect(() => {
    const isProductGrants = location.pathname === '/grants' || location.pathname.startsWith('/grants/');
    if (!location.pathname.startsWith('/app') && !location.pathname.startsWith('/streams') && !location.pathname.startsWith('/vaults') && !location.pathname.startsWith('/payments') && !location.pathname.startsWith('/airdrops') && !location.pathname.startsWith('/bounties') && !location.pathname.startsWith('/rewards') && !isProductGrants && !location.pathname.startsWith('/proposals') && !location.pathname.startsWith('/budgets') && !location.pathname.startsWith('/governance') && location.pathname !== '/explorer') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [location.pathname, location.search]);

  // Pre-warm every lazy route chunk on browser idle so navigation is instant.
  useEffect(() => {
    preloadAllLazyRoutes();
  }, []);

  return (
    <div className="bg-background min-h-screen flex flex-col">
      {/* Header removed from App.tsx - Dashboard has internal Nav, Landing has its own Header */}
      <main className="flex-grow">
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public routes */}
          <Route
            path="/"
            element={
              onExplorerHost ? (
                <ExplorerPage />
              ) : onAppHost ? (
                wallet.isConnected ? (
                  <ProtectedRoute>
                    <DashboardLayout>
                      <AppShellPage />
                    </DashboardLayout>
                  </ProtectedRoute>
                ) : (
                  <SplitLoginScreen />
                )
              ) : (
                <Home />
              )
            }
          />

          {/* New App Shell Route with Conditional Disconnected Login Screen */}
          <Route
            path="/app"
            element={
              onAppHost ? (
                <Navigate to="/" replace />
              ) : wallet.isConnected ? (
                <ProtectedRoute>
                  <DashboardLayout>
                    <AppShellPage />
                  </DashboardLayout>
                </ProtectedRoute>
              ) : (
                <SplitLoginScreen />
              )
            }
          />

          {/* DAO Beta Placeholders */}
          <Route
            path="/app/dao"
            element={
              <ProtectedRoute>
                <Navigate to="/app/dao/overview" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/dao/overview"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DaoOverviewPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/dao/streams"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DaoStreamsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/dao/stream-batches"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <StreamBatchHistoryPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/dao/team"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DaoTeamPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/dao/roles"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DaoRolesPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/dao/treasury-policy"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DaoTreasuryPolicyPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/dao/stream-activity"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <StreamActivityPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Solution landing pages (public) */}
          <Route path="/vesting" element={<VestingPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/budgeting" element={<BudgetingPage />} />
          <Route path="/grants-info" element={<GrantsInfoPage />} />
          <Route path="/governance-info" element={<GovernanceInfoPage />} />

          {/* Updates/Blog (public) */}
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/updates/:slug" element={<UpdateDetailPage />} />

          {/* Changelog (public) */}
          <Route path="/changelog" element={<ChangelogPage />} />

          {/* Roadmap (public) */}
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />

          {/* Onboarding / trust / support (all public, lazy-loaded) */}
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/use-cases" element={<UseCasesPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/help" element={<HelpPage />} />

          {/* Authenticated account surface */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SettingsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* NEW: Streams (Recipient View) */}
          <Route
            path="/streams"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <StreamsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/streams/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateStreamPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/streams/activity"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <StreamActivityPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/streams/batches"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <StreamBatchHistoryPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/streams/shapes"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <StreamShapeGalleryPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/streams/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <StreamDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Create Stream from Treasury */}
          <Route
            path="/vaults/:id/create-stream"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateStreamPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Batch Create Streams */}
          <Route
            path="/vaults/:id/batch-create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <BatchCreateStreamsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/streams/batch-create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <BatchCreateStreamsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Payments Product */}
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <PaymentsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreatePaymentPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <PaymentDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Airdrops Product */}
          <Route
            path="/airdrops"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <AirdropsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/airdrops/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateAirdropPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/airdrops/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <AirdropDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Bounties Product */}
          <Route
            path="/bounties"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <BountiesPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/bounties/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateBountyPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/bounties/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <BountyDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Rewards Product */}
          <Route
            path="/rewards"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <RewardsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rewards/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateRewardPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rewards/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <RewardDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Grants Product */}
          <Route
            path="/grants"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <GrantsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/grants/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateGrantPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/grants/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <GrantDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Public Explorer (no auth required) */}
          <Route path="/claim/:token" element={<ClaimLinkPage />} />

          {/* Explorer: public on the explorer subdomain, wrapped in DashboardLayout for authenticated users so the sidebar persists */}
          <Route
            path="/explorer"
            element={
              onExplorerHost ? (
                <Navigate to="/" replace />
              ) : wallet.isConnected ? (
                <DashboardLayout>
                  <ExplorerPage embedded />
                </DashboardLayout>
              ) : (
                <ExplorerPage />
              )
            }
          />

          {/* Public Status Page (standalone) */}
          <Route path="/status" element={<StatusPage />} />

          {/* Protected routes with dashboard layout */}
          <Route
            path="/vaults"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <VaultsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/vaults/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateVaultPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/vaults/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <VaultDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/vaults/:id/proposals/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateProposalPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/proposals"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ProposalsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/proposals/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <RequestDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <BudgetPlansPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CreateBudgetPlanPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/governance"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <GovernancePage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/governance/create"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <GovernancePage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* 404 catch-all - MUST stay last. Renders NotFoundPage with the
              attempted path, a search box, and curated destinations so users
              recover instead of seeing a blank screen. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </main>

      {/* Global Wallet Modal - rendered at App level, not in Header */}
      <WalletModal
        isOpen={isOpen}
        onClose={closeModal}
        onSelectWallet={wallet.connect}
        isConnecting={wallet.isConnecting}
        error={wallet.error}
      />
      <TransactionNoticeToast />
    </div>
  );
}

export default App;
