const fs = require('fs');
const path = require('path');

// Files with unescaped entities
const filesToFix = [
  './app/(auth)/login/login-form.tsx',
  './app/(auth)/signup/page.tsx',
  './app/(auth)/signup/signup-form.tsx',
  './app/(dashboard)/dashboard/bell-schedules/page.tsx',
  './app/(dashboard)/dashboard/schedule/page.tsx',
  './app/(dashboard)/dashboard/sea/page.tsx',
  './app/(dashboard)/dashboard/special-activities/page.tsx',
  './app/(dashboard)/dashboard/students/page.tsx',
  './app/components/schedule/schedule-sessions.tsx',
  './app/components/schedule-view-with-filter.tsx',
  './app/components/students/student-details-modal.tsx',
  './app/components/students/students-list.tsx',
  './app/components/todo-widget.tsx',
  './app/components/weekly-view.tsx',
  './app/ferpa/page.tsx',
  './app/privacy/page.tsx',
  './app/terms/page.tsx'
];

// Replacements
const replacements = [
  { from: /'/g, to: '&apos;' },
  { from: /"/g, to: '&quot;' },
  { from: /"/g, to: '&ldquo;' },
  { from: /"/g, to: '&rdquo;' }
];

filesToFix.forEach(filePath => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Only replace in JSX text content (between > and <)
    content = content.replace(/>([^<]+)</g, (match, text) => {
      let fixedText = text;
      // Replace single quotes that aren't part of code
      fixedText = fixedText.replace(/(\w)'(\w)/g, '$1&apos;$2');
      fixedText = fixedText.replace(/(\s)'(\s)/g, '$1&apos;$2');
      // Replace double quotes
      fixedText = fixedText.replace(/"/g, '&quot;');
      fixedText = fixedText.replace(/"/g, '&ldquo;');
      fixedText = fixedText.replace(/"/g, '&rdquo;');
      return `>${fixedText}<`;
    });

    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${filePath}`);
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error.message);
  }
});

console.log('Done fixing unescaped entities!');