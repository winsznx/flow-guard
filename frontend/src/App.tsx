import { Routes, Route } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
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
import DocsPage from './pages/DocsPage';

function App() {
  const wallet = useWallet();
  const { isOpen, closeModal } = useWalletModal();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />

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
      <Footer />

      {/* Global Wallet Modal - rendered at App level, not in Header */}
      <WalletModal
        isOpen={isOpen}
        onClose={closeModal}
        onSelectWallet={wallet.connect}
        isConnecting={wallet.isConnecting}
        error={wallet.error}
      />
    </div>
  );
}

export default App;

