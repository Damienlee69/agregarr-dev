import fs from 'fs';
import path from 'path';

export type YoutubeCookiesState = 'missing' | 'invalid' | 'valid';

export const youtubeCookiesPath = (): string =>
  path.join(process.cwd(), 'config', 'youtube-cookies.txt');

// Same first-line check as Python's MozillaCookieJar, which yt-dlp extends.
const NETSCAPE_HEADER = /#( Netscape)? HTTP Cookie File/;

export function getYoutubeCookiesState(
  cookiesPath: string = youtubeCookiesPath()
): YoutubeCookiesState {
  let content: string;
  try {
    content = fs.readFileSync(cookiesPath, 'utf8');
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? 'missing'
      : 'invalid';
  }
  const firstLine = content.split(/\r?\n/, 1)[0];
  return NETSCAPE_HEADER.test(firstLine) ? 'valid' : 'invalid';
}
