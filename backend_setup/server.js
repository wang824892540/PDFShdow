const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 3000; // 您可以根据需要更改端口

// 中间件，用于解析传入的 JSON 请求体
app.use(express.json({ limit: '10mb' })); // 设置请求体大小限制
app.use(express.static(path.join(__dirname, 'public'))); // 提供静态文件

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

// 从日志文件中读取并解析数据的辅助函数
const readLogFile = async (fileName) => {
  const logFilePath = path.join(logDir, fileName);
  try {
    const data = await fs.readFile(logFilePath, 'utf8');
    // 按换行符分割，过滤掉空行，然后解析每一行
    return data.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 如果文件不存在，返回空数组
      return [];
    }
    console.error(`Error reading log file ${fileName}:`, error);
    throw error; // 重新抛出错误
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

// 提供统计数据的端点
app.get('/api/stats', async (req, res) => {
  try {
    const feedbackLogs = await readLogFile('feedback.log');
    const taskLogs = await readLogFile('tasks.log');
    res.json({
      feedbackCount: feedbackLogs.length,
      taskCount: taskLogs.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve stats.' });
  }
});

// 提供反馈列表的端点
app.get('/api/feedback', async (req, res) => {
  try {
    const feedbackLogs = await readLogFile('feedback.log');
    // 返回反向排序的日志，让最新的在最前面
    res.json(feedbackLogs.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve feedback list.' });
  }
});

// 提供管理页面的端点
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 启动服务器
app.listen(port, async () => {
  await ensureLogDir(); // 在服务器启动前确保日志目录存在
  console.log(`Backend server listening at http://localhost:${port}`);
});