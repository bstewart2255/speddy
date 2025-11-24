/**
 * Student Assessment Types
 * Defines data structures for different assessment tools used in the district
 */

// Assessment type enum
export type AssessmentType =
  | 'mclass'
  | 'star_reading'
  | 'star_math'
  | 'wisc_v'
  | 'brief'
  | 'wiat_4'
  | 'wj_iv'

// Risk level for mClass/DIBELS
export type RiskLevel = 'low_risk' | 'some_risk' | 'high_risk'

// mClass (DIBELS) Assessment Data
export interface MClassAssessmentData {
  compositeScore?: number
  riskLevel?: RiskLevel
  // Letter Naming Fluency (Kindergarten)
  letterNamingFluency?: number
  // Phoneme Segmentation Fluency (Kindergarten-1st)
  phonemeSegmentationFluency?: number
  // Nonsense Word Fluency
  nonsenseWordFluency?: number
  nonsenseWordFluencyAccuracy?: number // Percentage
  // DORF - DIBELS Oral Reading Fluency (1st grade and up)
  dorfWordsCorrect?: number // Words per minute
  dorfAccuracy?: number // Percentage
  // Maze (comprehension)
  mazeAdjustedScore?: number
  // Additional fields
  notes?: string
}

// STAR Reading Assessment Data
export interface StarReadingAssessmentData {
  gradePlacement?: string // GP - Current grade
  scaledScore?: number // Score - e.g., 966
  gradeEquivalent?: string // GE - Grade equivalent, e.g., "3.2"
  percentileRank?: number // PR - Percentile rank, e.g., 49
  normalCurveEquivalent?: number // NCE - Normal curve equivalent, e.g., 49.5
  instructionalReadingLevel?: string // IRL - Instructional reading level, e.g., "3.8"
  estimatedOralReadingFluency?: number // Est. ORF - Estimated oral reading fluency, e.g., 105
  zpdLow?: string // ZPD lower bound - e.g., "3.1"
  zpdHigh?: string // ZPD upper bound - e.g., "4.7"
  notes?: string
}

// STAR Math Assessment Data
export interface StarMathAssessmentData {
  gradePlacement?: string // GP - Current grade
  scaledScore?: number // Score - e.g., 850
  quantileMeasure?: string // Quantile Measure - e.g., "550Q"
  gradeEquivalent?: string // GE - Grade equivalent, e.g., "3.2"
  percentileRank?: number // PR - Percentile rank, e.g., 49
  normalCurveEquivalent?: number // NCE - Normal curve equivalent, e.g., 49.5
  notes?: string
}

// WISC-V Assessment Data
export interface WiscVAssessmentData {
  fullScaleIQ?: number
  // Index Scores (standard scores, mean 100, SD 15)
  verbalComprehension?: number
  visualSpatial?: number
  fluidReasoning?: number
  workingMemory?: number
  processingSpeed?: number
  // Additional composite scores
  generalAbilityIndex?: number // GAI
  cognitiveProfileIndex?: number // CPI
  notes?: string
}

// BRIEF (Behavior Rating Inventory of Executive Function) Assessment Data
export interface BriefAssessmentData {
  // Clinical scales (T-scores, mean 50, SD 10)
  // Higher scores indicate more problems
  inhibit?: number
  selfMonitor?: number
  shift?: number
  emotionalControl?: number
  initiateTask?: number
  workingMemory?: number
  planOrganize?: number
  taskMonitor?: number
  organizationOfMaterials?: number
  // Composite/Index scores
  behavioralRegulationIndex?: number // BRI
  emotionRegulationIndex?: number // ERI
  cognitiveRegulationIndex?: number // CRI
  globalExecutiveComposite?: number // GEC
  notes?: string
}

// WIAT-4 (Wechsler Individual Achievement Test, 4th Edition) Assessment Data
export interface Wiat4AssessmentData {
  // Composite Scores (standard scores, mean 100, SD 15)
  totalAchievement?: number
  oralLanguage?: number
  reading?: number
  writtenExpression?: number
  mathematics?: number
  // Additional Composite/Index Scores
  phonologicalProcessing?: number
  orthographicProcessing?: number
  writingFluency?: number
  dyslexiaIndex?: number
  // Reading Subtests (standard scores)
  wordReading?: number
  readingComprehension?: number
  oralReadingFluency?: number
  pseudowordDecoding?: number
  orthographicFluency?: number
  // Written Expression Subtests (standard scores)
  spelling?: number
  alphabetWritingFluency?: number
  sentenceComposition?: number
  essayComposition?: number
  // Mathematics Subtests (standard scores)
  numericalOperations?: number
  mathProblemSolving?: number
  // Oral Language Subtests (standard scores)
  listeningComprehension?: number
  oralExpression?: number
  phonemicProficiency?: number
  // Additional score information
  percentileRank?: number
  ageEquivalent?: string
  gradeEquivalent?: string
  notes?: string
}

