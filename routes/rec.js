import express from 'express';
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

const router = express.Router();
const jar = new CookieJar();
const fetchWithCookie = fetchCookie(fetch, jar); // 讓 fetch 記住 cookie

router.post('/login', async (req, res) => {
  const { username, password, site_id, start_date, end_date } = req.body;

  try {
    const loginRes = await fetchWithCookie('https://cas.pss-group.xyz/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ username, password }),
    });

    const status = loginRes.status;
    const loginJson = await loginRes.json();

    console.log('Login status:', status);
    console.log('Login response body:', loginJson);

    if (status !== 200 || !loginJson.payload) {
      return res.status(401).json({ error: 'Login failed or session not established' });
    }

    const cardTypes = ['creditCard', 'easyCard', 'ipass'];
    const results = [];

    for (const type of cardTypes) {
      const url = `https://cas.pss-group.xyz/api/v1/multiple-records/site-revenue-statistics?start_date=${start_date}&end_date=${end_date}&card_type=${type}`;
      const resApi = await fetchWithCookie(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        }
      });

      const data = await resApi.json();
      results.push({ card_type: type, data });
    }

    res.json(results);

  } catch (err) {
    console.error('Error occurred:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
