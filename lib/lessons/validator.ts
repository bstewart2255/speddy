// Materials validator for zero-prep compliance
import {
  LessonResponse,
  ALLOWED_MATERIALS,
  FORBIDDEN_MATERIALS
} from './schema';
import {
  getDurationMultiplier,
  getWhiteboardExampleRange,
  getBaseMinimum
} from './duration-constants';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Legacy lesson format support - old lessons may have these fields
interface LegacyLessonFields {
  mainActivity?: string | { materials?: string };
  closure?: string | { materials?: string };
}

// Type for lessons that may have legacy fields
type LessonWithLegacySupport = LessonResponse['lesson'] & LegacyLessonFields;

// Compound phrases that should be preserved as single units during material parsing
const COMPOUND_MATERIAL_PHRASES = [
  'whiteboard and markers',
  'whiteboard-and-markers',
  'dry erase markers',
  'dry-erase markers',
  'dry erase marker',
  'dry-erase marker'
];

export class MaterialsValidator {
  // Helper to escape special regex characters
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validates that a lesson response follows zero-prep rules
   */
  validateLesson(lesson: LessonResponse): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check lesson plan materials
    this.validateMaterialsString(lesson.lesson.materials, 'Lesson materials', errors);
    
    // Check each activity section - handle both new and legacy formats for backward compatibility
    if (lesson.lesson.introduction) {
      this.validateActivitySection(lesson.lesson.introduction, 'Introduction', errors);
    }
    if (lesson.lesson.activity) {
      this.validateActivitySection(lesson.lesson.activity, 'Activity', errors);
    }
    // Legacy format support (if mainActivity or closure exist from old lessons)
    const legacyLesson = lesson.lesson as LessonWithLegacySupport;
    if (legacyLesson.mainActivity) {
      this.validateActivitySection(legacyLesson.mainActivity, 'Main Activity', errors);
    }
    if (legacyLesson.closure) {
      this.validateActivitySection(legacyLesson.closure, 'Closure', errors);
    }

    // Check student materials
    if (Array.isArray(lesson?.studentMaterials)) {
      lesson.studentMaterials.forEach((material, index) => {
        this.validateStudentMaterial(material, `Student ${index + 1}`, errors);
      });

      // Validate story content for ELA reading comprehension lessons
      this.validateStoryContent(lesson, errors, warnings);

      // Validate content count based on duration and grade
      this.validateContentCount(lesson, errors);
    }

    // Validate teacher lesson plan if present
    if (lesson.lesson.teacherLessonPlan) {
      this.validateTeacherLessonPlan(lesson.lesson.teacherLessonPlan, errors, warnings);
    }

    // Check for forbidden materials in all text content
    const allText = this.extractAllText(lesson);
    this.checkForbiddenMaterials(allText, errors);

    // Update metadata with validation results
    lesson.metadata.validationStatus = errors.length === 0 ? 'passed' : 'failed';
    lesson.metadata.validationErrors = errors;

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateMaterialsString(materials: string, context: string, errors: string[]): void {
    // Guard against null/undefined materials
    if (materials == null) {
      errors.push(`${context}: Materials list is missing or undefined`);
      return;
    }
    
    const materialLower = materials.toLowerCase();
    
    // Parse materials into a list of items
    const mentionedMaterials = this.parseMaterialsList(materialLower);
    
    // Check for forbidden materials using normalized comparison
    const forbiddenSet = new Set(FORBIDDEN_MATERIALS.map((m) => this.normalizeMaterial(m)));
    const forbiddenMentioned = mentionedMaterials.filter(mat => {
      const norm = this.normalizeMaterial(mat);
      return forbiddenSet.has(norm);
    });
    if (forbiddenMentioned.length > 0) {
      errors.push(`${context}: Forbidden materials mentioned: ${forbiddenMentioned.join(', ')}`);
    }
    
    // Verify that ONLY allowed materials are mentioned
    // The string must contain "only" and all materials must be in the allowed list
    if (mentionedMaterials.length > 0) {
      // Check if "only" is present as a complete word in the original string
      const onlyPattern = /\bonly\b/i;
      if (!onlyPattern.test(materials)) {
        errors.push(`${context}: Must specify "only" when listing materials`);
      }
      
      // Check that each mentioned material (as a phrase) is allowed using normalized equality
      const allowedSet = new Set(ALLOWED_MATERIALS.map((m) => this.normalizeMaterial(m)));
      const unrecognizedMaterials = mentionedMaterials.filter((mat) => {
        if (forbiddenMentioned.includes(mat)) return false;
        const norm = this.normalizeMaterial(mat);
        return norm !== 'none' && !allowedSet.has(norm);
      });
      
      if (unrecognizedMaterials.length > 0) {
        errors.push(`${context}: Unrecognized materials: ${unrecognizedMaterials.join(', ')}. Only allowed: ${ALLOWED_MATERIALS.join(', ')}`);
      }
    }
  }
  
