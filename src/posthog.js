export const POSTHOG = { host: 'https://us.i.posthog.com', key: 'phc_uD2banhuSNmNhc496TXp3yDo7RkVpUmfPCbSBzzEXwNT' };
export const DATA_COLLECTION = ['technicalAndInteraction'];
export const KEYS = { consent: 'blp.consent', asked: 'blp.consentAsked', installId: 'blp.installId', cursor: 'blp.telemetryCursor' };

export const batchOf = ({ events, installId, version, now }) => ({
  api_key: POSTHOG.key,
  batch: events.map(({ event, properties }) => ({
    event,
    timestamp: new Date(now).toISOString(),
    properties: {
      ...properties,
      distinct_id: installId,
      $process_person_profile: false,
      $geoip_disable: true,
      $lib: 'baiak-loot-planner',
      app_version: version,
    },
  })),
});

export const firefoxConsent = async (api) => {
  try {
    return await api.permissions.contains({ data_collection: DATA_COLLECTION });
  } catch {
    return null;
  }
};

export const consentGranted = async (api) => (await firefoxConsent(api)) ?? (await api.storage.local.get(KEYS.consent))[KEYS.consent]?.granted === true;
