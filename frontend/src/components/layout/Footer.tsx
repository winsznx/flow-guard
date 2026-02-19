import { Link } from 'react-router-dom';
import { Twitter, Mail, Send } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-brand700 border-t border-brand300/20 pt-12 md:pt-16 pb-6 md:pb-8">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-12 lg:gap-8 mb-16">
          {/* Brand Block */}
          <div className="lg:col-span-2 space-y-6">
            <Link
              to="/"
              className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 focus-visible:ring-offset-2 focus-visible:ring-offset-brand700 rounded-sm"
            >
              <img
                src="/assets/flow-green.png"
                alt="FlowGuard"
                className="h-8 object-contain"
              />
            </Link>
            <p className="text-brand100 text-lg leading-relaxed max-w-sm">
              Infrastructure for permissionless treasury automation, built on BCH.
            </p>
            <div className="flex flex-col gap-1">
              <p className="text-sm text-brand100/70">
                You control the funds.
              </p>
              <p className="text-sm text-brand100/70">
                Rules locked into the blockchain.
              </p>
            </div>
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-brand300/20 border border-brand300/30">
              <span className="w-1.5 h-1.5 rounded-full bg-brand300 mr-2 animate-pulse"></span>
              <span className="text-xs font-mono font-medium text-brand100 uppercase tracking-wider">
                Chipnet Alpha
              </span>
            </div>
          </div>

          {/* Navigation Groups */}
          <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-5 gap-8">
            {/* Solutions */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-brand50 uppercase tracking-wider">Solutions</h4>
              <ul className="space-y-3">
                <li>
                  <Link to="/vesting" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Vesting
                  </Link>
                </li>
                <li>
                  <Link to="/payroll" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Payroll
                  </Link>
                </li>
                <li>
                  <Link to="/budgeting" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Budgeting
                  </Link>
                </li>
                <li>
                  <Link to="/grants" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Grants
                  </Link>
                </li>
                <li>
                  <Link to="/governance-info" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Governance
                  </Link>
                </li>
              </ul>
            </div>

            {/* Product */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-brand50 uppercase tracking-wider">Product</h4>
              <ul className="space-y-3">
                <li>
                  <Link to="/vaults" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Launch App
                  </Link>
                </li>
                <li>
                  <Link to="/docs" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link to="/explorer" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Explorer
                  </Link>
                </li>
                <li>
                  <Link to="/updates" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Updates
                  </Link>
                </li>
                <li>
                  <Link to="/indexer" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Indexer
                  </Link>
                </li>
              </ul>
            </div>

            {/* Developers */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-brand50 uppercase tracking-wider">Developers</h4>
              <ul className="space-y-3">
                <li>
                  <Link to="/sdk" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    SDK
                  </Link>
                </li>
                <li>
                  <Link to="/api" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    API Reference
                  </Link>
                </li>
                <li>
                  <a href="https://github.com/winsznx/flow-guard" target="_blank" rel="noopener noreferrer" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    GitHub
                  </a>
                </li>
                <li>
                  <Link to="/security" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Security
                  </Link>
                </li>
              </ul>
            </div>

            {/* System */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-brand50 uppercase tracking-wider">System</h4>
              <ul className="space-y-3">
                <li>
                  <Link to="/status" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Status
                  </Link>
                </li>
                <li>
                  <Link to="/changelog" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Changelog
                  </Link>
                </li>
                <li>
                  <Link to="/roadmap" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Roadmap
                  </Link>
                </li>
                <li>
                  <Link to="/audits" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Audit Reports
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-brand50 uppercase tracking-wider">Legal</h4>
              <ul className="space-y-3">
                <li>
                  <Link to="/terms" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link to="/disclaimer" className="text-brand100 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm">
                    Disclaimer
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-brand300/20 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-brand100/60">
            &copy; {currentYear} FlowGuard Labs. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a
              href="https://x.com/flowguard_"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              className="text-brand100 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm p-1"
            >
              <Twitter className="w-5 h-5" />
            </a>
            <a
              href="https://warpcast.com/flowguard"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Farcaster"
              className="text-brand100 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm p-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 1000 1000" fill="currentColor">
                <path d="M257.778 155.556H742.222V844.445H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.445H257.778V155.556Z" />
                <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.445H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
                <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.445H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
              </svg>
            </a>
            <a
              href="https://t.me/flowguard_cash"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              className="text-brand100 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm p-1"
            >
              <Send className="w-5 h-5" />
            </a>
            <a
              href="https://www.linkedin.com/company/flowguard-labs/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="text-brand100 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand300 rounded-sm p-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
