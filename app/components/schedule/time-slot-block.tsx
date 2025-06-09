import React from 'react';

interface TimeSlotBlockProps {
  type: 'bell' | 'special' | 'session' | 'cross-provider';
  title?: string;
}

const TimeSlotBlockComponent: React.FC<TimeSlotBlockProps> = ({ type, title }) => {
  const styles = {
    bell: { backgroundColor: 'var(--schedule-bell)' },
    special: { backgroundColor: 'var(--schedule-special)' },
    session: { backgroundColor: 'var(--schedule-session)' },
    'cross-provider': { backgroundColor: 'var(--schedule-cross)' }
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
};

const TimeSlotBlock = React.memo(TimeSlotBlockComponent);
export default TimeSlotBlock;