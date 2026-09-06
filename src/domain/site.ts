/** Site-level domain models: configuration, pagination, deployment manifest. */

export interface MonthDay {
  readonly month: number; // 1–12
  readonly day: number; // 1–31
}

export interface SeasonalWindow {
  /** Category slug this window applies to. */
  readonly slug: string;
  readonly label: string;
  readonly start: MonthDay;
  readonly end: MonthDay;
}

export interface SiteConfiguration {
  readonly brandName: string;
  readonly siteUrl: string;
  readonly publicEmail: string;
  readonly questionsPerPage: number;
  readonly popularCategoryLimit: number;
  readonly navigationCategoryLimit: number;
  readonly questionsPerPack: number;
  readonly defaultSocialImage: string;
  readonly seasonalWindows: readonly SeasonalWindow[];
}

export interface PaginationResult<T> {
  readonly items: readonly T[];
  readonly page: number; // 1-based
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  /** 1-based index of the first item on this page (for continuous numbering). */
  readonly startIndex: number;
  readonly endIndex: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

export interface DeploymentManifest {
  readonly buildTimestamp: string;
  readonly gitCommit: string | null;
  readonly appVersion: string;
  readonly dataProvider: string;
  readonly publishedQuestionCount: number;
  readonly publishedCategoryCount: number;
  /** Stable SHA-256 over published content (ids + text + relationships). */
  readonly contentChecksum: string;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): PaginationResult<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const current = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: current,
    pageSize: size,
    totalItems,
    totalPages,
    startIndex: totalItems === 0 ? 0 : start + 1,
    endIndex: start + slice.length,
    hasPrevious: current > 1,
    hasNext: current < totalPages,
  };
}
