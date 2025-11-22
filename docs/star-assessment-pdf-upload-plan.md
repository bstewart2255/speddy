# STAR Assessment PDF Upload - Implementation Plan

**Created:** November 22, 2025
**Status:** Planning Phase
**Feature:** Automated extraction of STAR Reading assessment data from PDF reports

---

## Executive Summary

This document outlines the plan for implementing automated STAR Reading assessment data upload via PDF import. Users can upload Renaissance STAR Test Record Reports, and the system will automatically extract assessment scores for multiple students, match them to existing student records, and import the data after user confirmation.

**Key Benefits:**

- Eliminates manual data entry for STAR assessments
- Handles bulk imports (multiple students per PDF)
- Reduces data entry errors
- Saves significant time for teachers

**Estimated Effort:** 5-7 days
**Estimated Cost:** ~$3-10/month for typical usage (100-300 uploads)

---

## 1. PDF Format Analysis

### Example PDF: STAR Test Record Report

The Renaissance STAR Test Record Report contains:

**Structure:**

- One page per student
- Table format with clear columns
- Multiple test results per student (historical data)
- Summary row showing total tests

**Data Fields Extracted:**

- **Date** - Assessment date (MM/DD/YY format)
- **GP** - Grade Placement (e.g., "4.28")
- **Score** - Scaled Score (e.g., "993")
- **GE** - Grade Equivalent (e.g., "4.2")
- **PR** - Percentile Rank (e.g., "49")
- **NCE** - Normal Curve Equivalent (e.g., "49.5")
- **IRL** - Instructional Reading Level (e.g., "3.8")
- **Est. ORF** - Estimated Oral Reading Fluency (e.g., "105")
- **ZPD** - Zone of Proximal Development (e.g., "3.1 - 4.7")

**Student Information:**

- Student name (Last, First format)
- Class/Group
- Teacher name

**Edge Cases:**

- Students with no results ("No results. Adjust selections above to generate a table.")
- Students with multiple tests on same date
- Missing data fields (shown as "-" or blank)

---

## 2. Technical Architecture

### Recommended Approach: Claude Vision API

**Why Claude Vision?**

1. ✅ Already using Anthropic SDK (`@anthropic-ai/sdk v0.56.0`)
2. ✅ Excellent at structured data extraction from documents
3. ✅ Existing patterns in codebase (AI upload for IEP goals)
4. ✅ Better table understanding than pure text extraction
5. ✅ Handles format variations gracefully

**Architecture Flow:**

```
[User] → [Upload Button in Assessment Modal]
  ↓
[Select PDF File]
  ↓
POST /api/ai-upload
  ├─ Convert PDF to base64
  ├─ Send to Claude Vision API
  ├─ Extract structured data
  └─ Match students to database
  ↓
[Preview/Confirmation UI]
  ├─ Show all extracted students
  ├─ Display match confidence
  ├─ Allow editing values
  └─ Select which to import
  ↓
POST /api/assessments/import/confirm
  ├─ Validate data
  ├─ Insert into student_assessments
  └─ Return results
  ↓
[Success Message] → [Refresh Assessment List]
```

### Alternative Approaches Considered

**1. Pure Text Extraction (pdfjs-dist or pdf-parse)**

- ❌ Rejected: Difficult to maintain table structure
- ❌ Fragile with format variations
- ❌ Requires complex regex patterns

**2. PDF.co API (already used in codebase)**

- ⚠️ Works but adds external dependency
- ⚠️ Additional latency
- ⚠️ Still needs Claude for structured extraction

**3. OpenAI Vision**

- ⚠️ Similar capability to Claude
- ❌ Rejected: Already using Anthropic, no need to add another provider

---

## 3. Existing Infrastructure

### AI Upload System (Excellent Foundation!)

**Current Implementation:**

- Location: `/app/components/ai-upload/`
- Supports: IEP goals, bell schedules, special activities, students
- Features:
  - Modal-based upload UI
  - File validation (PDF, Excel, Word, CSV)
  - Claude integration for parsing
  - Preview/confirm workflow
  - Multi-item handling

**Key Files:**

