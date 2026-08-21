/**
 * SPE-583 · folding one person's two written names together.
 *
 * The bar here is asymmetric on purpose: missing a real nickname costs a
 * checkbox somebody ticks by hand, while folding two DIFFERENT people together
 * pre-ticks a student who isn't theirs. Most of these cases are the second
 * kind — the things that must NOT match.
 *
 * All names are fictional.
 */

import {
  NICKNAME_GROUPS,
  matchPersonNames,
  normalizePersonName,
  personIdentityKey,
} from '@/lib/utils/person-name-match';

describe('normalizePersonName', () => {
  it('folds case, punctuation and spacing', () => {
    expect(normalizePersonName('  Cynthia   REYES ')).toBe('cynthia reyes');
    expect(normalizePersonName('Charli O’Malley')).toBe('charli omalley');
    expect(normalizePersonName("Charli O'Malley")).toBe('charli omalley');
    expect(normalizePersonName('Reyes, Cynthia')).toBe('reyes cynthia');
  });

  it('is empty for nothing at all', () => {
    expect(normalizePersonName(null)).toBe('');
    expect(normalizePersonName(undefined)).toBe('');
    expect(normalizePersonName('   ')).toBe('');
  });
});

describe('personIdentityKey', () => {
  it('gives one key per person, dropping only a middle INITIAL', () => {
    expect(personIdentityKey('Antoinette M Bentley')).toBe(personIdentityKey('Antoinette Bentley'));
    expect(personIdentityKey('Antoinette M. Bentley')).toBe('antoinette bentley');
  });

  it('keeps a spelled middle name, so two-surname names stay distinct', () => {
    expect(personIdentityKey('Maria Reyes Garcia')).not.toBe(personIdentityKey('Maria Lopez Garcia'));
    expect(personIdentityKey('Maria Reyes Garcia')).toBe('maria reyes garcia');
  });

  it('does not fold a nickname — this counts people, it does not match them', () => {
    expect(personIdentityKey('Toni Bentley')).not.toBe(personIdentityKey('Antoinette Bentley'));
  });
});

