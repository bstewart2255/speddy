/**
 * Do two written forms of a STAFF member's name refer to the same person?
 * (SPE-583.)
 *
 * The case that produced this: a provider signs up as "Toni Bentley" while her
 * district's SEIS carries her legal "Antoinette Bentley". An exact comparison
 * calls those two different people, so the roster claim screen pre-selected
 * none of her students and told her the district didn't list her at all.
 *
 * The rule is deliberately narrow: ONE word may differ, the given name, and
 * only into a known nickname. Every other word — middle names and the surname,
 * however many words it runs to — must be identical. No edit distance, no
 * phonetics, no generic prefix rule ("Sam" would fold Samuel into Samantha).
 * A miss costs an unticked checkbox somebody ticks themselves; a wrong hit
 * pre-ticks someone else's student, and a pre-ticked box is exactly the thing
 * people stop reading.
 *
 * Two-surname names are the reason the middle words are held identical rather
 * than skipped: Maria Reyes Garcia and Maria Lopez Garcia share a given name
 * and a final surname and are nonetheless two different people.
 *
 * Not for STUDENT matching. Student identity decides whether two records are
 * one child, and that answer must not turn on a nickname table — SPE-300
 * covers that side, and may reuse `NICKNAME_GROUPS` here rather than growing a
 * second copy, but it needs its own rules around it.
 */

/** Same person, and how confidently we know it. */
export type NameMatchKind = 'exact' | 'nickname';

/**
 * Interchangeable given names, one group per FORMAL name.
 *
 * A group holds one formal name and the short forms people go by, never two
 * formal names — Mary and Maria, Anthony and Antonio, Diana and Diane, Kristina
 * and Kristine are separate people's names, and folding them would pre-tick a
 * colleague's students. Two tests decide the edges. A short form that has since
 * become a name of its own still belongs with its root, because that is exactly
 * the pair this exists for: Gail with Abigail, Sally with Sarah, Wendy with
 * Gwendolyn, Tammy with Tamara. But one name spelled two ways only shares a
 * group where the spellings are not themselves used as separate names —
 * Katherine/Kathryn, Steven/Stephen, Beatrice/Beatriz do; Helen/Helena and
 * Alexandra/Alexandria do not, being names two colleagues might each hold.
 *
 * A short form may appear in SEVERAL groups, and that is the point: "Shelly"
 * belongs to both Michelle and Rochelle, so it reaches either, while Michelle
 * and Rochelle still do not reach each other. The same keeps two formal names
 * apart where one spelling forks — "Toni" sits with Antoinette and with
 * Antonia, so Toni matches both while Antoinette never folds into Antonia.
 *
 * Entries are lowercase and already normalized (unaccented, no punctuation), so
 * they compare directly against `normalizePersonName` output. A starting list
 * of what a district's staff directory actually holds — extend it as real
 * misses turn up rather than trying to be a census.
 */