```
/app/components/ai-upload/
├── ai-upload-modal.tsx           # Main upload modal
├── bell-schedule-upload.tsx      # Bell schedule parser
└── special-activities-upload.tsx # Special activities parser

/app/api/ai-upload/
├── route.ts                      # Upload + Claude parsing
└── confirm/
    └── route.ts                  # Save confirmed data

/app/components/students/
└── iep-goals-uploader.tsx        # Student-specific upload
```

**IEP Goals Uploader Pattern:**

- Student-specific upload
- Excel/CSV parsing
- PII scrubbing
- Manual review before save
- ← **Perfect model for STAR upload!**

### Student Matching Logic

**Existing Matcher:**

- Location: `/lib/utils/student-matcher.ts`
- Matches by: initials + grade_level + school_id
- Returns confidence scores
- Handles fuzzy matching

**Students Table Schema:**

```typescript
{
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
  school_id: string;
  provider_id: string;
}
```

### Assessment Data Structure

**Database Table:** `student_assessments`

```sql
CREATE TABLE student_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id),
  assessment_type text NOT NULL, -- 'star_reading', 'star_math', etc.
  assessment_date date NOT NULL,
  data jsonb NOT NULL,           -- Tool-specific scores
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**TypeScript Interface:** `StarReadingAssessmentData`

```typescript
{
  gradePlacement?: string          // GP
  scaledScore?: number             // Score
  gradeEquivalent?: string         // GE
  percentileRank?: number          // PR
  normalCurveEquivalent?: number   // NCE
  instructionalReadingLevel?: string // IRL
  estimatedOralReadingFluency?: number // Est. ORF
  zpdLow?: string                  // ZPD lower bound
  zpdHigh?: string                 // ZPD upper bound
  notes?: string
}
```

---

## 4. Implementation Plan

### Phase 1: Backend - PDF Processing (Days 1-2)

#### 1.1 Extend AI Upload API

**File:** `/app/api/ai-upload/route.ts`

**Changes:**

- Add `'star_reading_assessment'` to `uploadType` union
- Handle PDF → base64 conversion
- Create STAR-specific Claude prompt

**Claude Prompt Template:**

```typescript
const STAR_EXTRACTION_PROMPT = `
You are extracting STAR Reading assessment data from a PDF report.

Extract ALL students and ALL their test results from this PDF.

For each student, extract:
- Student name (Last, First format)
- All test dates and complete scores

For each test, extract these fields:
- Date (MM/DD/YY)
- GP (Grade Placement)
- Score (Scaled Score, 0-1400)
- GE (Grade Equivalent)
- PR (Percentile Rank, 1-99)
- NCE (Normal Curve Equivalent)
- IRL (Instructional Reading Level)
- Est. ORF (Estimated Oral Reading Fluency)
- ZPD (Zone of Proximal Development, format: "X.X - X.X")

Return as JSON array with this structure:
{
  "students": [
    {
      "lastName": "string",
      "firstName": "string",
      "tests": [
        {
          "date": "MM/DD/YYYY",
          "gradePlacement": "string",
          "scaledScore": number,
          "gradeEquivalent": "string",
          "percentileRank": number,
          "normalCurveEquivalent": number,
          "instructionalReadingLevel": "string",
          "estimatedOralReadingFluency": number,
          "zpdLow": "string",
          "zpdHigh": "string"
        }
      ]
    }
  ]
}

Important:
- Extract ALL students, not just one
- Include ALL tests for each student
- Use null for missing values
- Parse ZPD range into separate low/high fields
- If a student has "No results", include them with empty tests array
`;
```

#### 1.2 Student Matching Logic

**Extend:** `/lib/utils/student-matcher.ts`

**Function:** `matchStarStudentToDatabase()`

```typescript
interface StarStudentMatch {
  pdfName: string;
  studentId: string | null;
  studentInitials: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  possibleMatches: Array<{
    id: string;
    initials: string;
    grade: string;
    teacherName: string;
  }>;
}

// Match logic:
// 1. Extract initials from "Last, First" name
// 2. Find students with matching initials
// 3. Score by grade proximity
// 4. Return all candidates with confidence
```

#### 1.3 Create Import Confirmation API

**New File:** `/app/api/assessments/import/confirm/route.ts`

```typescript
// POST /api/assessments/import/confirm
// Body: { assessments: ImportAssessment[] }

