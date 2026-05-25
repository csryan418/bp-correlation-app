import axios from 'axios';

export const client = axios.create({
  baseURL: process.env.OPEN_WEARABLES_BASE_URL || 'http://localhost:8000',
  headers: {
    Authorization: `Bearer ${process.env.OPEN_WEARABLES_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

export async function ping() {
  // Any HTTP response means the host is up; only a network error means it's unreachable.
  try {
    const res = await client.get('/health');
    return res.data;
  } catch (err) {
    if (err.response) return { status: err.response.status };
    throw err;
  }
}
