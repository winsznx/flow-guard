import { Helmet } from 'react-helmet-async';
import { MARKETING_HOME_TITLE, SITE_NAME, documentTitle } from '../../copy/nav';
import { getCurrentSiteOrigin, MAIN_SITE_URL } from '../../utils/publicUrls';

interface PageMetaProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  /** Use the title as written, without the "| FlowGuard" suffix. */
  exactTitle?: boolean;
  /** Ask search engines to leave the page out, for pages like the 404 that shouldn't show in results. */
  noindex?: boolean;
}

const DEFAULT_IMAGE = `${MAIN_SITE_URL}/og-default.png`;
const DEFAULT_IMAGE_ALT = MARKETING_HOME_TITLE;
const TWITTER_HANDLE = '@flowguard_';

function encodePath(path: string): string {
  try {
    return encodeURI(decodeURI(path));
  } catch {
    return encodeURI(path);
  }
}

function resolveAbsoluteUrl(pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    const url = new URL(pathOrUrl);
    return `${url.origin}${encodePath(url.pathname)}${url.search}${url.hash}`;
  }
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${getCurrentSiteOrigin()}${encodePath(path)}`;
}

export function PageMeta({
  title,
  description,
  path = '/',
  image,
  imageAlt = DEFAULT_IMAGE_ALT,
  type = 'website',
  exactTitle = false,
  noindex = false,
}: PageMetaProps) {
  const canonicalUrl = resolveAbsoluteUrl(path) ?? getCurrentSiteOrigin();
  const imageUrl = resolveAbsoluteUrl(image) ?? DEFAULT_IMAGE;
  const fullTitle = exactTitle || title.includes(SITE_NAME) ? title : documentTitle(title);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <link rel="canonical" href={canonicalUrl} />
      <meta name="description" content={description} />
      {noindex ? <meta name="robots" content="noindex" /> : null}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:alt" content={imageAlt} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={TWITTER_HANDLE} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <meta name="twitter:image:alt" content={imageAlt} />
    </Helmet>
  );
}
