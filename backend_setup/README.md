# PDFShdow 后端服务部署指南

这是一个简单的 Node.js 后端服务，用于接收和记录来自 PDFShdow 应用程序的反馈和任务报告。

## 部署步骤

### 1. 上传文件

将 `backend_setup` 文件夹中的所有文件 (`server.js`, `package.json`, `README.md`) 上传到您服务器上的一个目录，例如 `/root/pdfshdow_backend`。
WWW
### 2. 安装依赖

进入您上传文件的目录，并安装所需的 Node.js 模块。

```bash
cd /root/pdfshdow_backend
npm install
```

### 3. 运行后端服务

您可以直接运行此服务，但为了保证在您关闭终端后服务仍然能够持续运行，强烈建议使用像 `pm2` 这样的进程管理工具。

**方法一：直接运行 (用于测试)**

```bash
node server.js
```

您应该会看到输出 `Backend server listening at http://localhost:3000`。

**方法二：使用 `pm2` (推荐用于生产环境)**

如果您没有安装 `pm2`，请先全局安装：

```bash
npm install pm2 -g
```

然后使用 `pm2` 启动您的服务：

```bash
pm2 start server.js --name pdfshdow-backend
```

您可以使用 `pm2 list` 查看服务状态，`pm2 logs pdfshdow-backend` 查看日志。

### 4. 更新 Nginx 配置

现在，您需要修改 Nginx 配置文件，将 `/feedback` 和 `/task` 的请求转发到刚刚启动的后端服务上。

这是您修改后的 Nginx 配置文件 (`/etc/nginx/sites-available/default` 或类似路径)：

```nginx
server {
    listen 80;
    server_name 115.190.92.23; # 建议使用您的域名，而不是IP地址
    root /root/website;

    # 处理更新文件的请求
    location /updates {
        alias /root/updates/;
        autoindex on;
        autoindex_exact_size off;
        autoindex_localtime on;
    }

    # 将 /feedback 的请求转发到 Node.js 后端服务
    location /feedback {
        proxy_pass http://localhost:3000; # 转发到后端服务地址
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 将 /task 的请求转发到 Node.js 后端服务
    location /task {
        proxy_pass http://localhost:3000; # 同样转发到后端服务地址
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 根目录和其他静态文件请求
    location / {
        try_files $uri $uri/ =404;
    }
}
```

**重要提示：**
*   请将 `server_name` 从 `localhost` 改为您的服务器公网 IP `115.190.92.23` 或您的域名。
*   `proxy_pass http://localhost:3000;` 这一行告诉 Nginx 将匹配到的请求发送给在本机 3000 端口上运行的服务。
*   `proxy_set_header` 这些行是为了将原始的请求信息（如客户端的真实IP地址）传递给后端服务，这对于记录详细日志非常重要。

### 5. 重启 Nginx

在修改并保存了 Nginx 配置文件后，请检查配置语法并重启 Nginx 服务以使更改生效。

```bash
nginx -t
# 如果显示 "syntax is ok" 和 "test is successful"，则可以重启
sudo systemctl restart nginx
```

## 日志文件

部署并运行成功后，每当有反馈或任务报告提交时，详细信息将被记录在 `/root/pdfshdow_backend/logs/` 目录下的 `feedback.log` 和 `tasks.log` 文件中。每个条目都是一行独立的 JSON，方便您进行后续处理或分析。