/**
 * Progress calculation utilities for IEP goal tracking
 */

export interface ProgressDataPoint {
  rating: number;
  date: Date | string;
}

export type TrendDirection = 'improving' | 'stable' | 'declining' | 'insufficient_data';

export interface TrendResult {
  trend: TrendDirection;
  confidence: number; // 0-1, how confident we are in the trend
  slope: number; // Rate of change
  averageRating: number;
  recentAverage: number; // Average of last 3 ratings
  overallAverage: number; // Average of all ratings
  dataPoints: number; // Number of data points used
}

const MIN_DATA_POINTS = 3;
const STABLE_THRESHOLD = 0.15; // If slope is within ±0.15 per data point, consider stable
const RECENT_WINDOW = 3; // Number of recent points to use for recent average

/**
 * Calculate the trend for a student's progress toward an IEP goal
 * Uses simple linear regression on the ratings over time
 */
export function calculateTrend(dataPoints: ProgressDataPoint[]): TrendResult {
  // Sort by date (oldest first)
  const sortedPoints = [...dataPoints].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const n = sortedPoints.length;

  // Insufficient data
  if (n < MIN_DATA_POINTS) {
    const avgRating = n > 0
      ? sortedPoints.reduce((sum, p) => sum + p.rating, 0) / n
      : 0;

    return {
      trend: 'insufficient_data',
      confidence: 0,
      slope: 0,
      averageRating: avgRating,
      recentAverage: avgRating,
      overallAverage: avgRating,
      dataPoints: n,
    };
  }

  // Calculate overall average
  const overallAverage = sortedPoints.reduce((sum, p) => sum + p.rating, 0) / n;

  // Calculate recent average (last RECENT_WINDOW points)
  const recentPoints = sortedPoints.slice(-RECENT_WINDOW);
  const recentAverage = recentPoints.reduce((sum, p) => sum + p.rating, 0) / recentPoints.length;

  // Simple linear regression
  // We'll use index as x-axis (0, 1, 2, ...) since we care about sequential progress
  const xValues = sortedPoints.map((_, i) => i);
  const yValues = sortedPoints.map(p => p.rating);

  // Calculate means
  const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
  const yMean = yValues.reduce((sum, y) => sum + y, 0) / n;

  // Calculate slope (beta)
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = xValues[i] - xMean;
    const yDiff = yValues[i] - yMean;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  // Calculate R² (coefficient of determination) for confidence
  const intercept = yMean - slope * xMean;
  let ssRes = 0; // Residual sum of squares
  let ssTot = 0; // Total sum of squares

  for (let i = 0; i < n; i++) {
    const predicted = slope * xValues[i] + intercept;
    ssRes += Math.pow(yValues[i] - predicted, 2);
    ssTot += Math.pow(yValues[i] - yMean, 2);
  }

  const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;
  const confidence = Math.max(0, Math.min(1, rSquared)); // Clamp between 0 and 1

  // Determine trend direction
  let trend: TrendDirection;
  const absSlope = Math.abs(slope);

  if (absSlope < STABLE_THRESHOLD) {
    trend = 'stable';
  } else if (slope > 0) {
    trend = 'improving';
  } else {
    trend = 'declining';
  }

  return {
    trend,
    confidence,
    slope,
    averageRating: overallAverage,
    recentAverage,
    overallAverage,
    dataPoints: n,
  };
}

/**
 * Get a human-readable description of the trend
 */
export function getTrendDescription(trendResult: TrendResult): string {
  const { trend, confidence, recentAverage, slope, dataPoints } = trendResult;

  if (trend === 'insufficient_data') {
    return `Need ${MIN_DATA_POINTS - dataPoints} more data point${MIN_DATA_POINTS - dataPoints !== 1 ? 's' : ''} to determine trend`;
  }

  const confidenceLevel = confidence > 0.7 ? 'strong' : confidence > 0.4 ? 'moderate' : 'weak';
  const avgText = `Current average: ${recentAverage.toFixed(1)}/10`;

  switch (trend) {
    case 'improving':
      return `📈 ${confidenceLevel === 'strong' ? 'Strong' : 'Showing'} improvement (${avgText})`;
    case 'stable':
      return `➡️ Performance is stable (${avgText})`;
    case 'declining':
      return `📉 ${confidenceLevel === 'strong' ? 'Needs support' : 'Slight decline'} (${avgText})`;
    default:
      return avgText;
  }
}

/**
 * Get emoji representation of trend
 */
export function getTrendEmoji(trend: TrendDirection): string {
  switch (trend) {
    case 'improving':
      return '📈';
    case 'stable':
      return '➡️';
    case 'declining':
      return '📉';
    case 'insufficient_data':
      return '❓';
    default:
      return '—';
  }
}

/**
 * Get color class for trend (Tailwind)
 */
export function getTrendColorClass(trend: TrendDirection): string {
  switch (trend) {
    case 'improving':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'stable':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'declining':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'insufficient_data':
      return 'text-gray-600 bg-gray-50 border-gray-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}
