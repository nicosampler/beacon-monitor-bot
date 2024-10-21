// Define the return type for the function
interface UTCDateResult {
  hours: string;
  date: string;
}

/**
 * Converts a date to UTC using native JavaScript methods
 * @param {Date | number} dateInput - Date object or timestamp
 * @returns {UTCDateResult} Object with UTC hours and date
 */
export function convertToUTC(dateInput: Date | number): UTCDateResult {
  const date = new Date(dateInput);
  const isoString = date.toISOString();
  
  // Extract hours and date from ISO string
  const hours = isoString.substr(11, 2);
  const dateString = `${isoString.substr(8, 2)}/${isoString.substr(5, 2)}/${isoString.substr(0, 4)}`;

  return {
    hours,
    date: dateString,
  };
}