interface ImportAssessment {
  studentId: string;
  assessmentDate: string;
  assessmentType: 'star_reading';
  data: StarReadingAssessmentData;
}

// Logic:
// 1. Validate student exists
// 2. Check for duplicate (same student, same date, same type)
// 3. Insert into student_assessments table
// 4. Return success/failure for each
```

### Phase 2: Frontend - Upload Interface (Days 3-4)

#### 2.1 Extend AIUploadModal

**File:** `/app/components/ai-upload/ai-upload-modal.tsx`

**Changes:**

- Add `'star_reading_assessment'` to uploadType
- Create STAR-specific preview component
- Handle multi-student, multi-test data structure

#### 2.2 Create STAR Assessment Uploader Component

**New File:** `/app/components/students/star-assessment-uploader.tsx`

**Features:**

- Upload button in assessment modal
- Triggers AIUploadModal with student context
- Shows preview table of extracted data
- Student matching UI with confidence indicators
- Editable fields for corrections
- Bulk select/deselect

**UI Design:**

```
┌─────────────────────────────────────────────────────────────┐
│ Upload STAR Reading Assessment                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ [Drop PDF here or click to browse]                          │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ ✓ STAR Test Record Report Example.pdf (241.5 KB)    │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ Extracted 8 students with 18 total assessments              │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ☑️ Student    Match      Date      Score  PR   IRL    │ │
│ ├────────────────────────────────────────────────────────┤ │
│ │ ☑️ Descalzo, ✅ WD (4th)  10/30/25  993   49   3.8    │ │
│ │    William                                             │ │
│ ├────────────────────────────────────────────────────────┤ │
│ │ ☑️ Garvin,   ⚠️ [Select ▼] 10/28/25  966   58   3.3   │ │
│ │    Rogan       RG (3rd)                                │ │
│ │               RG (4th)                                 │ │
│ ├────────────────────────────────────────────────────────┤ │
│ │ ☐ Smith,     ❌ No match  10/15/25  850   35   2.5    │ │
│ │    Jane                                                │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ Legend: ✅ High confidence  ⚠️ Manual selection needed      │
│         ❌ No match found                                   │
│                                                              │
│              [Cancel]  [Import Selected (15 assessments)]   │
└─────────────────────────────────────────────────────────────┘
```

#### 2.3 Add Upload Button to Assessment Modal

**File:** `/app/components/students/student-details-modal.tsx`

**Location:** Assessments tab, near "Add Assessment" button

```tsx
<div className="flex gap-2">
  <Button onClick={handleAddAssessment}>+ Add Assessment</Button>
  <Button variant="outline" onClick={handleUploadPDF}>
    📄 Upload STAR Report
  </Button>
</div>
```

### Phase 3: Data Validation & Error Handling (Day 5)

#### 3.1 Input Validation

**Validate extracted data:**

- Date is valid format and not in future
- Scaled Score is 0-1400
- Percentile Rank is 1-99
- Grade Equivalent matches expected format
- ZPD range is valid (low < high)

#### 3.2 Duplicate Detection

**Check for duplicates:**

- Same student + same date + same type = potential duplicate
- Warn user: "This student already has a STAR Reading assessment on this date. Replace or skip?"
- Options: Replace, Skip, Keep Both

#### 3.3 Error Handling

**Common errors:**

- PDF parsing fails → Show error, allow retry
- No students extracted → "No data found in PDF"
- All students unmatched → "No matching students found. Verify student names."
- Partial save failure → "Imported 10/15 assessments. 5 failed (show details)"

### Phase 4: Testing & Polish (Days 6-7)

#### 4.1 Test Cases

**PDF Variations:**

- ✅ Single student, single test
- ✅ Single student, multiple tests
- ✅ Multiple students (like example PDF)
- ✅ Student with no results
- ✅ Students not in database
- ✅ Ambiguous student matches
- ✅ Invalid/corrupted PDF

**Database Scenarios:**

- ✅ First assessment for student
- ✅ Adding to existing assessments
- ✅ Duplicate assessment (same date)
- ✅ Multiple uploads in session

#### 4.2 User Experience Polish

- Loading states during extraction
- Progress indicators for multi-student processing
- Clear success/error messages
- Undo/cancel functionality
- Help text explaining matching logic
- Keyboard navigation support

#### 4.3 Performance Optimization

- Batch database inserts (transaction)
- Prompt caching for repeated school formats
- Lazy load preview table for large imports
- Debounce file upload events

---

## 5. UX Design Details

### Upload Flow - Option 1: Single Student Context

**Trigger:** From student's assessment tab

```
User viewing Student Details → Assessments tab
  ↓
