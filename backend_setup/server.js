const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const port = 3000;

// --- 中间件 ---
app.use(cors()); // 允许所有来源的跨域请求，方便管理页面开发
app.use(express.json({ limit: '10mb' })); // 解析JSON请求体
app.use(express.static(__dirname)); // 托管管理页面等静态文件

// --- 路径和文件设置 ---
const DB_DIR = path.join(__dirname, 'db');
const FEEDBACK_DB_PATH = path.join(DB_DIR, 'feedback.json');
const TASKS_LOG_PATH = path.join(DB_DIR, 'tasks.log');

// --- 辅助函数 ---

// 确保目录和数据库文件存在
const initializeDatabase = async () => {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
    // 检查feedback.json是否存在，如果不存在则创建一个空的JSON数组文件
    await fs.access(FEEDBACK_DB_PATH);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('feedback.json not found, creating a new one.');
      await fs.writeFile(FEEDBACK_DB_PATH, '[]', 'utf8');
    } else {
      console.error('Fatal: Could not create or access db directory.', error);
      process.exit(1);
    }
  }
};

// 读取反馈数据库
const readFeedbackDb = async () => {
  try {
    const data = await fs.readFile(FEEDBACK_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading feedback DB:', error);
    return []; // 如果出错则返回空数组
  }
};

// 写入反馈数据库
const writeFeedbackDb = async (data) => {
  try {
    await fs.writeFile(FEEDBACK_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing to feedback DB:', error);
  }
};

// 追加到任务日志
const appendToTaskLog = async (data) => {
  const logData = JSON.stringify(data) + '\n';
  try {
    await fs.appendFile(TASKS_LOG_PATH, logData, 'utf8');
  } catch (error) {
    console.error('Error appending to task log:', error);
  }
};


// --- API 端点 ---

// [修改] 提交新反馈
app.post('/feedback', async (req, res) => {
  const { feedback, timestamp, clientId } = req.body;

  if (!feedback || !clientId) {
    return res.status(400).json({ error: 'Feedback content and clientId are required.' });
  }

  const allFeedback = await readFeedbackDb();
  const newFeedback = {
    id: crypto.randomUUID(),
    clientId,
    feedback,
    timestamp: timestamp || new Date().toISOString(),
    status: 'new', // 'new' 或 'replied'
    reply: null,
    receivedAt: new Date().toISOString(),
    sourceIp: req.ip
  };

  allFeedback.unshift(newFeedback); // 将新的反馈放在最前面
  await writeFeedbackDb(allFeedback);

  res.status(201).json({ message: 'Feedback received successfully.', feedback: newFeedback });
});

// [修改] 记录任务报告 (路径不变，逻辑微调)
app.post('/task', async (req, res) => {
  const taskData = req.body;
  if (!taskData || Object.keys(taskData).length === 0) {
    return res.status(400).json({ error: 'Task data cannot be empty.' });
  }
  const logEntry = {
    receivedAt: new Date().toISOString(),
    sourceIp: req.ip,
    body: taskData
  };
  await appendToTaskLog(logEntry);
  res.status(200).json({ message: 'Task report received successfully.' });
});


// [新增] 获取所有反馈 (供管理页面使用)
app.get('/api/feedback', async (req, res) => {
  const allFeedback = await readFeedbackDb();
  res.status(200).json(allFeedback);
});

// [新增] 回复一条反馈 (供管理页面使用)
app.post('/api/feedback/:id/reply', async (req, res) => {
  const { id } = req.params;
  const { reply } = req.body;

  if (!reply) {
    return res.status(400).json({ error: 'Reply content cannot be empty.' });
  }

  const allFeedback = await readFeedbackDb();
  const feedbackIndex = allFeedback.findIndex(fb => fb.id === id);

  if (feedbackIndex === -1) {
    return res.status(404).json({ error: 'Feedback not found.' });
  }

  allFeedback[feedbackIndex].reply = {
    content: reply,
    repliedAt: new Date().toISOString()
  };
  allFeedback[feedbackIndex].status = 'replied';

  await writeFeedbackDb(allFeedback);

  res.status(200).json({ message: 'Reply added successfully.', feedback: allFeedback[feedbackIndex] });
});

// [新增] 检查特定用户的回复
app.get('/api/replies/:clientId', async (req, res) => {
    const { clientId } = req.params;
    const allFeedback = await readFeedbackDb();

    const repliesForClient = allFeedback.filter(fb => 
        fb.clientId === clientId && 
        fb.status === 'replied' && 
        !fb.reply.acknowledged // 新增一个字段来标记回复是否已被客户端确认
    );

    if (repliesForClient.length > 0) {
        // 找到回复后，立即更新它们的确认状态，以防止重复发送
        const updatedFeedback = allFeedback.map(fb => {
            if (fb.clientId === clientId && fb.status === 'replied' && !fb.reply.acknowledged) {
                fb.reply.acknowledged = true; // 标记为已确认
                fb.reply.acknowledgedAt = new Date().toISOString();
            }
            return fb;
        });
        await writeFeedbackDb(updatedFeedback);
    }

    res.status(200).json({ replies: repliesForClient });
});


// --- 启动服务器 ---
app.listen(port, async () => {
  await initializeDatabase();
  console.log(`Backend server listening at http://localhost:${port}`);
  console.log(`Admin panel might be available at http://localhost:${port}/admin.html`);
});