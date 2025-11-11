import { clearSettlementForPeriod } from '../lib/datasets'

async function main() {
  const userId = process.env.TEST_USER_ID || 'test-user-001'
  const platform = process.env.TEST_PLATFORM || 'wechat_video'
  const year = Number(process.env.TEST_YEAR || 2025)
  const month = Number(process.env.TEST_MONTH || 7)

  const res = await clearSettlementForPeriod(userId, platform, year, month)
  console.log('clear result', res)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