  // Helper to parse a materials string into a list of normalized material names
  private parseMaterialsList(materials: string): string[] {
    // Remove 'only' repeatedly until no more instances remain (handles cases like "only only pencils")
    let processedMaterials = materials;
    let previousLength;
    do {
      previousLength = processedMaterials.length;
      processedMaterials = processedMaterials.replace(/\bonly\b/gi, '');
    } while (processedMaterials.length !== previousLength);
    
    // Check for specific compound phrases first before splitting
    const foundPhrases: string[] = [];
    
    for (const phrase of COMPOUND_MATERIAL_PHRASES) {
      // Use word boundaries and escape special characters for safety
      const regex = new RegExp(`\\b${this.escapeRegExp(phrase)}\\b`, 'gi');
      const matches = processedMaterials.match(regex);
      if (matches) {
        foundPhrases.push(...matches.map(m => m.toLowerCase()));
        // Replace with space to maintain word boundaries
        // Create a new RegExp instance for replace to avoid state issues
        processedMaterials = processedMaterials.replace(new RegExp(`\\b${this.escapeRegExp(phrase)}\\b`, 'gi'), ' ');
      }
    }
    
    // Remove common punctuation, then split on commas, ampersands, and 'and'
    // Compound phrases have already been extracted, so we can safely split on 'and'
    const splitMaterials = processedMaterials
      .replace(/[()]/g, '')
      .split(/[,&]|\band\b/i)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s !== 'none');
    
