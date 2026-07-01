import {
  getAeriesConfig,
  AERIES_DEMO_BASE_URL,
  AERIES_DEMO_CERTIFICATE,
} from './config';

describe('getAeriesConfig', () => {
  it('falls back to the demo instance when both vars are unset', () => {
    expect(getAeriesConfig({} as NodeJS.ProcessEnv)).toEqual({
      baseUrl: AERIES_DEMO_BASE_URL,
      certificate: AERIES_DEMO_CERTIFICATE,
    });
  });

  it('uses a district base URL + certificate when both are set', () => {
    const env = {
      AERIES_BASE_URL: 'https://district.aeries.net/aeries/api/v5/',
      AERIES_CERTIFICATE: 'district-cert',
    } as unknown as NodeJS.ProcessEnv;
    expect(getAeriesConfig(env)).toEqual({
      baseUrl: 'https://district.aeries.net/aeries/api/v5', // trailing slash stripped
      certificate: 'district-cert',
    });
  });

  it('throws when a district base URL is set without a certificate', () => {
    const env = {
      AERIES_BASE_URL: 'https://district.aeries.net/aeries/api/v5',
    } as unknown as NodeJS.ProcessEnv;
    expect(() => getAeriesConfig(env)).toThrow(/certificate missing/i);
  });

  it('throws when a certificate is set without an explicit base URL', () => {
    const env = {
      AERIES_CERTIFICATE: 'orphan-cert',
    } as unknown as NodeJS.ProcessEnv;
    expect(() => getAeriesConfig(env)).toThrow(/base URL missing/i);
  });
});
