export type GeolocationStatus = 'granted' | 'prompt' | 'denied' | 'unsupported';

interface MaybePermissionsNavigator {
  permissions?: { query(input: { name: PermissionName }): Promise<{ state: PermissionState }> };
  geolocation?: Geolocation;
}

export async function ensureGeolocation(): Promise<GeolocationStatus> {
  if (typeof navigator === 'undefined') return 'unsupported';
  const nav = navigator as MaybePermissionsNavigator;
  if (!nav.geolocation) return 'unsupported';
  if (!nav.permissions) return 'prompt';
  try {
    const res = await nav.permissions.query({ name: 'geolocation' });
    return res.state as GeolocationStatus;
  } catch {
    return 'prompt';
  }
}
