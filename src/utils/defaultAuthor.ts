import * as os from 'os';

export function getDefaultAuthorName(): string {
  try {
    return os.userInfo().username || 'Unknown';
  } catch {
    return 'Unknown';
  }
}
