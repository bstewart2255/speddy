/**
 * Utility function to generate time options for dropdowns
 * @param startHour - Starting hour (24-hour format, default: 7)
 * @param endHour - Ending hour (24-hour format, default: 15) 
 * @param increment - Minutes increment (default: 5)
 * @returns Array of time options with value and label
 */
export const generateTimeOptions = (
  startHour = 7, 
  endHour = 15, 
  increment = 5
): Array<{ value: string; label: string }> => {
  const timeOptions: Array<{ value: string; label: string }> = [];
  
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += increment) {
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const amPm = hour >= 12 ? 'PM' : 'AM';
      const hourStr = hour < 10 ? `0${hour}` : `${hour}`;
      const minuteStr = minute < 10 ? `0${minute}` : `${minute}`;
      const time = `${hourStr}:${minuteStr}`;
      const label = `${displayHour}:${minuteStr} ${amPm}`;
      timeOptions.push({ value: time, label });
    }
  }
  
  return timeOptions;
};

/**
 * Generate time options for school hours (6 AM to 6 PM)
 */
export const generateSchoolHoursTimeOptions = () => generateTimeOptions(6, 18, 5);

/**
 * Generate time options for regular activities (7 AM to 3 PM)  
 */
export const generateActivityTimeOptions = () => generateTimeOptions(7, 15, 5);