export const NICKNAME_GROUPS: readonly (readonly string[])[] = [
  // A
  ['abigail', 'abby', 'abbie', 'gail'],
  ['adriana', 'adrianna', 'adri'],
  ['alan', 'allan', 'allen', 'al'],
  ['albert', 'al', 'bert', 'bertie', 'albie'],
  ['alberto', 'beto', 'al'],
  ['alejandra', 'ale', 'alex'],
  ['alejandro', 'ale', 'alex', 'jandro'],
  ['alexander', 'alex', 'alec', 'xander', 'sasha'],
  ['alexandra', 'alex', 'lexi', 'lexie', 'sasha'],
  ['alexandria', 'alex', 'lexi', 'lexie'],
  ['alexis', 'alex', 'lexi', 'lexie'],
  ['alfred', 'al', 'alfie', 'fred'],
  ['alfredo', 'fredo', 'al'],
  ['amanda', 'mandy', 'manda'],
  ['anastasia', 'stacy', 'stacey', 'stasia'],
  ['andrea', 'andi', 'andie'],
  ['andrew', 'andy', 'drew'],
  ['angela', 'angie', 'ang'],
  ['angelica', 'angie', 'angel'],
  ['angelina', 'angie', 'angel', 'lina'],
  ['anthony', 'tony', 'ant'],
  ['antoinette', 'toni', 'netta'],
  ['antonia', 'toni', 'tonia'],
  ['antonio', 'tony', 'tono'],
  ['arthur', 'art', 'artie'],
  // B
  ['barbara', 'barb', 'barbie', 'babs'],
  ['beatrice', 'beatriz', 'bea', 'betty'],
  ['benjamin', 'ben', 'benny', 'benji'],
  ['bernadette', 'bernie'],
  ['bernard', 'bernie', 'barney'],
  // C
  ['calvin', 'cal'],
  ['carlos', 'carlitos'],
  ['caroline', 'carrie', 'carol', 'callie'],
  ['carolyn', 'carrie', 'carol', 'callie'],
  ['cassandra', 'cassie', 'cass', 'sandy'],
  ['cecilia', 'ceci', 'cissy'],
  ['charles', 'charlie', 'charley', 'chuck', 'chas'],
  ['charlotte', 'charlie', 'lottie', 'char'],
  ['cheryl', 'sheryl', 'sher', 'sherry', 'cher'],
  ['christina', 'cristina', 'christy', 'chrissy', 'chris', 'tina'],
  ['christine', 'christy', 'chrissy', 'chris', 'tina'],
  ['christopher', 'chris', 'topher'],
  ['claudia', 'clau'],
  ['concepcion', 'conchita', 'concha', 'connie'],
  ['constance', 'connie'],
  ['consuelo', 'chelo', 'connie'],
  ['curtis', 'curt'],
  // D
  ['daniel', 'dan', 'danny'],
  ['daniela', 'daniella', 'dani'],
  ['danielle', 'dani'],
  ['david', 'dave', 'davey'],
  ['deborah', 'debra', 'deb', 'debbie', 'debby'],
  ['dennis', 'denny', 'den'],
  ['diana', 'di', 'dee'],
  ['diane', 'dianne', 'di'],
  ['dominic', 'dominick', 'domenic', 'dom'],
  ['donald', 'don', 'donnie'],
  ['dorothy', 'dot', 'dottie', 'dolly', 'dora'],
  ['douglas', 'doug'],
  // E
  ['eduardo', 'lalo', 'eddie'],
  ['edward', 'ed', 'eddie', 'ted', 'teddy', 'ned'],
  ['eleanor', 'ellie', 'nell', 'nellie', 'elle'],
  ['elena', 'ellie', 'lena'],
  ['elizabeth', 'liz', 'lizzy', 'lizzie', 'beth', 'betsy', 'betty', 'eliza', 'libby'],
  ['ellen', 'ellie', 'nell', 'nellie'],
  ['emmanuel', 'manny'],
  ['ernest', 'ernie'],
  ['eugene', 'gene'],
  // F
  ['frances', 'fran', 'francie', 'frankie'],
  ['francis', 'frank', 'frankie', 'fran'],
  ['francisco', 'paco', 'pancho', 'cisco'],
  ['frederick', 'frederic', 'fred', 'freddy', 'freddie'],
  // G
  ['gabriel', 'gabe'],
  ['gabriela', 'gabriella', 'gaby', 'gabby'],
  ['gabrielle', 'gaby', 'gabby', 'brielle'],
  ['george', 'georgie', 'geo'],
  ['georgia', 'georgie'],
  ['georgina', 'georgie', 'gina'],
  ['gerald', 'gerry', 'jerry'],
  ['graciela', 'chela', 'gracie'],
  ['gregory', 'greg', 'gregg'],
  ['guadalupe', 'lupe', 'lupita'],
  ['guillermo', 'memo'],
  ['gwendolyn', 'gwen', 'wendy'],
  // H
  ['harold', 'harry', 'hal'],
  ['helen', 'nell', 'nellie'],
  ['helena', 'lena'],
  ['henry', 'hank', 'harry', 'hal'],
  ['herbert', 'herb', 'bert'],
  ['howard', 'howie'],
  // I
  ['ignacio', 'nacho'],
  ['isabel', 'isabelle', 'bella', 'belle', 'izzy'],
  ['isabella', 'bella', 'belle', 'izzy'],
  // J
  ['jacob', 'jake', 'jakey'],
  ['james', 'jim', 'jimmy', 'jamie'],
  ['jeffrey', 'jeffery', 'jeff'],
  ['jennifer', 'jen', 'jenn', 'jenny', 'jennie'],
  ['jerome', 'jerry'],
  ['jessica', 'jess', 'jessie'],
  ['jesus', 'chuy'],
  ['john', 'johnny', 'johnnie', 'jack', 'jon'],
  ['jonathan', 'jon', 'jonny', 'johnny'],
  ['jose', 'pepe'],
  ['joseph', 'joe', 'joey'],
  ['josephine', 'jo', 'josie', 'joey'],
  ['joshua', 'josh'],
  ['juan', 'juanito'],
  ['julia', 'julie', 'jules'],
  ['juliana', 'julie', 'juli'],
  ['julianne', 'julie', 'juli'],
  ['julian', 'jules'],
  // K
  ['katherine', 'kathryn', 'catherine', 'kathy', 'cathy', 'kate', 'katie', 'kat', 'kay'],
  ['kenneth', 'ken', 'kenny'],
  ['kimberly', 'kim', 'kimmy'],
  ['kristen', 'kristin', 'kris', 'krissy'],
  ['kristina', 'kris', 'krissy', 'tina'],
  ['kristine', 'kris', 'krissy', 'tina'],
  // L
  ['laura', 'laurie', 'lori', 'lolly'],
  ['lauren', 'laurie'],
  ['lawrence', 'laurence', 'larry'],
  ['leonard', 'leo', 'len', 'lenny'],
  ['leonardo', 'leo', 'nardo'],
  ['leticia', 'letty', 'lety', 'leti'],
  ['linda', 'lynda', 'lin', 'lindy'],
  ['lourdes', 'lulu', 'lou'],
  ['lucia', 'lucy', 'luci'],
  ['lucille', 'lucy', 'lucie'],
  // M
  ['magdalena', 'magda', 'lena', 'maggie'],
  ['manuel', 'manny'],
  ['marcus', 'marc'],
  ['margaret', 'maggie', 'marge', 'margie', 'peggy', 'meg'],
  ['maria', 'mari', 'marita'],
  ['marisol', 'mari', 'sol'],
  ['mark', 'marc', 'marky'],
  ['martha', 'marty', 'mattie'],
  ['martin', 'marty'],
  ['mary', 'molly', 'mae'],
  ['matthew', 'matt', 'matty'],
  ['maureen', 'mo'],
  ['melanie', 'mel'],
  ['melissa', 'mel', 'missy', 'lissa'],
  ['michael', 'mike', 'mikey', 'micky', 'mick'],
  ['michelle', 'shelly', 'shelley'],
  ['monica', 'moni', 'mona'],
  // N
  ['nancy', 'nan', 'nance'],
  ['natalie', 'nat', 'nattie'],
  ['nathan', 'nate', 'nat'],
  ['nathaniel', 'nate', 'nat'],
  ['nicholas', 'nick', 'nicky', 'nico'],
  ['nicole', 'nikki', 'nicki'],
  ['norman', 'norm'],
  // O
  ['oliver', 'ollie'],
  ['olivia', 'liv', 'livvy'],
  // P
  ['pamela', 'pam', 'pammy'],
  ['patricia', 'pat', 'patty', 'patti', 'tricia', 'trish', 'trisha'],
  ['patrick', 'pat', 'paddy'],
  ['paul', 'pauly'],
  ['paula', 'polly'],
  ['pauline', 'polly'],
  ['peter', 'pete', 'petey'],
  ['philip', 'phillip', 'phil'],
  ['phyllis', 'phyl'],
  ['priscilla', 'cilla', 'prissy'],
  // R
  ['ramona', 'mona'],
  ['randall', 'randy', 'rand'],
  ['raymond', 'ray'],
  ['rebecca', 'becca', 'becky', 'beck'],
  ['regina', 'gina', 'reggie'],
  ['richard', 'rich', 'richie', 'rick', 'ricky', 'dick'],
  ['robert', 'rob', 'robbie', 'bob', 'bobby'],
  ['roberto', 'beto'],
  ['rochelle', 'shelly', 'shelley', 'chelle'],
  ['rocio', 'chio'],
  ['roger', 'rodge'],
  ['roland', 'rollie'],
  ['ronald', 'ron', 'ronnie'],
  ['rosa', 'rosie', 'rosita'],
  ['rosemary', 'rose', 'rosie'],
  ['russell', 'russ', 'rusty'],
  ['ruth', 'ruthie'],
  // S
  ['salvador', 'sal', 'chava'],
  ['salvatore', 'sal', 'tore'],
  ['samantha', 'sam', 'sammy'],
  ['samuel', 'sam', 'sammy'],
  ['sandra', 'sandy', 'sandi'],
  ['sarah', 'sara', 'sadie', 'sally'],
  ['scott', 'scotty'],
  ['sean', 'shawn', 'shaun'],
  ['sharon', 'shari', 'shary'],
  ['shirley', 'shirl'],
  ['silvia', 'sylvia', 'sil', 'syl'],
  ['socorro', 'coco', 'soco'],
  ['stanley', 'stan'],
  ['stephanie', 'steph', 'steffi', 'stevie'],
  ['steven', 'stephen', 'steve', 'stevie'],
  ['susan', 'sue', 'susie', 'suzie', 'suzy'],
  ['susanna', 'susannah', 'sue', 'suzy'],
  ['suzanne', 'sue', 'suzy', 'suzi'],
  // T
  ['tammy', 'tamara', 'tami', 'tam'],
  ['teresa', 'theresa', 'terri', 'terry', 'tess', 'tessa'],
  ['terrence', 'terence', 'terry'],
  ['theodore', 'ted', 'teddy', 'theo'],
  ['thomas', 'tom', 'tommy'],
  ['tiffany', 'tiffani', 'tiff'],
  ['timothy', 'tim', 'timmy'],
  ['tracy', 'tracey', 'traci'],
  // V
  ['valerie', 'val'],
  ['veronica', 'ronnie', 'roni', 'vero'],
  ['victoria', 'vicky', 'vicki', 'vickie', 'tori', 'vic'],
  ['vincent', 'vince', 'vinny', 'vin'],
  ['virginia', 'ginny', 'ginger', 'gina'],
  // W
  ['walter', 'walt', 'wally'],
  ['william', 'will', 'willie', 'bill', 'billy'],
  // X, Y, Z
  ['ximena', 'jimena', 'xime'],
  ['yesenia', 'yesi'],
  ['yolanda', 'yoli', 'yolie'],
  ['zachary', 'zach', 'zack', 'zak'],
];

