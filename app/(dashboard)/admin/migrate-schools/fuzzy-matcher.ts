import { SupabaseClient } from '@supabase/supabase-js';

export interface SchoolMatch {
  school_id: string;
  school_name: string;
  district_id: string;
  district_name: string;
  state_id: string;
  state_name: string;
  confidence_score: number;
  match_reason: string;
}

// Common abbreviations and variations in school names
const ABBREVIATIONS: Record<string, string[]> = {
  'elementary': ['elem', 'el', 'es'],
  'middle': ['mid', 'ms', 'jr', 'junior'],
  'high': ['hs', 'sr', 'senior'],
  'school': ['sch', 'schl'],
  'academy': ['acad'],
  'preparatory': ['prep'],
  'saint': ['st', 'st.'],
  'mount': ['mt', 'mt.'],
  'north': ['n', 'no'],
  'south': ['s', 'so'],
  'east': ['e'],
  'west': ['w'],
  'public': ['pub'],
  'district': ['dist'],
  'independent': ['ind', 'isd'],
  'unified': ['usd', 'unif'],
  'consolidated': ['cons', 'csd'],
  'community': ['comm', 'com'],
  'regional': ['reg', 'regional'],
  'vocational': ['voc', 'vo-tech', 'votech'],
  'technical': ['tech', 'technical'],
  'center': ['ctr', 'cntr'],
  'central': ['ctrl', 'cent']
};

// Levenshtein distance for string similarity
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

// Calculate similarity score between 0 and 1
function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

