import express from 'express';
import fetch from 'node-fetch';
import tough from 'tough-cookie';
import fetchCookie from 'fetch-cookie';

const router = express.Router();
const cookieJar = new tough.CookieJar();
const fetchWithCookie = fetchCookie(fetch, cookieJar);

router.post('/login', async (req, res) => {
  const { username, password, start, end, lotId } = req.body;
  const formatDate = (dateStr) => dateStr.replace(/-/g, '/');
  const formattedStart = formatDate(start);
  const formattedEnd = formatDate(end);

  try {
    console.log('===== 開始流程 =====');

    // 1. 抓首頁取得 cookies 和 XSRF-TOKEN
    const homeRes = await fetchWithCookie('https://ichenparking.com.tw/major');
    await homeRes.text();

    const cookies = cookieJar.getCookiesSync('https://ichenparking.com.tw');
    const xsrfCookie = cookies.find(c => c.key === 'XSRF-TOKEN');
    const xsrfToken = decodeURIComponent(xsrfCookie?.value || '');

    if (!xsrfToken) {
      console.error('❌ 無法取得 CSRF Token');
      return res.status(400).json({ error: '無法取得 CSRF Token' });
    }

    console.log('✔ 取得 CSRF Token:', xsrfToken);

    // 2. 登入
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

    const loginText = await loginRes.text();
    console.log('登入回應狀態碼:', loginRes.status);
    console.log('登入回應內容:', loginText);

    let loginJson;
    try {
      loginJson = JSON.parse(loginText);
    } catch {
      return res.status(500).json({ error: '無法解析登入回應', detail: loginText });
    }

    if (loginRes.status !== 200 || loginJson.status !== 'success') {
      console.error('❌ 登入失敗:', loginJson.message || '未知錯誤');
      return res.status(401).json({ error: '登入失敗', detail: loginJson });
    }

    const accessToken = loginJson.accessToken;
    if (!accessToken) {
      return res.status(500).json({ error: 'accessToken 遺失' });
    }

    console.log('✔ 登入成功，AccessToken:', accessToken);

    // 等待登入狀態穩定
    await new Promise(resolve => setTimeout(resolve, 8000));

    // 3. 查詢報表
    const reportPayload = {
      lots: [lotId],
      reportType: 'dailyStatisticReport',
      isForExternal: false,
      payDateInterval: { start: formattedStart, end: formattedEnd },
      payMethod: [],
      transStatusStatistic: ['normal'],
      carCategory: [],
      reportStatisticBy: ['machine']
    };
    console.log('📅 日期格式：', formattedStart, formattedEnd);

    const allCookies = cookieJar.getCookiesSync('https://ichenparking.com.tw');
    const cookieString = allCookies.map(c => `${c.key}=${c.value}`).join('; ');

    console.log('✔ 發送報表查詢請求...');
    console.log('🍪 Cookie String:', cookieString);
    console.log('🔑 XSRF Token:', xsrfToken);

    const reportRes = await fetchWithCookie('https://ichenparking.com.tw/finance/reports/daily-statistic', {
      method: 'POST',
      headers: {
        'X-XSRF-TOKEN': xsrfToken,
        'x-csrf-token': xsrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://ichenparking.com.tw/finance/reports?lots[]=${lotId}`,
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://ichenparking.com.tw',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cookie': cookieString
      },
      body: JSON.stringify(reportPayload),
    });

    const reportText = await reportRes.text();
    console.log('報表查詢狀態碼:', reportRes.status);
    console.log('報表回應內容:', reportText);

    console.log('📤 最終 payload:', JSON.stringify(reportPayload, null, 2));
    // ✅ 若要顯示送出的 headers，應該在你發送 request 前印出
    console.log('📤 送出 headers:', {
      'X-XSRF-TOKEN': xsrfToken,
      'x-csrf-token': xsrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `https://ichenparking.com.tw/finance/reports?lots[]=${lotId}`,
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://ichenparking.com.tw',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
     'Cookie': cookieString
    });

    if (reportRes.status !== 200) {
      return res.status(reportRes.status).json({ error: '報表查詢失敗', detail: reportText });
    }

    console.log('✔ 報表查詢成功');
    res.json(JSON.parse(reportText));

  } catch (err) {
    console.error('🔥 發生錯誤:', err);
    res.status(500).json({ error: err.message || '未知錯誤' });
  }
});

export default router;
