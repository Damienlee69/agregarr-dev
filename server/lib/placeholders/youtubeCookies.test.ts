import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { getYoutubeCookiesState } from './youtubeCookies';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytcookies-'));
const write = (content: string) => {
  const p = path.join(dir, `c-${Math.random()}.txt`);
  fs.writeFileSync(p, content);
  return p;
};

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('getYoutubeCookiesState', () => {
  it('reports a missing file', () => {
    expect(getYoutubeCookiesState(path.join(dir, 'nope.txt'))).toBe('missing');
  });

  it('rejects a 0-byte file', () => {
    expect(getYoutubeCookiesState(write(''))).toBe('invalid');
  });

  it('rejects non-Netscape content', () => {
    expect(getYoutubeCookiesState(write('[{"name":"SID"}]'))).toBe('invalid');
  });

  it('accepts both Netscape header spellings', () => {
    expect(
      getYoutubeCookiesState(
        write(
          '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tA\tb\n'
        )
      )
    ).toBe('valid');
    expect(getYoutubeCookiesState(write('# HTTP Cookie File\r\n'))).toBe(
      'valid'
    );
  });
});
