import fs from "fs";
import path from "path";

const factDir = path.join("data", "effective", "fact");
const aggDir = path.join("data", "effective", "agg");

function walk(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(name => ({ name, full: path.join(dir, name) }));
}

function inspectEffective(baseDir: string) {
  const users = walk(baseDir);
  for (const user of users) {
    if (!fs.statSync(user.full).isDirectory()) continue;
    const platforms = walk(user.full);
    for (const plat of platforms) {
      if (!fs.statSync(plat.full).isDirectory()) continue;
      const years = walk(plat.full);
      for (const yr of years) {
        if (!fs.statSync(yr.full).isDirectory()) continue;
        const months = walk(yr.full);
        for (const mo of months) {
          if (!fs.statSync(mo.full).isDirectory()) continue;
          const file = path.join(mo.full, "effective.json");
          if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, "utf8"));
            console.log("--", file, "rowCount:", data.rowCount, "datasetId:", data.datasetId);
            if (Array.isArray(data.rows) && data.rows.length > 0) {
              console.log("   sample rows:", data.rows.slice(0, 2));
            }
            if (Array.isArray(data.uploadIds)) {
              console.log("   uploadIds:", data.uploadIds);
            }
          } else {
            console.log("missing effective.json in", mo.full);
          }
        }
      }
    }
  }
}

console.log("=== Fact effective view ===");
inspectEffective(factDir);

console.log("\n=== Agg effective view ===");
inspectEffective(aggDir);
