/**
 * @jest-environment jsdom
 */

/**
 * The profile dropdown showed a "School District" label with nothing under it.
 *
 * `profiles` carries the org twice: legacy free-text (`school_district`,
 * `school_site`) and structured FKs (`district_id`, `school_id`). Every
 * admin-created account writes '' to the text columns and pins the ids in a
 * follow-up UPDATE (see app/api/admin/district/**), so the dropdown — which
 * read the text column — rendered a labelled blank for the entire live
 * provider cohort while `districts.name` sat one join away.
 *
 * These pin the resolution order (structured → legacy → omit the row) and the
 * embed shape, which is the part that silently breaks: PostgREST returns a
 * many-to-one embed as an object, supabase-js's types say array.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import UserProfileDropdown from '@/app/components/navigation/user-profile-dropdown';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

// The row the component's select() resolves to, set per test.
let profileRow: Record<string, unknown> | null = null;

jest.mock('@/lib/supabase/client', () => {
  // The component awaits select().eq().single(); a self-returning chain whose
  // single() resolves the staged row satisfies it.
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.single = async () => ({ data: profileRow, error: null });
  // One stable client — the fetch effect keys on the client's identity, and the
  // real createClient returns a cached singleton.
  const client = {
    auth: { signOut: jest.fn() },
    from: () => chain,
  };
  return { createClient: () => client };
});

const user = { id: 'user-1', email: 'dmunoz@example.org' } as User;

/** The text under a given label, or null if that row is not rendered at all. */
function valueUnderLabel(label: string): string | null {
  const heading = screen.queryByText(label);
  if (!heading) return null;
  return heading.nextElementSibling?.textContent ?? null;
}

/** Render, let the profile fetch land, and open the menu once. */
async function openDropdown() {
  render(<UserProfileDropdown user={user} />);
  const trigger = await screen.findByRole('button', { name: 'User menu' });
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(trigger);
}

describe('UserProfileDropdown — school district name', () => {
  afterEach(() => {
    profileRow = null;
  });

  it('shows the district name from district_id when the legacy text column is blank', async () => {
    // The exact production shape: admin-created provider, ids pinned, text ''.
    profileRow = {
      full_name: 'Danielle Munoz',
      role: 'psychologist',
      school_district: '',
      school_site: 'Carquinez Middle',
      district: { name: 'John Swett Unified' },
      school: { name: 'Carquinez Middle', district: { name: 'John Swett Unified' } },
    };

    await openDropdown();

    expect(valueUnderLabel('School District')).toBe('John Swett Unified');
    expect(valueUnderLabel('School Site')).toBe('Carquinez Middle');
  });

  it('resolves a district through the school when the profile has no district_id', async () => {
    // Teacher accounts get school_id only — no district_id, no text.
    profileRow = {
      full_name: 'Tess Teacher',
      role: 'teacher',
      school_district: '',
      school_site: '',
      district: null,
      school: { name: 'Carquinez Middle', district: { name: 'John Swett Unified' } },
    };

    await openDropdown();

    expect(valueUnderLabel('School District')).toBe('John Swett Unified');
    expect(valueUnderLabel('School Site')).toBe('Carquinez Middle');
  });

  it('falls back to the legacy text column when no structured ids are set', async () => {
    profileRow = {
      full_name: 'Legacy User',
      role: 'resource',
      school_district: 'Hayward Unified',
      school_site: 'Some Elementary',
      district: null,
      school: null,
    };

    await openDropdown();

    expect(valueUnderLabel('School District')).toBe('Hayward Unified');
    expect(valueUnderLabel('School Site')).toBe('Some Elementary');
  });

  it('omits the row entirely rather than rendering a labelled blank', async () => {
    profileRow = {
      full_name: 'No Org',
      role: 'teacher',
      school_district: '   ',
      school_site: '',
      district: null,
      school: null,
    };

    await openDropdown();

    expect(valueUnderLabel('School District')).toBeNull();
    expect(valueUnderLabel('School Site')).toBeNull();
    // The role row still renders, so this is an omitted row, not an empty menu.
    expect(valueUnderLabel('Role')).toBe('teacher');
  });

  it('reads an embed that arrives as an array, not just as an object', async () => {
    // PostgREST sends an object; supabase-js's generated types say array. The
    // component must not depend on winning that argument.
    profileRow = {
      full_name: 'Danielle Munoz',
      role: 'psychologist',
      school_district: '',
      school_site: '',
      district: [{ name: 'John Swett Unified' }],
      school: [{ name: 'Carquinez Middle', district: [{ name: 'John Swett Unified' }] }],
    };

    await openDropdown();

    expect(valueUnderLabel('School District')).toBe('John Swett Unified');
    expect(valueUnderLabel('School Site')).toBe('Carquinez Middle');
  });
});
