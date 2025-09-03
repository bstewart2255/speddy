import { MaterialsValidator } from '@/lib/lessons/validator';

describe('MaterialsValidator', () => {
  let validator: MaterialsValidator;

  beforeEach(() => {
    validator = new MaterialsValidator();
  });

  describe('validateLesson', () => {
    const createMockLesson = (materials: string, activityMaterials?: string[]) => ({
      lesson: {
        title: 'Test Lesson',
        duration: 30,
        objectives: ['Objective 1'],
        materials,
        overview: 'Test overview',
        introduction: {
          description: 'Test intro',
          duration: 5,
          instructions: ['Instruction 1'],
          materials: activityMaterials || []
        },
        mainActivity: {
          description: 'Test activity',
          duration: 20,
          instructions: ['Instruction 1'],
          materials: activityMaterials || []
        },
        closure: {
          description: 'Test closure',
          duration: 5,
          instructions: ['Instruction 1'],
          materials: activityMaterials || []
        },
        answerKey: {},
        roleSpecificContent: {}
      },
      studentMaterials: [],
      metadata: {
        validationStatus: 'pending' as const,
        validationErrors: [] as string[]
      }
    });

    it('should accept "whiteboard and markers" as a valid compound phrase', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers only',
        ['whiteboard and markers']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept "Whiteboard and markers" with capital W', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers only',
        ['Whiteboard and markers']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept "dry erase markers" plural', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers only',
        ['dry erase markers']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept "markers" plural form', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers only',
        ['markers']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept mixed valid materials', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers only',
        ['pencils', 'whiteboard and markers', 'worksheets']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle multiple "only" keywords properly', () => {
      const lesson = createMockLesson(
        'Only worksheets, pencils, whiteboard and markers only',
        ['whiteboard and markers', 'pencils']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject forbidden materials', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers only',
        ['scissors']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('scissors');
    });

    it('should reject unknown materials', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers only',
        ['random item']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('random item');
    });

    it('should not split "whiteboard and markers" when parsing', () => {
      const lesson = createMockLesson(
        'whiteboard and markers only',
        []
      );
      const result = validator.validateLesson(lesson as any);
      // Should not have errors about "whiteboard" and "markers" being separate invalid items
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle compound phrases in complex material strings', () => {
      const lesson = createMockLesson(
        'Paper, whiteboard and markers, pencils only',
        ['whiteboard and markers', 'paper']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept hyphenated "dry-erase markers"', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers only',
        ['dry-erase markers']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept hyphenated compound "whiteboard-and-markers"', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard-and-markers only',
        []
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject materials string missing the word "only"', () => {
      const lesson = createMockLesson(
        'Worksheets, pencils, whiteboard and markers',
        []
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/must specify "only"/i);
    });

    it('should correctly split "pencils and paper" after removing compound phrases', () => {
      const lesson = createMockLesson(
        'pencils and paper only',
        ['pencils', 'paper']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle mixed regular and compound materials with "and"', () => {
      const lesson = createMockLesson(
        'whiteboard and markers, pencils and paper only',
        ['whiteboard and markers', 'pencils', 'paper']
      );
      const result = validator.validateLesson(lesson as any);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});