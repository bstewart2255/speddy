// Worksheet Renderer - Display formatted worksheets from v2 generation

import { QuestionRenderer, QuestionData } from '@/lib/shared/question-renderer';
import { QUESTION_FORMATS, stripQuestionNumber } from '@/lib/shared/question-types';

interface WorksheetSection {
  title: string;
  instructions?: string;
  items: WorksheetItem[];
}

interface WorksheetItem {
  type: string;
  content: string;
  choices?: string[];
  blankLines?: number;
  solution?: string[];
}

interface Worksheet {
  title: string;
  grade: string;
  topic: string;
  duration: number;
  sections: WorksheetSection[];
  formatting?: {
    numberingStyle: string;
    spacing: string;
    showInstructions: boolean;
  };
}

interface WorksheetRendererProps {
  worksheet: Worksheet;
}

export default function WorksheetRenderer({ worksheet }: WorksheetRendererProps) {
  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6 border-b-2 border-gray-300 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{worksheet.title}</h1>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {worksheet.sections.map((section, sectionIdx) => {
          // Filter out teacher-only content (examples)
          const studentFacingItems = section.items.filter(item => item.type !== 'example');

          // Check if section uses grid layout (for visual math)
          const useGridLayout = studentFacingItems.some(item => item.type === 'visual-math');

          return (
            <div key={sectionIdx} className="space-y-4">
              {/* Section Title */}
              <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
                {section.title}
              </h2>

              {/* Section Instructions */}
              {section.instructions && (
                <p className="text-sm text-gray-700 italic">{section.instructions}</p>
              )}

              {/* Section Items */}
              {useGridLayout ? (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {studentFacingItems.map((item, itemIdx) => (
                    <QuestionRenderer
                      key={itemIdx}
                      question={{
                        ...item,
                        content: stripQuestionNumber(item.content),
                      } as QuestionData}
                      questionNumber={itemIdx + 1}
                      showNumber={false}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {studentFacingItems.map((item, itemIdx) => {
                    // Render passages directly without the blue box styling
                    if (item.type === 'passage') {
                      return (
                        <div key={itemIdx} className="prose max-w-none">
                          <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                            {item.content}
                          </p>
                        </div>
                      );
                    }

                    // For all other question types, use QuestionRenderer
                    return (
                      <QuestionRenderer
                        key={itemIdx}
                        question={{
                          ...item,
                          content: stripQuestionNumber(item.content),
                        } as QuestionData}
                        questionNumber={itemIdx + 1}
                        showNumber={true}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
