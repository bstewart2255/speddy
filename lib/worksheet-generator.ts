/**
 * @deprecated This class uses hardcoded templates and should be replaced with AI-generated content.
 * 
 * ISSUE #213: This WorksheetGenerator class contains static, hardcoded worksheet templates 
 * that don't reflect the AI-generated differentiated content created for each student.
 * 
 * NEW APPROACH: The system now uses AI-generated content from JSON responses when available:
 * 1. AI generates individualized worksheets in the `studentMaterials` section
 * 2. The WorksheetRenderer class (lib/lessons/renderer.ts) renders these to HTML
 * 3. This generator is only used as a fallback for non-JSON/legacy content
 * 
 * TODO: Once all lessons are migrated to JSON format, this file can be removed entirely.
 * 
 * Files that have been updated to use AI content with fallback:
 * - /app/components/ai-content-modal.tsx
 * - /app/components/ai-content-modal-enhanced.tsx
 */

import { jsPDF } from 'jspdf';
// QR CODE DISABLED: Commenting out QR code functionality to simplify pipeline (Issue #268)
// import QRCode from 'qrcode';

export type Subject = 'math' | 'ela';
export type GradeLevel = 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

export interface WorksheetConfig {
  studentName: string;
  subject: Subject;
  gradeLevel: GradeLevel;
  sessionDate?: Date;
  sessionTime?: string;
  lessonId?: string;
}

/**
 * @deprecated Use WorksheetRenderer with AI-generated content instead
 */
export class WorksheetGenerator {
  private doc: jsPDF;

  constructor() {
    this.doc = new jsPDF();
  }

  async generateWorksheet(config: WorksheetConfig): Promise<string> {
    this.doc = new jsPDF(); // Reset for new worksheet

    // QR CODE DISABLED: Commenting out QR code functionality to simplify pipeline (Issue #268)
    console.log('[QR DISABLED] Skipping QR code generation in WorksheetGenerator');

    /* ORIGINAL QR CODE - PRESERVED FOR FUTURE REFERENCE
    // Generate unique worksheet code
    const worksheetCode = `WS-${Date.now()}`;

    // Generate QR code with URL format
    const qrUrl = `https://app.speddy.com/ws/${worksheetCode}`;

    try {
      const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 60,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Add smaller QR code to top right corner with border
      this.doc.setDrawColor(0);
      this.doc.setLineWidth(0.5);
      this.doc.rect(170, 10, 25, 25); // Reduced from 165,8,32,32 to 170,10,25,25
      this.doc.addImage(qrCodeDataUrl, 'PNG', 171, 11, 23, 23); // Reduced from 166,9,30,30 to 171,11,23,23

      // Add small text below QR code
      this.doc.setFontSize(7); // Reduced from 8
      this.doc.setTextColor(100);
      this.doc.text('Scan to submit', 182.5, 37, { align: 'center' }); // Adjusted position
      this.doc.setTextColor(0); // Reset to black

    } catch (error) {
      console.error('Error generating QR code:', error);
      // Continue without QR code if there's an error
    }
    */

    if (config.subject === 'math') {
      return await this.generateMathWorksheet(config);
    } else {
      return await this.generateELAWorksheet(config);
    }
  }

  private addStandardHeader(config: WorksheetConfig): void {
    const { studentName, gradeLevel, sessionTime, sessionDate } = config;

    // Add header information (left side)
    this.doc.setFontSize(16);
    this.doc.text(`Name: ${studentName || '_________________'}`, 20, 20);
    this.doc.text(`Date: ${sessionDate ? sessionDate.toLocaleDateString() : new Date().toLocaleDateString()}`, 20, 30);

    // Add grade level and session time
    this.doc.setFontSize(12);
    this.doc.text(`Grade: ${gradeLevel}`, 20, 40);
    if (sessionTime) {
      this.doc.text(`Session: ${sessionTime}`, 80, 40);
    }

    // Draw a line under the header for separation
    this.doc.setLineWidth(0.5);
    this.doc.line(20, 45, 190, 45);
  }

