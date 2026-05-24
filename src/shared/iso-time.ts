export const nowIso = (): string => new Date().toISOString();
export const monotonicMs = (): number => performance.now();
