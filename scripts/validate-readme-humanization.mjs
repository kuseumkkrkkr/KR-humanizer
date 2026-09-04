import fs from "node:fs";

const [beforePath = "README.md", afterPath = "artifacts/readme-review/README-humanized.md"] = process.argv.slice(2);
const normalize = (text) => text.replace(/\r\n/g, "\n");
const before = normalize(fs.readFileSync(beforePath, "utf8"));
const after = normalize(fs.readFileSync(afterPath, "utf8"));

const collect = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[0]);
const checks = [
  ["fenced code blocks", /```[^\n]*\n[\s\S]*?```/g],
  ["headings", /^#{1,6} .+$/gm],
  ["link destinations", /(?<=\]\()[^)]+(?=\))/g],
  ["inline code", /`[^`\n]+`/g],
  ["HTML tags", /<[^>]+>/g],
  ["number tokens", /\b\d[\d,.]*(?:\s?(?:KiB|MiB|초|개|자|단계|회))?\b/g],
];

for (const [label, pattern] of checks) {
  const left = collect(before, pattern);
  const right = collect(after, pattern);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} changed: ${left.length} before, ${right.length} after`);
  }
}

const tableShape = (text) => text
  .split("\n")
  .filter((line) => line.startsWith("|"))
  .map((line) => (line.match(/\|/g) || []).length);
if (JSON.stringify(tableShape(before)) !== JSON.stringify(tableShape(after))) {
  throw new Error("Markdown table shape changed");
}

const disclosure = "이 설명문은 순수 AI로 작성 후 해당 툴로 윤문한 것입니다.";
if (!after.includes(disclosure)) throw new Error("AI drafting disclosure is missing");

console.log(`README structure preserved: ${checks.length} protected token groups, ${tableShape(before).length} table rows.`);
