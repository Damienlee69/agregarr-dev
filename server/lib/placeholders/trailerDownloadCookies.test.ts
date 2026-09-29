import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock, stateMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  stateMock: vi.fn(),
}));

vi.mock('child_process', () => ({ spawn: spawnMock }));
vi.mock('./youtubeCookies', () => ({
  getYoutubeCookiesState: stateMock,
  youtubeCookiesPath: () => '/cfg/youtube-cookies.txt',
}));

import { downloadWithYtDlp } from './trailerDownload';

function fakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  setImmediate(() => proc.emit('close', 0));
  return proc;
}

describe('downloadWithYtDlp cookies', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockImplementation(fakeProcess);
  });

  it.each(['invalid', 'missing'])('omits --cookies when %s', async (state) => {
    stateMock.mockReturnValue(state);
    await downloadWithYtDlp('https://youtu.be/x', '/tmp/out.mp4');
    expect(spawnMock.mock.calls[0][1]).not.toContain('--cookies');
  });

  it('passes --cookies when valid', async () => {
    stateMock.mockReturnValue('valid');
    await downloadWithYtDlp('https://youtu.be/x', '/tmp/out.mp4');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args[args.indexOf('--cookies') + 1]).toBe(
      '/cfg/youtube-cookies.txt'
    );
  });
});
