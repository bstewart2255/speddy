/**
 * Aeries SIS API integration — public surface.
 *
 * Server-only. Import from here rather than reaching into sub-modules.
 * See `docs/integrations/aeries.md` for the integration overview.
 */

export {
  AeriesClient,
  AeriesApiError,
  createAeriesClient,
  AERIES_DEFAULT_PAGE_SIZE,
  type AeriesRequestOptions,
} from './client';

export {
  getAeriesConfig,
  AERIES_API_VERSION,
  AERIES_DEMO_BASE_URL,
  AERIES_DEMO_CERTIFICATE,
  type AeriesConnectionConfig,
} from './config';

export {
  mapTeacher,
  mapTeachers,
  mapStudent,
  isSpedProgram,
  isEvaluationProgram,
  isCurrentProgram,
  indexSpedStudents,
  SPED_PROGRAM_CODE,
  SPED_EVALUATION_PROGRAM_CODE,
} from './mappers';

export type {
  RawAeriesSchool,
  RawAeriesTeacher,
  RawAeriesStudent,
  RawAeriesProgram,
  MappedAeriesTeacher,
  MappedAeriesStudent,
} from './types';
