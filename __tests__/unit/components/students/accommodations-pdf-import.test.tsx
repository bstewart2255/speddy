/**
 * @jest-environment jsdom
 */

/**
 * Availability gate on the accommodations PDF import (SPE-494): the entry
 * point renders ONLY after /api/features confirms AI features are on. While
 * the kill switch is off (or the check fails) the component renders nothing —
 * matching how every other AI surface stays out of reach. All data fictional.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { AccommodationsPdfImport } from '@/app/components/students/accommodations-pdf-import';

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

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AccommodationsPdfImport availability gate', () => {
  it('renders nothing while AI features are off', async () => {
    mockFeatures(async () => ({ ok: true, json: async () => ({ aiFeatures: false }) }));
    const { container } = renderImport();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/features'));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the import entry point once AI features are on', async () => {
    mockFeatures(async () => ({ ok: true, json: async () => ({ aiFeatures: true }) }));
    renderImport();
    expect(await screen.findByRole('button', { name: /import from iep pdf/i })).toBeInTheDocument();
  });

  it('stays hidden when the availability check fails (fail-closed)', async () => {
    mockFeatures(async () => {
      throw new Error('network down');
    });
    const { container } = renderImport();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden on a non-OK response (fail-closed)', async () => {
    mockFeatures(async () => ({ ok: false, json: async () => ({ error: 'nope' }) }));
    const { container } = renderImport();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
