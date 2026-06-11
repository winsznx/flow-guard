import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_SITE_URL, BLOG_URL, DOCS_SITE_URL } from '../../utils/publicUrls';
import { Link } from 'react-router-dom';
import { X, ChevronDown, ChevronRight, Coins, Users, PieChart, Gift, Vote, BookOpen, HelpCircle, FileText, PenLine, Target, Award, HandCoins, Activity, ShieldCheck, Tag, Sparkles, PlayCircle, LifeBuoy, Lightbulb } from 'lucide-react';

interface MobileMenuProps {
    isOpen: boolean;
    onClose: () => void;
}

const menuVariants = {
    closed: {
        opacity: 0,
        x: '100%',
        transition: {
            duration: 0.2,
            ease: [0.4, 0, 0.2, 1] as const
        }
    },
    open: {
        opacity: 1,
        x: 0,
        transition: {
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1] as const
        }
    }
};

const solutions = [
    {
        name: 'Vesting',
        href: '/vesting',
        icon: Coins,
        description: 'Release tokens on a fixed schedule'
    },
    {
        name: 'Payroll',
        href: '/payroll',
        icon: Users,
        description: 'Pay your team automatically'
    },
    {
        name: 'Budgeting',
        href: '/budgeting',
        icon: PieChart,
        description: 'Set spending limits that enforce themselves'
    },
    {
        name: 'Grants Info',
        href: '/grants-info',
        icon: Gift,
        description: 'Fund projects with accountability'
    },
    {
        name: 'Governance',
        href: '/governance-info',
        icon: Vote,
        description: 'Make treasury decisions as a group'
    },
    {
        name: 'Bounties',
        href: '/bounties',
        icon: Target,
        description: 'Reward task winners with on-chain payouts'
    },
    {
        name: 'Rewards',
        href: '/rewards',
        icon: Award,
        description: 'Distribute pooled incentives to contributors'
    },
    {
        name: 'Grants',
        href: '/grants',
        icon: HandCoins,
        description: 'Milestone-based grant streams'
    },
    {
        name: 'Use Cases',
        href: '/use-cases',
        icon: Lightbulb,
        description: 'Real-world FlowGuard scenarios'
    },
    {
        name: 'How it works',
        href: '/how-it-works',
        icon: Sparkles,
        description: 'From smart contract to wallet'
    },
    {
        name: 'Pricing',
        href: '/pricing',
        icon: Tag,
        description: 'Fees, plans, and what you pay for'
    },
    {
        name: 'Demo',
        href: '/demo',
        icon: PlayCircle,
        description: 'See FlowGuard in action'
    },
];

