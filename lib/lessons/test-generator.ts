// Test file for the JSON lesson generator
// Run with: npx tsx lib/lessons/test-generator.ts

import { lessonGenerator } from './generator';
import { LessonRequest } from './schema';
import { materialsValidator } from './validator';

async function testLessonGeneration() {
  console.log('Testing JSON Lesson Generator...\n');
  
  // Test request
  const request: LessonRequest = {
    students: [
      {
        id: 'student-1',
        grade: 2,
        readingLevel: 2.5,
        iepGoals: ['Improve reading comprehension', 'Develop phonics skills'],
        accommodations: ['Visual supports', 'Reduced problem count']
      },
      {
        id: 'student-2',
        grade: 3,
        readingLevel: 3.0,
        iepGoals: ['Master multiplication facts', 'Improve word problems'],
        accommodations: ['Extra time', 'Step-by-step instructions']
      },
      {
        id: 'student-3',
        grade: 5,
        readingLevel: 4.5,
        iepGoals: ['Develop writing skills', 'Improve organization'],
        accommodations: ['Graphic organizers', 'Sentence starters']
      }
    ],
    teacherRole: 'resource',
    subject: 'Math',
    subjectType: 'math',
    topic: 'Addition and Subtraction',
    duration: 30,
    focusSkills: ['Number sense', 'Problem solving']
  };
  
  try {
    console.log('Generating lesson for:');
    console.log(`- ${request.students.length} students`);
    console.log(`- Grades: ${request.students.map(s => s.grade).join(', ')}`);
    console.log(`- Subject: ${request.subject}`);
    console.log(`- Duration: ${request.duration} minutes`);
    console.log(`- Teacher Role: ${request.teacherRole}`);
    console.log('\n');
    
    const { lesson, validation } = await lessonGenerator.generateLesson(request);
    
    console.log('✅ Lesson generated successfully!');
    console.log('\nLesson Details:');
    console.log(`- Title: ${lesson.lesson.title}`);
    console.log(`- Objectives: ${lesson.lesson.objectives.length} objectives`);
    console.log(`- Materials: ${lesson.lesson.materials}`);
    console.log(`- Grade Groups: ${lesson.metadata.gradeGroups.length} groups`);
    
    // Show grade groups
    console.log('\nGrade Groups:');
    lesson.metadata.gradeGroups.forEach((group, i) => {
      console.log(`  Group ${i + 1}: Grades ${group.grades.join(', ')} (${group.studentIds.length} students)`);
    });
    
    // Show validation results
    console.log('\nValidation Results:');
    console.log(`- Status: ${validation.isValid ? '✅ PASSED' : '❌ FAILED'}`);
    if (validation.errors.length > 0) {
      console.log('- Errors:');
      validation.errors.forEach(error => console.log(`  • ${error}`));
    }
    if (validation.warnings.length > 0) {
      console.log('- Warnings:');
      validation.warnings.forEach(warning => console.log(`  • ${warning}`));
    }
    
    // Show student materials
    console.log('\nStudent Materials:');
    lesson.studentMaterials.forEach((material, i) => {
      console.log(`  Student ${material.studentId}:`);
      console.log(`    - Worksheet: ${material.worksheet.title}`);
      console.log(`    - Sections: ${material.worksheet.content?.length || 0}`);
      console.log(`    - Accommodations: ${material.worksheet.accommodations.join(', ') || 'None'}`);
    });
    
    // Show metadata
    console.log('\nMetadata:');
    console.log(`- Model: ${lesson.metadata.modelUsed}`);
    console.log(`- Generation Time: ${lesson.metadata.generationTime}ms`);
    console.log(`- Validation Status: ${lesson.metadata.validationStatus}`);
    
    // Save to file for inspection
    const fs = await import('fs').then(m => m.promises);
    const outputPath = './test-lesson-output.json';
    await fs.writeFile(outputPath, JSON.stringify(lesson, null, 2));
    console.log(`\n📄 Full lesson saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if this file is executed directly
// Using import.meta.url for ESM compatibility
// Falls back to process.argv check for broader compatibility
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('test-generator.ts');

if (isMainModule) {
  testLessonGeneration().then(() => {
    console.log('\n✨ Test complete!');
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testLessonGeneration };