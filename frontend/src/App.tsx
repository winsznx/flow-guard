import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { WalletModal } from './components/ui/WalletModal';
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
import DocsPage from './pages/DocsPage';
import StreamsPage from './pages/StreamsPage';
import StreamDetailPage from './pages/StreamDetailPage';
import CreateStreamPage from './pages/CreateStreamPage';
import BatchCreateStreamsPage from './pages/BatchCreateStreamsPage';
import PaymentsPage from './pages/PaymentsPage';
import CreatePaymentPage from './pages/CreatePaymentPage';
import PaymentDetailPage from './pages/PaymentDetailPage';
import AirdropsPage from './pages/AirdropsPage';
import CreateAirdropPage from './pages/CreateAirdropPage';
import AirdropDetailPage from './pages/AirdropDetailPage';
import ExplorerPage from './pages/ExplorerPage';
import IndexerStatusPage from './pages/IndexerStatusPage';
import VestingPage from './pages/solutions/VestingPage';
import PayrollPage from './pages/solutions/PayrollPage';
import BudgetingPage from './pages/solutions/BudgetingPage';
import GrantsPage from './pages/solutions/GrantsPage';
import GovernanceInfoPage from './pages/solutions/GovernanceInfoPage';
import SecurityPage from './pages/SecurityPage';
import UpdatesPage from './pages/UpdatesPage';
import UpdateDetailPage from './pages/UpdateDetailPage';
import ChangelogPage from './pages/ChangelogPage';
import RoadmapPage from './pages/RoadmapPage';

function App() {
  const wallet = useWallet();
  const { isOpen, closeModal } = useWalletModal();
  const navigate = useNavigate();
  const location = useLocation();
  /* Redirect logic removed to allow users to view landing page even when connected */

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

          {/* Solution landing pages (public) */}
          <Route path="/vesting" element={<VestingPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/budgeting" element={<BudgetingPage />} />
          <Route path="/grants" element={<GrantsPage />} />
          <Route path="/governance-info" element={<GovernanceInfoPage />} />

          {/* Security page (public) */}
          <Route path="/security" element={<SecurityPage />} />

          {/* Updates/Blog (public) */}
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/updates/:slug" element={<UpdateDetailPage />} />

          {/* Changelog (public) */}
          <Route path="/changelog" element={<ChangelogPage />} />

          {/* Roadmap (public) */}
          <Route path="/roadmap" element={<RoadmapPage />} />

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
          <Route
            path="/explorer"
            element={
              <ExplorerPage />
            }
          />

          {/* Public Status Page (standalone) */}
          <Route
            path="/status"
            element={<IndexerStatusPage />}
          />

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

          {/* Docs page with dashboard layout */}
          <Route
            path="/docs"
            element={
              <DashboardLayout>
                <DocsPage />
              </DashboardLayout>
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
    </div >
  );
}

export default App;

