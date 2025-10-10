// Worksheet Renderer - Display formatted worksheets from v2 generation

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
        <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
          <span>Grade: {worksheet.grade}</span>
          <span>Duration: {worksheet.duration} minutes</span>
        </div>
        <div className="mt-2">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            {worksheet.topic}
          </span>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {worksheet.sections.map((section, sectionIdx) => (
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
            <div className="space-y-4">
              {section.items.map((item, itemIdx) => (
                <div key={itemIdx} className="pl-2">
                  {item.type === 'passage' && (
                    <div className="prose max-w-none">
                      <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {item.content}
                      </p>
                    </div>
                  )}

                  {item.type === 'example' && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                      <p className="font-medium text-gray-900">{item.content}</p>
                      {item.solution && item.solution.length > 0 && (
                        <div className="mt-2 text-sm text-gray-700 space-y-1">
                          {item.solution.map((step, stepIdx) => (
                            <p key={stepIdx}>• {step}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {item.type === 'multiple-choice' && (
                    <div className="space-y-2">
                      <p className="font-medium text-gray-900">{item.content}</p>
                      {item.choices && (
                        <div className="ml-6 space-y-1">
                          {item.choices.map((choice, choiceIdx) => (
                            <div key={choiceIdx} className="flex items-start gap-2">
                              <span className="text-gray-600 font-medium">
                                {String.fromCharCode(65 + choiceIdx)}.
                              </span>
                              <span className="text-gray-800">{choice}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {(item.type === 'short-answer' || item.type === 'long-answer') && (
                    <div className="space-y-2">
                      <p className="font-medium text-gray-900">{item.content}</p>
                      <div className="ml-6">
                        {Array.from({ length: item.blankLines || 3 }).map((_, lineIdx) => (
                          <div key={lineIdx} className="border-b border-gray-300 h-8" />
                        ))}
                      </div>
                    </div>
                  )}

                  {item.type === 'fill-blank' && (
                    <div className="space-y-2">
                      <p className="font-medium text-gray-900">{item.content}</p>
                      <div className="ml-6 border-b border-gray-300 w-64 h-8" />
                    </div>
                  )}

                  {item.type === 'text' && (
                    <p className="text-gray-800">{item.content}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
        Generated with Template-Based System (v2)
      </div>
    </div>
  );
}
