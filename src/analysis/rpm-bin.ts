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

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
