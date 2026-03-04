import { Helmet } from 'react-helmet-async';

interface PageMetaProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
}

const SITE_NAME = 'FlowGuard';
const SITE_URL = 'https://flowguard.cash';
const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;
const DEFAULT_IMAGE_ALT = 'FlowGuard social preview card';

function resolveAbsoluteUrl(pathOrUrl?: string) {
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function PageMeta({
  title,
  description,
  path = '/',
  image,
  imageAlt = DEFAULT_IMAGE_ALT,
  type = 'website',
}: PageMetaProps) {
  const canonicalUrl = resolveAbsoluteUrl(path) || SITE_URL;
  const imageUrl = resolveAbsoluteUrl(image) || DEFAULT_IMAGE;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <link rel="canonical" href={canonicalUrl} />
      <meta name="description" content={description} />

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:alt" content={imageAlt} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@flowguard_" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <meta name="twitter:image:alt" content={imageAlt} />
    </Helmet>
  );
}
