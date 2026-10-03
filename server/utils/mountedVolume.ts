import { readFile, realpath, stat } from 'fs/promises';
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

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false
  );

// Unreadable mountinfo or a non-container host means "can't tell": no warning.
export const isOnContainerRootFs = async (target: string): Promise<boolean> => {
  if (!(await exists('/.dockerenv')) && !(await exists('/run/.containerenv')))
    return false;
  try {
    const mountinfo = await readFile('/proc/self/mountinfo', 'utf8');
    let probe = path.resolve(target);
    while (!(await exists(probe)) && probe !== path.dirname(probe)) {
      probe = path.dirname(probe);
    }
    return isOnRootFilesystem(mountinfo, await realpath(probe));
  } catch {
    return false;
  }
};
