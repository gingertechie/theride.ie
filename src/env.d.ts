/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime;

declare namespace App {
  interface Locals extends Runtime {
    // D1 Database binding
    DB: D1Database;
  }
}

// D1 Database types
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta: {
    duration: number;
    size_after: number;
    rows_read: number;
    rows_written: number;
  };
}

interface D1ExecResult {
  count: number;
  duration: number;
}

// Sensor Location type (metadata only - traffic data stored in sensor_hourly_data)
interface SensorLocation {
  segment_id: number;
  last_data_package: string;
  timezone: string;
  latitude: number;
  longitude: number;
  country: string | null;
  county: string | null;
  city_town: string | null;
  locality: string | null;
  eircode: string | null;
  created_at: string;
  updated_at: string;
}

// Hourly sensor traffic data
interface SensorHourlyData {
  segment_id: number;
  hour_timestamp: string; // ISO8601 datetime
  bike: number;
  car: number;
  heavy: number;
  pedestrian: number;
  v85: number | null;
  uptime: number | null;
  created_at: string;
}
