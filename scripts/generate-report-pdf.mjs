import fs from "node:fs";
import { chromium } from "@playwright/test";

const source = fs.readFileSync(
  "reports/laporan-pengujian-end-to-end-2026-09-06.md",
  "utf8",
);

function escape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inline(value) {
  const tick = String.fromCharCode(96);
  const codePattern = new RegExp(tick + "([^" + tick + "]+)" + tick, "g");
  return escape(value)
    .replace(codePattern, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  let html = "";
  let inList = false;
  let inTable = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  const closeTable = () => {
    if (inTable) {
      html += "</tbody></table>";
      inTable = false;
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      if (!inTable) {
        closeList();
        inTable = true;
        html += "<table><thead><tr>";
        html += cells.map((cell) => "<th>" + inline(cell) + "</th>").join("");
        html += "</tr></thead><tbody>";
      } else {
        html += "<tr>";
        html += cells.map((cell) => "<td>" + inline(cell) + "</td>").join("");
        html += "</tr>";
      }
      continue;
    }

    closeTable();
    if (line.startsWith("# ")) {
      closeList();
      html += "<h1>" + inline(line.slice(2)) + "</h1>";
    } else if (line.startsWith("## ")) {
      closeList();
      html += "<h2>" + inline(line.slice(3)) + "</h2>";
    } else if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += "<li>" + inline(line.slice(2)) + "</li>";
    } else {
      closeList();
      html += "<p>" + inline(line) + "</p>";
    }
  }

  closeList();
  closeTable();
  return html;
}

const html = [
  "<!doctype html><html><head><meta charset='utf-8'><style>",
  "@page{size:A4;margin:16mm 14mm 16mm 14mm}",
  "body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:10.5pt;line-height:1.45}",
  "h1{font-size:23pt;color:#0f172a;margin:0 0 8px;border-bottom:3px solid #2563eb;padding-bottom:8px}",
  "h2{font-size:15pt;color:#1d4ed8;margin:20px 0 7px;border-bottom:1px solid #dbeafe;padding-bottom:4px;page-break-after:avoid}",
  "p{margin:5px 0 8px}ul{margin:5px 0 10px;padding-left:20px}li{margin:2px 0}",
  "table{width:100%;border-collapse:collapse;margin:8px 0 13px;font-size:9.5pt;page-break-inside:avoid}",
  "th{background:#1e3a8a;color:white;text-align:left;padding:6px;border:1px solid #cbd5e1}",
  "td{padding:5px;border:1px solid #cbd5e1;vertical-align:top}",
  "tr:nth-child(even) td{background:#f8fafc}",
  "code{font-family:Consolas,monospace;background:#eef2ff;padding:1px 3px;border-radius:3px;font-size:9pt}",
  "strong{color:#0f172a}",
  "</style></head><body>",
  markdownToHtml(source),
  "</body></html>",
].join("");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({
  path: "reports/laporan-pengujian-end-to-end-2026-09-06.pdf",
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log("PDF_CREATED");
