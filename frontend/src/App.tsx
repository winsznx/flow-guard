import { Routes, Route } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import Home from './pages/Home';
import VaultsPage from './pages/VaultsPage';
import CreateVaultPage from './pages/CreateVaultPage';
import VaultDetailPage from './pages/VaultDetailPage';
import CreateProposalPage from './pages/CreateProposalPage';
import ProposalsPage from './pages/ProposalsPage';
import DocsPage from './pages/DocsPage';

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/vaults" element={<VaultsPage />} />
          <Route path="/vaults/create" element={<CreateVaultPage />} />
          <Route path="/vaults/:id" element={<VaultDetailPage />} />
          <Route path="/vaults/:id/proposals/create" element={<CreateProposalPage />} />
          <Route path="/proposals" element={<ProposalsPage />} />
          <Route path="/docs" element={<DocsPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;

