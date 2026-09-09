/** SEO helpers: metadata objects and JSON-LD builders. Pure. */
import { BRAND_NAME, SOCIAL, absoluteUrl, ROUTES } from '@/config/site';

export interface PageMeta {
  title: string;
  description: string;
  /** Site-relative canonical path (with trailing slash). */
  path: string;
  /** 'index,follow' by default. Share pages use noindex. */
  robots?: string;
  ogType?: 'website' | 'article';
  /** Site-relative or absolute image URL. */
  image?: string;
  imageAlt?: string;
  /** Prev/next for paginated sets. */
  prev?: string;
  next?: string;
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function websiteJsonLd(siteUrl: string, description: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND_NAME,
    url: absoluteUrl('/', siteUrl),
    description,
    publisher: { '@id': `${absoluteUrl('/', siteUrl)}#organization` },
  };
}

export function organizationJsonLd(siteUrl: string, email: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${absoluteUrl('/', siteUrl)}#organization`,
    name: BRAND_NAME,
    url: absoluteUrl('/', siteUrl),
    email,
    logo: absoluteUrl('/icon-512.png', siteUrl),
  };
}

export function breadcrumbJsonLd(
  siteUrl: string,
  items: readonly BreadcrumbItem[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path, siteUrl),
    })),
  };
}

export function collectionPageJsonLd(siteUrl: string, meta: PageMeta): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: meta.title,
    description: meta.description,
    url: absoluteUrl(meta.path, siteUrl),
    isPartOf: { '@type': 'WebSite', url: absoluteUrl('/', siteUrl), name: BRAND_NAME },
  };
}

export function defaultImage(siteUrl: string): string {
  return absoluteUrl(SOCIAL.defaultImagePath, siteUrl);
}

export function homeBreadcrumb(): BreadcrumbItem {
  return { name: 'Home', path: ROUTES.home };
}

/** Serialize JSON-LD safely inside a <script> element. */
export function jsonLdString(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