// Normalize school names for comparison
function normalizeSchoolName(name: string): string {
  if (!name) return '';
  
  let normalized = name.toLowerCase().trim();
  
  // Remove common words
  const removeWords = ['the', 'of', 'and', '&'];
  removeWords.forEach(word => {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
  });
  
  // Remove punctuation
  normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

// Expand abbreviations in text
function expandAbbreviations(text: string): string[] {
  const variations = [text];
  const lowerText = text.toLowerCase();
  
  Object.entries(ABBREVIATIONS).forEach(([full, abbrevs]) => {
    abbrevs.forEach(abbrev => {
      // Check if abbreviation exists as a whole word
      const abbrevRegex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      if (abbrevRegex.test(lowerText)) {
        variations.push(text.replace(abbrevRegex, full));
      }
      
      // Check if full word exists
      const fullRegex = new RegExp(`\\b${full}\\b`, 'gi');
      if (fullRegex.test(lowerText)) {
        abbrevs.forEach(a => {
          variations.push(text.replace(fullRegex, a));
        });
      }
    });
  });
  
  return [...new Set(variations)];
}

// Tokenize school name into meaningful parts
function tokenizeSchoolName(name: string): string[] {
  const normalized = normalizeSchoolName(name);
  return normalized.split(' ').filter(token => token.length > 2);
}

// Calculate token overlap score
function calculateTokenOverlap(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  let matches = 0;
  const usedTokens2 = new Set<number>();
  
  tokens1.forEach(token1 => {
    tokens2.forEach((token2, idx) => {
      if (!usedTokens2.has(idx)) {
        const similarity = calculateSimilarity(token1, token2);
        if (similarity > 0.8) {
          matches++;
          usedTokens2.add(idx);
        }
      }
    });
  });
  
  return matches / Math.max(tokens1.length, tokens2.length);
}

export async function fuzzyMatchSchool(
  supabase: SupabaseClient,
  schoolSite: string,
  schoolDistrict: string,
  stateId?: string
): Promise<SchoolMatch[]> {
  if (!schoolSite || !schoolDistrict) {
    return [];
  }

  // Get all schools (optionally filtered by state)
  let query = supabase
    .from('schools')
    .select(`
      id,
      name,
      district_id,
      districts!inner(
        id,
        name,
        state_id,
        states!inner(
          id,
          name
        )
      )
    `);

  if (stateId) {
    query = query.eq('districts.state_id', stateId);
  }

  const { data: schools, error } = await query;

  if (error || !schools) {
    console.error('Error fetching schools:', error);
    return [];
  }

  const matches: SchoolMatch[] = [];
  
  // Generate variations of input school name
  const schoolVariations = expandAbbreviations(schoolSite);
  const districtVariations = expandAbbreviations(schoolDistrict);
  
  // Tokenize input
  const schoolTokens = tokenizeSchoolName(schoolSite);
  const districtTokens = tokenizeSchoolName(schoolDistrict);

  schools.forEach((school: any) => {
    const district = school.districts;
    const state = district.states;
    
    let bestSchoolScore = 0;
    let bestDistrictScore = 0;
    let matchReason = '';

    // Check exact matches first
    const normalizedSchoolSite = normalizeSchoolName(schoolSite);
    const normalizedSchoolName = normalizeSchoolName(school.name);
    const normalizedDistrict = normalizeSchoolName(schoolDistrict);
    const normalizedDistrictName = normalizeSchoolName(district.name);

    if (normalizedSchoolSite === normalizedSchoolName) {
      bestSchoolScore = 1.0;
      matchReason = 'Exact school name match';
    } else {
      // Try variations
      schoolVariations.forEach(variation => {
        const score = calculateSimilarity(
          normalizeSchoolName(variation),
          normalizedSchoolName
        );
        if (score > bestSchoolScore) {
          bestSchoolScore = score;
          matchReason = `School name similarity (${variation})`;
        }
      });

      // Token overlap
      const schoolDbTokens = tokenizeSchoolName(school.name);
      const tokenScore = calculateTokenOverlap(schoolTokens, schoolDbTokens);
      if (tokenScore > bestSchoolScore) {
        bestSchoolScore = tokenScore;
        matchReason = 'School name token overlap';
      }
    }

    // District matching
    if (normalizedDistrict === normalizedDistrictName) {
      bestDistrictScore = 1.0;
    } else {
      districtVariations.forEach(variation => {
        const score = calculateSimilarity(
          normalizeSchoolName(variation),
          normalizedDistrictName
        );
        if (score > bestDistrictScore) {
          bestDistrictScore = score;
        }
      });

      // Token overlap for district
      const districtDbTokens = tokenizeSchoolName(district.name);
      const districtTokenScore = calculateTokenOverlap(districtTokens, districtDbTokens);
      if (districtTokenScore > bestDistrictScore) {
        bestDistrictScore = districtTokenScore;
      }
    }

    // Calculate combined confidence score
    // Weight school name match more heavily than district
    const confidenceScore = (bestSchoolScore * 0.7) + (bestDistrictScore * 0.3);

    // Only include matches above threshold
    if (confidenceScore >= 0.6) {
      matches.push({
        school_id: school.id,
        school_name: school.name,
        district_id: district.id,
        district_name: district.name,
        state_id: state.id,
        state_name: state.name,
        confidence_score: confidenceScore,
        match_reason: matchReason || 'Combined name and district match'
      });
    }
  });

  // Sort by confidence score
  matches.sort((a, b) => b.confidence_score - a.confidence_score);

  // Return top 10 matches
  return matches.slice(0, 10);
}

// Batch matching for multiple users
export async function batchFuzzyMatch(
  supabase: SupabaseClient,
  users: Array<{ id: string; school_site: string; school_district: string }>,
  confidenceThreshold: number = 0.95
): Promise<Map<string, SchoolMatch[]>> {
  const results = new Map<string, SchoolMatch[]>();

  // Process in batches to avoid overwhelming the database
  const batchSize = 10;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (user) => {
        const matches = await fuzzyMatchSchool(
          supabase,
          user.school_site,
          user.school_district
        );
        
        // Filter by confidence threshold
        const filteredMatches = matches.filter(
          m => m.confidence_score >= confidenceThreshold
        );
        
        results.set(user.id, filteredMatches);
      })
    );
  }

  return results;
}