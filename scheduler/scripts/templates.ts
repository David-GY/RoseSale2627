import { mkdir, writeFile } from "node:fs/promises";
import { demoSnapshot } from "../lib/demo";
import { templateTables } from "../lib/templates";
const directory = new URL("../sheet-templates/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, rows] of Object.entries(templateTables(demoSnapshot()))) {
  const csv =
    rows
      .map((row) =>
        row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n") + "\r\n";
  await writeFile(
    new URL(encodeURIComponent(name) + ".csv", directory),
    csv,
    "utf8",
  );
}
console.log(
  "Wrote placeholder config, roster, blank response/output tables and six sample day tabs.",
);
