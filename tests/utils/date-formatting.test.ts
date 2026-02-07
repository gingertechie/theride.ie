import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDate, formatMidnight } from '../../src/utils/date-formatting';

describe('Date Formatting Utils', () => {
  describe('formatDate', () => {
    it('should format date to YYYY-MM-DD', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDate(date);
      expect(result).toBe('2024-01-15');
    });

    it('should handle different times on same day', () => {
      const morning = new Date('2024-01-15T08:00:00Z');
      const evening = new Date('2024-01-15T20:00:00Z');
      expect(formatDate(morning)).toBe('2024-01-15');
      expect(formatDate(evening)).toBe('2024-01-15');
    });

    it('should handle dates in different months', () => {
      const date = new Date('2024-12-31T23:59:59Z');
      const result = formatDate(date);
      expect(result).toBe('2024-12-31');
    });
  });

  describe('formatDateTime', () => {
    it('should format date with time and Z suffix', () => {
      const date = new Date('2024-01-15T14:30:45Z');
      const result = formatDateTime(date);
      expect(result).toBe('2024-01-15 14:30:45Z');
    });

    it('should handle midnight times', () => {
      const date = new Date('2024-01-15T00:00:00Z');
      const result = formatDateTime(date);
      expect(result).toBe('2024-01-15 00:00:00Z');
    });

    it('should handle end of day times', () => {
      const date = new Date('2024-01-15T23:59:59Z');
      const result = formatDateTime(date);
      expect(result).toBe('2024-01-15 23:59:59Z');
    });
  });

  describe('formatMidnight', () => {
    it('should format date to midnight UTC', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const result = formatMidnight(date);
      expect(result).toBe('2024-01-15 00:00:00Z');
    });

    it('should ignore time component and always return midnight', () => {
      const morning = new Date('2024-01-15T08:00:00Z');
      const evening = new Date('2024-01-15T20:00:00Z');
      expect(formatMidnight(morning)).toBe('2024-01-15 00:00:00Z');
      expect(formatMidnight(evening)).toBe('2024-01-15 00:00:00Z');
    });

    it('should be useful for date range boundaries', () => {
      const date = new Date('2024-12-31T15:30:00Z');
      const result = formatMidnight(date);
      expect(result).toBe('2024-12-31 00:00:00Z');
    });
  });
});
