import express from 'express';
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

const router = express.Router();

// 建立 Cookie 管理容器，用於維持 session
const jar = new CookieJar();
const fetchWithCookie = fetchCookie(fetch, jar);

// 登入並查詢資料 API
router.post('/login', async (req, res) => {
  const { username, password, start_date, end_date, whitelist = [] } = req.body;

  try {
    // === 登入取得 Session Cookie ===
    const loginRes = await fetchWithCookie('https://cas.pss-group.xyz/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({ username, password })
    });

    const status = loginRes.status;
    const loginJson = await loginRes.json();

    // 登入失敗處理
    if (status !== 200 || !loginJson.payload) {
      return res.status(401).json({ error: 'Login failed or session not established' });
    }

    // === 依支付方式查詢報表 ===
    const cardTypes = ['creditCard', 'easyCard', 'ipass'];
    const rawResults = [];

    for (const type of cardTypes) {
      const url = `https://cas.pss-group.xyz/api/v1/multiple-records/site-revenue-statistics?start_date=${start_date}&end_date=${end_date}&card_type=${type}`;

      const resApi = await fetchWithCookie(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const { payload } = await resApi.json();

      // 展開每筆 site -> detail 加入 card_type
      if (Array.isArray(payload)) {
        payload.forEach(site => {
          const { company, site_id, site_name, details } = site;
          if (Array.isArray(details)) {
            details.forEach(detail => {
              rawResults.push({
                ...detail,
                company,
                site_id,
                site_name,
                card_type: type
              });
            });
          }
        });
      }
    }

    // === 排除白名單場站 ===
    const lowerWhitelist = whitelist.map(x => x.toLowerCase());
    const filteredResults = rawResults.filter(item =>
      !lowerWhitelist.includes(item.site_id.toLowerCase())
    );

    // === 初始化分類容器 ===
    const bothIssues = [];
    const onlyDiff = [];
    const onlyTotal = [];

    const stats = {
      bothIssues: {},
      onlyDiff: {},
      onlyTotal: {},
      total: 0
    };

    // === 遍歷資料並分類 ===
    for (const item of filteredResults) {
      const {
        company,
        site_id,
        site_name,
        card_type,
        diff_amount,
        total_amount,
        date
      } = item;

      const isDiffNegative = Number(diff_amount) < 0;
      const isTotalZero = Number(total_amount) === 0;

      // 同時符合兩種異常
      if (isDiffNegative && isTotalZero) {
        bothIssues.push({
          company,
          site_id,
          site_name,
          card_type,
          date,
          reason: '在途營收為負數，期間營收為 0'
        });
        stats.bothIssues[card_type] = (stats.bothIssues[card_type] || 0) + 1;

      // 僅在途營收為負
      } else if (isDiffNegative) {
        onlyDiff.push({
          company,
          site_id,
          site_name,
          card_type,
          date,
          reason: '在途營收為負數'
        });
        stats.onlyDiff[card_type] = (stats.onlyDiff[card_type] || 0) + 1;

      // 僅期間營收為零
      } else if (isTotalZero) {
        onlyTotal.push({
          company,
          site_id,
          site_name,
          card_type,
          date,
          reason: '期間營收為 0'
        });
        stats.onlyTotal[card_type] = (stats.onlyTotal[card_type] || 0) + 1;
      }
    }

    stats.total = bothIssues.length + onlyDiff.length + onlyTotal.length;

    // === 回傳結果 ===
    res.json({ bothIssues, onlyDiff, onlyTotal, stats });

  } catch (err) {
    console.error('Error occurred:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