Click "Upload STAR Report"
  ↓
AIUploadModal opens
  ↓
Select PDF file
  ↓
[If PDF contains multiple students]
  ↓
Filter to show only current student's data
+ Option to "Import all students from this PDF"
  ↓
Preview & Confirm
  ↓
Import → Refresh student's assessment list
```

### Upload Flow - Option 2: Bulk Upload

**Trigger:** From main navigation or tools menu

```
Click "Import Assessments" (new menu item)
  ↓
Select assessment type: STAR Reading / STAR Math
  ↓
AIUploadModal opens
  ↓
Select PDF file(s)
  ↓
Extract ALL students from ALL PDFs
  ↓
Show preview table with ALL extractions
  ↓
User reviews matches
  ↓
Import selected → Show summary report
```

**Recommendation:** Implement both, starting with Option 1

---

## 6. Cost & Performance Analysis

### Claude API Costs (Sonnet 4.5)

**Pricing:**

- Input: $3 per 1M tokens
- Output: $15 per 1M tokens
- Image tokens: ~$0.01 per page (241KB PDF)

**Estimated costs:**

- Single student PDF (1 page): ~$0.01
- Multi-student PDF (10 pages): ~$0.10
- 100 uploads/month: ~$3-5/month
- 1000 uploads/month: ~$30-50/month

**Optimization:**

- Use prompt caching (90% cost reduction on repeated formats)
- Consider Haiku model for initial extraction ($0.25 per 1M tokens)
- Batch process multiple pages in one request

### Processing Time

**Expected latency:**

- PDF upload: ~500ms
- Claude API call: 2-5 seconds
- Student matching: ~200ms
- Total: ~3-6 seconds per PDF

**Optimization:**

- Show immediate upload confirmation
- Process in background with progress indicator
- Use streaming responses for large PDFs

### Storage

**PDF Storage:**

- Option 1: Delete after processing (recommended)
- Option 2: Store in Supabase Storage (for audit trail)
- Estimated: 200-500 KB per PDF

**Recommendation:** Don't store PDFs, log extraction metadata only

---

## 7. Database Schema

### No Migration Needed!

The `student_assessments` table already supports this feature:

```sql
-- Existing table structure
CREATE TABLE student_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  assessment_type text NOT NULL,
  assessment_date date NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes (add if not exist)
CREATE INDEX idx_student_assessments_student_id
  ON student_assessments(student_id);
CREATE INDEX idx_student_assessments_date
  ON student_assessments(assessment_date DESC);
CREATE INDEX idx_student_assessments_type
  ON student_assessments(assessment_type);
```

### Example Data Row

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "student_id": "123e4567-e89b-12d3-a456-426614174000",
  "assessment_type": "star_reading",
  "assessment_date": "2025-10-30",
  "data": {
    "gradePlacement": "4.28",
    "scaledScore": 993,
    "gradeEquivalent": "4.2",
    "percentileRank": 49,
    "normalCurveEquivalent": 49.5,
    "instructionalReadingLevel": "3.8",
    "estimatedOralReadingFluency": 105,
    "zpdLow": "3.1",
    "zpdHigh": "4.7"
  },
  "created_at": "2025-11-22T15:30:00Z",
  "updated_at": "2025-11-22T15:30:00Z"
}
```

---

## 8. Security & Privacy Considerations

### Data Privacy

**PII in PDFs:**

