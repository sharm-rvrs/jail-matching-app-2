import { scrapeRosters } from "../lib/scraper.js";
import fs from "fs";
import path from "path";

async function main() {
  const data = await scrapeRosters();

  const filePath = path.join(process.cwd(), "data", "roster.json");

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log(`Saved ${data.length} roster entries.`);
}

main();
