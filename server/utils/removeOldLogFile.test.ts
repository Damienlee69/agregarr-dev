import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeOldLogFile } from './removeOldLogFile';

const errno = (code: string) =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;

describe('removeOldLogFile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('removes a regular file and keeps a symlink', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oldlog-'));
    const regular = path.join(dir, 'a.log');
    const link = path.join(dir, 'b.log');
    fs.writeFileSync(regular, '');
    fs.symlinkSync(regular, link);
    removeOldLogFile(link);
    expect(fs.existsSync(link)).toBe(true);
    removeOldLogFile(regular);
    expect(fs.existsSync(regular)).toBe(false);
    fs.rmSync(dir, { recursive: true });
  });

  it('tolerates the file vanishing at lstat or unlink', () => {
    vi.spyOn(fs, 'lstatSync').mockImplementation(() => {
      throw errno('ENOENT');
    });
    expect(() => removeOldLogFile('x.log')).not.toThrow();
    vi.restoreAllMocks();
    vi.spyOn(fs, 'lstatSync').mockReturnValue({
      isSymbolicLink: () => false,
    } as fs.Stats);
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw errno('ENOENT');
    });
    expect(() => removeOldLogFile('x.log')).not.toThrow();
  });

  it('rethrows other errors', () => {
    vi.spyOn(fs, 'lstatSync').mockImplementation(() => {
      throw errno('EACCES');
    });
    expect(() => removeOldLogFile('x.log')).toThrow('EACCES');
  });
});
