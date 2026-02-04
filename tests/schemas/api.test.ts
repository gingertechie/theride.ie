import { describe, it, expect } from 'vitest';
import {
  CountiesQuerySchema,
  SearchBoundsSchema,
  SensorLocationSchema,
  validateInput,
} from '../../src/schemas/api';

describe('API Schemas', () => {
  describe('CountiesQuerySchema', () => {
    it('should validate valid limit', () => {
      const result = CountiesQuerySchema.safeParse({ limit: '10' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('should default to 3 when limit is missing', () => {
      const result = CountiesQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(3);
      }
    });

    it('should default to 3 when limit is empty string', () => {
      const result = CountiesQuerySchema.safeParse({ limit: '' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(3);
      }
    });

    it('should reject limit below 1', () => {
      const result = CountiesQuerySchema.safeParse({ limit: '0' });
      expect(result.success).toBe(false);
    });

    it('should reject limit above 100', () => {
      const result = CountiesQuerySchema.safeParse({ limit: '101' });
      expect(result.success).toBe(false);
    });

    it('should parse string numbers correctly', () => {
      const result = CountiesQuerySchema.safeParse({ limit: '50' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });
  });

  describe('SearchBoundsSchema', () => {
    it('should validate correct bounds', () => {
      const validBounds = {
        bounds: {
          minLat: 51.0,
          maxLat: 55.0,
          minLon: -10.0,
          maxLon: -5.0,
        },
      };
      const result = SearchBoundsSchema.safeParse(validBounds);
      expect(result.success).toBe(true);
    });

    it('should reject latitude below -90', () => {
      const invalidBounds = {
        bounds: {
          minLat: -91,
          maxLat: 55.0,
          minLon: -10.0,
          maxLon: -5.0,
        },
      };
      const result = SearchBoundsSchema.safeParse(invalidBounds);
      expect(result.success).toBe(false);
    });

    it('should reject latitude above 90', () => {
      const invalidBounds = {
        bounds: {
          minLat: 51.0,
          maxLat: 91,
          minLon: -10.0,
          maxLon: -5.0,
        },
      };
      const result = SearchBoundsSchema.safeParse(invalidBounds);
      expect(result.success).toBe(false);
    });

    it('should reject longitude below -180', () => {
      const invalidBounds = {
        bounds: {
          minLat: 51.0,
          maxLat: 55.0,
          minLon: -181,
          maxLon: -5.0,
        },
      };
      const result = SearchBoundsSchema.safeParse(invalidBounds);
      expect(result.success).toBe(false);
    });

    it('should reject longitude above 180', () => {
      const invalidBounds = {
        bounds: {
          minLat: 51.0,
          maxLat: 55.0,
          minLon: -10.0,
          maxLon: 181,
        },
      };
      const result = SearchBoundsSchema.safeParse(invalidBounds);
      expect(result.success).toBe(false);
    });

    it('should reject when minLat > maxLat', () => {
      const invalidBounds = {
        bounds: {
          minLat: 55.0,
          maxLat: 51.0,
          minLon: -10.0,
          maxLon: -5.0,
        },
      };
      const result = SearchBoundsSchema.safeParse(invalidBounds);
      expect(result.success).toBe(false);
    });

    it('should reject when minLon > maxLon', () => {
      const invalidBounds = {
        bounds: {
          minLat: 51.0,
          maxLat: 55.0,
          minLon: -5.0,
          maxLon: -10.0,
        },
      };
      const result = SearchBoundsSchema.safeParse(invalidBounds);
      expect(result.success).toBe(false);
    });
  });

  describe('SensorLocationSchema', () => {
    it('should validate complete sensor data', () => {
      const validSensor = {
        segment_id: 123456,
        last_data_package: '2024-01-15T10:00:00Z',
        timezone: 'Europe/Dublin',
        latitude: 53.3498,
        longitude: -6.2603,
        country: 'Ireland',
        county: 'Dublin',
        city_town: 'Dublin',
        locality: 'City Centre',
        eircode: 'D01 F5P2',
      };
      const result = SensorLocationSchema.safeParse(validSensor);
      expect(result.success).toBe(true);
    });

    it('should accept nullable location fields', () => {
      const sensorWithNulls = {
        segment_id: 123456,
        last_data_package: '2024-01-15T10:00:00Z',
        timezone: 'Europe/Dublin',
        latitude: 53.3498,
        longitude: -6.2603,
        country: null,
        county: null,
        city_town: null,
        locality: null,
        eircode: null,
      };
      const result = SensorLocationSchema.safeParse(sensorWithNulls);
      expect(result.success).toBe(true);
    });

    it('should reject negative segment_id', () => {
      const invalidSensor = {
        segment_id: -1,
        last_data_package: '2024-01-15T10:00:00Z',
        timezone: 'Europe/Dublin',
        latitude: 53.3498,
        longitude: -6.2603,
        country: null,
        county: null,
        city_town: null,
        locality: null,
        eircode: null,
      };
      const result = SensorLocationSchema.safeParse(invalidSensor);
      expect(result.success).toBe(false);
    });

    it('should reject invalid latitude range', () => {
      const invalidSensor = {
        segment_id: 123456,
        last_data_package: '2024-01-15T10:00:00Z',
        timezone: 'Europe/Dublin',
        latitude: 91,
        longitude: -6.2603,
        country: null,
        county: null,
        city_town: null,
        locality: null,
        eircode: null,
      };
      const result = SensorLocationSchema.safeParse(invalidSensor);
      expect(result.success).toBe(false);
    });

    it('should reject invalid longitude range', () => {
      const invalidSensor = {
        segment_id: 123456,
        last_data_package: '2024-01-15T10:00:00Z',
        timezone: 'Europe/Dublin',
        latitude: 53.3498,
        longitude: 200,
        country: null,
        county: null,
        city_town: null,
        locality: null,
        eircode: null,
      };
      const result = SensorLocationSchema.safeParse(invalidSensor);
      expect(result.success).toBe(false);
    });

    it('should reject empty timezone string', () => {
      const sensor = {
        segment_id: 123456,
        last_data_package: '2024-01-15T10:00:00Z',
        timezone: '',
        latitude: 53.3498,
        longitude: -6.2603,
        country: null,
        county: null,
        city_town: null,
        locality: null,
        eircode: null,
      };
      const result = SensorLocationSchema.safeParse(sensor);
      expect(result.success).toBe(false);
    });

    it('should reject missing last_data_package', () => {
      const sensor = {
        segment_id: 123456,
        last_data_package: '',
        timezone: 'Europe/Dublin',
        latitude: 53.3498,
        longitude: -6.2603,
        country: null,
        county: null,
        city_town: null,
        locality: null,
        eircode: null,
      };
      const result = SensorLocationSchema.safeParse(sensor);
      expect(result.success).toBe(false);
    });
  });

  describe('validateInput helper', () => {
    it('should return success with parsed data for valid input', () => {
      const schema = CountiesQuerySchema;
      const data = { limit: '10' };
      const result = validateInput(schema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('should return error details for invalid input', () => {
      const schema = CountiesQuerySchema;
      const data = { limit: '200' };
      const result = validateInput(schema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Validation failed');
        expect(result.details).toBeDefined();
        expect(Array.isArray(result.details)).toBe(true);
      }
    });

    it('should provide detailed error information', () => {
      const schema = SearchBoundsSchema;
      const data = {
        bounds: {
          minLat: 100, // Invalid
          maxLat: 55,
          minLon: -10,
          maxLon: -5,
        },
      };
      const result = validateInput(schema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.details.length).toBeGreaterThan(0);
      }
    });
  });
});
