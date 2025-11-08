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
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      const amPm = hour >= 12 ? 'PM' : 'AM';
      const hourStr = hour.toString().padStart(2, '0');
      const minuteStr = minute.toString().padStart(2, '0');
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

/**
 * Format a time string (HH:mm) to 12-hour format with AM/PM
 * @param time - Time string in 24-hour format (HH:mm) or null
 * @returns Formatted time string or "Unscheduled" if null
 */
export const formatTime = (time: string | null): string => {
  if (!time) return "Unscheduled";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
};