// WJ-IV (Woodcock-Johnson IV Tests of Achievement) Assessment Data
export interface WjIvAssessmentData {
  // Cross-Domain Cluster Scores (standard scores, mean 100, SD 15)
  briefAchievement?: number
  broadAchievement?: number
  academicSkills?: number
  academicFluency?: number
  academicApplications?: number
  academicKnowledge?: number
  phonemeGraphemeKnowledge?: number
  // Reading Cluster Scores (standard scores)
  reading?: number
  broadReading?: number
  basicReadingSkills?: number
  readingComprehension?: number
  readingFluency?: number
  readingRate?: number
  // Mathematics Cluster Scores (standard scores)
  mathematics?: number
  broadMathematics?: number
  mathCalculationSkills?: number
  mathProblemSolving?: number
  // Written Language Cluster Scores (standard scores)
  writtenLanguage?: number
  broadWrittenLanguage?: number
  basicWritingSkills?: number
  writtenExpression?: number
  // Standard Battery Subtests (standard scores)
  letterWordIdentification?: number
  appliedProblems?: number
  spelling?: number
  passageComprehension?: number
  calculation?: number
  writingSamples?: number
  wordAttack?: number
  oralReading?: number
  sentenceReadingFluency?: number
  mathFactsFluency?: number
  sentenceWritingFluency?: number
  // Additional score information
  percentileRank?: number
  relativeProficiencyIndex?: string // RPI score (e.g., "95/90")
  ageEquivalent?: string
  gradeEquivalent?: string
  notes?: string
}

// Union type for all assessment data
export type AssessmentData =
  | MClassAssessmentData
  | StarReadingAssessmentData
  | StarMathAssessmentData
  | WiscVAssessmentData
  | BriefAssessmentData
  | Wiat4AssessmentData
  | WjIvAssessmentData

// Database record structure
export interface StudentAssessment {
  id: string
  studentId: string
  assessmentType: AssessmentType
  assessmentDate: string // ISO date string
  data: AssessmentData
  createdAt: string
  updatedAt: string
}

// Helper type for creating new assessments
export type CreateAssessmentInput = Omit<StudentAssessment, 'id' | 'createdAt' | 'updatedAt'>

// Helper type for updating assessments
export type UpdateAssessmentInput = Partial<CreateAssessmentInput> & { id: string }

// Display labels for assessment types
export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  mclass: 'mClass (DIBELS)',
  star_reading: 'STAR Reading',
  star_math: 'STAR Math',
  wisc_v: 'WISC-V',
  brief: 'BRIEF (Executive Function)',
  wiat_4: 'WIAT-4',
  wj_iv: 'WJ-IV'
}

// Type guards for discriminating assessment data types
// Uses fields unique to each assessment type for reliable discrimination
export function isMClassData(data: AssessmentData): data is MClassAssessmentData {
  return 'letterNamingFluency' in data || 'phonemeSegmentationFluency' in data ||
         'nonsenseWordFluency' in data || 'dorfWordsCorrect' in data || 'mazeAdjustedScore' in data
}

export function isStarReadingData(data: AssessmentData): data is StarReadingAssessmentData {
  return 'instructionalReadingLevel' in data || 'zpdLow' in data ||
         'zpdHigh' in data || 'estimatedOralReadingFluency' in data
}

export function isStarMathData(data: AssessmentData): data is StarMathAssessmentData {
  return 'quantileMeasure' in data
}

export function isWiscVData(data: AssessmentData): data is WiscVAssessmentData {
  return 'fullScaleIQ' in data || 'verbalComprehension' in data ||
         'visualSpatial' in data || 'fluidReasoning' in data
}

export function isBriefData(data: AssessmentData): data is BriefAssessmentData {
  return 'behavioralRegulationIndex' in data || 'emotionRegulationIndex' in data ||
         'cognitiveRegulationIndex' in data || 'globalExecutiveComposite' in data
}

export function isWiat4Data(data: AssessmentData): data is Wiat4AssessmentData {
  return 'totalAchievement' in data || 'dyslexiaIndex' in data ||
         'phonologicalProcessing' in data || 'orthographicProcessing' in data ||
         'wordReading' in data || 'pseudowordDecoding' in data
}

export function isWjIvData(data: AssessmentData): data is WjIvAssessmentData {
  return 'briefAchievement' in data || 'broadAchievement' in data ||
         'academicSkills' in data || 'academicFluency' in data ||
         'letterWordIdentification' in data || 'appliedProblems' in data ||
         'relativeProficiencyIndex' in data
}