    // Combine found compound phrases with split materials
    return [...foundPhrases, ...splitMaterials];
  }

  // Helper to tokenize a material string into individual words
  private tokenizeMaterial(material: string): string[] {
    // Remove punctuation and split into words
    return material
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(s => s.length > 0);
  }

  // Helper to check if two words are plural forms of each other
  private isPlural(word1: string, word2: string): boolean {
    // Simple plural check - can be enhanced with more rules
    if (word1 === word2 + 's') return true;
    if (word2 === word1 + 's') return true;
    if (word1 === word2 + 'es') return true;
    if (word2 === word1 + 'es') return true;
    // Handle words ending in 'y' -> 'ies'
    if (word1.endsWith('ies') && word2 === word1.slice(0, -3) + 'y') return true;
    if (word2.endsWith('ies') && word1 === word2.slice(0, -3) + 'y') return true;
    return false;
  }

  // Helper to normalize material names for comparison
  private normalizeMaterial(s: string): string {
    const lowerInput = (s || '').toLowerCase().trim();
    
    // Normalize punctuation/hyphens for preserved-phrase comparison
    const normalizedForPreserve = lowerInput
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Check if the normalized string matches a preserved phrase
    for (const phrase of COMPOUND_MATERIAL_PHRASES) {
      const normalizedPhrase = phrase
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalizedForPreserve === normalizedPhrase) {
        // Return the canonical form (without hyphens)
        return normalizedPhrase;
      }
    }
    
    // Otherwise, normalize as before
    const t = lowerInput
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Fold common plurals to singular (but keep both forms in allowed list)
    let r = t
      .replace(/\bmarkers\b/g, 'marker')
      .replace(/\bpencils\b/g, 'pencil')
      .replace(/\bpapers\b/g, 'paper')
      .replace(/\berasers\b/g, 'eraser')
      .replace(/\bnotebooks\b/g, 'notebook')
      .replace(/\bworksheets?\b/g, 'worksheets');
    
    // Handle synonyms and variations
    r = r
      .replace(/\bwhiteboard markers?\b/g, 'dry erase marker')
      .replace(/\bdry erase markers?\b/g, 'dry erase marker')
      .replace(/\bwhite board markers?\b/g, 'dry erase marker')
      .replace(/\bdry-erase markers?\b/g, 'dry erase marker');
    
    return r;
  }

  private validateContentCount(lesson: LessonResponse, errors: string[]): void {
    const duration = lesson.lesson.duration || 30;

    // Count total practice problems across all students
    lesson.studentMaterials?.forEach((material, studentIndex) => {
      if (!material.worksheet?.sections) return;

      const gradeGroup = material.gradeGroup || 3; // Default to grade 3 if not specified
      let activityItemCount = 0;

      // Count items in Activity section
      material.worksheet.sections.forEach((section: any) => {
        if (section.title === 'Activity' && section.items) {
          section.items.forEach((item: any) => {
            // Handle both nested and flat structures
            if (item.items && Array.isArray(item.items)) {
              // Nested structure: count items within item.items
              activityItemCount += item.items.filter((subItem: any) =>
                subItem.type !== 'example' &&
                subItem.type !== 'passage'
              ).length;
            } else if (item.type) {
              // Flat structure: count direct items (exclude examples and passages)
              if (item.type !== 'example' && item.type !== 'passage') {
                activityItemCount++;
              }
            }
          });
        }
      });

      // Calculate expected minimum based on grade and duration
      const baseMin = getBaseMinimum(gradeGroup);
      const multiplier = getDurationMultiplier(duration);
      const expectedMin = Math.ceil(baseMin * multiplier);

      if (activityItemCount < expectedMin) {
        errors.push(
          `Student ${studentIndex + 1} (Grade ${gradeGroup}): Insufficient practice problems. ` +
          `Found ${activityItemCount}, minimum ${expectedMin} required for ${duration}-minute lesson`
        );
      }
    });

    // Validate whiteboard examples count based on duration
    if (lesson.lesson.teacherLessonPlan?.whiteboardExamples) {
      const examples = lesson.lesson.teacherLessonPlan.whiteboardExamples;
      const expectedExamples = getWhiteboardExampleRange(duration);

      if (examples.length < expectedExamples.min) {
        errors.push(
          `Teacher lesson plan: Insufficient whiteboard examples. ` +
          `Found ${examples.length}, minimum ${expectedExamples.min} required for ${duration}-minute lesson`
        );
      } else if (examples.length > expectedExamples.max) {
        errors.push(
          `Teacher lesson plan: Too many whiteboard examples. ` +
          `Found ${examples.length}, maximum ${expectedExamples.max} allowed for ${duration}-minute lesson`
        );
      }
    }
  }

  private validateTeacherLessonPlan(
    lessonPlan: any,
    errors: string[],
    warnings: string[]
  ): void {
    // Check required fields
    if (!lessonPlan.studentInitials || !Array.isArray(lessonPlan.studentInitials) || lessonPlan.studentInitials.length === 0) {
      errors.push('Teacher lesson plan: Missing or empty student initials');
    }

    if (!lessonPlan.topic || typeof lessonPlan.topic !== 'string' || lessonPlan.topic.trim() === '') {
      errors.push('Teacher lesson plan: Missing or empty topic');
    }

    // Validate teacher introduction
    if (!lessonPlan.teacherIntroduction) {
      errors.push('Teacher lesson plan: Missing teacher introduction');
    } else {
      if (!lessonPlan.teacherIntroduction.script || lessonPlan.teacherIntroduction.script.trim() === '') {
        errors.push('Teacher lesson plan: Missing or empty introduction script');
      }
      if (!Array.isArray(lessonPlan.teacherIntroduction.materials)) {
        errors.push('Teacher lesson plan: Introduction materials must be an array');
      }
    }

    // Validate whiteboard examples structure (count is validated in validateContentCount)
    if (!Array.isArray(lessonPlan.whiteboardExamples)) {
      errors.push('Teacher lesson plan: Whiteboard examples must be an array');
    } else {
      lessonPlan.whiteboardExamples.forEach((example: any, index: number) => {
        if (!example.title || !example.problem || !Array.isArray(example.steps) || !example.teachingPoint) {
          errors.push(`Teacher lesson plan: Whiteboard example ${index + 1} missing required fields`);
        }
        if (example.steps && example.steps.length === 0) {
          errors.push(`Teacher lesson plan: Whiteboard example ${index + 1} must have at least one step`);
        }
      });
    }

    // Validate student problems
    if (!Array.isArray(lessonPlan.studentProblems) || lessonPlan.studentProblems.length === 0) {
      errors.push('Teacher lesson plan: Missing or empty student problems');
    } else {
      lessonPlan.studentProblems.forEach((studentSet: any, index: number) => {
        if (!studentSet.studentInitials) {
          errors.push(`Teacher lesson plan: Student problem set ${index + 1} missing student initials`);
        }
        if (!Array.isArray(studentSet.problems) || studentSet.problems.length === 0) {
          errors.push(`Teacher lesson plan: Student ${studentSet.studentInitials || index + 1} has no problems`);
        } else {
          studentSet.problems.forEach((problem: any, pIndex: number) => {
            if (!problem.number || !problem.question || !problem.answer) {
              errors.push(`Teacher lesson plan: Problem ${pIndex + 1} for student ${studentSet.studentInitials} missing required fields`);
            }
          });
        }
      });
    }
  }

  private validateActivitySection(
    section: any, 
    sectionName: string, 
    errors: string[]
  ): void {
    if (!section) return;

    // Check materials list
    if (section.materials && Array.isArray(section.materials)) {
      section.materials.forEach((material: string) => {
        // Parse the material string which might contain multiple materials (e.g., "Whiteboard, markers")
        const parsedMaterials = this.parseMaterialsList(material.toLowerCase());
        
        parsedMaterials.forEach(parsedMaterial => {
          const normalizedMaterial = this.normalizeMaterial(parsedMaterial);
          
          // Check against forbidden list
          const forbiddenSet = new Set(FORBIDDEN_MATERIALS.map(m => this.normalizeMaterial(m)));
          if (forbiddenSet.has(normalizedMaterial)) {
            errors.push(`${sectionName}: Forbidden material "${parsedMaterial}" found in "${material}"`);
          }
          
          // Check if it's in allowed list
          const allowedSet = new Set(ALLOWED_MATERIALS.map(m => this.normalizeMaterial(m)));
          if (!allowedSet.has(normalizedMaterial) && normalizedMaterial !== 'none') {
            errors.push(`${sectionName}: Material "${parsedMaterial}" is not in the allowed list`);
          }
        });
      });
    }

    // Check instructions for forbidden activities
    if (section.instructions && Array.isArray(section.instructions)) {
      section.instructions.forEach((instruction: string) => {
        this.checkForbiddenInText(instruction, `${sectionName} instructions`, errors);
      });
    }
  }

  private validateStudentMaterial(material: any, context: string, errors: string[]): void {
    if (!material.worksheet) return;

    const worksheet = material.worksheet;
    
    // Check new sections structure (current format)
    if (Array.isArray(worksheet.sections)) {
      worksheet.sections.forEach((section: any, sectionIndex: number) => {
        if (section.title) {
          this.checkForbiddenInText(
            section.title,
            `${context} worksheet section ${sectionIndex + 1} title`,
            errors
          );
        }
        
        if (section.instructions) {
          this.checkForbiddenInText(
            section.instructions,
            `${context} worksheet section ${sectionIndex + 1} instructions`,
            errors
          );
        }
        
        // Check items within sections
        if (Array.isArray(section.items)) {
          section.items.forEach((item: any, itemIndex: number) => {
            // Each item can have nested structure
            if (item.sectionTitle) {
              this.checkForbiddenInText(
                item.sectionTitle,
                `${context} worksheet section ${sectionIndex + 1} item ${itemIndex + 1} title`,
                errors
              );
            }
            
            if (item.instructions) {
              this.checkForbiddenInText(
                item.instructions,
                `${context} worksheet section ${sectionIndex + 1} item ${itemIndex + 1} instructions`,
                errors
              );
            }
            
            // Check nested items
            if (Array.isArray(item.items)) {
              item.items.forEach((nestedItem: any, nestedIndex: number) => {
                if (nestedItem.content) {
                  this.checkForbiddenInText(
                    nestedItem.content,
                    `${context} worksheet section ${sectionIndex + 1} item ${itemIndex + 1}.${nestedIndex + 1}`,
                    errors
                  );
                }
              });
            }
          });
        }
      });
    }
    
    // Check legacy content structure (backward compatibility)
    if (Array.isArray(worksheet.content)) {
      worksheet.content.forEach((section: any, index: number) => {
        if (section.instructions) {
          this.checkForbiddenInText(
            section.instructions, 
            `${context} worksheet content ${index + 1}`, 
            errors
          );
        }
        
        // Check items
        if (Array.isArray(section.items)) {
          section.items.forEach((item: any, itemIndex: number) => {
            if (item.content) {
              this.checkForbiddenInText(
                item.content, 
                `${context} worksheet content item ${itemIndex + 1}`, 
                errors
              );
            }
          });
        }
      });
    }
  }

  private checkForbiddenInText(text: string, context: string, errors: string[]): void {
    const textLower = text.toLowerCase();
    
    for (const forbidden of FORBIDDEN_MATERIALS) {
      const forbiddenLower = forbidden.toLowerCase();
      
      // Use word boundaries for short words to reduce false positives
      if (forbiddenLower.length <= 3) {
        const pattern = new RegExp(`\\b${this.escapeRegExp(forbiddenLower)}\\b`, 'i');
        if (pattern.test(textLower)) {
          errors.push(`${context}: Contains forbidden term "${forbidden}"`);
        }
      } else {
        // For longer words, check for false positive cases first
        if (forbiddenLower === 'cut' && /\b(shortcut|execute|cute)\b/i.test(text)) continue;
        if (forbiddenLower === 'online' && /\b(outline|deadline|storyline)\b/i.test(text)) continue;
        if (forbiddenLower === 'paste' && /\b(toothpaste)\b/i.test(text)) continue;
        if (forbiddenLower === 'app' && /\b(application|apply|appear|happy|approach)\b/i.test(text)) continue;
        
        if (textLower.includes(forbiddenLower)) {
          errors.push(`${context}: Contains forbidden term "${forbidden}"`);
        }
      }
    }
    
    // Check for movement activities
    const movementPhrases = [
      'stand up',
      'walk around',
      'move to',
      'go to',
      'gallery walk',
      'rotate between',
      'visit each'
    ];
    
    for (const phrase of movementPhrases) {
      if (textLower.includes(phrase)) {
        errors.push(`${context}: Contains movement activity "${phrase}" which is not allowed`);
      }
    }
  }

  private checkForbiddenMaterials(text: string, errors: string[]): void {
    const textLower = text.toLowerCase();
    
    // Check for specific forbidden patterns
    const forbiddenPatterns = [
      /\bcut\s+out\b/g,
      /\bcut\s+and\s+paste\b/g,
      /\bscissors\b/g,
      /\bglue\s+stick\b/g,
      /\bmanipulatives\b/g,
      /\bdice\b/g,
      /\bcards?\b/g,
      /\bapp\b/g,
      /\bwebsite\b/g,
      /\bonline\s+tool\b/g,
      /\bipad\b/g,
      /\btablet\b/g,
      /\bcomputer\b/g
    ];
    
    forbiddenPatterns.forEach(pattern => {
      const matches = textLower.match(pattern);
      if (matches) {
        errors.push(`Lesson contains forbidden material/activity: "${matches[0]}"`);
      }
    });
  }

  private extractAllText(lesson: LessonResponse): string {
    const texts: string[] = [];
    
    // Extract from lesson plan
    if (lesson?.lesson) {
      if (lesson.lesson.title) texts.push(lesson.lesson.title);
      if (lesson.lesson.overview) texts.push(lesson.lesson.overview);
      if (lesson.lesson.materials) texts.push(lesson.lesson.materials);
      if (Array.isArray(lesson.lesson.objectives)) {
        lesson.lesson.objectives.forEach(obj => texts.push(obj));
      }
    }
    
    // Extract from activities
    const activities = lesson?.lesson ? [
      lesson.lesson.introduction,
      lesson.lesson.activity
    ] : [];
    
    activities.forEach(activity => {
      if (activity) {
        if (activity.description) texts.push(activity.description);
        if (Array.isArray(activity.instructions)) {
          activity.instructions.forEach(inst => texts.push(inst));
        }
        if (Array.isArray(activity.materials)) {
          activity.materials.forEach(mat => texts.push(mat));
        }
      }
    });

    // Extract from teacher lesson plan
    if (lesson?.lesson?.teacherLessonPlan) {
      const tlp = lesson.lesson.teacherLessonPlan;
      if (tlp.topic) texts.push(tlp.topic);
      if (tlp.teacherIntroduction?.script) texts.push(tlp.teacherIntroduction.script);
      if (Array.isArray(tlp.whiteboardExamples)) {
        tlp.whiteboardExamples.forEach((ex: any) => {
          if (ex.title) texts.push(ex.title);
          if (ex.problem) texts.push(ex.problem);
          if (ex.teachingPoint) texts.push(ex.teachingPoint);
          if (Array.isArray(ex.steps)) {
            ex.steps.forEach((step: string) => texts.push(step));
          }
        });
      }
      if (Array.isArray(tlp.studentProblems)) {
        tlp.studentProblems.forEach((sp: any) => {
          if (Array.isArray(sp.problems)) {
            sp.problems.forEach((p: any) => {
              if (p.question) texts.push(p.question);
              if (p.answer) texts.push(p.answer);
            });
          }
        });
      }
    }
    
    // Extract from student materials
    if (Array.isArray(lesson?.studentMaterials)) {
      lesson.studentMaterials.forEach(material => {
        if (material?.worksheet) {
          if (material.worksheet.title) texts.push(material.worksheet.title);
          if (material.worksheet.instructions) texts.push(material.worksheet.instructions);
        
          // Extract from new sections structure
          if (Array.isArray(material.worksheet.sections)) {
            material.worksheet.sections.forEach(section => {
              if (section?.title) texts.push(section.title);
              if (section?.instructions) texts.push(section.instructions);
              
              if (Array.isArray(section?.items)) {
                section.items.forEach(item => {
                  if (item?.sectionTitle) texts.push(item.sectionTitle);
                  if (item?.instructions) texts.push(item.instructions);
                  
                  // Check nested items
                  if (Array.isArray(item?.items)) {
                    item.items.forEach(nestedItem => {
                      if (nestedItem?.content) texts.push(nestedItem.content);
                      if (nestedItem?.visualSupport) texts.push(nestedItem.visualSupport);
                    });
                  }
                });
              }
            });
          }
          
          // Extract from legacy content structure (backward compatibility)
          if (Array.isArray(material.worksheet.content)) {
            material.worksheet.content.forEach(content => {
              if (content?.sectionTitle) texts.push(content.sectionTitle);
              if (content?.instructions) texts.push(content.instructions);
            
              if (Array.isArray(content?.items)) {
                content.items.forEach(item => {
                  if (item?.content) texts.push(item.content);
                  if (item?.visualSupport) texts.push(item.visualSupport);
                });
              }
            });
          }
        }
      });
    }
    
    return texts.join(' ');
  }

  /**
   * Validates that ELA reading comprehension lessons include story/passage content
   */
  private validateStoryContent(lesson: LessonResponse, errors: string[], warnings: string[]): void {
    // Check if this is an ELA reading comprehension lesson
    const isReadingLesson =
      lesson.lesson.title?.toLowerCase().includes('reading') ||
      lesson.lesson.title?.toLowerCase().includes('comprehension') ||
      lesson.lesson.overview?.toLowerCase().includes('reading') ||
      lesson.lesson.overview?.toLowerCase().includes('story') ||
      lesson.lesson.overview?.toLowerCase().includes('passage');

    if (!isReadingLesson) {
      return; // Not a reading comprehension lesson, no validation needed
    }

    // Check if any worksheet has comprehension questions
    let hasComprehensionQuestions = false;
    let hasStoryPassage = false;

    lesson.studentMaterials?.forEach((material) => {
      if (!material.worksheet?.sections) return;

      material.worksheet.sections.forEach((section: any) => {
        if (!section.items) return;

        // Handle nested structure
        const items = Array.isArray(section.items) ? section.items : [];
        items.forEach((item: any) => {
          // Check for nested items structure
          const nestedItems = item.items && Array.isArray(item.items) ? item.items : [item];

          nestedItems.forEach((subItem: any) => {
            // Check for passage/story content
            // Only accept type: 'passage' as a story - 'text' items are often just instructions
            if (subItem.type === 'passage') {
              hasStoryPassage = true;
            }

            // Check if the text content looks like it contains a story (minimum length for story)
            if (subItem.type === 'text' && subItem.content && subItem.content.length > 200) {
              // Check if this text item actually contains story-like content
              const textContent = subItem.content.toLowerCase();
              if (
                textContent.includes('once upon a time') ||
                textContent.includes('there was a') ||
                textContent.includes('there lived') ||
                (textContent.includes('.') && textContent.includes('"') && textContent.length > 300) // Likely a narrative with dialogue
              ) {
                hasStoryPassage = true;
              }
            }

            // Check for comprehension questions about stories/passages
            const content = subItem.content?.toLowerCase() || '';
            if (
              content.includes('main idea') ||
              content.includes('main character') ||
              content.includes('what happened') ||
              content.includes('in the story') ||
              content.includes('in the passage') ||
              content.includes('the story') ||
              content.includes('who was') ||
              content.includes('why did') ||
              content.includes('what did')
            ) {
              hasComprehensionQuestions = true;
            }

            // Also check if story is embedded in the question itself (like the Fox example)
            if (
              content.includes('once upon a time') ||
              content.includes('there was') ||
              content.includes('read the story:') ||
              content.includes('read the following')
            ) {
              hasStoryPassage = true;
            }
          });
        });
      });
    });

    // Also check legacy format: worksheet.content
    lesson.studentMaterials?.forEach((material) => {
      const content = material.worksheet?.content;
      if (!Array.isArray(content)) return;

      content.forEach((section: any) => {
        const items = section.items || [];
        items.forEach((item: any) => {
          const itemType = (item.type || '').toLowerCase();
          const itemContent = (item.content || '').toLowerCase();

          // Check for passage in legacy format
          if (itemType === 'passage') {
            hasStoryPassage = true;
          }

          // Check if text looks like a story in legacy format
          if (itemType === 'text' && item.content && item.content.length > 200) {
            if (
              itemContent.includes('once upon a time') ||
              itemContent.includes('there was a') ||
              itemContent.includes('there lived') ||
              (itemContent.includes('.') && itemContent.includes('"') && item.content.length > 300)
            ) {
              hasStoryPassage = true;
            }
          }

          // Check for comprehension questions in legacy format
          if (
            /\bmain idea|main character|what happened|in the (story|passage)\b/.test(itemContent) ||
            /\bthe story|who was|why did|what did\b/.test(itemContent)
          ) {
            hasComprehensionQuestions = true;
          }

          // Check for embedded stories in legacy format
          if (/\bonce upon a time\b|\bread the (story|following)\b/.test(itemContent)) {
            hasStoryPassage = true;
          }
        });
      });
    });

    // Validate: if there are comprehension questions, there must be a story
    if (hasComprehensionQuestions && !hasStoryPassage) {
      errors.push(
        'Reading comprehension lesson has questions about a story/passage but no actual story text is included. ' +
        'Stories must be included as type:"passage" items or within question content.'
      );
    }

    // Add warning if it seems like a reading lesson but has neither stories nor questions
    if (isReadingLesson && !hasComprehensionQuestions && !hasStoryPassage) {
      warnings.push(
        'This appears to be a reading lesson but contains no reading passage or comprehension questions.'
      );
    }
  }
}

// Export singleton instance
export const materialsValidator = new MaterialsValidator();