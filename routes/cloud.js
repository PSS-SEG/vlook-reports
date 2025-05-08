import express from 'express';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password, lots, start, end } = req.body;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5秒 timeout

  try {
    const loginRes = await fetch('https://ichenparking.com.tw/major/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });

    clearTimeout(timeout); // 清除 timeout 計時器

    const loginData = await loginRes.json();

    if (!loginData.token) {
      return res.status(401).json({ error: 'Login failed or token not returned', loginData });
    }

    const reportRes = await fetch('https://ichenparking.com.tw/finance/reports/daily-statistic', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loginData.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lots: [lots],
        reportType: 'dailyStatisticReport',
        isForExternal: false,
        payDateInterval: { start, end },
        payMethod: [],
        transStatusStatistic: ['normal'],
        carCategory: [],
        reportStatisticBy: ['machine'],
      }),
      credentials: "include",
    });

    const result = await reportRes.json();
    res.json(result);

  } catch (err) {
    if (err.name === 'AbortError') {
      res.status(408).json({ error: 'Login request timed out' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;
