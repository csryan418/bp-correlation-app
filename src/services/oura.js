import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.ouraring.com/v2',
  timeout: 15000,
});

function authHeaders() {
  return { Authorization: `Bearer ${process.env.OURA_API_KEY}` };
}

export async function fetchSleepSessions(startDate, endDate) {
  const res = await client.get('/usercollection/sleep', {
    headers: authHeaders(),
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.data ?? [];
}

export async function fetchReadiness(startDate, endDate) {
  const res = await client.get('/usercollection/daily_readiness', {
    headers: authHeaders(),
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.data ?? [];
}

export async function fetchDailyActivity(startDate, endDate) {
  const res = await client.get('/usercollection/daily_activity', {
    headers: authHeaders(),
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.data ?? [];
}
