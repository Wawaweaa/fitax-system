FROM node:18-slim

# 安装 Python 和构建工具（用于编译依赖）
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    curl \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json 以利用 Docker 缓存
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 安装 DuckDB CLI
RUN wget -q https://github.com/duckdb/duckdb/releases/download/v0.10.0/duckdb_cli-linux-amd64.zip \
    && unzip duckdb_cli-linux-amd64.zip \
    && mv duckdb /usr/local/bin/ \
    && rm duckdb_cli-linux-amd64.zip

# 复制应用代码
COPY . .

# 建立必要的目录
RUN mkdir -p data uploads exports

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 启动 Worker
CMD ["node", "worker/index.js"]