const resources = [
    {
        name: 'FAQ',
        href: '/faq',
        icon: HelpCircle,
        description: 'Frequently asked questions'
    },
    {
        name: 'Help',
        href: '/help',
        icon: LifeBuoy,
        description: 'Guides and support center'
    },
    {
        name: 'Status',
        href: '/status',
        icon: Activity,
        description: 'System health and uptime'
    },
    {
        name: 'Security',
        href: '/security',
        icon: ShieldCheck,
        description: 'Audits, disclosures, threat model'
    },
    {
        name: 'Updates',
        href: '/updates',
        icon: BookOpen,
        description: 'Release notes and product news'
    },
    {
        name: 'Blog',
        href: BLOG_URL,
        icon: PenLine,
        isExternal: true,
        description: 'Long-form posts on FlowGuard internals'
    },
    {
        name: 'Docs',
        href: DOCS_SITE_URL,
        icon: FileText,
        isExternal: true,
        description: 'Concepts, guides, API reference'
    },
];

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
    const [openSection, setOpenSection] = useState<string | null>(null);

    const toggleSection = (section: string) => {
        setOpenSection(openSection === section ? null : section);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 md:hidden"
                    />

                    {/* Menu Panel */}
                    <motion.div
                        variants={menuVariants}
                        initial="closed"
                        animate="open"
                        exit="closed"
                        className="fixed inset-y-0 right-0 w-full sm:w-80 bg-surface border-l border-border z-50 md:hidden shadow-2xl overflow-y-auto"
                    >
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-8">
                                <img
                                    src="/assets/flow-green.png"
                                    alt="FlowGuard"
                                    className="h-8 object-contain"
                                />
                                <button
                                    onClick={onClose}
                                    className="p-2 -mr-2 text-textSecondary hover:text-textPrimary hover:bg-surfaceAlt rounded-full transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-6">
                                {/* Solutions Section */}
                                <div className="space-y-3">
                                    <button
                                        onClick={() => toggleSection('solutions')}
                                        className="flex items-center justify-between w-full text-lg font-medium text-textPrimary"
                                    >
                                        Solutions
                                        <ChevronDown className={`w-5 h-5 transition-transform ${openSection === 'solutions' ? 'rotate-180' : ''}`} />
                                    </button>

                                    <AnimatePresence>
                                        {openSection === 'solutions' && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="space-y-2 pl-4 pt-2 border-l-2 border-border/50 ml-1">
                                                    {solutions.map((item) => {
                                                        const Icon = item.icon;
                                                        return (
                                                            <Link
                                                                key={item.name}
                                                                to={item.href}
                                                                onClick={onClose}
                                                                className="flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-surfaceAlt transition-colors group"
                                                            >
                                                                <Icon className="w-5 h-5 mt-0.5 text-primary group-hover:text-primaryHover" />
                                                                <div>
                                                                    <div className="text-sm font-semibold text-textPrimary">{item.name}</div>
                                                                    <div className="text-xs text-textSecondary leading-snug">{item.description}</div>
                                                                </div>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Direct Links */}
                                <Link
                                    to="/developers"
                                    onClick={onClose}
                                    className="block text-lg font-medium text-textSecondary hover:text-textPrimary transition-colors"
                                >
                                    Developers
                                </Link>

                                <Link
                                    to="/security"
                                    onClick={onClose}
                                    className="block text-lg font-medium text-textSecondary hover:text-textPrimary transition-colors"
                                >
                                    Security
                                </Link>

                                {/* Resources Section */}
                                <div className="space-y-3">
                                    <button
                                        onClick={() => toggleSection('resources')}
                                        className="flex items-center justify-between w-full text-lg font-medium text-textSecondary hover:text-textPrimary transition-colors"
                                    >
                                        Resources
                                        <ChevronDown className={`w-5 h-5 transition-transform ${openSection === 'resources' ? 'rotate-180' : ''}`} />
                                    </button>

                                    <AnimatePresence>
                                        {openSection === 'resources' && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="space-y-2 pl-4 pt-2 border-l-2 border-border/50 ml-1">
                                                    {resources.map((item) => {
                                                        const Icon = item.icon;
                                                        // Cross-origin entries (Blog, Docs) open in a new tab to
                                                        // preserve the marketing-site context. In-page anchors
                                                        // (e.g. "#faq") stay in the current tab.
                                                        if (item.isExternal) {
                                                            const isCrossOrigin = /^https?:\/\//i.test(item.href);
                                                            const externalProps = isCrossOrigin
                                                                ? { target: '_blank' as const, rel: 'noopener noreferrer' }
                                                                : {};
                                                            return (
                                                                <a
                                                                    key={item.name}
                                                                    href={item.href}
                                                                    onClick={onClose}
                                                                    className="flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-surfaceAlt transition-colors group"
                                                                    {...externalProps}
                                                                >
                                                                    <Icon className="w-5 h-5 mt-0.5 text-primary group-hover:text-primaryHover" />
                                                                    <div>
                                                                        <div className="text-sm font-semibold text-textPrimary">{item.name}</div>
                                                                        <div className="text-xs text-textSecondary leading-snug">{item.description}</div>
                                                                    </div>
                                                                </a>
                                                            );
                                                        }
                                                        return (
                                                            <Link
                                                                key={item.name}
                                                                to={item.href}
                                                                onClick={onClose}
                                                                className="flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-surfaceAlt transition-colors group"
                                                            >
                                                                <Icon className="w-5 h-5 mt-0.5 text-primary group-hover:text-primaryHover" />
                                                                <div>
                                                                    <div className="text-sm font-semibold text-textPrimary">{item.name}</div>
                                                                    <div className="text-xs text-textSecondary leading-snug">{item.description}</div>
                                                                </div>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="pt-6 mt-6 border-t border-border">
                                    <a href={APP_SITE_URL} onClick={onClose}>
                                        <motion.button
                                            whileTap={{ scale: 0.95 }}
                                            className="w-full bg-primary text-white px-6 py-3 rounded-xl text-base font-semibold shadow-lg"
                                        >
                                            Launch App
                                        </motion.button>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
