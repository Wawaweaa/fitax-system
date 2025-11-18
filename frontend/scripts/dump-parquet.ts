import fs from "fs";
import path from "path";
import parquet from "parquetjs";

async function dump() {
  const file = path.join(
    "data",
    "parquet",
    "fact_settlement_effective",
    "user_id=test-user-001",
    "platform=wechat_video",
    "year=2025",
    "month=10",
    "job_id=job-db79482a-0839-4b72-82a8-c28057d71512",
    "fact_settlement.parquet"
  );
  console.log("reading", file);
  const reader = await parquet.ParquetReader.openFile(file);
  const cursor = reader.getCursor();
  let row;
  let i = 0;
  while ((row = await cursor.next()) && i < 5) {
    console.log(row);
    i++;
  }
  await reader.close();
}

dump().catch(console.error);
