export const POSTHOG = { key: 'phc_uD2banhuSNmNhc496TXp3yDo7RkVpUmfPCbSBzzEXwNT', ingestUrl: 'https://blp-vega.gabriel-luis-cinza.workers.dev/v1/punk' };

export const DELIVERY = { sent: 'sent', dropped: 'dropped', retry: 'retry', noConsent: 'no_consent' };
export const PERMANENT_REJECTIONS = [400, 403, 413];

export const deliveryOf = (status) => {
  if (status >= 200 && status < 300) return DELIVERY.sent;
  if (PERMANENT_REJECTIONS.includes(status)) return DELIVERY.dropped;
  return DELIVERY.retry;
};

const FINAL_DELIVERIES = new Set([DELIVERY.sent, DELIVERY.dropped, DELIVERY.noConsent]);

export const advancesCursor = (response) => FINAL_DELIVERIES.has(response?.delivery);
export const DATA_COLLECTION = ['technicalAndInteraction'];
export const KEYS = { consent: 'blp.consent', asked: 'blp.consentAsked', installId: 'blp.installId', cursor: 'blp.telemetryCursor' };

const identityFirst = (properties, identity) => ({ ...identity, ...properties, ...identity });

export const batchOf = ({ events, installId, version, now }) => {
  const identity = {
    distinct_id: installId,
    app_version: version,
    $lib: 'baiak-loot-planner',
    $process_person_profile: false,
    $geoip_disable: true,
  };
  return {
    api_key: POSTHOG.key,
    batch: events.map(({ event, properties }) => ({
      event,
      timestamp: new Date(now).toISOString(),
      properties: identityFirst(properties, identity),
    })),
  };
};

export const firefoxConsent = async (api) => {
  try {
    return await api.permissions.contains({ data_collection: DATA_COLLECTION });
  } catch {
    return null;
  }
};

export const consentDetails = async (api) => {
  const firefox = await firefoxConsent(api);
  const stored = (await api.storage.local.get(KEYS.consent))[KEYS.consent]?.granted === true;
  return { firefox, stored, granted: firefox ?? stored };
};

export const consentGranted = async (api) => (await consentDetails(api)).granted;
