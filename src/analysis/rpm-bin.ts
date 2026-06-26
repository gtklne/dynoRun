import type { PowerTorquePoint } from './power-torque';
import type { RpmPoint } from '@/shared/types';

export function binByRpm(input: PowerTorquePoint[], bin_width_rpm: number): RpmPoint[] {
  if (input.length === 0) return [];
  const buckets = new Map<number, { p: number[]; t: number[] }>();
  for (const pt of input) {
    const bucket = Math.floor(pt.rpm / bin_width_rpm);
    let arr = buckets.get(bucket);
    if (!arr) {
      arr = { p: [], t: [] };
      buckets.set(bucket, arr);
    }
    arr.p.push(pt.wheel_power_kw);
    arr.t.push(pt.wheel_torque_nm);
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([bucket, arr]) => ({
    rpm: bucket * bin_width_rpm + bin_width_rpm / 2,
    wheel_power_kw: avg(arr.p),
    wheel_torque_nm: avg(arr.t),
  }));
}

// One RPM bin of the road-load decomposition. The four component averages sum to
// total_kw, and total_kw equals binByRpm's wheel_power_kw for the same bin
// (averaging is linear). In-memory only — parallels binByRpm, never persisted.
export interface PowerBreakdownPoint {
  rpm: number;
  p_inertia_kw: number;
  p_aero_kw: number;
  p_roll_kw: number;
  p_grade_kw: number;
  total_kw: number;
}

export function binBreakdownByRpm(
  input: PowerTorquePoint[],
  bin_width_rpm: number,
): PowerBreakdownPoint[] {
  if (input.length === 0) return [];
  const buckets = new Map<number, { i: number[]; a: number[]; r: number[]; g: number[] }>();
  for (const pt of input) {
    const bucket = Math.floor(pt.rpm / bin_width_rpm);
    let arr = buckets.get(bucket);
    if (!arr) {
      arr = { i: [], a: [], r: [], g: [] };
      buckets.set(bucket, arr);
    }
    arr.i.push(pt.p_inertia_kw);
    arr.a.push(pt.p_aero_kw);
    arr.r.push(pt.p_roll_kw);
    arr.g.push(pt.p_grade_kw);
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([bucket, arr]) => {
    const p_inertia_kw = avg(arr.i);
    const p_aero_kw = avg(arr.a);
    const p_roll_kw = avg(arr.r);
    const p_grade_kw = avg(arr.g);
    return {
      rpm: bucket * bin_width_rpm + bin_width_rpm / 2,
      p_inertia_kw,
      p_aero_kw,
      p_roll_kw,
      p_grade_kw,
      total_kw: p_inertia_kw + p_aero_kw + p_roll_kw + p_grade_kw,
    };
  });
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
