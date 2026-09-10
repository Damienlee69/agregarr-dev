import { describe, expect, it } from 'vitest';
import Settings from './settings';

type Loose = Record<string, unknown>;

const makeSettings = () => {
  const settings = new Settings();
  const data = (settings as unknown as { data: Loose }).data;
  (data.plex as Loose).collectionConfigs = [
    {
      id: 'a',
      directDownloadRadarrServerId: 0,
      directDownloadRadarrProfileId: 7,
      directDownloadRadarrRootFolder: '/movies',
      directDownloadRadarrMonitor: false,
      directDownloadRadarrSearchOnAdd: true,
      comingSoonRadarrServerId: 0,
      comingSoonRadarrTagIds: [3],
      radarrInstanceId: 0,
      radarrTagId: 9,
      radarrTagLabel: 'benjy',
      overseerrRadarrServerId: 0,
      directDownloadSonarrServerId: 0,
      directDownloadSonarrProfileId: 2,
    },
    {
      id: 'b',
      directDownloadRadarrServerId: 1,
      directDownloadRadarrProfileId: 4,
      sources: [
        { id: 's1', radarrTagServerId: 0, radarrTagId: 9, radarrTagLabel: 'x' },
        { id: 's2', directDownloadRadarrServerId: 1, sonarrTagServerId: 0 },
      ],
    },
  ];
  data.overseerr = { radarrServerId: 0 };
  data.watchlistSync = {
    enableOwner: true,
    enableUsers: false,
    radarr: { enabled: true, serverId: 0, profileId: 5, tags: [1] },
    sonarr: { enabled: true, serverId: 1, profileId: 6 },
  };
  return { settings, data };
};

const configs = (data: Loose) =>
  (data.plex as Loose).collectionConfigs as Loose[];

describe('clearArrServerReferences', () => {
  it('drops the selector and its server-specific siblings, top level and per source', () => {
    const { settings, data } = makeSettings();
    settings.clearArrServerReferences('radarr', 0);

    const [a, b] = configs(data);
    expect(a).toEqual({
      id: 'a',
      directDownloadRadarrMonitor: false,
      directDownloadRadarrSearchOnAdd: true,
      overseerrRadarrServerId: 0,
      directDownloadSonarrServerId: 0,
      directDownloadSonarrProfileId: 2,
    });
    expect(b.sources).toEqual([
      { id: 's1' },
      { id: 's2', directDownloadRadarrServerId: 1, sonarrTagServerId: 0 },
    ]);
    expect((data.watchlistSync as Loose).radarr).toEqual({ enabled: true });
  });

  it('leaves other servers, the other kind, and Overseerr ids alone', () => {
    const { settings, data } = makeSettings();
    settings.clearArrServerReferences('sonarr', 0);

    const [a, b] = configs(data);
    expect(a.directDownloadRadarrServerId).toBe(0);
    expect(a.directDownloadRadarrProfileId).toBe(7);
    expect(a.directDownloadSonarrServerId).toBeUndefined();
    expect(a.directDownloadSonarrProfileId).toBeUndefined();
    expect(b.directDownloadRadarrProfileId).toBe(4);
    expect((b.sources as Loose[])[1]).toEqual({
      id: 's2',
      directDownloadRadarrServerId: 1,
    });
    expect(data.overseerr).toEqual({ radarrServerId: 0 });
    expect((data.watchlistSync as Loose).sonarr).toEqual({
      enabled: true,
      serverId: 1,
      profileId: 6,
    });
  });
});
