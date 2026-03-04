import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { WalletModal } from './components/ui/WalletModal';
import { TransactionNoticeToast } from './components/ui/TransactionNoticeToast';
import { useWallet } from './hooks/useWallet';
import { useWalletModal } from './hooks/useWalletModal';
import Home from './pages/Home';
import VaultsPage from './pages/VaultsPage';
import CreateVaultPage from './pages/CreateVaultPage';
import VaultDetailPage from './pages/VaultDetailPage';
import CreateProposalPage from './pages/CreateProposalPage';
import ProposalsPage from './pages/ProposalsPage';
import RequestDetailPage from './pages/RequestDetailPage';
import BudgetPlansPage from './pages/BudgetPlansPage';
import CreateBudgetPlanPage from './pages/CreateBudgetPlanPage';
import GovernancePage from './pages/GovernancePage';

import StreamsPage from './pages/StreamsPage';
import StreamDetailPage from './pages/StreamDetailPage';
import CreateStreamPage from './pages/CreateStreamPage';
import BatchCreateStreamsPage from './pages/BatchCreateStreamsPage';
import StreamBatchHistoryPage from './pages/StreamBatchHistoryPage';
import StreamShapeGalleryPage from './pages/StreamShapeGalleryPage';
import StreamActivityPage from './pages/StreamActivityPage';
import PaymentsPage from './pages/PaymentsPage';
import CreatePaymentPage from './pages/CreatePaymentPage';
import PaymentDetailPage from './pages/PaymentDetailPage';
import AirdropsPage from './pages/AirdropsPage';
import CreateAirdropPage from './pages/CreateAirdropPage';
import AirdropDetailPage from './pages/AirdropDetailPage';
import ClaimLinkPage from './pages/ClaimLinkPage';
import ExplorerPage from './pages/ExplorerPage';
import IndexerStatusPage from './pages/IndexerStatusPage';
import VestingPage from './pages/solutions/VestingPage';
import PayrollPage from './pages/solutions/PayrollPage';
import BudgetingPage from './pages/solutions/BudgetingPage';
import GrantsPage from './pages/solutions/GrantsPage';
import GovernanceInfoPage from './pages/solutions/GovernanceInfoPage';

import UpdatesPage from './pages/UpdatesPage';
import UpdateDetailPage from './pages/UpdateDetailPage';
import ChangelogPage from './pages/ChangelogPage';
import RoadmapPage from './pages/RoadmapPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import DisclaimerPage from './pages/DisclaimerPage';
import { AppShellPage } from './pages/AppShellPage';
import { DaoOverviewPage } from './pages/dao/DaoOverviewPage';
import { DaoTeamPage } from './pages/dao/DaoTeamPage';
import { DaoRolesPage } from './pages/dao/DaoRolesPage';
import { DaoTreasuryPolicyPage } from './pages/dao/DaoTreasuryPolicyPage';
import { DaoStreamsPage } from './pages/dao/DaoStreamsPage';
import { SplitLoginScreen } from './pages/SplitLoginScreen';

function App() {
  const wallet = useWallet();
  const { isOpen, closeModal } = useWalletModal();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to /app when wallet connects, if currently on public landing pages
  useEffect(() => {
    if (wallet.isConnected && !wallet.isConnecting) {
      const isPublicLandingPage =
        location.pathname === '/' ||
        location.pathname === '/vesting' ||
        location.pathname === '/payroll' ||
        location.pathname === '/budgeting' ||
        location.pathname === '/grants' ||
        location.pathname === '/governance-info';

      if (isPublicLandingPage) {
        navigate('/app');
      }
    }
  }, [wallet.isConnected, wallet.isConnecting, location.pathname, navigate]);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="bg-background min-h-screen flex flex-col">
      {/* Header removed from App.tsx - Dashboard has internal Nav, Landing has its own Header */}
      <main className="flex-grow">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />

          {/* New App Shell Route with Conditional Disconnected Login Screen */}
          <Route
            path="/app"
            element={
              wallet.isConnected ? (
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
          <Route path="/explorer" element={<ExplorerPage />} />

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
