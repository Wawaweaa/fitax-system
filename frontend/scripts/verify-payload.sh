#!/bin/bash
# 验证 payload 中是否包含 fileMetadata

echo "🔍 查找最近的 /api/process 调用日志..."
echo ""

# 方法1: 查找服务器日志文件
if [ -f ".next/server.log" ]; then
  echo "📄 从 .next/server.log 查找："
  grep "\[process\] 文件元数据" .next/server.log | tail -5
elif [ -f "dev.log" ]; then
  echo "📄 从 dev.log 查找："
  grep "\[process\] 文件元数据" dev.log | tail -5
else
  echo "⚠️  未找到日志文件，请手动查看控制台输出"
  echo ""
  echo "预期日志格式："
  echo '[process] 文件元数据: {'
  echo '  "settlement": {'
  echo '    "objectKey": "raw/user_id=.../...",'
  echo '    "contentHash": "...",'
  echo '    "fileType": "settlement",'
  echo '    "originalFilename": "...",'
  echo '    "size": 123456'
  echo '  }'
  echo '}'
fi

echo ""
echo "✅ 如果看到上述日志，说明 payload 正确包含了 fileMetadata"