/** given name -> every group it belongs to, built once. */
const GROUPS_BY_NAME: ReadonlyMap<string, readonly number[]> = (() => {
  const index = new Map<string, number[]>();
  NICKNAME_GROUPS.forEach((group, i) => {
    for (const name of group) {
      const existing = index.get(name);
      if (existing) existing.push(i);
      else index.set(name, [i]);
    }
  });
  return index;
})();

/**
 * Text key for comparing two written names.
 *
 * Accents are folded because the table is unaccented and because one system
 * carrying "Martinez" where another carries "Martínez" is a transcription
 * difference, not a different surname. Apostrophes are the same kind of noise:
 * the pilot district's SEIS writes "Charli OMalley" where Speddy has "Charli
 * O'Malley", in both the straight and curly forms, since exports use either.
 */
export function normalizePersonName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019.,]/g, '')
    // Trim LAST: stripping a leading or trailing "." would otherwise leave an
    // edge space behind, and "Cynthia Reyes ." would stop matching "Cynthia
    // Reyes".
    .replace(/\s+/g, ' ')
    .trim();
}

/** A middle word that is just an initial, e.g. the "M" in "Antoinette M Bentley". */
const isInitial = (word: string): boolean => word.length === 1;

/**
 * The middle words to compare, once an initial that only ONE side carries is
 * discounted.
 *
 * Dropping initials unilaterally would be a bug: "Antoinette M Bentley" and
 * "Antoinette Q Bentley" are two people, and discarding both initials makes
 * them one. So an initial is ignored only where the other side has no middle
 * word at all — where both sides have one, they must agree.
 */
