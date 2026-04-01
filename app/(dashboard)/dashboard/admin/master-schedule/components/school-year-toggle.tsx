'use client';

interface SchoolYearToggleProps {
  currentYear: string;
  nextYear: string;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  nextYearHasData: boolean;
  onInitializeNextYear: () => void;
  initializing?: boolean;
}

export function SchoolYearToggle({
  currentYear,
  nextYear,
  selectedYear,
  onSelectYear,
  nextYearHasData,
  onInitializeNextYear,
  initializing = false,
}: SchoolYearToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
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
          onClick={() => onSelectYear(nextYear)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            selectedYear === nextYear
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {nextYear}
        </button>
      </div>

      {selectedYear === nextYear && !nextYearHasData && (
        <button
          type="button"
          onClick={onInitializeNextYear}
          disabled={initializing}
          className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {initializing ? 'Copying...' : `Copy from ${currentYear}`}
        </button>
      )}
    </div>
  );
}