- Student names (scrub after matching)
- Teacher names (keep for matching only)
- School information (validate against user's school)

**Handling:**

- Process server-side only (never send to client before scrubbing)
- Don't store PDFs after processing
- Log extraction attempts without PII
- Encrypt data in transit (HTTPS)

### Access Control

**Permissions:**

- Users can only upload for their own school/district
- Match students only from user's accessible students
- Validate student_id belongs to user's school

**RLS Policies:**

```sql
-- Ensure users can only insert assessments for their students
CREATE POLICY "Users can insert assessments for their students"
  ON student_assessments FOR INSERT
  USING (
    student_id IN (
      SELECT id FROM students
      WHERE provider_id = auth.uid()
    )
  );
```

### Rate Limiting

**Prevent abuse:**

- Max 10 uploads per minute per user
- Max 100 uploads per day per user
- Max file size: 10 MB
- File type validation (PDF only)

---

## 9. Future Enhancements

### Phase 2 Features

**1. STAR Math Support**

- Same infrastructure, different fields
- Additional assessment type: `star_math`
- Fields: GP, Score, Quantile, GE, PR, NCE

**2. Multi-PDF Upload**

- Drag & drop multiple PDFs
- Batch processing
- Combined preview table

**3. Auto-Detection**

- Automatically detect STAR Reading vs STAR Math
- Smart field mapping based on PDF structure

**4. Historical Comparison**

- Show trend graphs after import
- Highlight improvements/declines
- Alert teachers to significant changes

### Phase 3 Features

**1. mClass/DIBELS Upload**

- Support mClass PDF reports
- Different field structure
- Same extraction pattern

**2. Progress Tracking**

- Dashboard showing imported assessments
- Monthly/quarterly reports
- Student progress graphs

**3. Export Functionality**

- Generate summary reports
- Export to Excel/CSV
- Print progress reports

**4. OCR Fallback**

- Handle scanned PDFs (currently text-based only)
- Use Tesseract.js or cloud OCR
- More expensive but handles all formats

---

## 10. Risk Mitigation

### Technical Risks

| Risk                      | Likelihood | Impact | Mitigation                                    |
| ------------------------- | ---------- | ------ | --------------------------------------------- |
| Claude misparses data     | Medium     | High   | Preview/edit UI, allow manual correction      |
| PDF format changes        | Low        | Medium | Flexible prompts, monitor extraction accuracy |
| Student matching failures | Medium     | Medium | Manual selection dropdowns, fuzzy matching    |
| API rate limits           | Low        | Medium | Queue system, user feedback                   |
| High API costs            | Low        | Low    | Prompt caching, monitor usage, set budgets    |

### Data Quality Risks

| Risk                     | Likelihood | Impact | Mitigation                              |
| ------------------------ | ---------- | ------ | --------------------------------------- |
| Incorrect scores entered | Low        | High   | Preview before import, validation rules |
| Duplicate assessments    | Medium     | Low    | Duplicate detection, user warning       |
| Wrong student matched    | Low        | High   | Confidence indicators, manual override  |
| Missing required fields  | Low        | Medium | Validation, clear error messages        |

### User Experience Risks

| Risk                     | Likelihood | Impact | Mitigation                                  |
| ------------------------ | ---------- | ------ | ------------------------------------------- |
| Confusing UI             | Medium     | Medium | User testing, clear instructions, help text |
| Slow processing          | Low        | Low    | Loading states, progress indicators         |
| Lost data on error       | Low        | High   | Transaction-based saves, error recovery     |
| Unclear match confidence | Medium     | Low    | Color coding, tooltips, match explanations  |

---

## 11. Success Metrics

### Measure Success By:

**Adoption:**

- % of teachers using upload vs manual entry
- Number of assessments imported via PDF
- Repeat usage (weekly active uploaders)

**Efficiency:**

- Time saved per assessment (target: 80% reduction)
- Upload success rate (target: >95%)
- Average assessments per upload (multi-student benefit)

**Quality:**

- Manual corrections needed per upload (target: <10%)
- Student matching accuracy (target: >90% high confidence)
- User satisfaction score (survey)

**Cost:**

- API costs per assessment (target: <$0.02)
- Total monthly API costs
- Cost per time saved (ROI)

---

## 12. Implementation Checklist

### Pre-Development

- [ ] Review and approve this plan
- [ ] Confirm budget for Claude API costs
- [ ] Set up monitoring for API usage
- [ ] Create test PDFs with various scenarios

### Development Phase

- [ ] Backend: Extend `/api/ai-upload/route.ts`
- [ ] Backend: Create `/api/assessments/import/confirm/route.ts`
- [ ] Backend: Enhance student matcher
- [ ] Frontend: Create STAR uploader component
- [ ] Frontend: Extend AIUploadModal
- [ ] Frontend: Add upload button to assessment modal
- [ ] Testing: Write unit tests for extraction logic
- [ ] Testing: Write integration tests for full flow
- [ ] Testing: Manual QA with real STAR PDFs

### Launch Phase

- [ ] Deploy to staging environment
- [ ] User acceptance testing with real teachers
- [ ] Monitor API costs and performance
- [ ] Create user documentation/tutorial
- [ ] Deploy to production
- [ ] Announce feature to users

### Post-Launch

- [ ] Monitor adoption metrics
- [ ] Collect user feedback
- [ ] Track API costs vs budget
- [ ] Identify issues and iterate
- [ ] Plan Phase 2 features

---

## 13. Code Examples

### Claude API Call (Simplified)

```typescript
import Anthropic from '@anthropic-ai/sdk';

async function extractStarAssessments(pdfBase64: string) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4.5-20250929',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: STAR_EXTRACTION_PROMPT, // See prompt in Phase 1.1
          },
        ],
      },
    ],
  });

  const extracted = JSON.parse(message.content[0].text);
  return extracted.students;
}
```

### Student Matching Logic (Simplified)

```typescript
interface StudentMatch {
  studentId: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  candidates: Array<{ id: string; initials: string }>;
}

function matchStudent(
  lastName: string,
  firstName: string,
  gradePlacement: string,
  existingStudents: Student[]
): StudentMatch {
  // Extract initials
  const initials = `${firstName[0]}${lastName[0]}`.toUpperCase();

  // Extract grade
  const grade = Math.floor(parseFloat(gradePlacement));

  // Find candidates
  const candidates = existingStudents.filter(s => s.initials.toUpperCase() === initials);

  if (candidates.length === 0) {
    return { studentId: null, confidence: 'none', candidates: [] };
  }

  // Score by grade proximity
  const scored = candidates.map(c => ({
    ...c,
    score: Math.abs(parseInt(c.grade_level) - grade),
  }));

  scored.sort((a, b) => a.score - b.score);

  if (scored[0].score === 0) {
    return {
      studentId: scored[0].id,
      confidence: 'high',
      candidates: scored,
    };
  } else if (scored[0].score <= 1) {
    return {
      studentId: scored[0].id,
      confidence: 'medium',
      candidates: scored,
    };
  } else {
    return {
      studentId: null,
      confidence: 'low',
      candidates: scored,
    };
  }
}
```

### Database Insert (Simplified)

```typescript
import { createClient } from '@/lib/supabase/server';

async function importAssessments(assessments: ImportAssessment[]) {
  const supabase = createClient();

  const results = [];

  for (const assessment of assessments) {
    try {
      const { data, error } = await supabase
        .from('student_assessments')
        .insert({
          student_id: assessment.studentId,
          assessment_type: 'star_reading',
          assessment_date: assessment.assessmentDate,
          data: assessment.data,
        })
        .select()
        .single();

      if (error) throw error;

      results.push({ success: true, id: data.id });
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        studentId: assessment.studentId,
      });
    }
  }

  return results;
}
```

---

## 14. Resources & References

### Documentation

- [Anthropic Claude API Docs](https://docs.anthropic.com/)
- [Claude Vision Capabilities](https://docs.anthropic.com/claude/docs/vision)
- [Supabase JSONB Queries](https://supabase.com/docs/guides/database/json)

### Existing Code References

- AI Upload Modal: `/app/components/ai-upload/ai-upload-modal.tsx`
- IEP Goals Upload: `/app/components/students/iep-goals-uploader.tsx`
- Student Matcher: `/lib/utils/student-matcher.ts`
- Assessment Queries: `/lib/supabase/queries/student-assessments.ts`

### Testing

- Example PDF: `/STAR Test Record Report Example.pdf`
- Test student data: Multiple students with various grade levels

---

## 15. Questions & Decisions Needed

### Before Implementation

**1. Upload Context**

- Q: Where should the primary upload button be?
- Options:
  - A) In student's assessment tab (single student context)
  - B) Separate bulk upload page
  - C) Both
- **Decision needed:** Confirm preferred option

**2. Duplicate Handling**

- Q: What to do when importing duplicate assessment?
- Options:
  - A) Always skip duplicates
  - B) Always replace duplicates
  - C) Ask user each time
