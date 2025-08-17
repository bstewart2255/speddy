'use client';

import { useEffect, useRef } from 'react';

interface ProgressChartProps {
  data: Array<{
    date: string;
    accuracy: number;
    worksheetType: string;
  }>;
  height?: number;
}

export function ProgressChart({ data, height = 300 }: ProgressChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Group data by date and calculate daily averages
  const chartData = data.reduce((acc: any[], item) => {
    const date = new Date(item.date + "T00:00:00").toLocaleDateString();
    const existing = acc.find(d => d.date === date);

    if (existing) {
      existing.total += item.accuracy;
      existing.count += 1;
      existing.accuracy = existing.total / existing.count;
    } else {
      acc.push({
        date,
        accuracy: item.accuracy,
        total: item.accuracy,
        count: 1
      });
    }

    return acc;
  }, []).reverse(); // Reverse to show oldest to newest

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        No data available for the selected time period
      </div>
    );
  }

  return (
    <div ref={chartRef} className="w-full" style={{ height }}>
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-4">Accuracy Trend</h4>
        <div className="space-y-2">
          {chartData.map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="text-xs text-gray-600">{item.date}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      item.accuracy >= 80 ? 'bg-green-500' :
                      item.accuracy >= 70 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${item.accuracy}%` }}
                  />
                </div>
                <span className="text-xs font-medium">{item.accuracy.toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}