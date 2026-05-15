import { createSign } from 'crypto';
import axios from 'axios';

interface SfAuth {
  accessToken: string;
  instanceUrl: string;
}

let _cached: SfAuth | null = null;

export async function getSalesforceAuth(): Promise<SfAuth> {
  if (_cached) return _cached;

  const { SF_LOGIN_URL, SF_CLIENT_ID, SF_USERNAME, SF_PRIVATE_KEY_B64 } = process.env;
  if (!SF_LOGIN_URL || !SF_CLIENT_ID || !SF_USERNAME || !SF_PRIVATE_KEY_B64) {
    throw new Error('Missing env vars: SF_LOGIN_URL, SF_CLIENT_ID, SF_USERNAME, SF_PRIVATE_KEY_B64');
  }

  // Key is stored as base64 in Railway to avoid multiline env var issues
  const privateKey = Buffer.from(SF_PRIVATE_KEY_B64, 'base64').toString('utf8').replace(/\r\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: SF_CLIENT_ID,
    sub: SF_USERNAME,
    aud: SF_LOGIN_URL,
    exp: now + 300,
  })).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(privateKey, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const response = await axios.post<{ access_token: string; instance_url: string }>(
    `${SF_LOGIN_URL}/services/oauth2/token`,
    body.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  _cached = { accessToken: response.data.access_token, instanceUrl: response.data.instance_url };
  return _cached;
}

export function resetAuth(): void {
  _cached = null;
}
