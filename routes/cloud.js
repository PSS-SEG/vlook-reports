import express from 'express';
import fetch from 'node-fetch';
import tough from 'tough-cookie';
import fetchCookie from 'fetch-cookie';

const router = express.Router();
const cookieJar = new tough.CookieJar();
const fetchWithCookie = fetchCookie(fetch, cookieJar);

router.post('/login', async (req, res) => {
  const { username, password, start, end } = req.body;

  try {
    console.log('開始抓取首頁並取得 cookies...');

    // 1. 取得首頁並抓取 cookies
    const homeRes = await fetchWithCookie('https://ichenparking.com.tw/major');
    const homeText = await homeRes.text();
    console.log('首頁抓取成功，取得 cookies');

    const cookies = cookieJar.getCookiesSync('https://ichenparking.com.tw');
    const xsrfCookie = cookies.find(c => c.key === 'XSRF-TOKEN');
    const xsrfToken = decodeURIComponent(xsrfCookie?.value || '');

    if (!xsrfToken) {
      console.error('無法取得 CSRF Token');
      return res.status(400).json({ error: '無法取得 CSRF Token' });
    }

    console.log('取得 CSRF Token:', xsrfToken);

    // 2. 登入
    console.log('開始登入...');
    const loginRes = await fetchWithCookie('https://ichenparking.com.tw/major/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': xsrfToken,
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://ichenparking.com.tw/major/',
        'Origin': 'https://ichenparking.com.tw',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify({ account: username, password }),
    });

    if (loginRes.status !== 200) {
      const errData = await loginRes.text();
      console.error('登入失敗:', errData);
      return res.status(401).json({ error: '登入失敗', detail: errData });
    }

    console.log('登入成功');

    // 3. 查詢報表（此時 session cookie 應已生效）
    console.log('開始查詢報表...');
    const reportRes = await fetchWithCookie('https://ichenparking.com.tw/finance/reports/daily-statistic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Referer': 'https://ichenparking.com.tw/major/report',
      },
      body: JSON.stringify({
        lots: [],  // 確認這裡的 'lots' 是否需要更新
        reportType: 'dailyStatisticReport',
        isForExternal: false,
        payDateInterval: { start, end },
        payMethod: [],
        transStatusStatistic: ['normal'],
        carCategory: [],
        reportStatisticBy: ['machine']
      }),
    });

    const reportData = await reportRes.json();

    if (reportRes.status !== 200) {
      console.error('報表查詢失敗:', reportData);
      return res.status(reportRes.status).json({ error: '報表查詢失敗', reportData });
    }

    console.log('報表查詢成功', reportData);

    res.json(reportData);

  } catch (err) {
    console.error('Error occurred:', err);
    res.status(500).json({ error: err.message || '未知錯誤' });
  }
});

export default router;