  private async generateELAWorksheet(config: WorksheetConfig): Promise<string> {
    // Add standard header
    this.addStandardHeader(config);

    switch (config.gradeLevel) {
      case 'K':
        this.generateKindergartenELA();
        break;
      case '1':
        this.generateFirstGradeELA();
        break;
      case '2':
        this.generateSecondGradeELA();
        break;
      case '3':
        this.generateThirdGradeELA();
        break;
      case '4':
        this.generateFourthGradeELA();
        break;
      case '5':
        this.generateFifthGradeELA();
        break;
      default:
        this.doc.text('Worksheet coming soon!', 20, 60);
    }

    return this.doc.output('datauristring');
  }

  private async generateMathWorksheet(config: WorksheetConfig): Promise<string> {
    // Add standard header
    this.addStandardHeader(config);

    switch (config.gradeLevel) {
      case 'K':
        this.generateKindergartenMath();
        break;
      case '1':
        this.generateFirstGradeMath();
        break;
      case '2':
        this.generateSecondGradeMath();
        break;
      case '3':
        this.generateThirdGradeMath();
        break;
      case '4':
        this.generateFourthGradeMath();
        break;
      case '5':
        this.generateFifthGradeMath();
        break;
      default:
        this.doc.text('Worksheet coming soon!', 20, 60);
    }

    return this.doc.output('datauristring');
  }

  // KINDERGARTEN WORKSHEETS
  private generateKindergartenELA(): void {
    this.doc.setFontSize(20);
    this.doc.text('Letter Recognition Practice', 105, 60, { align: 'center' });

    // Generate target letter
    const targetLetter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];

    // Upper case section
    this.doc.setFontSize(14);
    this.doc.text(`1. Circle all the letter ${targetLetter}:`, 20, 75);

    this.doc.setFontSize(24);
    let x = 20;
    let y = 90;

    // Corrected Declaration with Type Annotation
    let letters: string[] = [];

