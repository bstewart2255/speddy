'use client';

interface SchoolYearToggleProps {
  currentYear: string;
  nextYear: string;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  nextYearActivated: boolean;
  onNextYearClick: () => void;
}

export function SchoolYearToggle({
  currentYear,
  nextYear,
  selectedYear,
  onSelectYear,
  nextYearActivated,
  onNextYearClick,
}: SchoolYearToggleProps) {
  const handleNextYearClick = () => {
    if (nextYearActivated) {
      onSelectYear(nextYear);
    } else {
      onNextYearClick();
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-1">
        <button
          type="button"
          onClick={() => onSelectYear(currentYear)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            selectedYear === currentYear
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {currentYear}
        </button>
        <button
          type="button"
          onClick={handleNextYearClick}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            selectedYear === nextYear
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {nextYear}
        </button>
      </div>
    </div>
  );
}
