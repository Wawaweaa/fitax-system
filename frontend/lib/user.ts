/**
 * 用户工具函数
 * 用于用户ID的解析和管理
 */

/**
 * 解析用户ID
 * 优先从请求头获取，其次从环境变量获取，最后使用默认值
 * @param req 请求对象或包含headers的对象
 * @returns 解析后的用户ID
 */
export function resolveUserId(req: Request | { headers?: any }): string {
  // 从请求头获取用户ID
  const userId = req.headers?.get?.('x-user-id') ||
                 req.headers?.['x-user-id'] ||
                 '';

  // 如果请求头中有用户ID，直接返回
  if (userId && typeof userId === 'string' && userId.trim() !== '') {
    return userId;
  }

  // 其次从环境变量获取
  if (typeof process !== 'undefined' && process.env?.DEFAULT_USER_ID) {
    return process.env.DEFAULT_USER_ID;
  }

  // 最后使用默认值
  return 'test-user-001';
}