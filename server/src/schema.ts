import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
} from 'drizzle-orm/pg-core';

export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  mass_kg: real('mass_kg').notNull(),
  drivetrain: text('drivetrain').notNull(),
  frontal_area_m2: real('frontal_area_m2'),
  drag_coefficient: real('drag_coefficient'),
  body_shape: text('body_shape'),
  notes: text('notes').notNull().default(''),
  make: text('make'),
  model: text('model'),
  year: integer('year'),
  tire_label: text('tire_label'),
  power_hp_factory: integer('power_hp_factory'),
  transmission: text('transmission'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const calibrations = pgTable('calibrations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  vehicle_id: text('vehicle_id').notNull(),
  gear_label: text('gear_label').notNull(),
  rpm: real('rpm').notNull(),
  speed_kmh: real('speed_kmh').notNull(),
  rollout_m_per_rev: real('rollout_m_per_rev').notNull(),
  recorded_at: text('recorded_at').notNull(),
  notes: text('notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  vehicle_id: text('vehicle_id').notNull(),
  calibration_id: text('calibration_id').notNull(),
  started_at: text('started_at').notNull(),
  ended_at: text('ended_at'),
  gear_label: text('gear_label').notNull(),
  conditions: text('conditions').notNull().default('{}'),
  notes: text('notes').notNull().default(''),
  status: text('status').notNull().default('in_progress'),
  title: text('title'),
  peak_power_kw: real('peak_power_kw'),
  peak_torque_nm: real('peak_torque_nm'),
  peak_power_rpm: real('peak_power_rpm'),
  share_token: text('share_token'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (t) => [
  index('runs_share_token_idx').on(t.share_token),
]);

export const samples = pgTable('samples', {
  run_id: text('run_id').notNull(),
  t_ms: integer('t_ms').notNull(),
  speed_mps: real('speed_mps').notNull(),
  accel_long_ms2: real('accel_long_ms2'),
  accel_vert_ms2: real('accel_vert_ms2'),
  lat: real('lat'),
  lon: real('lon'),
  hdop: real('hdop'),
  altitude_m: real('altitude_m'),
}, (t) => [primaryKey({ columns: [t.run_id, t.t_ms] })]);

export const recordings = pgTable('recordings', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  vehicle_id: text('vehicle_id'),
  calibration_id: text('calibration_id'),
  run_id: text('run_id'),
  gear_label: text('gear_label'),
  user_rpm: real('user_rpm'),
  label: text('label'),
  recorded_at: text('recorded_at').notNull(),
  duration_ms: integer('duration_ms').notNull(),
  gps_count: integer('gps_count').notNull(),
  motion_count: integer('motion_count').notNull(),
  data: jsonb('data').notNull(),
  created_at: text('created_at').notNull(),
}, (t) => [
  index('recordings_user_recorded_idx').on(t.userId, sql`${t.recorded_at} DESC`),
  index('recordings_user_run_idx').on(t.userId, t.run_id),
]);

export const derivedCurves = pgTable('derived_curves', {
  run_id: text('run_id').primaryKey(),
  rpm_min: real('rpm_min').notNull(),
  rpm_max: real('rpm_max').notNull(),
  points: text('points').notNull(),
  pipeline_version: integer('pipeline_version').notNull(),
  computed_at: text('computed_at').notNull(),
});
