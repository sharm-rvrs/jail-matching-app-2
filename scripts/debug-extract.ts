import fs from "fs";
import path from "path";
import pdf from "@cedrugs/pdf-parse";
import { extractPotentialNames } from "../lib/nameExtractor";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: tsx scripts/debug-extract.ts <pdfPath1> [pdfPath2 ...]",
    );
    process.exit(1);
  }

  for (const input of args) {
    const filePath = path.resolve(input);
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    const text = data.text || "";

    console.log(`\n=== ${filePath} ===`);
    console.log(`text length: ${text.length}`);

    const names = extractPotentialNames(text);
    console.log(`names found: ${names.length}`);
    console.log("first 30:", names.slice(0, 30));

    if (names.length === 0) {
      const excerpt = text.replace(/\s+/g, " ").slice(0, 500);
      console.log("text excerpt:", excerpt);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