- **Decision needed:** Confirm policy

**3. Match Confidence Threshold**

- Q: When should we auto-match vs require manual selection?
- Options:
  - A) Auto-match only on "high" confidence
  - B) Auto-match on "high" and "medium"
  - C) Always require manual confirmation
- **Decision needed:** Confirm threshold

**4. Data Storage**

- Q: Should we keep uploaded PDFs?
- Options:
  - A) Delete immediately after processing
  - B) Store for 30 days (audit trail)
  - C) Store permanently (compliance)
- **Decision needed:** Confirm retention policy

### During Implementation

- Monitor Claude API costs in first week
- Gather user feedback on matching accuracy
- Adjust confidence thresholds based on results
- Iterate on UI based on usability testing

---

## Appendix A: PDF Data Structure

### Raw Extracted Data Example

```json
{
  "students": [
    {
      "lastName": "Descalzo",
      "firstName": "William",
      "tests": [
        {
          "date": "10/30/2025",
          "gradePlacement": "4.28",
          "scaledScore": 993,
          "gradeEquivalent": "4.2",
          "percentileRank": 49,
          "normalCurveEquivalent": 49.5,
          "instructionalReadingLevel": "3.8",
          "estimatedOralReadingFluency": 105,
          "zpdLow": "3.1",
          "zpdHigh": "4.7"
        },
        {
          "date": "08/12/2025",
          "gradePlacement": "4.02",
          "scaledScore": 960,
          "gradeEquivalent": "3.5",
          "percentileRank": 35,
          "normalCurveEquivalent": 41.9,
          "instructionalReadingLevel": "3.2",
          "estimatedOralReadingFluency": 86,
          "zpdLow": "2.8",
          "zpdHigh": "4.0"
        }
      ]
    }
  ]
}
```

