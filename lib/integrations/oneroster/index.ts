/**
 * OneRoster v1.1 integration — public surface (SPE-397).
 *
 * Server-only. Import from here rather than reaching into sub-modules.
 */

export {
  OneRosterClient,
  OneRosterApiError,
  ONEROSTER_DEFAULT_PAGE_SIZE,
  type OneRosterPhase,
  type OneRosterRequestOptions,
} from './client';

export {
  ONEROSTER_API_PATH,
  ONEROSTER_SCOPE,
  type OneRosterConnectionConfig,
} from './config';

export type {
  RawOneRosterOrg,
  RawOneRosterSchool,
  RawOneRosterUser,
  RawOneRosterEnrollment,
  RawOneRosterClass,
  OneRosterTokenResponse,
} from './types';
