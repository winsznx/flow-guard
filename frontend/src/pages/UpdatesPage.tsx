import { useState } from 'react';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { PageContainer } from '../components/layout/PageContainer';
import { PageMeta } from '../components/seo/PageMeta';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Display } from '../components/ui/Display';
import { FilterChips } from '../components/ui/FilterChips';
import { LinkCard } from '../components/ui/LinkCard';
import { NoResults } from '../components/ui/NoResults';
import { SearchInput } from '../components/ui/SearchInput';
import { formatDate } from '../copy/format';
import { matchesQuery } from '../copy/help';
import {
  FEATURED_SLUG,
  POSTS,
  POST_TAGS,
  UPDATES_PAGE,
  findPost,
  postCount,
  readingTime,
  type PostMeta,
  type PostTag,
} from '../copy/updates';

function postMetaLine(post: PostMeta): string {
  const parts = [formatDate(post.date), post.tags.join(', '), readingTime(post.readingMinutes)];
  if (post.archived) parts.push(UPDATES_PAGE.archived);
  return parts.filter(Boolean).join(' · ');
}

export default function UpdatesPage() {
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<PostTag[]>([]);
  const featured = findPost(FEATURED_SLUG);

  const posts = POSTS.filter(
    (post) =>
      (tags.length === 0 || post.tags.some((tag) => tags.includes(tag))) &&
      matchesQuery(query, post.title, post.summary, ...post.tags),
  );
  const filtering = query.trim().length > 0 || tags.length > 0;

  const clear = () => {
    setQuery('');
    setTags([]);
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PageMeta title={UPDATES_PAGE.title} description={UPDATES_PAGE.description} path="/updates" />
      <MarketingNav />
      <main className="min-w-0 flex-1">
        <PageContainer width="reading" className="flex flex-col gap-8 pt-12 lg:pt-16">
          <header className="flex flex-col gap-3">
            <Display size="headline" as="h1">
              {UPDATES_PAGE.title}
            </Display>
            <p className="text-body-lg text-ink-secondary">{UPDATES_PAGE.description}</p>
            {featured ? (
              <p className="text-body text-ink-secondary">
                {`${UPDATES_PAGE.newHere} `}
                <ButtonLink variant="link" to={`/updates/${featured.slug}`}>
                  {featured.title}
                </ButtonLink>
                {'. '}
                {`${UPDATES_PAGE.releaseNotes} `}
                <ButtonLink variant="link" to="/changelog">
                  {UPDATES_PAGE.changelogLink}
                </ButtonLink>
                {'.'}
              </p>
            ) : null}
          </header>

          <div className="flex flex-col gap-3">
            <SearchInput
              label={UPDATES_PAGE.searchLabel}
              placeholder={UPDATES_PAGE.searchPlaceholder}
              value={query}
              onChange={setQuery}
            />
            <FilterChips
              label={UPDATES_PAGE.topicsLabel}
              options={POST_TAGS.map((tag) => ({ value: tag, label: tag }))}
              selected={tags}
              onChange={setTags}
              multiple
            />
            <p className="text-small text-ink-muted" aria-live="polite">
              {filtering ? postCount(posts.length) : ''}
            </p>
          </div>

          {posts.length === 0 ? (
            <NoResults thing={UPDATES_PAGE.noMatchThing} onClear={clear} />
          ) : (
            <ul className="flex flex-col gap-3">
              {posts.map((post) => (
                <li key={post.slug} className="flex">
                  <LinkCard
                    to={`/updates/${post.slug}`}
                    title={post.title}
                    description={post.summary}
                    meta={postMetaLine(post)}
                    className="flex-1"
                  />
                </li>
              ))}
            </ul>
          )}
        </PageContainer>
      </main>
      <MarketingFooter />
    </div>
  );
}
