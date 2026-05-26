import type { RpmPoint } from '@/shared/types';

export interface CurveDeltaPoint {
  rpm: number;
  delta_power_kw: number;
  delta_torque_nm: number;
  a_power_kw: number | null;
  b_power_kw: number | null;
}

export function computeCurveDelta(
  a: RpmPoint[],
  b: RpmPoint[],
): CurveDeltaPoint[] {
  if (a.length === 0 || b.length === 0) return [];
  const aByRpm = new Map(a.map((p) => [p.rpm, p]));
  const bByRpm = new Map(b.map((p) => [p.rpm, p]));
  const out: CurveDeltaPoint[] = [];
  for (const [rpm, aPoint] of aByRpm) {
    const bPoint = bByRpm.get(rpm);
    if (!bPoint) continue;
    out.push({
      rpm,
      delta_power_kw: aPoint.wheel_power_kw - bPoint.wheel_power_kw,
      delta_torque_nm: aPoint.wheel_torque_nm - bPoint.wheel_torque_nm,
      a_power_kw: aPoint.wheel_power_kw,
      b_power_kw: bPoint.wheel_power_kw,
    });
  }
  out.sort((x, y) => x.rpm - y.rpm);
  return out;
}
