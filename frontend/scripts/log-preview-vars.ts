import { readFileSync } from "fs";
import { join } from "path";

const factPath = join("data", "effective", "fact", "user_id=test-user-001", "platform=wechat_video", "year=2025", "month=10", "effective.json");
const aggPath = join("data", "effective", "agg", "user_id=test-user-001", "platform=wechat_video", "year=2025", "month=10", "effective.json");

for (const p of [factPath, aggPath]) {
  try {
    const content = readFileSync(p, "utf8");
    const data = JSON.parse(content);
    console.log("File:", p);
    console.log("  rowCount:", data.rowCount);
    console.log("  datasetId:", data.datasetId);
    console.log("  rows[0]:", data.rows?.[0]);
    console.log("  rows[1]:", data.rows?.[1]);
  } catch (err) {
    console.error("Failed to read", p, err);
  }
}
