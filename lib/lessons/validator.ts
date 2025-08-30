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
    lesson.studentMaterials.forEach((material, index) => {
      this.validateStudentMaterial(material, `Student ${index + 1}`, errors);
    });

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
    const materialLower = materials.toLowerCase();
    
    // Parse materials into a list of items
    const mentionedMaterials = this.parseMaterialsList(materialLower);
    
    // Check for forbidden materials
    const forbiddenMentioned = mentionedMaterials.filter(mat =>
      FORBIDDEN_MATERIALS.some(forbidden => mat.includes(forbidden))
    );
    if (forbiddenMentioned.length > 0) {
      errors.push(`${context}: Forbidden materials mentioned: ${forbiddenMentioned.join(', ')}`);
    }
    
    // Verify that ONLY allowed materials are mentioned
    // The string must contain "only" and all materials must be in the allowed list
    if (mentionedMaterials.length > 0) {
      // Check if "only" is present in the original string
      if (!materialLower.includes('only')) {
        errors.push(`${context}: Must specify "only" when listing materials`);
      }
      
      // Check that all mentioned materials are allowed
      const unrecognizedMaterials = mentionedMaterials.filter(mat => {
        // Skip if it's already identified as forbidden
        if (forbiddenMentioned.includes(mat)) return false;
        
        // Check if this material is in the allowed list
        const isAllowed = ALLOWED_MATERIALS.some(allowed => {
          const allowedLower = allowed.toLowerCase();
          // Exact match or plural form match
          return mat === allowedLower || 
                 mat === allowedLower + 's' ||
                 (allowedLower.endsWith('s') && mat === allowedLower.slice(0, -1));
        });
        
        return !isAllowed;
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
    if (worksheet.content && Array.isArray(worksheet.content)) {
      worksheet.content.forEach((section: any, index: number) => {
        if (section.instructions) {
          this.checkForbiddenInText(
            section.instructions, 
            `${context} worksheet section ${index + 1}`, 
            errors
          );
        }
        
        // Check items
        if (section.items && Array.isArray(section.items)) {
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
    texts.push(lesson.lesson.title);
    texts.push(lesson.lesson.overview);
    texts.push(lesson.lesson.materials);
    lesson.lesson.objectives.forEach(obj => texts.push(obj));
    
    // Extract from activities
    const activities = [
      lesson.lesson.introduction,
      lesson.lesson.mainActivity,
      lesson.lesson.closure
    ];
    
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
    lesson.studentMaterials.forEach(material => {
      if (material.worksheet) {
        texts.push(material.worksheet.title);
        texts.push(material.worksheet.instructions);
        
        material.worksheet.content.forEach(content => {
          texts.push(content.sectionTitle);
          texts.push(content.instructions);
          
          content.items.forEach(item => {
            texts.push(item.content);
            if (item.visualSupport) texts.push(item.visualSupport);
          });
        });
      }
    });
    
    return texts.join(' ');
  }
}

// Export singleton instance
export const materialsValidator = new MaterialsValidator();