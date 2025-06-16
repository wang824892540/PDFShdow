const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 3000; // 您可以根据需要更改端口

// 中间件，用于解析传入的 JSON 请求体
app.use(express.json({ limit: '10mb' })); // 设置请求体大小限制

// 中间件，用于记录每个收到的请求
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url} from ${req.ip}`);
  next();
});

// 确保日志目录存在
const logDir = path.join(__dirname, 'logs');
const ensureLogDir = async () => {
  try {
    await fs.mkdir(logDir, { recursive: true });
    console.log(`Log directory ensured at: ${logDir}`);
  } catch (error) {
    console.error('Fatal: Could not create log directory.', error);
    process.exit(1); // 如果无法创建日志目录，则退出
  }
};

// 将数据追加到日志文件的辅助函数
const appendToFile = async (fileName, data) => {
  const logFilePath = path.join(logDir, fileName);
  // 为了方便解析，每条记录都是一个独立的 JSON 对象，以换行符分隔
  const logData = JSON.stringify(data) + '\n'; 
  try {
    await fs.appendFile(logFilePath, logData, 'utf8');
    console.log(`Data successfully appended to ${fileName}`);
  } catch (error) {
    console.error(`Error appending to file ${fileName}:`, error);
  }
};

// 处理反馈的端点
app.post('/feedback', async (req, res) => {
  const feedbackData = req.body;
  console.log('Received feedback content:', feedbackData);

  if (!feedbackData || Object.keys(feedbackData).length === 0) {
    return res.status(400).json({ error: 'Feedback data cannot be empty.' });
  }

  // 构造一个更详细的日志条目
  const logEntry = {
    receivedAt: new Date().toISOString(),
    sourceIp: req.ip,
    headers: req.headers,
    body: feedbackData
  };

  await appendToFile('feedback.log', logEntry);

  res.status(200).json({ message: 'Feedback received successfully.' });
});

// 处理任务报告的端点
app.post('/task', async (req, res) => {
  const taskData = req.body;
  console.log('Received task report content:', taskData);

  if (!taskData || Object.keys(taskData).length === 0) {
    return res.status(400).json({ error: 'Task data cannot be empty.' });
  }

  // 构造一个更详细的日志条目
  const logEntry = {
    receivedAt: new Date().toISOString(),
    sourceIp: req.ip,
    headers: req.headers,
    body: taskData
  };

  await appendToFile('tasks.log', logEntry);

  res.status(200).json({ message: 'Task report received successfully.' });
});

// 启动服务器
app.listen(port, async () => {
  await ensureLogDir(); // 在服务器启动前确保日志目录存在
  console.log(`Backend server listening at http://localhost:${port}`);
});