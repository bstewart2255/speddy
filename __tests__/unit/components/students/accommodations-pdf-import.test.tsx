/**
 * @jest-environment jsdom
 */

/**
 * Availability gate on the accommodations PDF import (SPE-494): the entry
 * point renders ONLY after /api/features confirms AI features are on. While
 * the kill switch is off (or the check fails) the component renders nothing —
 * matching how every other AI surface stays out of reach. Only a confirmed
 * "on" is cached across mounts. All data fictional.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import {
  AccommodationsPdfImport,
  __resetAiFeaturesProbeForTests,
} from '@/app/components/students/accommodations-pdf-import';

const ORIGINAL_FETCH = global.fetch;

const renderImport = () =>
  render(
    <AccommodationsPdfImport
      studentId="22222222-2222-4222-8222-222222222222"
      existingAccommodations={[]}
      onAdd={jest.fn()}
    />
  );

const mockFeatures = (impl: () => Promise<unknown>) => {
  global.fetch = jest.fn(impl) as unknown as typeof fetch;
};

/** Drain the availability promise chain so assertions run after it settled. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  __resetAiFeaturesProbeForTests();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  jest.clearAllMocks();
});

describe('AccommodationsPdfImport availability gate', () => {
  it('renders nothing while AI features are off', async () => {
    mockFeatures(async () => ({ ok: true, json: async () => ({ aiFeatures: false }) }));
    const { container } = renderImport();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/features'));
    await settle();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the import entry point once AI features are on', async () => {
    mockFeatures(async () => ({ ok: true, json: async () => ({ aiFeatures: true }) }));
    renderImport();
    expect(await screen.findByRole('button', { name: /import from iep pdf/i })).toBeInTheDocument();
  });

  it('asks once per page load once confirmed on, but re-asks after an off answer', async () => {
    mockFeatures(async () => ({ ok: true, json: async () => ({ aiFeatures: false }) }));
    renderImport();
    await settle();
    renderImport();
    await settle();
    // "off" is never cached — each mount re-asks so a flipped switch shows up.
    expect(global.fetch).toHaveBeenCalledTimes(2);

    mockFeatures(async () => ({ ok: true, json: async () => ({ aiFeatures: true }) }));
    renderImport();
    await settle();
    renderImport();
    await settle();
    // Confirmed "on" is cached for the page: the second mount asks nothing.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('stays hidden when the availability check fails (fail-closed)', async () => {
    mockFeatures(async () => {
      throw new Error('network down');
    });
    const { container } = renderImport();
    await settle();
    expect(global.fetch).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden on a non-OK response (fail-closed)', async () => {
    mockFeatures(async () => ({ ok: false, json: async () => ({ error: 'nope' }) }));
    const { container } = renderImport();
    await settle();
    expect(global.fetch).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
