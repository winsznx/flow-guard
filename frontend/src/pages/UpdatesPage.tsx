import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Calendar, Tag, Clock, ArrowRight, ArrowLeft } from 'lucide-react';
import { Footer } from '../components/layout/Footer';

interface BlogPost {
    slug: string;
    title: string;
    date: string;
    summary: string;
    tags: string[];
    readingTime: number;
    featured?: boolean;
    status: 'draft' | 'published';
    cover?: string;
    author?: string;
}

const BLOG_POSTS: BlogPost[] = [
    {
        slug: 'why-flowguard-is-non-custodial',
        title: 'Why FlowGuard Is Non-Custodial (And Why That Matters)',
        date: '2026-02-19',
        summary: 'FlowGuard does not hold your keys, sign on your behalf, or control funds. Treasury rules are enforced directly by covenant contracts on Bitcoin Cash.',
        tags: ['Security', 'Architecture', 'Deep Dive'],
        readingTime: 7,
        featured: true,
        status: 'published',
        author: 'FlowGuard Team'
    },
    {
        slug: 'what-flowguard-is',
        title: 'What FlowGuard Actually Is (And What It Isn’t)',
        date: '2026-02-18',
        summary: "FlowGuard isn't a wallet or a database. It's a set of six core covenant modules that enforce treasury rules directly on the Bitcoin Cash blockchain.",
        tags: ['Product', 'Deep Dive', 'Technology'],
        readingTime: 6,
        featured: true,
        status: 'published',
        author: 'FlowGuard Team'
    },
    {
        slug: 'bch-treasury-problem',
        title: 'The Problem With How BCH Teams Manage Treasury Today',
        date: '2026-02-17',
        summary: 'Most BCH teams manage treasury with shared wallets and verbal rules. As treasury size grows, the risks grow with it. Treasury rules should be enforced by the blockchain, not by memory or trust.',
        tags: ['Education', 'Treasury', 'BCH', 'Governance'],
        readingTime: 8,
        featured: true,
        status: 'published',
        author: 'FlowGuard Team'
    },
    {
        slug: 'alpha-launch-chipnet',
        title: 'FlowGuard Alpha Launches on BCH Chipnet',
        date: '2026-02-15',
        summary: 'Introducing FlowGuard: automated treasury management with on-chain enforcement. Now live on Bitcoin Cash Chipnet for testing and feedback.',
        tags: ['Launch', 'Alpha', 'Chipnet'],
        readingTime: 5,
        featured: false,
        status: 'published',
        author: 'FlowGuard Team'
    },
    {
        slug: 'treasury-automation-explained',
        title: 'Why Treasury Automation Matters',
        date: '2026-02-10',
        summary: 'Manual treasury management is error-prone and time-consuming. Learn how FlowGuard automates payments, enforces spending limits, and provides transparency.',
        tags: ['Education', 'Treasury', 'Automation'],
        readingTime: 8,
        status: 'published',
        author: 'FlowGuard Team'
    }
];

export default function UpdatesPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        BLOG_POSTS.forEach(post => post.tags.forEach(tag => tags.add(tag)));
        return Array.from(tags).sort();
    }, []);

    const filteredPosts = useMemo(() => {
        return BLOG_POSTS.filter(post => {
            if (post.status !== 'published') return false;

            const matchesSearch = !searchQuery ||
                post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                post.summary.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesTag = !selectedTag || post.tags.includes(selectedTag);

            return matchesSearch && matchesTag;
        });
    }, [searchQuery, selectedTag]);

    const featuredPost = BLOG_POSTS.find(p => p.featured && p.status === 'published');

    return (
        <main className="bg-background min-h-screen">
            {/* Hero */}
            <section className="pt-32 pb-16 px-6 lg:px-12 bg-surface border-b border-border">
                <div className="max-w-4xl mx-auto">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 text-textSecondary hover:text-textPrimary transition-colors mb-8"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Home
                    </Link>
                    <div className="text-center">
                        <h1 className="font-display text-5xl md:text-6xl font-bold text-textPrimary mb-6">
                            Updates
                        </h1>
                        <p className="text-xl text-textSecondary max-w-2xl mx-auto">
                            Product updates, feature releases, and insights from the FlowGuard team
                        </p>
                    </div>
                </div>
            </section>

            <div className="max-w-6xl mx-auto px-6 lg:px-12 py-16">
                {/* Search and Filters */}
                <div className="mb-12 space-y-6">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-textMuted" />
                        <input
                            type="text"
                            placeholder="Search updates..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-textPrimary"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setSelectedTag(null)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${!selectedTag
                                ? 'bg-primary text-white'
                                : 'bg-surface border border-border text-textSecondary hover:bg-surfaceAlt'
                                }`}
                        >
                            All
                        </button>
                        {allTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => setSelectedTag(tag)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedTag === tag
                                    ? 'bg-primary text-white'
                                    : 'bg-surface border border-border text-textSecondary hover:bg-surfaceAlt'
                                    }`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Featured Post */}
                {featuredPost && !searchQuery && !selectedTag && (
                    <Link to={`/updates/${featuredPost.slug}`} className="block mb-16 group">
                        <div className="bg-surface border border-border rounded-2xl p-8 hover:border-primary/50 transition-all">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                                    Featured
                                </span>
                            </div>
                            <h2 className="font-display text-3xl md:text-4xl font-bold text-textPrimary mb-4 group-hover:text-primary transition-colors">
                                {featuredPost.title}
                            </h2>
                            <p className="text-lg text-textSecondary mb-6">
                                {featuredPost.summary}
                            </p>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-textMuted">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(featuredPost.date).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {featuredPost.readingTime} min read
                                </div>
                            </div>
                        </div>
                    </Link>
                )}

                {/* Post Grid */}
                <div className="grid md:grid-cols-2 gap-8">
                    {filteredPosts.map(post => (
                        <Link
                            key={post.slug}
                            to={`/updates/${post.slug}`}
                            className="group bg-surface border border-border rounded-xl p-6 hover:border-primary/50 transition-all"
                        >
                            <div className="flex flex-wrap gap-2 mb-4">
                                {post.tags.map(tag => (
                                    <span
                                        key={tag}
                                        className="px-2 py-1 bg-surfaceAlt text-textMuted text-xs font-medium rounded"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            <h3 className="font-display text-xl font-bold text-textPrimary mb-3 group-hover:text-primary transition-colors">
                                {post.title}
                            </h3>
                            <p className="text-textSecondary mb-4 line-clamp-2">
                                {post.summary}
                            </p>
                            <div className="flex items-center justify-between text-sm text-textMuted">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(post.date).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </div>
                                <div className="flex items-center gap-2 text-primary group-hover:gap-3 transition-all">
                                    Read more
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

                {filteredPosts.length === 0 && (
                    <div className="text-center py-16">
                        <p className="text-textSecondary text-lg">No posts found matching your criteria.</p>
                    </div>
                )}
            </div>

            <Footer />
        </main>
    );
}
