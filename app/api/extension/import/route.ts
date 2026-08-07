/**
 * Chrome Extension Import API
 * Receives data extracted from SEIS pages and imports into Speddy
 * Authentication via API key in Authorization header
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { updateExistingSessionsForStudent } from '@/lib/scheduling/session-requirement-sync';
import {
  toWeeklyMinutes,
  calculateSessions,
  fitsScheduleConstraints,
  shouldUseWeeklyBucket,
  SCHOOL_DAYS_PER_WEEK,
  type SessionSplit,
} from '@/lib/services/weekly-minutes';

export const runtime = 'nodejs';

// Verify an API key against its bcrypt hash
async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

/**
 * Convert a scraped SEIS service into a sessions × minutes split. Weekly and
 * Daily statements keep their stated session structure; Monthly and Yearly
 * totals convert through the shared 36-week system and chop into standard
 * sessions. Secondary-resource callers get the whole weekly amount as one
 * bucket. Returns null when the service can't be read confidently — the
 * caller then leaves the student's existing schedule untouched.
 */
function serviceToSplit(
  service: { minutesPerSession: number; sessionsPerPeriod: number; frequency: string },
  weeklyBucket: boolean
): SessionSplit | null {
  const minutes = Number(service.minutesPerSession);
  const count = Number(service.sessionsPerPeriod);
  if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isFinite(count) || count <= 0) {
    return null;
  }

  const period = (service.frequency || '').trim().toLowerCase();
  const weeklyMinutes = toWeeklyMinutes(minutes * count, period);
  if (weeklyMinutes <= 0) return null; // unrecognized frequency

  if (weeklyBucket) {
    return calculateSessions(weeklyMinutes, { weeklyBucket: true });
  }
  if (period === 'weekly') {
    return { sessionsPerWeek: count, minutesPerSession: minutes };
  }
  if (period === 'daily') {
    return { sessionsPerWeek: count * SCHOOL_DAYS_PER_WEEK, minutesPerSession: minutes };
  }
  return calculateSessions(weeklyMinutes);
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
    frequency: string; // 'Weekly' | 'Daily' | 'Monthly'
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

interface ImportPayload {
  students: SEISStudentData[];
  source: 'seis';
  pageType: 'student-list' | 'goals' | 'services';
  // Optional: If user confirmed the match in the extension UI, skip auto-matching
  speddyStudentId?: string;
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

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate API key format
    if (!apiKey.startsWith('sk_live_')) {
      return NextResponse.json(
        { error: 'Invalid API key format' },
        { status: 401 }
      );
    }

    // Extract prefix for lookup (first 16 chars: "sk_live_" + 8 random chars)
    const keyPrefix = apiKey.substring(0, 16);

    // Create Supabase service client (bypasses RLS for API key lookup)
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

    // Update last_used_at timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyRecord.id);

    // Parse the request body
    let payload: ImportPayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    if (!payload.students || !Array.isArray(payload.students)) {
      return NextResponse.json(
        { error: 'Invalid payload: students array required' },
        { status: 400 }
      );
    }

    // Validate that speddyStudentId is only used with a single student
    if (payload.speddyStudentId && payload.students.length !== 1) {
      return NextResponse.json(
        { error: 'speddyStudentId can only be used when importing a single student' },
        { status: 400 }
      );
    }

    // Provider role drives the secondary-resource weekly-bucket decision below.
    const { data: providerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    const providerRole = providerProfile?.role ?? null;

    // Get user's existing students for matching
    const { data: dbStudents, error: studentsError } = await supabase
      .from('students')
      .select('id, initials, grade_level, school_site, school_id, sessions_per_week, minutes_per_session')
      .eq('provider_id', userId);

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
      return NextResponse.json(
        { error: 'Failed to fetch existing students' },
        { status: 500 }
      );
    }

