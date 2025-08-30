// Main exports for the JSON lesson generation system

export * from './schema';
export * from './providers';
export * from './prompts';
export * from './validator';
export * from './renderer';
export * from './generator';

// Export singleton instances for convenience
export { lessonGenerator } from './generator';
export { promptBuilder } from './prompts';
export { materialsValidator } from './validator';
export { worksheetRenderer } from './renderer';