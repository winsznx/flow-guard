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
const ClaimLinkPage = lazy(() => import('./pages/ClaimLinkPage'));
const ExplorerPage = lazy(() => import('./pages/ExplorerPage'));
const IndexerStatusPage = lazy(() => import('./pages/IndexerStatusPage'));

const VestingPage = lazy(() => import('./pages/solutions/VestingPage'));
const PayrollPage = lazy(() => import('./pages/solutions/PayrollPage'));
const BudgetingPage = lazy(() => import('./pages/solutions/BudgetingPage'));
const GrantsPage = lazy(() => import('./pages/solutions/GrantsPage'));
const GovernanceInfoPage = lazy(() => import('./pages/solutions/GovernanceInfoPage'));

const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const UpdateDetailPage = lazy(() => import('./pages/UpdateDetailPage'));
const ChangelogPage = lazy(() => import('./pages/ChangelogPage'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const DisclaimerPage = lazy(() => import('./pages/DisclaimerPage'));

const AppShellPage = lazy(() => import('./pages/AppShellPage').then((m) => ({ default: m.AppShellPage })));
const DaoOverviewPage = lazy(() => import('./pages/dao/DaoOverviewPage').then((m) => ({ default: m.DaoOverviewPage })));
const DaoTeamPage = lazy(() => import('./pages/dao/DaoTeamPage').then((m) => ({ default: m.DaoTeamPage })));
const DaoRolesPage = lazy(() => import('./pages/dao/DaoRolesPage').then((m) => ({ default: m.DaoRolesPage })));
const DaoTreasuryPolicyPage = lazy(() => import('./pages/dao/DaoTreasuryPolicyPage').then((m) => ({ default: m.DaoTreasuryPolicyPage })));
const DaoStreamsPage = lazy(() => import('./pages/dao/DaoStreamsPage').then((m) => ({ default: m.DaoStreamsPage })));
const SplitLoginScreen = lazy(() => import('./pages/SplitLoginScreen').then((m) => ({ default: m.SplitLoginScreen })));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-textMuted text-sm">
      Loading…
    </div>
  );
}

function App() {
  const wallet = useWallet();
  const { isOpen, closeModal } = useWalletModal();
  const location = useLocation();
  const onAppHost = isAppHost();
  const onExplorerHost = isExplorerHost();

  // Scroll to top on route change
  useEffect(() => {
    if (!location.pathname.startsWith('/app') && !location.pathname.startsWith('/streams') && !location.pathname.startsWith('/vaults') && !location.pathname.startsWith('/payments') && !location.pathname.startsWith('/airdrops') && !location.pathname.startsWith('/proposals') && !location.pathname.startsWith('/budgets') && !location.pathname.startsWith('/governance') && location.pathname !== '/explorer') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [location.pathname, location.search]);

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
          <Route path="/grants" element={<GrantsPage />} />
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

          {/* Public Explorer (no auth required) */}
          <Route path="/claim/:token" element={<ClaimLinkPage />} />

          {/* Public Explorer (no auth required) */}
          <Route path="/explorer" element={onExplorerHost ? <Navigate to="/" replace /> : <ExplorerPage />} />

          {/* Public Status Page (standalone) */}
          <Route path="/status" element={<IndexerStatusPage />} />

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
