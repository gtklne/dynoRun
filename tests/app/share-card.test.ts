import { describe, it, expect } from 'vitest';
import { renderShareCard } from '@/app/share-card';
import type { RpmPoint } from '@/shared/types';
import type { AccelTimes } from '@/analysis/accel-times';

function makeCurve(): RpmPoint[] {
  return [
    { rpm: 2000, wheel_power_kw: 40, wheel_torque_nm: 190 },
    { rpm: 3000, wheel_power_kw: 80, wheel_torque_nm: 255 },
    { rpm: 4000, wheel_power_kw: 110, wheel_torque_nm: 263 },
    { rpm: 5000, wheel_power_kw: 130, wheel_torque_nm: 248 },
    { rpm: 6000, wheel_power_kw: 120, wheel_torque_nm: 191 },
  ];
}

function makeAccel(): AccelTimes {
  return {
    duration_s: 14.2,
    distance_m: 320,
    start_speed_kmh: 0,
    peak_speed_kmh: 182,
    intervals: [
      { label: '0–100 km/h', from_kmh: 0, to_kmh: 100, elapsed_s: 5.2, distance_m: 90 },
      { label: '60–100 km/h', from_kmh: 60, to_kmh: 100, elapsed_s: 2.4, distance_m: 60 },
    ],
    quarter_mile: { elapsed_s: 13.4, trap_speed_kmh: 168 },
  };
}

describe('renderShareCard', () => {
  it('produces a non-empty Blob with PNG mime type', async () => {
    const blob = await renderShareCard({
      vehicleName: 'Civic Type R',
      gearLabel: '3rd',
      title: '3rd · Spa',
      unit: 'kW',
      peakPowerKw: 165,
      peakTorqueNm: 280,
      peakPowerRpm: 5600,
      curvePoints: makeCurve(),
      accelTimes: makeAccel(),
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles a missing curve gracefully', async () => {
    const blob = await renderShareCard({
      vehicleName: 'Test',
      gearLabel: '1',
      unit: 'hp',
      peakPowerKw: null,
      peakTorqueNm: null,
      peakPowerRpm: null,
      curvePoints: [],
      accelTimes: null,
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('renders without a quarter mile when accelTimes lacks it', async () => {
    const accel: AccelTimes = {
      duration_s: 4,
      distance_m: 80,
      start_speed_kmh: 0,
      peak_speed_kmh: 110,
      intervals: [
        { label: '0–100 km/h', from_kmh: 0, to_kmh: 100, elapsed_s: 6.1, distance_m: 80 },
      ],
      quarter_mile: null,
    };
    const blob = await renderShareCard({
      vehicleName: 'Hatchback',
      gearLabel: '2nd',
      unit: 'PS',
      peakPowerKw: 90,
      peakTorqueNm: 180,
      peakPowerRpm: 6000,
      curvePoints: makeCurve(),
      accelTimes: accel,
    });
    expect(blob.size).toBeGreaterThan(0);
  });
});
