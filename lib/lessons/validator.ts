// Materials validator for zero-prep compliance
import { 
  LessonResponse, 
  ALLOWED_MATERIALS, 
  FORBIDDEN_MATERIALS 
} from './schema';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class MaterialsValidator {
  /**
   * Validates that a lesson response follows zero-prep rules
   */
  validateLesson(lesson: LessonResponse): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check lesson plan materials
    this.validateMaterialsString(lesson.lesson.materials, 'Lesson materials', errors);
    
    // Check each activity section
    this.validateActivitySection(lesson.lesson.introduction, 'Introduction', errors);
    this.validateActivitySection(lesson.lesson.mainActivity, 'Main Activity', errors);
    this.validateActivitySection(lesson.lesson.closure, 'Closure', errors);

    // Check student materials
    if (Array.isArray(lesson?.studentMaterials)) {
      lesson.studentMaterials.forEach((material, index) => {
        this.validateStudentMaterial(material, `Student ${index + 1}`, errors);
      });
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
    
    // Remove common punctuation, then split on commas, 'and', and ampersands
    return processedMaterials
      .replace(/[()]/g, '')
      .split(/[,&]|\band\b/i)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s !== 'none');
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
    const t = (s || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Fold common plurals to singular
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

  private validateActivitySection(
    section: any, 
    sectionName: string, 
    errors: string[]
  ): void {
    if (!section) return;

    // Check materials list
    if (section.materials && Array.isArray(section.materials)) {
      section.materials.forEach((material: string) => {
        const materialLower = material.toLowerCase();
        
        // Check against forbidden list
        for (const forbidden of FORBIDDEN_MATERIALS) {
          if (materialLower.includes(forbidden)) {
            errors.push(`${sectionName}: Forbidden material "${forbidden}" found in "${material}"`);
          }
        }
        
        // Check if it's in allowed list (exact match, not substring)
        const isAllowed = ALLOWED_MATERIALS.some(allowed => {
          const allowedLower = allowed.toLowerCase();
          // Exact match or plural form match
          return materialLower === allowedLower || 
                 materialLower === allowedLower + 's' ||
                 (allowedLower.endsWith('s') && materialLower === allowedLower.slice(0, -1));
        });
        
        if (!isAllowed && materialLower !== 'none') {
          errors.push(`${sectionName}: Material "${material}" is not in the allowed list`);
        }
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
    
    // Check worksheet content
    if (Array.isArray(worksheet.content)) {
      worksheet.content.forEach((section: any, index: number) => {
        if (section.instructions) {
          this.checkForbiddenInText(
            section.instructions, 
            `${context} worksheet section ${index + 1}`, 
            errors
          );
        }
        
        // Check items
        if (Array.isArray(section.items)) {
          section.items.forEach((item: any, itemIndex: number) => {
            if (item.content) {
              this.checkForbiddenInText(
                item.content, 
                `${context} worksheet item ${itemIndex + 1}`, 
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

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      lesson.lesson.mainActivity,
      lesson.lesson.closure
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
    
    // Extract from student materials
    if (Array.isArray(lesson?.studentMaterials)) {
      lesson.studentMaterials.forEach(material => {
        if (material?.worksheet) {
          if (material.worksheet.title) texts.push(material.worksheet.title);
          if (material.worksheet.instructions) texts.push(material.worksheet.instructions);
        
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
}

// Export singleton instance
export const materialsValidator = new MaterialsValidator();