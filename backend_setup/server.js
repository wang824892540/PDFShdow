const express = require('express');
 const fs = require('fs').promises;
 const path = require('path');
 const { randomUUID } = require('crypto');
 const cors = require('cors');
 
 const app = express();
 const port = 3000;
 const DB_DIR = path.join(__dirname, 'db');
 
 // Define paths for our new "database" files
 const DB_PATHS = {
   users: path.join(DB_DIR, 'users.json'),
   events: path.join(DB_DIR, 'events.json'),
   feedback: path.join(DB_DIR, 'feedback.json'),
 };
 
 app.use(express.json());
 app.use(cors());
 
 // --- 数据库辅助函数 ---
 
 const ensureDbFiles = async () => {
   try {
     await fs.mkdir(DB_DIR, { recursive: true });
     for (const key in DB_PATHS) {
       try {
         await fs.access(DB_PATHS[key]);
       } catch {
         await fs.writeFile(DB_PATHS[key], JSON.stringify([], null, 2));
       }
     }
   } catch (error) {
     console.error("Failed to initialize database files:", error);
   }
 };
 
 const readDb = async (dbName) => {
   try {
     const data = await fs.readFile(DB_PATHS[dbName], 'utf8');
     return JSON.parse(data);
   } catch (error) {
     console.error(`Error reading ${dbName} DB:`, error);
     return [];
   }
 };
 
 const writeDb = async (dbName, data) => {
   await fs.writeFile(DB_PATHS[dbName], JSON.stringify(data, null, 2), 'utf8');
 };
 
 const findOrCreateUser = async (clientId) => {
   const users = await readDb('users');
   let user = users.find(u => u.clientId === clientId);
   const now = new Date().toISOString();
 
   if (user) {
     user.lastSeen = now;
   } else {
     user = {
       clientId,
       isBanned: false,
       firstSeen: now,
       lastSeen: now,
       feedbackCount: 0,
     };
     users.push(user);
   }
   await writeDb('users', users);
   return user;
 };
 
 // --- API 端点 ---
 
 // [新增] 检查用户状态 (供Electron应用在执行功能前调用)
 app.get('/api/status/:clientId', async (req, res) => {
   const { clientId } = req.params;
   if (!clientId) {
     return res.status(400).json({ message: 'clientId is required.' });
   }
   const user = await findOrCreateUser(clientId);
   res.json({ isBanned: user.isBanned });
 });
 
 // [修改] 提交反馈
 app.post('/feedback', async (req, res) => {
   const { feedback, timestamp, clientId } = req.body;
   if (!feedback || !clientId) {
     return res.status(400).json({ message: 'Feedback content and clientId are required.' });
   }
 
   const user = await findOrCreateUser(clientId);
   if (user.isBanned) {
     return res.status(403).json({ message: 'User is banned.' });
   }
 
   const newFeedback = {
     id: randomUUID(),
     clientId,
     feedback,
     timestamp: timestamp || new Date().toISOString(),
     status: 'new',
     reply: null
   };
 
   const allFeedback = await readDb('feedback');
   allFeedback.unshift(newFeedback);
   await writeDb('feedback', allFeedback);
   
   // Update user's feedback count
   const users = await readDb('users');
   const userIndex = users.findIndex(u => u.clientId === clientId);
   if (userIndex !== -1) {
     users[userIndex].feedbackCount = (users[userIndex].feedbackCount || 0) + 1;
     await writeDb('users', users);
   }
 
   res.status(201).json({ message: 'Feedback received.', feedback: newFeedback });
 });
 
 // [修改] 记录任务 -> 重命名为记录事件
 app.post('/api/event', async (req, res) => {
   const { clientId, feature, details } = req.body;
   if (!clientId || !feature) {
     return res.status(400).json({ message: 'clientId and feature are required.' });
   }
 
   const user = await findOrCreateUser(clientId);
   if (user.isBanned) {
     // Still log the event, but could be filtered in admin panel.
     // Or just return here if we don't want to log banned user actions.
     // For now, we log it.
   }
 
   const newEvent = {
     id: randomUUID(),
     clientId,
     feature,
     details: details || {},
     timestamp: new Date().toISOString(),
   };
 
   const events = await readDb('events');
   events.push(newEvent);
   await writeDb('events', events);
 
   res.status(200).json({ message: 'Event logged.' });
 });
 
 // [新增] 获取仪表盘统计数据
 app.get('/api/dashboard-stats', async (req, res) => {
    const users = await readDb('users');
    const events = await readDb('events');
    const feedback = await readDb('feedback');
 
    const featureUsage = events.reduce((acc, event) => {
        acc[event.feature] = (acc[event.feature] || 0) + 1;
        return acc;
    }, {});
 
    const stats = {
        totalUsers: users.length,
        bannedUsers: users.filter(u => u.isBanned).length,
        totalFeedback: feedback.length,
        newFeedback: feedback.filter(f => f.status === 'new').length,
        totalEvents: events.length,
        featureUsage,
    };
 
    res.json(stats);
 });
 
 // [新增] 获取所有用户 (供管理页面使用)
 app.get('/api/users', async (req, res) => {
    const users = await readDb('users');
    res.json(users.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)));
 });
 
 // [新增] 封禁/解封用户
 app.post('/api/users/:clientId/ban', async (req, res) => {
    const { clientId } = req.params;
    const { ban } = req.body; // { ban: true } or { ban: false }
 
    const users = await readDb('users');
    const userIndex = users.findIndex(u => u.clientId === clientId);
 
    if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found.' });
    }
 
    users[userIndex].isBanned = ban;
    await writeDb('users', users);
 
    res.json({ message: `User ${ban ? 'banned' : 'unbanned'} successfully.`, user: users[userIndex] });
 });
 
 // [保留] 获取所有反馈 (供管理页面使用)
 app.get('/api/feedback', async (req, res) => {
   const allFeedback = await readDb('feedback');
   res.json(allFeedback);
 });
 
 // [保留] 回复一条反馈 (供管理页面使用)
 app.post('/api/feedback/:id/reply', async (req, res) => {
   const { id } = req.params;
   const { reply } = req.body;
 
   if (!reply) {
     return res.status(400).json({ message: 'Reply content is required.' });
   }
 
   const allFeedback = await readDb('feedback');
   const feedbackIndex = allFeedback.findIndex(fb => fb.id === id);
 
   if (feedbackIndex === -1) {
     return res.status(404).json({ message: 'Feedback not found.' });
   }
 
   allFeedback[feedbackIndex].reply = {
     content: reply,
     repliedAt: new Date().toISOString()
   };
   allFeedback[feedbackIndex].status = 'replied';
 
   await writeDb('feedback', allFeedback);
   res.status(200).json({ message: 'Reply added successfully.', feedback: allFeedback[feedbackIndex] });
 });
 
 // [保留] 检查并获取新回复 (供Electron应用轮询)
 app.get('/api/replies/:clientId', async (req, res) => {
   const { clientId } = req.params;
   const allFeedback = await readDb('feedback');
 
   const newReplies = allFeedback.filter(fb => fb.clientId === clientId && fb.status === 'replied');
 
   if (newReplies.length > 0) {
     const updatedFeedback = allFeedback.map(fb => {
       if (fb.clientId === clientId && fb.status === 'replied') {
         return { ...fb, status: 'acknowledged' };
       }
       return fb;
     });
     await writeDb('feedback', updatedFeedback);
   }
 
   res.json({ replies: newReplies });
 });
 
 
 app.listen(port, async () => {
   await ensureDbFiles();
   console.log(`Backend server with new features running at http://localhost:${port}`);
 });