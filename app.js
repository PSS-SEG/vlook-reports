import express from 'express';
import cors from 'cors';  // <--- 新增
import path from 'path';
import { fileURLToPath } from 'url';
import cloudRouter from './routes/cloud.js';
import recRouter from './routes/rec.js';

const app = express();

// 解決 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ 加入 CORS 設定 (重要)
app.use(cors({
  origin: 'http://localhost:3000', // 根據你的前端位址調整
  credentials: true
}));

// 中介軟體
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 註冊 API 路由
app.use('/api/cloud', cloudRouter);
app.use('/api/rec', recRouter);

// 提供 public 靜態檔案（前端）
app.use(express.static(path.join(__dirname, 'public')));

// 啟動 server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
