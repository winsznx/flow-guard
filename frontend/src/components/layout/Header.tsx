import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* Logo and nav grouped together on the left */}
          <div className="flex items-center gap-8">
            <Logo variant="default" />
            
            <nav className="hidden md:flex space-x-8">
              <Link to="/vaults" className="text-gray-600 hover:text-gray-900">
                Vaults
              </Link>
              <Link to="/proposals" className="text-gray-600 hover:text-gray-900">
                Proposals
              </Link>
            </nav>
          </div>
          
          {/* Docs and Launch App button pushed to the right */}
          <div className="flex items-center gap-6 ml-auto">
            <Link to="/docs" className="hidden md:block text-gray-600 hover:text-gray-900">
              Docs
            </Link>
            <Link to="/vaults">
              <Button variant="primary" size="sm">
                Launch App →
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};

