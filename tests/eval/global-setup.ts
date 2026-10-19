import { writeFileSync } from "node:fs";

// Runs once before all eval files, so each file can append to the same report.
export default function setup() {
  writeFileSync("tests/eval/report.txt", "");
}
