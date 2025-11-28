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

// Sensor Location type
interface SensorLocation {
  segment_id: number;
  last_data_package: string;
  timezone: string;
  date: string | null;
  period: 'hourly' | 'daily' | 'monthly' | null;
  uptime: number | null;
  heavy: number | null;
  car: number | null;
  bike: number | null;
  pedestrian: number | null;
  v85: number | null;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
}
