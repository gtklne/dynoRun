export function speedToRpm(speed_mps: number, rollout_m_per_rev: number): number {
  if (rollout_m_per_rev <= 0) throw new Error('rollout must be positive');
  return (speed_mps / rollout_m_per_rev) * 60;
}
