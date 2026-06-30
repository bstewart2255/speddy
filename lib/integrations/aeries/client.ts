/**
 * Aeries SIS API — server-only REST client (native API, v5).
 *
 * Certificate auth via the `AERIES-CERT` header; JSON via `Accept`. This client
 * is server-to-server ONLY — the certificate must never reach the browser. It
 * deliberately performs no DB writes: it fetches and shapes raw Aeries records;
 * mapping to Speddy models lives in `mappers.ts` and persistence in callers.
 *
 * Good-citizen patterns (per Aeries' performance etiquette): the `fields` param
 * trims payloads, `StartingRecord`/`EndingRecord` paginate, and `getAllPages`
 * walks large result sets in bounded batches. Differential sync via
 * `dateLastModified` is left to callers (the param is supported here).
 */

import { logger } from '@/lib/logger';
import {
  getAeriesConfig,
  type AeriesConnectionConfig,
} from './config';
import type {
  RawAeriesProgram,
  RawAeriesSchool,
  RawAeriesStudent,
  RawAeriesTeacher,
} from './types';

/** Default page size for `getAllPages`. Conservative, off-peak friendly. */
export const AERIES_DEFAULT_PAGE_SIZE = 500;
/** Hard cap on pages walked, so a bad cursor can't loop forever. */
const MAX_PAGES = 1000;

export interface AeriesRequestOptions {
  /** Restrict the response to these Aeries fields (the `fields` query param). */
  fields?: string[];
  /** 1-based inclusive pagination bounds (`StartingRecord`/`EndingRecord`). */
  startingRecord?: number;
  endingRecord?: number;
  /** ISO date for differential sync (`dateLastModified`). */
  dateLastModified?: string;
  /** Extra query params passed through verbatim (e.g. `code` for programs). */
  query?: Record<string, string | number>;
  /** Per-request timeout in ms (default 30s). */
  timeoutMs?: number;
}

/** Raised when Aeries returns a non-2xx response. Carries the HTTP status. */
export class AeriesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'AeriesApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class AeriesClient {
  private readonly baseUrl: string;
  private readonly certificate: string;

  constructor(config: AeriesConnectionConfig = getAeriesConfig()) {
    this.baseUrl = config.baseUrl;
    this.certificate = config.certificate;
  }

  /**
   * Issue a GET against an Aeries endpoint path (relative to the version base,
   * e.g. `schools/1/teachers`) and parse the JSON body.
   */
  async get<T>(path: string, options: AeriesRequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'AERIES-CERT': this.certificate,
          Accept: 'application/json',
        },
        signal: controller.signal,
        // Never cache SIS responses (student PII, changing data).
        cache: 'no-store',
      });

      if (!res.ok) {
        // Body may contain the failing cert value — log status/path only.
        logger.error('Aeries API request failed', {
          status: res.status,
          path,
        });
        throw new AeriesApiError(
          `Aeries API responded ${res.status} for ${path}`,
          res.status,
          path,
        );
      }

      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof AeriesApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AeriesApiError(
          `Aeries API request timed out after ${timeoutMs}ms for ${path}`,
          408,
          path,
        );
      }
      logger.error('Aeries API request error', {
        path,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Walk a paginated endpoint to completion in fixed-size batches. Stops when a
   * page returns fewer than `pageSize` rows. Use for "get all" reads, off-peak.
   */
  async getAllPages<T>(
    path: string,
    options: Omit<AeriesRequestOptions, 'startingRecord' | 'endingRecord'> & {
      pageSize?: number;
    } = {},
  ): Promise<T[]> {
    const { pageSize = AERIES_DEFAULT_PAGE_SIZE, ...rest } = options;
    const all: T[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const startingRecord = page * pageSize + 1;
      const endingRecord = startingRecord + pageSize - 1;
      const batch = await this.get<T[]>(path, {
        ...rest,
        startingRecord,
        endingRecord,
      });

      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < pageSize) break;
    }

    return all;
  }

  // -- Typed endpoint helpers ------------------------------------------------

  /** All schools for the district. */
  getSchools(options?: AeriesRequestOptions): Promise<RawAeriesSchool[]> {
    return this.get<RawAeriesSchool[]>('schools', options);
  }

  /** A single school by code. */
  getSchool(
    schoolCode: number,
    options?: AeriesRequestOptions,
  ): Promise<RawAeriesSchool> {
    return this.get<RawAeriesSchool>(`schools/${schoolCode}`, options);
  }

  /**
   * Every teacher record for a school (SPE-123). No teacher number needed.
   * Callers filter `InactiveStatusCode` via the mapper's `active` flag.
   */
  getSchoolTeachers(
    schoolCode: number,
    options?: AeriesRequestOptions,
  ): Promise<RawAeriesTeacher[]> {
    return this.get<RawAeriesTeacher[]>(`schools/${schoolCode}/teachers`, options);
  }

  /** All students for a school (use `getAllPages` for large sites). */
  getSchoolStudents(
    schoolCode: number,
    options?: AeriesRequestOptions,
  ): Promise<RawAeriesStudent[]> {
    return this.get<RawAeriesStudent[]>(`schools/${schoolCode}/students`, options);
  }

  /**
   * Program records for a school's students. Pass `studentId = 0` for all
   * students, and `programCode` (e.g. `'144'`) to filter to Special Education
   * (SPE-122). `'144x'` records mark students being evaluated for services.
   */
  getStudentPrograms(
    schoolCode: number,
    studentId = 0,
    programCode?: string,
    options: AeriesRequestOptions = {},
  ): Promise<RawAeriesProgram[]> {
    const query = { ...options.query };
    if (programCode) query.code = programCode;
    return this.get<RawAeriesProgram[]>(
      `schools/${schoolCode}/students/${studentId}/programs`,
      { ...options, query },
    );
  }

  // -- Internal --------------------------------------------------------------

  private buildUrl(path: string, options: AeriesRequestOptions): string {
    const cleanPath = path.replace(/^\/+/, '');
    const url = new URL(`${this.baseUrl}/${cleanPath}`);

    if (options.fields?.length) {
      url.searchParams.set('fields', options.fields.join(','));
    }
    if (options.startingRecord != null) {
      url.searchParams.set('StartingRecord', String(options.startingRecord));
    }
    if (options.endingRecord != null) {
      url.searchParams.set('EndingRecord', String(options.endingRecord));
    }
    if (options.dateLastModified) {
      url.searchParams.set('dateLastModified', options.dateLastModified);
    }
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }
}

/** Convenience factory using env-resolved config. */
export function createAeriesClient(
  config?: AeriesConnectionConfig,
): AeriesClient {
  return new AeriesClient(config);
}
