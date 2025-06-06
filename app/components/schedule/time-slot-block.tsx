import React from 'react';

interface TimeSlotBlockProps {
  type: 'bell' | 'special' | 'session' | 'cross-provider';
  title?: string;
}

export function TimeSlotBlock({ type, title }: TimeSlotBlockProps) {
  const styles = {
    bell: { backgroundColor: 'rgba(239, 68, 68, 0.7)' },     // Stronger red
    special: { backgroundColor: 'rgba(245, 158, 11, 0.7)' }, // Stronger orange
    session: { backgroundColor: 'rgba(59, 130, 246, 0.7)' },  // Stronger blue
    'cross-provider': { backgroundColor: 'rgba(168, 85, 247, 0.7)' }  // Purple for cross-provider
  };

  return (
    <div 
      className="absolute inset-0 z-10"
      style={{
        ...styles[type],
        pointerEvents: 'auto',
        cursor: 'not-allowed'
      }}
      title={title}
    >
      <span style={{ visibility: 'hidden' }}>.</span>
    </div>
  );
}