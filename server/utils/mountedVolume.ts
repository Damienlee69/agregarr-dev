import { existsSync, readFileSync, realpathSync } from 'fs';
import path from 'path';

const unescapeMount = (s: string) =>
  s.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

export const isOnRootFilesystem = (
  mountinfo: string,
  target: string
): boolean => {
  let best = '';
  for (const line of mountinfo.split('\n')) {
    const mp = line.split(' ')[4];
    if (!mp) continue;
    const dir = unescapeMount(mp);
    const hit = dir === '/' || target === dir || target.startsWith(`${dir}/`);
    if (hit && dir.length >= best.length) best = dir;
  }
  return best === '/';
};

const inContainer = () =>
  existsSync('/.dockerenv') || existsSync('/run/.containerenv');

// Unreadable mountinfo or a non-container host means "can't tell": no warning.
export const isOnContainerRootFs = (target: string): boolean => {
  if (!inContainer()) return false;
  let mountinfo: string;
  try {
    mountinfo = readFileSync('/proc/self/mountinfo', 'utf8');
  } catch {
    return false;
  }
  let probe = path.resolve(target);
  while (!existsSync(probe) && probe !== path.dirname(probe)) {
    probe = path.dirname(probe);
  }
  try {
    probe = realpathSync(probe);
  } catch {
    return false;
  }
  return isOnRootFilesystem(mountinfo, probe);
};