---

## Appendix B: Error Messages

### User-Facing Error Messages

```typescript
const ERROR_MESSAGES = {
  // Upload errors
  INVALID_FILE_TYPE: 'Please upload a PDF file.',
  FILE_TOO_LARGE: 'File size must be less than 10 MB.',
  UPLOAD_FAILED: 'Upload failed. Please try again.',

  // Extraction errors
  NO_DATA_FOUND:
    'No assessment data found in this PDF. Please verify it is a STAR Test Record Report.',
  EXTRACTION_FAILED: 'Could not read PDF data. The file may be corrupted or password-protected.',

  // Matching errors
  NO_STUDENTS_MATCHED: 'No matching students found. Please verify student names match your roster.',
  ALL_DUPLICATES: 'All assessments in this PDF have already been imported for these students.',

  // Save errors
  SAVE_FAILED: 'Failed to save assessments. Please try again.',
  PARTIAL_SAVE: 'Imported {success} of {total} assessments. {failed} failed.',

  // Permission errors
  UNAUTHORIZED: 'You do not have permission to import assessments for these students.',
};
```

---

## Appendix C: Testing Scenarios

### Test Case Matrix

| Scenario                                        | Expected Result                           | Pass/Fail |
| ----------------------------------------------- | ----------------------------------------- | --------- |
| Single student, 1 test                          | Extract 1 assessment, import successfully |           |
| Single student, 3 tests                         | Extract 3 assessments, import all         |           |
| 10 students, varying tests                      | Extract all, match all (if in DB)         |           |
| Student not in database                         | Show "No match", allow skip               |           |
| Duplicate assessment (same date)                | Warn user, allow replace/skip             |           |
| Ambiguous match (2 students with same initials) | Show dropdown, require selection          |           |
| Invalid PDF (not STAR report)                   | Show error, allow retry                   |           |
| Corrupted PDF                                   | Show error, allow retry                   |           |
| Empty PDF (no students)                         | Show "No data found"                      |           |
| PDF with "No results" student                   | Extract student, show 0 tests             |           |

---

**End of Document**

For questions or updates, contact the development team.
