import React from 'react';
import { Link } from 'react-router-dom';

// Footer inspired by Safe.global - dark, spacious, multi-column layout with large wordmark
// Footer fills more than half the screen height
export const Footer: React.FC = () => {
  return (
    <footer className="bg-black text-white relative overflow-hidden min-h-[60vh]">
      {/* Large FLOW wordmark background graphic */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
        <div className="text-[20rem] md:text-[30rem] lg:text-[40rem] font-bold text-white/5 select-none leading-none tracking-tighter">
          FLOW
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 h-full flex flex-col">
        {/* Social Icons and Copyright - Above footer links */}
        <div className="flex items-center justify-between pb-16 pt-24 md:pt-32">
          <div className="flex items-center space-x-6">
            <a
              href="https://twitter.com/flowguard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:opacity-80 transition-opacity"
              aria-label="X (Twitter)"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://github.com/flowguard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:opacity-80 transition-opacity"
              aria-label="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} FlowGuard. All rights reserved.
          </p>
        </div>

        {/* Footer Links - 5 Column Layout */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-12 md:gap-16 lg:gap-20 pb-24 md:pb-32 lg:pb-40 flex-grow">
          {/* Column 1: Product */}
          <div>
            <ul className="space-y-5 md:space-y-6">
              <li>
                <Link to="/vaults" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Vaults
                </Link>
              </li>
              <li>
                <Link to="/proposals" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Proposals
                </Link>
              </li>
              <li>
                <Link to="/docs" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Developer APIs
                </Link>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Integrations
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Users */}
          <div>
            <ul className="space-y-5 md:space-y-6">
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Teams
                </a>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Power Users
                </a>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Deploy new networks
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div>
            <ul className="space-y-5 md:space-y-6">
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  About
                </a>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Careers
                </a>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Imprint
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Support */}
          <div>
            <ul className="space-y-5 md:space-y-6">
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  FAQs
                </a>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Help centre
                </a>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Terms
                </a>
              </li>
              <li>
                <a href="#" className="text-white hover:opacity-80 transition-opacity text-base md:text-lg">
                  Privacy
                </a>
              </li>
            </ul>
          </div>

          {/* Column 5: Social (duplicate for consistency with Safe.global layout) */}
          <div>
            <ul className="space-y-5 md:space-y-6">
              <li>
                <a
                  href="https://twitter.com/flowguard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:opacity-80 transition-opacity text-base md:text-lg"
                >
                  X (Twitter)
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/flowguard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:opacity-80 transition-opacity text-base md:text-lg"
                >
                  Github
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
