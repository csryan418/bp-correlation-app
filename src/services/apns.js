import apn from '@parse/node-apn';

const provider = new apn.Provider({
  token: {
    key:    process.env.APNS_KEY_PATH,
    keyId:  process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
  },
  production: false,  // aps-environment is 'development' — sandbox only
});

export async function sendSyncPush(deviceToken) {
  const note = new apn.Notification();
  note.topic = process.env.APNS_BUNDLE_ID;
  note.pushType = 'background';
  note.priority = 5;
  note.contentAvailable = true;
  note.payload = { action: 'sync' };
  // Silent push — no alert, sound, or badge

  const result = await provider.send(note, deviceToken);

  if (result.failed.length > 0) {
    const failure = result.failed[0];
    const reason = failure.response?.reason ?? 'unknown';
    const status = failure.status ?? 'unknown';
    console.error(`[apns] Push failed — status: ${status}, reason: ${reason}`, failure);
  }

  return result;
}