    // School level (elementary vs secondary) per school the caseload touches.
    // Students without a structured school_id fall back to elementary — the
    // app-wide default.
    const schoolIds = [...new Set((dbStudents ?? []).map(s => s.school_id).filter(Boolean))] as string[];
    const schoolLevelById = new Map<string, { school_type: string | null; grade_span_low: string | null }>();
    if (schoolIds.length > 0) {
      const { data: schoolRows } = await supabase
        .from('schools')
        .select('id, school_type, grade_span_low')
        .in('id', schoolIds);
      for (const row of schoolRows ?? []) {
        schoolLevelById.set(row.id, {
          school_type: row.school_type,
          grade_span_low: row.grade_span_low,
        });
      }
    }

    // Get student details for name matching
    const studentIds = dbStudents?.map(s => s.id) || [];

    // Guard against empty array in .in() query
    let studentDetails: Array<{
      student_id: string;
      first_name: string | null;
      last_name: string | null;
      iep_goals: string[] | null;
      accommodations: string[] | null;
    }> | null = null;

    if (studentIds.length > 0) {
      const { data } = await supabase
        .from('student_details')
        .select('student_id, first_name, last_name, iep_goals, accommodations')
        .in('student_id', studentIds);
      studentDetails = data;
    }

    // Process each student from the payload
    const results = {
      matched: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const seisStudent of payload.students) {
      try {
        let matchedStudent: { id: string; initials: string } | null = null;

        // If user confirmed the match via extension UI, use that directly
        if (payload.speddyStudentId) {
          const confirmedStudent = dbStudents?.find(s => s.id === payload.speddyStudentId);
          if (confirmedStudent) {
            matchedStudent = { id: confirmedStudent.id, initials: confirmedStudent.initials };
          }
        } else {
          // Auto-match by name or initials
          matchedStudent = findMatchingStudent(
            seisStudent,
            dbStudents || [],
            studentDetails || []
          );
        }

        if (!matchedStudent) {
          results.skipped++;
          continue;
        }

        results.matched++;

        // Get existing details for this student
        const existingDetails = studentDetails?.find(
          d => d.student_id === matchedStudent.id
        );

        // Prepare update data
        const updateData: Record<string, unknown> = {};

        // Process IEP goals if provided (stored verbatim — SPE-238)
        if (seisStudent.goals && seisStudent.goals.length > 0) {
          const newGoals = seisStudent.goals.map(g => g.goalText);

          // Merge with existing goals (avoid duplicates)
          const existingGoals = existingDetails?.iep_goals || [];
          const mergedGoals = [...new Set([...existingGoals, ...newGoals])];

          updateData.iep_goals = mergedGoals;
        }

        // Process accommodations if provided (stored verbatim — SPE-238)
        if (seisStudent.accommodations && seisStudent.accommodations.length > 0) {
          const newAccommodations = seisStudent.accommodations.map(a => a.description);

          // Merge with existing accommodations
          const existingAccommodations = existingDetails?.accommodations || [];
          const mergedAccommodations = [...new Set([...existingAccommodations, ...newAccommodations])];

          updateData.accommodations = mergedAccommodations;
        }

        // Process IEP dates if provided
        if (seisStudent.futureIepDate) {
          updateData.upcoming_iep_date = seisStudent.futureIepDate;
        }

        // Process services - update sessions_per_week and minutes_per_session on student record
        if (seisStudent.services && seisStudent.services.length > 0) {
          // Find the primary service (usually Specialized Academic Instruction)
          const primaryService = seisStudent.services.find(
            s => s.code === '330' || s.name.toLowerCase().includes('academic')
          ) || seisStudent.services[0];

          if (primaryService) {
            // Convert whatever period the IEP states (Weekly/Daily/Monthly/
            // Yearly) to a weekly schedule; secondary-resource students keep
            // the whole amount as one weekly bucket instead of a session chop.
            const studentRow = dbStudents?.find(s => s.id === matchedStudent.id);
            const weeklyBucket = shouldUseWeeklyBucket(
              providerRole,
              studentRow?.school_id ? schoolLevelById.get(studentRow.school_id) ?? null : null
            );
            const split = serviceToSplit(primaryService, weeklyBucket);

            if (split && fitsScheduleConstraints(split)) {
              const oldRequirements = {
                sessions_per_week: studentRow?.sessions_per_week ?? null,
                minutes_per_session: studentRow?.minutes_per_session ?? null,
              };
              const { error: serviceUpdateError } = await supabase
                .from('students')
                .update({
                  sessions_per_week: split.sessionsPerWeek,
                  minutes_per_session: split.minutesPerSession,
                })
                .eq('id', matchedStudent.id);

              if (serviceUpdateError) {
                results.errors.push(
                  `${seisStudent.name}: failed to update service minutes: ${serviceUpdateError.message}`
                );
              } else if (
                oldRequirements.sessions_per_week !== split.sessionsPerWeek ||
                oldRequirements.minutes_per_session !== split.minutesPerSession
              ) {
                // Keep schedule_sessions templates in step with the new
                // requirement — the same sync the edit and bulk-confirm paths
                // run. Without it a re-imported legacy 19×30 student keeps 19
                // phantom unscheduled rows next to the new 1×N bucket.
                const syncResult = await updateExistingSessionsForStudent(
                  matchedStudent.id,
                  oldRequirements,
                  {
                    sessions_per_week: split.sessionsPerWeek,
                    minutes_per_session: split.minutesPerSession,
                  },
                  supabase
                );
                if (!syncResult.success) {
                  results.errors.push(
                    `${seisStudent.name}: service minutes saved, but session cleanup failed: ${syncResult.error}`
                  );
                }
              }
            } else if (split) {
              results.errors.push(
                `${seisStudent.name}: service amount (${split.sessionsPerWeek} × ${split.minutesPerSession} min) is outside what Speddy can store — set the weekly minutes manually`
              );
            }
          }
        }

        // Update student_details if there's data to update
        if (Object.keys(updateData).length > 0) {
          if (existingDetails) {
            // Update existing record
            const { error: updateError } = await supabase
              .from('student_details')
              .update(updateData)
              .eq('student_id', matchedStudent.id);

            if (updateError) {
              console.error('Error updating student details:', updateError);
              results.errors.push(`Failed to update ${seisStudent.name}: ${updateError.message}`);
              continue;
            }
          } else {
            // Insert new record
            const { error: insertError } = await supabase
              .from('student_details')
              .insert({
                student_id: matchedStudent.id,
                first_name: seisStudent.firstName,
                last_name: seisStudent.lastName,
                ...updateData,
              });

            if (insertError) {
              console.error('Error inserting student details:', insertError);
              results.errors.push(`Failed to create details for ${seisStudent.name}: ${insertError.message}`);
              continue;
            }
          }

          results.updated++;
        }
      } catch (err) {
        console.error('Error processing student:', err);
        results.errors.push(`Error processing ${seisStudent.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Matched ${results.matched} students, updated ${results.updated} records`,
    });
  } catch (error) {
    console.error('Extension import error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to match SEIS student to database student
function findMatchingStudent(
  seisStudent: SEISStudentData,
  dbStudents: Array<{ id: string; initials: string; grade_level: string; school_site: string | null }>,
  studentDetails: Array<{ student_id: string; first_name: string | null; last_name: string | null }>
): { id: string; initials: string } | null {
  // Extract first and last name from SEIS data
  const seisFirstName = seisStudent.firstName?.toLowerCase().trim();
  const seisLastName = seisStudent.lastName?.toLowerCase().trim();

  // If we have a full name but not first/last, try to split it
  let firstName = seisFirstName;
  let lastName = seisLastName;

  if (!firstName && !lastName && seisStudent.name) {
    const nameParts = seisStudent.name.split(/[,\s]+/).filter(Boolean);
    if (nameParts.length >= 2) {
      // Assume "Last, First" format (common in SEIS)
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

      // Partial name match (first name + last initial or vice versa)
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

  // Try to extract number
  const num = g.match(/\d+/);
  if (num) return num[0];

  return g.toUpperCase();
}
