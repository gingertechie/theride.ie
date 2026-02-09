/**
 * Test the date calculation logic for the weekly aggregation worker
 * Run with: node test-date-logic.js
 *
 * The worker should aggregate the PREVIOUS complete week (Sunday to Saturday)
 * when it runs every Sunday at 3 AM UTC.
 */

function calculateWeekBoundaries_CURRENT(now) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  const daysFromSunday = today.getUTCDay(); // 0 = Sunday
  const lastSunday = new Date(today);
  lastSunday.setUTCDate(today.getUTCDate() - daysFromSunday - 1); // BUG HERE

  const lastSaturday = new Date(lastSunday);
  lastSaturday.setUTCDate(lastSunday.getUTCDate() + 6);

  return {
    lastSunday: lastSunday.toISOString().split('T')[0],
    lastSaturday: lastSaturday.toISOString().split('T')[0],
    dayOfWeek: today.getUTCDay()
  };
}

function calculateWeekBoundaries_FIXED(now) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  // We want the week that ended on the most recent Saturday
  // Calculate days since last Sunday
  const daysSinceSunday = today.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Calculate the start of the previous complete week (Sunday)
  const weekStart = new Date(today);
  if (daysSinceSunday === 0) {
    // Today is Sunday - the week that just ended was last Sunday to yesterday (Saturday)
    weekStart.setUTCDate(today.getUTCDate() - 7);
  } else {
    // Not Sunday - go back to the most recent Sunday before this week
    weekStart.setUTCDate(today.getUTCDate() - daysSinceSunday - 7);
  }

  // Week ends on Saturday (6 days after Sunday)
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return {
    lastSunday: weekStart.toISOString().split('T')[0],
    lastSaturday: weekEnd.toISOString().split('T')[0],
    dayOfWeek: today.getUTCDay()
  };
}

console.log('Testing date calculation logic\n');
console.log('=' .repeat(80));

// Test cases: The cron runs every Sunday at 3 AM
const testCases = [
  // If running on Sunday Feb 2, aggregate previous week (Jan 26 - Feb 1)
  { date: '2026-02-01T03:00:00Z', day: 'Sunday', expectedSun: '2026-01-25', expectedSat: '2026-01-31' },

  // If running on Sunday Feb 8, aggregate previous week (Feb 2 - Feb 7)
  { date: '2026-02-08T03:00:00Z', day: 'Sunday', expectedSun: '2026-02-01', expectedSat: '2026-02-07' },

  // If running on Sunday Feb 15, aggregate previous week (Feb 8 - Feb 14)
  { date: '2026-02-15T03:00:00Z', day: 'Sunday', expectedSun: '2026-02-08', expectedSat: '2026-02-14' },
];

let allPassed = true;

testCases.forEach(({ date, day, expectedSun, expectedSat }) => {
  const now = new Date(date);
  const current = calculateWeekBoundaries_CURRENT(now);
  const fixed = calculateWeekBoundaries_FIXED(now);

  const currentCorrect = current.lastSunday === expectedSun && current.lastSaturday === expectedSat;
  const fixedCorrect = fixed.lastSunday === expectedSun && fixed.lastSaturday === expectedSat;

  console.log(`\nTest: Running on ${day} (${date.split('T')[0]}) [day ${current.dayOfWeek}]`);
  console.log(`Expected: ${expectedSun} to ${expectedSat}`);
  console.log(`Current:  ${current.lastSunday} to ${current.lastSaturday} ${currentCorrect ? '✅' : '❌'}`);
  console.log(`Fixed:    ${fixed.lastSunday} to ${fixed.lastSaturday} ${fixedCorrect ? '✅' : '❌'}`);

  if (!fixedCorrect) allPassed = false;
});

console.log('\n' + '='.repeat(80));
console.log(`\n${allPassed ? '✅ All tests PASSED' : '❌ Some tests FAILED'}`);