    // Create array with target letter appearing 3-4 times
    const targetCount = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < targetCount; i++) {
      letters.push(targetLetter);
    }

    // Fill rest with random letters
    while (letters.length < 15) {
      const randomLetter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
      if (randomLetter !== targetLetter) {
        letters.push(randomLetter);
      }
    }

    // Shuffle and display
    letters.sort(() => Math.random() - 0.5);
    letters.forEach((letter, index) => {
      if (index % 5 === 0 && index !== 0) {
        x = 20;
        y += 25;
      }
      this.doc.text(letter, x, y);
      x += 35;
    });

    // Lower case section
    y += 40;
    this.doc.setFontSize(14);
    this.doc.text(`2. Match the uppercase to lowercase:`, 20, y);

    y += 15;
    const matchLetters = ['A', 'B', 'C', 'D', 'E'];
    const lowerLetters = ['a', 'b', 'c', 'd', 'e'].sort(() => Math.random() - 0.5);

    this.doc.setFontSize(20);
    matchLetters.forEach((letter, index) => {
      this.doc.text(letter, 30, y + (index * 25));
      this.doc.text('___', 60, y + (index * 25));
      this.doc.text(lowerLetters[index], 120, y + (index * 25));
    });
  }

  private generateKindergartenMath(): void {
    this.doc.setFontSize(20);
    this.doc.text('Number Sense Practice', 105, 35, { align: 'center' });

    // Counting objects
    this.doc.setFontSize(14);
    this.doc.text('1. Count the shapes and write the number:', 20, 50);

    let y = 65;
    const shapes = ['circles', 'squares', 'triangles'];

    shapes.forEach((shape, shapeIndex) => {
      const count = Math.floor(Math.random() * 8) + 2; // 2-9 objects

      // Draw shapes
      let x = 20;
      for (let i = 0; i < count; i++) {
        if (shape === 'circles') {
          this.doc.circle(x, y, 5);
        } else if (shape === 'squares') {
          this.doc.rect(x - 5, y - 5, 10, 10);
        } else {
          // Simple triangle
          this.doc.line(x, y - 5, x - 5, y + 5);
          this.doc.line(x - 5, y + 5, x + 5, y + 5);
          this.doc.line(x + 5, y + 5, x, y - 5);
        }
        x += 20;
      }

      // Answer box
      this.doc.text('____', 180, y + 2);

      y += 30;
    });

    // Number recognition
    y += 10;
    this.doc.setFontSize(14);
    this.doc.text('2. Circle the number:', 20, y);

    y += 15;
    const targetNumbers = [3, 7, 5];
    targetNumbers.forEach((target) => {
      this.doc.text(`Find ${target}:`, 20, y);

      const numbers = [target];
      while (numbers.length < 5) {
        const num = Math.floor(Math.random() * 10);
        if (num !== target && !numbers.includes(num)) {
          numbers.push(num);
        }
      }

      numbers.sort(() => Math.random() - 0.5);
      let x = 70;
      numbers.forEach((num) => {
        this.doc.text(num.toString(), x, y);
        x += 20;
      });

      y += 20;
    });
  }

  // FIRST GRADE WORKSHEETS
  private generateFirstGradeELA(): void {
    this.doc.setFontSize(20);
    this.doc.text('Phonemic Awareness', 105, 60, { align: 'center' });

    // Blending sounds
    this.doc.setFontSize(14);
    this.doc.text('1. Blend the sounds to make a word:', 20, 50);

    const blendWords = [
      { sounds: 'c - a - t', word: 'cat' },
      { sounds: 'd - o - g', word: 'dog' },
      { sounds: 'r - u - n', word: 'run' },
      { sounds: 'b - i - g', word: 'big' },
      { sounds: 'h - o - t', word: 'hot' }
    ];

    let y = 65;
    blendWords.forEach((item) => {
      this.doc.text(item.sounds, 20, y);
      this.doc.text('→ _________', 80, y);
      y += 20;
    });

    // Segmenting
    y += 10;
    this.doc.text('2. Break the word into sounds:', 20, y);

    const segmentWords = ['map', 'sit', 'pen', 'hop', 'bed'];
    y += 15;

    segmentWords.forEach((word) => {
      this.doc.text(word, 20, y);
      this.doc.text('→ ___ - ___ - ___', 60, y);
      y += 20;
    });
  }

  private generateFirstGradeMath(): void {
    this.doc.setFontSize(20);
    this.doc.text('Addition & Subtraction Within 20', 105, 35, { align: 'center' });

    // Addition problems
    this.doc.setFontSize(14);
    this.doc.text('1. Solve:', 20, 50);

    let y = 65;
    let x = 20;

    // Generate 10 addition problems
    for (let i = 0; i < 10; i++) {
      const a = Math.floor(Math.random() * 10) + 1;
      const b = Math.floor(Math.random() * (20 - a));

      this.doc.text(`${a} + ${b} = ____`, x, y);

      if (i === 4) {
        x = 20;
        y += 25;
      } else {
        x += 70;
      }
    }

    // Subtraction problems
    y += 35;
    x = 20;
    this.doc.text('2. Solve:', 20, y);
    y += 15;

    for (let i = 0; i < 10; i++) {
      const a = Math.floor(Math.random() * 15) + 5;
      const b = Math.floor(Math.random() * a);

      this.doc.text(`${a} - ${b} = ____`, x, y);

      if (i === 4) {
        x = 20;
        y += 25;
      } else {
        x += 70;
      }
    }
  }

  // SECOND GRADE WORKSHEETS
  private generateSecondGradeELA(): void {
    this.doc.setFontSize(20);
    this.doc.text('Reading Comprehension', 105, 60, { align: 'center' });

    // Simple passage
    this.doc.setFontSize(12);
    const passage = `The big red barn sat on the hill. Inside the barn lived many animals.
There were three brown cows, five white sheep, and one black horse.
Every morning, the farmer came to feed them. The cows gave milk.
The sheep gave wool. The horse helped pull the wagon.
All the animals were happy on the farm.`;

    const wrappedText = this.doc.splitTextToSize(passage, 170);
    let y = 75; // Standard starting position for content

    wrappedText.forEach((line: string) => {
      this.doc.text(line, 20, y);
      y += 7;
    });

    // Questions
    y += 10;
    this.doc.setFontSize(14);
    this.doc.text('Questions:', 20, y);

    y += 10;
    this.doc.setFontSize(12);
    const questions = [
      '1. What color was the barn?',
      '2. How many cows lived in the barn?',
      '3. What did the sheep give?',
      '4. When did the farmer come to feed the animals?'
    ];

    questions.forEach((question) => {
      this.doc.text(question, 20, y);
      y += 8;
      this.doc.text('_________________________________________________', 20, y);
      y += 15;
    });
  }

  private generateSecondGradeMath(): void {
    this.doc.setFontSize(20);
    this.doc.text('Place Value Practice', 105, 60, { align: 'center' });

    // Understanding place value
    this.doc.setFontSize(14);
    this.doc.text('1. Write the number in expanded form:', 20, 50);

    let y = 65;
    const numbers = [234, 567, 109, 820, 445];

    numbers.forEach((num) => {
      this.doc.text(`${num} = ___ hundreds + ___ tens + ___ ones`, 20, y);
      y += 20;
    });

    // Comparing numbers
    y += 10;
    this.doc.text('2. Circle the bigger number:', 20, y);

    y += 15;
    const comparisons = [
      [245, 254],
      [302, 320],
      [199, 201],
      [567, 576],
      [400, 399]
    ];

    comparisons.forEach((pair) => {
      this.doc.text(`${pair[0]}     or     ${pair[1]}`, 20, y);
      y += 20;
    });

    // Number ordering
    y += 10;
    this.doc.text('3. Write these numbers from smallest to largest:', 20, y);

    y += 15;
    const orderSet = [432, 234, 423, 324, 342];
    this.doc.text(orderSet.join(',  '), 20, y);

    y += 15;
    this.doc.text('____, ____, ____, ____, ____', 20, y);
  }

  // THIRD GRADE WORKSHEETS
  private generateThirdGradeELA(): void {
    this.doc.setFontSize(20);
    this.doc.text('Main Idea & Inferencing', 105, 60, { align: 'center' });

    // Passage with inference opportunities
    this.doc.setFontSize(11);
    const passage = `Maria looked out the window and frowned. The sky was dark gray,
and she could hear thunder in the distance. She had been planning
this picnic for weeks! All her friends were supposed to meet at the
park at noon. Maria checked her phone - no messages yet. She grabbed
her raincoat from the closet and sighed. Maybe they could move the
picnic indoors. Her mom was making sandwiches in the kitchen.
"Don't worry," her mom said, "We'll figure something out."`;

    const wrappedText = this.doc.splitTextToSize(passage, 170);
    let y = 75; // Standard starting position for content

    wrappedText.forEach((line: string) => {
      this.doc.text(line, 20, y);
      y += 7;
    });

    // Questions requiring inference
    y += 10;
    this.doc.setFontSize(13);
    this.doc.text('Answer the questions:', 20, y);

    y += 10;
    this.doc.setFontSize(11);
    const questions = [
      '1. What was Maria planning to do today?',
      '2. Why do you think Maria frowned? Use evidence from the text.',
      '3. What is the main problem in this story?',
      '4. What do you think will happen next? Why?'
    ];

    questions.forEach((question) => {
      this.doc.text(question, 20, y);
      y += 7;
      this.doc.text('_________________________________________________', 20, y);
      y += 7;
      this.doc.text('_________________________________________________', 20, y);
      y += 12;
    });
  }

  private generateThirdGradeMath(): void {
    this.doc.setFontSize(20);
    this.doc.text('Multiplication Facts', 105, 35, { align: 'center' });

    // Basic multiplication facts
    this.doc.setFontSize(14);
    this.doc.text('1. Multiplication Facts (2 minutes):', 20, 50);

    let y = 65;
    let x = 20;

    // Generate 20 multiplication problems (focus on 2-9 times tables)
    for (let i = 0; i < 20; i++) {
      const a = Math.floor(Math.random() * 8) + 2;
      const b = Math.floor(Math.random() * 8) + 2;

      this.doc.setFontSize(12);
      this.doc.text(`${a} × ${b} = ___`, x, y);

      if ((i + 1) % 5 === 0) {
        x = 20;
        y += 20;
      } else {
        x += 35;
      }
    }

    // Word problems
    y += 10;
    x = 20;
    this.doc.setFontSize(14);
    this.doc.text('2. Solve the word problems:', x, y);

    y += 15;
    this.doc.setFontSize(11);

    const problems = [
      'Sam has 4 bags of marbles. Each bag has 6 marbles. How many marbles does Sam have in total?',
      'There are 7 rows of desks in the classroom. Each row has 5 desks. How many desks are there?',
      'A pizza has 8 slices. If we order 3 pizzas, how many slices will we have?'
    ];

    problems.forEach((problem, index) => {
      // Word wrap for longer problems
      const words = problem.split(' ');
      let line = '';
      let lineY = y;

      words.forEach((word, i) => {
        if (line.length + word.length > 70) {
          this.doc.text(line, x, lineY);
          line = word + ' ';
          lineY += 6;
        } else {
          line += word + ' ';
        }

        if (i === words.length - 1) {
          this.doc.text(line, x, lineY);
        }
      });

      y = lineY + 8;
      this.doc.text('Answer: _____________', x, y);
      y += 15;
    });
  }

  // FOURTH GRADE WORKSHEETS
  private generateFourthGradeELA(): void {
    this.doc.setFontSize(20);
    this.doc.text('Summarizing & Synthesizing', 105, 60, { align: 'center' });

    // Passage for summarizing
    this.doc.setFontSize(11);
    const passage = `The Amazon rainforest is often called the "lungs of the Earth" because it produces
  about 20% of the world's oxygen. This massive forest covers over 2 million square miles
  across nine South American countries. The Amazon is home to an incredible variety of life,
  with scientists estimating that it contains 10% of all species on Earth. Many of these
  species haven't even been discovered yet! The rainforest also plays a crucial role in
  regulating the global climate by absorbing carbon dioxide from the atmosphere.
  Unfortunately, deforestation threatens this vital ecosystem, with thousands of acres
  being cleared each year for farming and development.`;

    const wrappedText = this.doc.splitTextToSize(passage, 170);
    let y = 75; // Standard starting position for content

    wrappedText.forEach((line: string) => {
      this.doc.text(line, 20, y);
      y += 7;
    });

    // Summarizing tasks
    y += 10;
    this.doc.setFontSize(13);
    this.doc.text('Tasks:', 20, y);

    y += 10;
    this.doc.setFontSize(11);

    this.doc.text('1. Write a 2-sentence summary of the main idea:', 20, y);
    y += 8;
    this.doc.text('_________________________________________________', 20, y);
    y += 7;
    this.doc.text('_________________________________________________', 20, y);

    y += 15;
    this.doc.text('2. List the 3 most important facts from the passage:', 20, y);
    y += 8;
    this.doc.text('• _____________________________________________', 20, y);
    y += 8;
    this.doc.text('• _____________________________________________', 20, y);
    y += 8;
    this.doc.text('• _____________________________________________', 20, y);

    y += 15;
    this.doc.text('3. What details could be removed without changing the main message?', 20, y);
    y += 8;
    this.doc.text('_________________________________________________', 20, y);
    y += 7;
    this.doc.text('_________________________________________________', 20, y);
  }

  private generateFourthGradeMath(): void {
    this.doc.setFontSize(20);
    this.doc.text('Multi-Digit Multiplication & Division', 105, 60, { align: 'center' });

    // Multi-digit multiplication
    this.doc.setFontSize(14);
    this.doc.text('1. Solve using the standard algorithm:', 20, 50);

    let y = 65;
    let x = 20;

    // Generate 6 multiplication problems
    const multiplicationProblems = [
      [234, 5],
      [467, 3],
      [125, 8],
      [342, 6],
      [58, 24],
      [73, 36]
    ];

    multiplicationProblems.forEach((problem, index) => {
      this.doc.setFontSize(12);
      this.doc.text(`${problem[0]}`, x + 15, y);
      this.doc.text(`×  ${problem[1]}`, x, y + 8);
      this.doc.line(x, y + 12, x + 40, y + 12);

      if (index === 2) {
        x = 120;
        y = 65;
      } else {
        y += 35;
      }
    });

    // Long division
    y = 180;
    this.doc.setFontSize(14);
    this.doc.text('2. Long Division:', 20, y);

    y += 15;
    const divisionProblems = [
      [845, 5],
      [672, 8],
      [963, 3],
      [1248, 4]
    ];

    x = 20;
    divisionProblems.forEach((problem, index) => {
      this.doc.setFontSize(12);
      // Draw division bracket
      this.doc.text(`${problem[1]}`, x, y);
      this.doc.line(x + 10, y - 8, x + 10, y + 2);
      this.doc.line(x + 10, y - 8, x + 50, y - 8);
      this.doc.text(`${problem[0]}`, x + 15, y);

      if (index === 1) {
        x = 120;
        y -= 30;
      } else {
        y += 30;
      }
    });
  }

  // FIFTH GRADE WORKSHEETS
  private generateFifthGradeELA(): void {
    this.doc.setFontSize(20);
    this.doc.text('Analyzing Text & Citing Evidence', 105, 60, { align: 'center' });

    // Passage with evidence opportunities
    this.doc.setFontSize(11);
    const passage = `Sarah stared at the empty garden bed with determination. Last year's tomatoes had
  failed miserably, but she wasn't giving up. She spent hours researching soil conditions,
  studying seed catalogs, and sketching garden layouts. Her notebook filled with detailed
  plans: raised beds for better drainage, companion plants to deter pests, and a watering
  schedule based on weather patterns. "You're overthinking it," her neighbor laughed,
  "Just throw some seeds in the ground!" But Sarah shook her head. She had learned that
  success required preparation. By summer's end, her careful planning paid off - her garden
  overflowed with ripe tomatoes while her neighbor's wilted in the heat.`;

    const wrappedText = this.doc.splitTextToSize(passage, 170);
    let y = 75; // Standard starting position for content

    wrappedText.forEach((line: string) => {
      this.doc.text(line, 20, y);
      y += 7;
    });

    // Questions requiring text evidence
    y += 10;
    this.doc.setFontSize(13);
    this.doc.text('Answer with evidence from the text:', 20, y);

    y += 10;
    this.doc.setFontSize(11);

    this.doc.text('1. What character trait best describes Sarah? Use a quote to support.', 20, y);
    y += 8;
    this.doc.text('Trait: _________________ Evidence: "___________________________', 20, y);
    y += 7;
    this.doc.text('_________________________________________________"', 20, y);

    y += 15;
    this.doc.text('2. Why did Sarah\'s garden succeed? Cite two specific actions from the text.', 20, y);
    y += 8;
    this.doc.text('First: _________________________________________________', 20, y);
    y += 7;
    this.doc.text('Second: _______________________________________________', 20, y);

    y += 15;
    this.doc.text('3. Find evidence that shows the neighbor\'s attitude was wrong.', 20, y);
    y += 8;
    this.doc.text('_________________________________________________', 20, y);
    y += 7;
    this.doc.text('_________________________________________________', 20, y);
  }

  private generateFifthGradeMath(): void {
    this.doc.setFontSize(20);
    this.doc.text('Fractions Practice', 105, 60, { align: 'center' });

    // Adding fractions with unlike denominators
    this.doc.setFontSize(14);
    this.doc.text('1. Add or subtract (show your work):', 20, 75);

    let y = 90;
    const fractionProblems = [
      { num1: 2, den1: 3, num2: 1, den2: 4, op: '+' },
      { num1: 3, den1: 5, num2: 1, den2: 2, op: '+' },
      { num1: 5, den1: 6, num2: 2, den2: 3, op: '-' },
      { num1: 7, den1: 8, num2: 1, den2: 4, op: '-' },
      { num1: 1, den1: 2, num2: 2, den2: 5, op: '+' },
      { num1: 4, den1: 5, num2: 1, den2: 3, op: '-' }
    ];

    fractionProblems.forEach((prob, index) => {
      this.doc.setFontSize(12);

      // Draw fraction problem
      const x = index < 3 ? 20 : 120;
      const adjustedY = index < 3 ? y + (index * 35) : y + ((index - 3) * 35);

      // First fraction
      this.doc.text(prob.num1.toString(), x + 5, adjustedY - 3);
      this.doc.line(x, adjustedY, x + 15, adjustedY);
      this.doc.text(prob.den1.toString(), x + 5, adjustedY + 7);

      // Operation
      this.doc.text(prob.op, x + 20, adjustedY + 2);

      // Second fraction
      this.doc.text(prob.num2.toString(), x + 30, adjustedY - 3);
      this.doc.line(x + 25, adjustedY, x + 40, adjustedY);
      this.doc.text(prob.den2.toString(), x + 30, adjustedY + 7);

      // Equals
      this.doc.text('= _____', x + 45, adjustedY + 2);
    });

    // Word problems
    y = 200;
    this.doc.setFontSize(14);
    this.doc.text('2. Solve the word problems:', 20, y);

    y += 12;
    this.doc.setFontSize(11);

    const problems = [
      'Emma ate 3/4 of a pizza and her brother ate 1/2. How much did they eat together?',
      'A recipe needs 2/3 cup of flour. If you make half the recipe, how much flour do you need?'
    ];

    problems.forEach((problem) => {
      this.doc.text(problem, 20, y);
      y += 8;
      this.doc.text('Answer: _____________', 20, y);
      y += 15;
    });
  }
}