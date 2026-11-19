export const APP_VERSION = '1.2.7';

/**
 * Validates that a version string follows NITA's 3-segment format (major >= 1, minor 1..9, patch 1..9).
 */
export function isValidAppVersion(version: string): boolean {
  const parts = String(version || '')
    .trim()
    .split('.')
    .map((segment) => Number(segment));

  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) {
    return false;
  }

  const [major, minor, patch] = parts;
  return major >= 1 && minor >= 1 && minor <= 9 && patch >= 1 && patch <= 9;
}

/**
 * Computes the next NITA version using segments 1..9 per release:
 * 1.1.1 -> 1.1.2 -> ... -> 1.1.9 -> 1.2.1
 * When minor and patch both reach 9 (e.g. 1.9.9), rolls over to 2.1.1.
 */
export function getNextAppVersion(currentVersion: string = APP_VERSION): string {
  const parts = String(currentVersion)
    .trim()
    .split('.')
    .map((segment) => parseInt(segment, 10));

  if (parts.length !== 3 || parts.some((n) => isNaN(n) || n < 1)) {
    return '1.1.1';
  }

  const [major, minor, patch] = parts;

  if (patch < 9) {
    return `${major}.${minor}.${patch + 1}`;
  }

  if (minor < 9) {
    return `${major}.${minor + 1}.1`;
  }

  return `${major + 1}.1.1`;
}
