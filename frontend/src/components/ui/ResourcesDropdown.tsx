import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, BookOpen, HelpCircle, FileText, PenLine, Activity, ShieldCheck, LifeBuoy } from 'lucide-react';
import { BLOG_URL, DOCS_SITE_URL } from '../../utils/publicUrls';

interface Resource {
    name: string;
    href: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    isExternal?: boolean;
}

// Resources order is intentional. "Updates" stays on apex (release notes /
// product news, chronological). "Blog" points at the docs subdomain where
// long-form technical posts live in MDX. Two surfaces, two roles, no overlap.
const resources: Resource[] = [
    {
        name: 'FAQ',
        href: '/faq',
        description: 'Frequently asked questions',
        icon: HelpCircle,
    },
    {
        name: 'Help',
        href: '/help',
        description: 'Guides and support center',
        icon: LifeBuoy,
    },
    {
        name: 'Status',
        href: '/status',
        description: 'System health and uptime',
        icon: Activity,
    },
    {
        name: 'Security',
        href: '/security',
        description: 'Audits, disclosures, threat model',
        icon: ShieldCheck,
    },
    {
        name: 'Updates',
        href: '/updates',
        description: 'Release notes and product news',
        icon: BookOpen,
    },
    {
        name: 'Blog',
        href: BLOG_URL,
        description: 'Long-form posts on FlowGuard internals',
        icon: PenLine,
        isExternal: true,
    },
    {
        name: 'Docs',
        href: DOCS_SITE_URL,
        description: 'Concepts, guides, API reference',
        icon: FileText,
        isExternal: true,
    },
];

export function ResourcesDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 150);
    };

    return (
        <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <button
                className="flex items-center gap-1 text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors py-2"
            >
                Resources
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-0 w-64 bg-surface border border-border rounded-2xl shadow-2xl py-4 z-50">
                    {resources.map((resource) => {
                        const Icon = resource.icon;

                        if (resource.isExternal) {
                            // Cross-origin links open in a new tab so the user
                            // doesn't lose the marketing-site context. In-page
                            // anchors (e.g. "#faq") stay in the current tab.
                            const isCrossOrigin = /^https?:\/\//i.test(resource.href);
                            const externalProps = isCrossOrigin
                                ? { target: '_blank' as const, rel: 'noopener noreferrer' }
                                : {};
                            return (
                                <a
                                    key={resource.name}
                                    href={resource.href}
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-start gap-3 px-4 py-3 hover:bg-surfaceAlt transition-colors group"
                                    {...externalProps}
                                >
                                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                                        <Icon className="w-5 h-5 text-accent" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-sm font-semibold text-textPrimary group-hover:text-primary transition-colors">
                                            {resource.name}
                                        </h3>
                                        <p className="text-xs text-textMuted mt-0.5">
                                            {resource.description}
                                        </p>
                                    </div>
                                </a>
                            );
                        }

                        return (
                            <Link
                                key={resource.name}
                                to={resource.href}
                                onClick={() => setIsOpen(false)}
                                className="flex items-start gap-3 px-4 py-3 hover:bg-surfaceAlt transition-colors group"
                            >
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                                    <Icon className="w-5 h-5 text-accent" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-semibold text-textPrimary group-hover:text-primary transition-colors">
                                        {resource.name}
                                    </h3>
                                    <p className="text-xs text-textMuted mt-0.5">
                                        {resource.description}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
