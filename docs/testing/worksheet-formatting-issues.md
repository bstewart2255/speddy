# Worksheet Formatting Issues - Problem List

## 1. **Nested Structure Problems**

- Excessive nesting in worksheet sections (sections → items → items)
- Creates confusing visual hierarchy with redundant instruction levels
- Example: "Instructions" → "Part 1: Introduction" → "Read the instructions..." → "Getting Started" → "Review these examples..."

## 2. **Grade Level Mismatches**

- Student grade shown at top doesn't match worksheet title grade
- Example: "Grade: 1" header but "ELA Practice - Grade 4" title
- Students in same grade group get different grade labels on worksheets

## 3. **Answer Space Not Rendered**

- `blankLines` property in JSON is completely ignored by renderer
- Long-answer questions with `blankLines: 4` only get 1 line in PDF
- All answer spaces are hardcoded, not dynamic based on grade or question type

## 4. **Poor Example Quality**

- Introduction examples are self-answering
- Example: "What is the main idea? The main idea is that the cat is sitting on the mat."
- Doesn't teach concept, just gives answer immediately

## 5. **Multiple Choice Formatting**

- Double letters appearing: "A. A. A magic bean" instead of "A. A magic bean"
- Inconsistent labeling between prompt requirements and output

## 6. **Lack of Content Differentiation**

- All students in grade group get identical content
- Only difference is minor variation in `blankLines` (which doesn't render anyway)
- No actual grade-appropriate difficulty adjustments

## 7. **Question Numbering Issues**

- Confusing numbering scheme: "1.1", "2.1", "2.2" etc.
- Makes it hard to reference specific questions

## 8. **Missing Story Integration**

- Story text embedded in first question rather than presented separately
- Makes it hard to reference back to the story for other questions

## 9. **Incorrect Student Information Display**

- Student shown as "Student 1" instead of actual name/initials
- Grade level displayed incorrectly in header

## 10. **CSS/HTML Rendering Issues**

- Answer spaces using inconsistent CSS classes (`answer-space` vs `answer-lines`)
- No visual distinction between different types of answer areas
- Poor print formatting for PDF generation
