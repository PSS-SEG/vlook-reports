import express from 'express';
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

const router = express.Router();
const jar = new CookieJar();
const fetchWithCookie = fetchCookie(fetch, jar);

router.post('/login', async (req, res) => {
  const { username, password, start_date, end_date } = req.body;

  try {
    // 登入取得 session cookie
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

    if (status !== 200 || !loginJson.payload) {
      return res.status(401).json({ error: 'Login failed or session not established' });
    }

    const cardTypes = ['creditCard', 'easyCard', 'ipass'];
    const rawResults = [];

    // 依 card_type 取得資料，展開 details 並帶入 site_id、site_name
    for (const type of cardTypes) {
      const url = `https://cas.pss-group.xyz/api/v1/multiple-records/site-revenue-statistics?start_date=${start_date}&end_date=${end_date}&card_type=${type}`;
      const resApi = await fetchWithCookie(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        }
      });

      const { payload } = await resApi.json();

      if (Array.isArray(payload)) {
        payload.forEach(site => {
          const { site_id, site_name } = site;
          if (Array.isArray(site.details)) {
            site.details.forEach(detail => {
              rawResults.push({
                ...detail,
                site_id,
                site_name,
                card_type: type
              });
            });
          }
        });
      }
    }

    const bothIssues = [];
    const onlyDiff = [];
    const onlyTotal = [];
    const stats = {
      bothIssues: {},
      onlyDiff: {},
      onlyTotal: {},
      total: 0
    };

    // 篩選異常資料並累計，並帶入 date 欄位
    for (const item of rawResults) {
      const { site_id, site_name, card_type, diff_amount, total_amount, date } = item;
      const isDiffNegative = Number(diff_amount) < 0;
      const isTotalZero = Number(total_amount) === 0;

      if (isDiffNegative && isTotalZero) {
        bothIssues.push({ site_id, site_name, card_type, date, reason: '在途營收為負數，期間營收為 0' });
        stats.bothIssues[card_type] = (stats.bothIssues[card_type] || 0) + 1;
      } else if (isDiffNegative) {
        onlyDiff.push({ site_id, site_name, card_type, date, reason: '在途營收為負數' });
        stats.onlyDiff[card_type] = (stats.onlyDiff[card_type] || 0) + 1;
      } else if (isTotalZero) {
        onlyTotal.push({ site_id, site_name, card_type, date, reason: '期間營收為 0' });
        stats.onlyTotal[card_type] = (stats.onlyTotal[card_type] || 0) + 1;
      }
    }

    stats.total = bothIssues.length + onlyDiff.length + onlyTotal.length;

    res.json({ bothIssues, onlyDiff, onlyTotal, stats });

  } catch (err) {
    console.error('Error occurred:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
