#!/bin/bash
# Worker 后台启动脚本

WORKER_LOG="worker.log"
WORKER_PID_FILE=".worker.pid"

# 停止现有 Worker
if [ -f "$WORKER_PID_FILE" ]; then
  OLD_PID=$(cat "$WORKER_PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "停止现有 Worker (PID: $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$WORKER_PID_FILE"
fi

# 启动新 Worker
echo "启动 Worker（后台运行）..."
nohup npm run worker:dev > "$WORKER_LOG" 2>&1 &
WORKER_PID=$!

# 保存 PID
echo "$WORKER_PID" > "$WORKER_PID_FILE"

# 等待启动
sleep 2

# 检查进程是否存在
if kill -0 "$WORKER_PID" 2>/dev/null; then
  echo "✅ Worker 已启动 (PID: $WORKER_PID)"
  echo "📋 日志文件: $WORKER_LOG"
  echo ""
  echo "实时查看日志: tail -f $WORKER_LOG"
  echo "停止 Worker: kill $WORKER_PID"
else
  echo "❌ Worker 启动失败"
  cat "$WORKER_LOG"
  exit 1
fi