describe('matchPersonNames', () => {
  describe('exact', () => {
    it('matches through case, punctuation and spacing', () => {
      expect(matchPersonNames('Cynthia Reyes', '  cynthia   reyes ')).toBe('exact');
      expect(matchPersonNames('Charli OMalley', "Charli O'Malley")).toBe('exact');
      expect(matchPersonNames('Charli O’Malley', "Charli O'Malley")).toBe('exact');
    });

    it('never matches when either side is blank', () => {
      expect(matchPersonNames('', 'Cynthia Reyes')).toBeNull();
      expect(matchPersonNames('Cynthia Reyes', null)).toBeNull();
      expect(matchPersonNames(null, undefined)).toBeNull();
    });
  });

  describe('nickname', () => {
    it('folds the case that produced this — Toni is Antoinette', () => {
      expect(matchPersonNames('Antoinette Bentley', 'Toni Bentley')).toBe('nickname');
      expect(matchPersonNames('Toni Bentley', 'Antoinette Bentley')).toBe('nickname');
    });

    it('folds other everyday nicknames in both directions', () => {
      const pairs: [string, string][] = [
        ['Robert Nakamura', 'Bob Nakamura'],
        ['Bill Okonkwo', 'William Okonkwo'],
        ['Kathy Villareal', 'Katherine Villareal'],
        ['Margaret Osei', 'Peggy Osei'],
        ['Jose Ferrante', 'Pepe Ferrante'],
      ];
      for (const [a, b] of pairs) {
        expect(matchPersonNames(a, b)).toBe('nickname');
        expect(matchPersonNames(b, a)).toBe('nickname');
      }
    });

    it('ignores a middle INITIAL on either side', () => {
      expect(matchPersonNames('Antoinette M Bentley', 'Toni Bentley')).toBe('nickname');
      expect(matchPersonNames('Antoinette Bentley', 'Toni M. Bentley')).toBe('nickname');
      // Same person either way, so an inconsistent initial still folds.
      expect(matchPersonNames('Antoinette M Bentley', 'Antoinette Bentley')).toBe('nickname');
    });

    it('folds accents, which the district writes and Speddy may not', () => {
      expect(matchPersonNames('Guadalupe Mart\u00ednez', 'Lupe Martinez')).toBe('nickname');
      expect(matchPersonNames('M\u00f3nica Nu\u00f1ez', 'Mona Nunez')).toBe('nickname');
      expect(matchPersonNames('Jos\u00e9 Ferrante', 'Jose Ferrante')).toBe('exact');
    });

    it('reports an identical name as exact, not as a nickname fold', () => {
      // The caller gates on this: 'exact' is trusted anywhere, 'nickname' only
      // where nothing matched exactly.
      expect(matchPersonNames('Toni Bentley', 'Toni Bentley')).toBe('exact');
    });
  });

  describe('what must NOT fold', () => {
    it('refuses a different last name, however close', () => {
      expect(matchPersonNames('Toni Bentley', 'Antoinette Bently')).toBeNull();
      expect(matchPersonNames('Toni Bentley', 'Antoinette Bentley-Ruiz')).toBeNull();
      expect(matchPersonNames('Cynthia Reyes', 'Cynthia Reyes-Smith')).toBeNull();
    });

    it('refuses a reversed "Last First" spelling', () => {
      // SEIS exports vary; a comma is stripped, so this is the shape that
      // reaches here. Both words are hers and it still must not match — the
      // guard is that folding it would also match a genuine "Reyes Cynthia".
      expect(matchPersonNames('Reyes, Cynthia', 'Cynthia Reyes')).toBeNull();
      expect(matchPersonNames('Bentley Antoinette', 'Toni Bentley')).toBeNull();
    });

    it('refuses a bare single name on either side', () => {
      expect(matchPersonNames('Antoinette', 'Toni Bentley')).toBeNull();
      expect(matchPersonNames('Bentley', 'Toni Bentley')).toBeNull();
      expect(matchPersonNames('Toni', 'Antoinette')).toBeNull();
    });

    it('refuses two first names that merely share a group MEMBER', () => {
      expect(matchPersonNames('Antoinette Bentley', 'Antonio Bentley')).toBeNull();
      expect(matchPersonNames('Antoinette Bentley', 'Anthony Bentley')).toBeNull();
      // "Shelly" is in both the Michelle and Rochelle groups, so it reaches
      // either, while the two formal names still do not reach each other.
      expect(matchPersonNames('Shelly Okafor', 'Michelle Okafor')).toBe('nickname');
      expect(matchPersonNames('Shelly Okafor', 'Rochelle Okafor')).toBe('nickname');
      expect(matchPersonNames('Michelle Okafor', 'Rochelle Okafor')).toBeNull();
    });

    it('refuses a prefix that is not in the table', () => {
      // No generic prefix rule: it would fold Samuel into Samantha.
      expect(matchPersonNames('Samuel Ferrante', 'Samantha Ferrante')).toBeNull();
      expect(matchPersonNames('Christopher Ferrante', 'Christine Ferrante')).toBeNull();
    });

    it('refuses two unrelated first names under one last name', () => {
      expect(matchPersonNames('Cynthia Reyes', 'Marcus Reyes')).toBeNull();
      expect(matchPersonNames('Toni Bentley', 'Priya Bentley')).toBeNull();
    });

    it('refuses two-surname names that differ in the FIRST surname', () => {
      // Maria Reyes Garcia and Maria Lopez Garcia share a given name and a
      // final surname and are two different people. Skipping the middle word
      // the way a middle initial is skipped would hand one of them the
      // other's caseload.
      expect(matchPersonNames('Maria Reyes Garcia', 'Maria Lopez Garcia')).toBeNull();
      expect(matchPersonNames('Lupe Reyes Garcia', 'Guadalupe Lopez Garcia')).toBeNull();
      // ...and a dropped surname is not a fold either, in either direction.
      expect(matchPersonNames('Maria Garcia', 'Maria Reyes Garcia')).toBeNull();
      expect(matchPersonNames('Maria Reyes Garcia', 'Maria Garcia')).toBeNull();
    });

    it('folds a nickname across a two-surname name that agrees throughout', () => {
      expect(matchPersonNames('Guadalupe Reyes Garcia', 'Lupe Reyes Garcia')).toBe('nickname');
    });

    it('refuses two FORMAL names that merely share a short form', () => {
      // Each group holds one formal name. "Tony" reaches Anthony and Antonio,
      // "Toni" reaches Antoinette and Antonia, but no two formal names meet.
      expect(matchPersonNames('Anthony Bentley', 'Antonio Bentley')).toBeNull();
      expect(matchPersonNames('Antoinette Bentley', 'Antonia Bentley')).toBeNull();
      expect(matchPersonNames('Mary Okonkwo', 'Maria Okonkwo')).toBeNull();
      expect(matchPersonNames('Diana Okonkwo', 'Diane Okonkwo')).toBeNull();
      expect(matchPersonNames('Mark Okonkwo', 'Marcus Okonkwo')).toBeNull();
      // ...while the short form still reaches each of them.
      expect(matchPersonNames('Tony Bentley', 'Anthony Bentley')).toBe('nickname');
      expect(matchPersonNames('Tony Bentley', 'Antonio Bentley')).toBe('nickname');
    });
  });

  describe('the table itself', () => {
    it('is lowercase and punctuation-free, so it can be compared directly', () => {
      for (const group of NICKNAME_GROUPS) {
        for (const name of group) {
          expect(name).toBe(normalizePersonName(name));
        }
      }
    });

    it('has no duplicate entry inside a group, and no group under two entries', () => {
      for (const group of NICKNAME_GROUPS) {
        expect(new Set(group).size).toBe(group.length);
        expect(group.length).toBeGreaterThan(1);
      }
      const roots = NICKNAME_GROUPS.map((g) => g[0]);
      expect(new Set(roots).size).toBe(roots.length);
    });
  });
});
