/**
 * Chrome Extension Compare API
 * Compares SEIS data to Speddy data, returns discrepancies without writing
 * Used for passive background checking
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

// Verify an API key against its bcrypt hash
async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

// Types for incoming SEIS data
interface SEISStudentData {
  seisId: string;
  ssid?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  grade?: string;
  school?: string;
  caseManager?: string;
  futureIepDate?: string;
  currentIepDate?: string;
  goals?: Array<{
    areaOfNeed: string;
    goalText: string;
    category?: string;
  }>;
  services?: Array<{
    code: string;
    name: string;
    startDate: string;
    endDate: string;
    minutesPerSession: number;
    sessionsPerPeriod: number;
    frequency: string;
    totalMinutes: number;
    provider?: string;
  }>;
  accommodations?: Array<{
    description: string;
    startDate: string;
    endDate: string;
    location: string;
  }>;
}

interface ComparePayload {
  student: SEISStudentData;
}

interface Discrepancies {
  goals?: {
    seisCount: number;
    speddyCount: number;
    hasDifferences: boolean;
  };
  services?: {
    seisMinutesPerWeek: number;
    speddyMinutesPerWeek: number;
    hasDifferences: boolean;
  };
  iepDate?: {
    seis: string | null;
    speddy: string | null;
    hasDifferences: boolean;
  };
  accommodations?: {
    seisCount: number;
    speddyCount: number;
    hasDifferences: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Extract API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7);

    // Validate API key format
    if (!apiKey.startsWith('sk_live_')) {
      return NextResponse.json(
        { error: 'Invalid API key format' },
        { status: 401 }
      );
    }

    // Extract prefix for lookup
    const keyPrefix = apiKey.substring(0, 16);

    // Create Supabase service client
    const supabase = createServiceClient();

    // Look up candidate API keys by prefix
    const { data: candidateKeys, error: keyError } = await supabase
      .from('api_keys')
      .select('id, user_id, key_hash, revoked_at')
      .eq('key_prefix', keyPrefix)
      .is('revoked_at', null);

    if (keyError) {
      console.error('Error looking up API key:', keyError);
      return NextResponse.json(
        { error: 'Failed to validate API key' },
        { status: 500 }
      );
    }

    // Find matching key using bcrypt compare
    let apiKeyRecord: { id: string; user_id: string } | null = null;
    for (const candidate of candidateKeys || []) {
      const isMatch = await verifyApiKey(apiKey, candidate.key_hash);
      if (isMatch) {
        apiKeyRecord = { id: candidate.id, user_id: candidate.user_id };
        break;
      }
    }

    if (!apiKeyRecord) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const userId = apiKeyRecord.user_id;

    // Parse the request body
    let payload: ComparePayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    if (!payload.student) {
      return NextResponse.json(
        { error: 'Invalid payload: student object required' },
        { status: 400 }
      );
    }

    const seisStudent = payload.student;

    // Get user's existing students for matching
    const { data: dbStudents, error: studentsError } = await supabase
      .from('students')
      .select('id, initials, grade_level, school_site, sessions_per_week, minutes_per_session')
      .eq('provider_id', userId);

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
      return NextResponse.json(
        { error: 'Failed to fetch existing students' },
        { status: 500 }
      );
    }

    // Get student details for name matching
    const studentIds = dbStudents?.map(s => s.id) || [];

    let studentDetails: Array<{
      student_id: string;
      first_name: string | null;
      last_name: string | null;
      iep_goals: string[] | null;
      accommodations: string[] | null;
      upcoming_iep_date: string | null;
    }> | null = null;

    if (studentIds.length > 0) {
      const { data } = await supabase
        .from('student_details')
        .select('student_id, first_name, last_name, iep_goals, accommodations, upcoming_iep_date')
        .in('student_id', studentIds);
      studentDetails = data;
    }

    // Try to match to existing student
    const matchedStudent = findMatchingStudent(
      seisStudent,
      dbStudents || [],
      studentDetails || []
    );

    if (!matchedStudent) {
      return NextResponse.json({
        matched: false,
        speddyStudent: null,
        discrepancies: null,
        message: 'No matching student found in Speddy',
      });
    }

    // Get existing details for this student
    const existingDetails = studentDetails?.find(
      d => d.student_id === matchedStudent.id
    );

    // Calculate discrepancies
    const discrepancies: Discrepancies = {};

    // Compare goals
    if (seisStudent.goals) {
      const seisGoalsCount = seisStudent.goals.length;
      const speddyGoalsCount = existingDetails?.iep_goals?.length || 0;
      discrepancies.goals = {
        seisCount: seisGoalsCount,
        speddyCount: speddyGoalsCount,
        hasDifferences: seisGoalsCount !== speddyGoalsCount,
      };
    }

    // Compare services (calculate total weekly minutes)
    if (seisStudent.services && seisStudent.services.length > 0) {
      const seisMinutesPerWeek = seisStudent.services
        .filter(s => s.frequency === 'Weekly')
        .reduce((sum, s) => sum + (s.minutesPerSession * s.sessionsPerPeriod), 0);

      const speddyMinutesPerWeek =
        (matchedStudent.sessions_per_week || 0) * (matchedStudent.minutes_per_session || 0);

      discrepancies.services = {
        seisMinutesPerWeek,
        speddyMinutesPerWeek,
        hasDifferences: seisMinutesPerWeek !== speddyMinutesPerWeek,
      };
    }

    // Compare IEP date
    if (seisStudent.futureIepDate) {
      const seisIepDate = seisStudent.futureIepDate;
      const speddyIepDate = existingDetails?.upcoming_iep_date || null;

      discrepancies.iepDate = {
        seis: seisIepDate,
        speddy: speddyIepDate,
        hasDifferences: seisIepDate !== speddyIepDate,
      };
    }

    // Compare accommodations
    if (seisStudent.accommodations) {
      const seisAccommodationsCount = seisStudent.accommodations.length;
      const speddyAccommodationsCount = existingDetails?.accommodations?.length || 0;
      discrepancies.accommodations = {
        seisCount: seisAccommodationsCount,
        speddyCount: speddyAccommodationsCount,
        hasDifferences: seisAccommodationsCount !== speddyAccommodationsCount,
      };
    }

    // Check if there are any discrepancies
    const hasAnyDiscrepancy = Object.values(discrepancies).some(d => d?.hasDifferences);

    return NextResponse.json({
      matched: true,
      speddyStudent: {
        id: matchedStudent.id,
        initials: matchedStudent.initials,
        grade: matchedStudent.grade_level,
        school: matchedStudent.school_site,
      },
      discrepancies,
      hasDiscrepancies: hasAnyDiscrepancy,
    });
  } catch (error) {
    console.error('Extension compare error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to match SEIS student to database student (same as import)
function findMatchingStudent(
  seisStudent: SEISStudentData,
  dbStudents: Array<{ id: string; initials: string; grade_level: string; school_site: string | null; sessions_per_week: number | null; minutes_per_session: number | null }>,
  studentDetails: Array<{ student_id: string; first_name: string | null; last_name: string | null }>
): { id: string; initials: string; grade_level: string; school_site: string | null; sessions_per_week: number | null; minutes_per_session: number | null } | null {
  // Extract first and last name from SEIS data
  const seisFirstName = seisStudent.firstName?.toLowerCase().trim();
  const seisLastName = seisStudent.lastName?.toLowerCase().trim();

  // If we have a full name but not first/last, try to split it
  let firstName = seisFirstName;
  let lastName = seisLastName;

  if (!firstName && !lastName && seisStudent.name) {
    const nameParts = seisStudent.name.split(/[,\s]+/).filter(Boolean);
    if (nameParts.length >= 2) {
      if (seisStudent.name.includes(',')) {
        lastName = nameParts[0].toLowerCase();
        firstName = nameParts[1].toLowerCase();
      } else {
        firstName = nameParts[0].toLowerCase();
        lastName = nameParts[nameParts.length - 1].toLowerCase();
      }
    }
  }

  // Try to match by name
  for (const dbStudent of dbStudents) {
    const details = studentDetails.find(d => d.student_id === dbStudent.id);

    if (details?.first_name && details?.last_name) {
      const dbFirstName = details.first_name.toLowerCase().trim();
      const dbLastName = details.last_name.toLowerCase().trim();

      // Exact name match
      if (firstName === dbFirstName && lastName === dbLastName) {
        return dbStudent;
      }

      // Partial name match
      if (firstName === dbFirstName && lastName?.[0] === dbLastName[0]) {
        return dbStudent;
      }
    }

    // Try matching by initials + grade
    if (firstName && lastName && seisStudent.grade) {
      const seisInitials = `${firstName[0]}${lastName[0]}`.toUpperCase();
      const normalizedGrade = normalizeGrade(seisStudent.grade);

      if (
        dbStudent.initials.toUpperCase() === seisInitials &&
        normalizeGrade(dbStudent.grade_level) === normalizedGrade
      ) {
        return dbStudent;
      }
    }
  }

  return null;
}

// Normalize grade level for comparison
function normalizeGrade(grade: string): string {
  const g = grade.toLowerCase().trim();

  if (g === 'k' || g === 'kindergarten') return 'K';
  if (g === 'tk' || g === 'transitional kindergarten') return 'TK';
  if (g.includes('first') || g === '1st') return '1';
  if (g.includes('second') || g === '2nd') return '2';
  if (g.includes('third') || g === '3rd') return '3';
  if (g.includes('fourth') || g === '4th') return '4';
  if (g.includes('fifth') || g === '5th') return '5';
  if (g.includes('sixth') || g === '6th') return '6';
  if (g.includes('seventh') || g === '7th') return '7';
  if (g.includes('eighth') || g === '8th') return '8';
  if (g.includes('ninth') || g === '9th') return '9';
  if (g.includes('tenth') || g === '10th') return '10';
  if (g.includes('eleventh') || g === '11th') return '11';
  if (g.includes('twelfth') || g === '12th') return '12';

  const num = g.match(/\d+/);
  if (num) return num[0];

  return g.toUpperCase();
}