const comparableMiddles = (a: string[], b: string[]): [string[], string[]] => {
  if (a.length === 0 && b.every(isInitial)) return [a, []];
  if (b.length === 0 && a.every(isInitial)) return [[], b];
  return [a, b];
};

/** True when two given names are the same name written two ways. */
function givenNamesEquivalent(a: string, b: string): boolean {
  if (a === b) return a !== '';
  const aGroups = GROUPS_BY_NAME.get(a);
  if (!aGroups) return false;
  const bGroups = GROUPS_BY_NAME.get(b);
  if (!bGroups) return false;
  return aGroups.some((g) => bGroups.includes(g));
}

/**
 * Compare two people's full names.
 *
 * `'exact'` — the same person under the same given name: identical once
 * accents, case, punctuation and spacing are folded, allowing for a middle
 * INITIAL one side carries and the other doesn't. No guessing is involved, so
 * callers can trust this anywhere.
 *
 * `'nickname'` — everything matches except the given name, which is a known
 * nickname of the other. This one is a judgement, and callers gate on it.
 *
 * Either way every other word must be identical: a spelled middle name is NOT
 * skipped, so "Maria Reyes Garcia" stays apart from "Maria Lopez Garcia", and a
 * differing final word never matches, which keeps "Reyes-Smith" apart from
 * "Reyes" and a reversed "Reyes Cynthia" apart from "Cynthia Reyes". Both sides
 * need at least two words — one bare word says too little to fold.
 *
 * `null` — treat them as different people.
 */
export function matchPersonNames(
  a: string | null | undefined,
  b: string | null | undefined,
): NameMatchKind | null {
  const aKey = normalizePersonName(a);
  const bKey = normalizePersonName(b);
  if (aKey === '' || bKey === '') return null;
  if (aKey === bKey) return 'exact';

  const aWords = aKey.split(' ');
  const bWords = bKey.split(' ');
  if (aWords.length < 2 || bWords.length < 2) return null;
  if (aWords[aWords.length - 1] !== bWords[bWords.length - 1]) return null;

  const [aMiddle, bMiddle] = comparableMiddles(aWords.slice(1, -1), bWords.slice(1, -1));
  if (aMiddle.length !== bMiddle.length) return null;
  if (aMiddle.some((word, i) => word !== bMiddle[i])) return null;

  if (aWords[0] === bWords[0]) return 'exact';
  return givenNamesEquivalent(aWords[0], bWords[0]) ? 'nickname' : null;
}
