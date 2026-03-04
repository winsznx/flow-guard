import React from 'react';
import { useWalletModal } from '../hooks/useWalletModal';
import { useAppMode } from '../hooks/useAppMode';
import { ShieldCheck, UserCircle, ArrowRight, Zap, Target, Lock } from 'lucide-react';
import { PageMeta } from '../components/seo/PageMeta';
import { MAIN_SITE_URL } from '../utils/publicUrls';

export const SplitLoginScreen: React.FC = () => {
    const { openModal } = useWalletModal();
    const { setMode } = useAppMode();

    const handleSelectMode = (mode: 'user' | 'dao') => {
        setMode(mode);
        openModal();
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-background">
            <PageMeta
                title="Choose Your Workspace"
                description="Choose your FlowGuard workspace for personal vaults, streams, payments, or organization treasury operations on Bitcoin Cash."
                path="/app"
            />
            {/* LHS - Branding & Value Prop */}
            <div className="hidden md:flex flex-col flex-1 bg-[#1a1a1a] text-white p-12 lg:p-20 relative overflow-hidden justify-between">
                {/* Abstract Background Elements */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#00E676] rounded-full blur-[150px] opacity-10 translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500 rounded-full blur-[150px] opacity-10 -translate-x-1/2 translate-y-1/2"></div>

                <div className="relative z-10">
                    <a href={MAIN_SITE_URL} className="flex items-center gap-3 mb-16">
                        <img src="/assets/flow-green.png" alt="FlowGuard" className="h-8 object-contain brightness-0 invert" />
                    </a>

                    <h1 className="text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight leading-tight mb-6">
                        The operating system <br />
                        for on-chain finance. <br />
                        <span className="text-white">on </span>
                        <span className="text-white">Bitcoin</span><span className="text-[#00E676]">Cash.</span>
                    </h1>
                    <p className="text-lg text-gray-400 max-w-md leading-relaxed">
                        FlowGuard helps teams manage BCH-native treasuries, vesting flows, payments, and governance workflows on Bitcoin Cash.
                    </p>
                </div>

                <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-mono">
                        <ShieldCheck className="w-5 h-5 text-[#00E676]" /> CashScript-native contracts
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-mono">
                        <Zap className="w-5 h-5 text-[#00E676]" /> Fast BCH settlement
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-mono">
                        <Lock className="w-5 h-5 text-[#00E676]" /> Non-custodial by design
                    </div>
                </div>
            </div>

            {/* RHS - Login Selection */}
            <div className="flex-1 flex flex-col justify-center p-8 sm:p-12 lg:p-20 relative">
                {/* Mobile Logo */}
                <div className="md:hidden mb-12">
                    <a href={MAIN_SITE_URL} className="inline-flex items-center">
                        <img src="/assets/flow-green.png" alt="FlowGuard" className="h-8 object-contain" />
                    </a>
                </div>

                <div className="max-w-md w-full mx-auto">
                    <h2 className="text-3xl font-extrabold text-[#1a1a1a] tracking-tight mb-2">Choose Your Workspace</h2>
                    <p className="text-textSecondary mb-10">Select how you want to use FlowGuard.</p>

                    <div className="space-y-4">
                        {/* User Mode Button */}
                        <button
                            onClick={() => handleSelectMode('user')}
                            className="w-full text-left group bg-white border border-border hover:border-[#00E676]/30 hover:shadow-xl hover:shadow-[#00E676]/5 rounded-2xl p-6 transition-all relative overflow-hidden"
                        >
                            <div className="flex items-start gap-5 relative z-10">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform shrink-0">
                                    <UserCircle className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-textPrimary mb-1 group-hover:text-[#00E676] transition-colors">Personal Workspace</h3>
                                    <p className="text-sm text-textSecondary leading-relaxed">
                                        Manage personal vaults, vesting streams, payments, and individual on-chain actions.
                                    </p>
                                </div>
                            </div>
                            <ArrowRight className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-textMuted opacity-0 group-hover:opacity-100 group-hover:translate-x-1 group-hover:text-[#00E676] transition-all" />
                        </button>

                        {/* DAO Mode Button */}
                        <button
                            onClick={() => handleSelectMode('dao')}
                            className="w-full text-left group bg-white border border-border hover:border-[#00E676]/30 hover:shadow-xl hover:shadow-[#00E676]/5 rounded-2xl p-6 transition-all relative overflow-hidden"
                        >
                            <div className="flex items-start gap-5 relative z-10">
                                <div className="p-3 bg-[#00E676]/10 text-[#00E676] rounded-xl group-hover:scale-110 transition-transform shrink-0">
                                    <Target className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-textPrimary mb-1 group-hover:text-[#00E676] transition-colors flex items-center gap-2">
                                        Organization Workspace
                                        <span className="bg-[#00E676] text-white text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-sans shrink-0">BETA</span>
                                    </h3>
                                    <p className="text-sm text-textSecondary leading-relaxed">
                                        Manage multi-member treasuries, roles, governance workflows, and shared treasury policy controls.
                                    </p>
                                </div>
                            </div>
                            <ArrowRight className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-textMuted opacity-0 group-hover:opacity-100 group-hover:translate-x-1 group-hover:text-[#00E676] transition-all" />
                        </button>
                    </div>

                    <div className="mt-12 text-center text-sm text-textMuted flex items-center justify-center gap-2">
                        Fully Non-Custodial <span className="w-1 h-1 rounded-full bg-textMuted" /> Powered by Bitcoin Cash
                    </div>
                </div>
            </div>
        </div>
    );
};
