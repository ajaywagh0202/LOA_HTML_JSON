#!/usr/bin/env node
/* =====================================================================
 * CR "Last Reviewed" Audit — Node.js scraper
 * ---------------------------------------------------------------------
 * Rebuilds CR_LastUpdated_AllPages.xlsx by crawling the live nav tree.
 * Pure Node (no DOM): built-in fetch + regex parsing + disk cache.
 *
 * SETUP (once):
 *     npm install xlsx          # for the .xlsx writer (optional; CSV/JSON fallback if absent)
 *
 * RUN:
 *     node cr_scraper_node.js                 # full crawl -> CR_LastUpdated_AllPages_NEW.xlsx
 *     node cr_scraper_node.js --sections 5    # Time Table only (quick test)
 *     node cr_scraper_node.js --sections 1 7  # Public Information + Contact Us
 *     node cr_scraper_node.js --selftest      # offline parser + writer test, no network
 *
 * Requires Node 18+ (global fetch). You're on v24 — fine.
 *
 * If your first small run shows the submenu empty or every Last Reviewed as
 * "Not shown on page", the two site-specific spots to tweak are
 * parseChildren() and extractReviewed() — both isolated and commented.
 * ===================================================================== */
"use strict";

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

let XLSX = null;
try { XLSX = require("xlsx"); } catch (_) { /* CSV/JSON fallback used instead */ }

// --------------------------------------------------------------------- Config
const CONFIG = {
  sections: [],            // filled from --sections; [] = all
  delayMs: 120,            // pause between fetches (politeness)
  timeoutMs: 30000,
  maxDepth: 12,
  outFile: "CR_LastUpdated_AllPages_NEW.xlsx",
  cacheDir: ".cr_cache",   // raw HTML cached here -> resumable, fast re-runs
};

const BASE      = "https://cr.indianrailways.gov.in";
const HOME_URL  = `${BASE}/index.jsp?lang=0`;
const SECTION   = (id) => `${BASE}/view_section.jsp?lang=0&id=${id}`;
const NOT_SHOWN = "Not shown on page";
const HEADER    = ["Chain / Leaf Page","Lvl","Page Name","Page ID",
                   "Last Reviewed","URL","Date Captured"];
const DEFAULT_NAMES = {1:"Public Information",2:"Page 2",
  3:"Tenders & Suppliers Info",4:"News & Recruitment",5:"Time Table",
  6:"About Us",7:"Contact Us"};
const REVIEW_LABELS = ["last reviewed","page last reviewed","last review",
  "last updated","page last updated","last modified","reviewed on",
  "updated on","this page is last reviewed","this page was last updated"];
const DATE_RE = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const TODAY = new Date().toISOString().slice(0,10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const cache = new Map();

// --------------------------------------------------------------------- HTTP
function cachePath(url) {
  const h = crypto.createHash("md5").update(url).digest("hex");
  return path.join(CONFIG.cacheDir, h + ".html");
}
async function fetchPage(url) {
  if (cache.has(url)) return cache.get(url);
  if (!fs.existsSync(CONFIG.cacheDir)) fs.mkdirSync(CONFIG.cacheDir, { recursive: true });
  const cp = cachePath(url);
  if (fs.existsSync(cp)) { const t = fs.readFileSync(cp, "utf8"); cache.set(url, t); return t; }
  await sleep(CONFIG.delayMs);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9",
                 "Accept": "text/html,application/xhtml+xml" },
    });
    const t = await r.text();
    cache.set(url, t);
    fs.writeFileSync(cp, t, "utf8");
    return t;
  } catch (e) {
    console.warn("  fetch failed:", url, "-", e.message);
    return "";
  } finally { clearTimeout(timer); }
}

// --------------------------------------------------------------------- Parsing
const ENTITIES = { "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',
                   "&#39;":"'","&apos;":"'","&nbsp;":" " };
function decodeEntities(s) {
  return s.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&nbsp;/g, m => ENTITIES[m])
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
function stripTags(html) {
  return decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}
function idFromHref(href) {
  if (!href || href.indexOf("view_section.jsp") < 0) return null;
  const m = href.match(/[?&]id=([0-9,\s]+)/);
  if (!m) return null;
  return m[1].replace(/\s+/g, "").replace(/,+$/, "");
}

// SITE-SPECIFIC #1: submenu links. Matches <a ... href="...view_section.jsp...id=...">text</a>
function parseChildren(html, currentId) {
  const cur = currentId.split(",");
  const seen = new Set(), out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']*view_section\.jsp[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cid = idFromHref(decodeEntities(m[1]));
    if (!cid) continue;
    const parts = cid.split(",");
    if (parts.length === cur.length + 1 && parts.slice(0, -1).join(",") === cur.join(",")) {
      if (seen.has(cid)) continue; seen.add(cid);
      const name = stripTags(m[2]) || ("Page " + parts[parts.length - 1]);
      out.push({ id: cid, name });
    }
  }
  return out;
}

function fmtParts(d, mo, y) {
  if (String(y).length === 2) y = (parseInt(y,10) < 70 ? "20" : "19") + y;
  return `${String(+d).padStart(2,"0")}-${String(+mo).padStart(2,"0")}-${y}`;
}
function fmtFromDate(dt) {
  return `${String(dt.getDate()).padStart(2,"0")}-${String(dt.getMonth()+1).padStart(2,"0")}-${dt.getFullYear()}`;
}

// SITE-SPECIFIC #2: the review-date line. Finds a label, grabs the nearby date.
function extractReviewed(html) {
  const text = stripTags(html);
  const low = text.toLowerCase();
  for (const label of REVIEW_LABELS) {
    const i = low.indexOf(label);
    if (i < 0) continue;
    const win = text.substr(i, label.length + 40);
    const m = win.match(DATE_RE);
    if (m) return fmtParts(m[1], m[2], m[3]);
  }
  return NOT_SHOWN;
}
function parseDate(s) {
  const m = (s || "").match(DATE_RE);
  if (!m) return null;
  let y = m[3]; if (y.length === 2) y = (parseInt(y,10) < 70 ? "20"+y : "19"+y);
  const dt = new Date(+y, +m[2]-1, +m[1]);
  return isNaN(dt.getTime()) ? null : dt;
}

// --------------------------------------------------------------------- Crawl
async function crawl() {
  const home = { id:"0", name:"Home", url:HOME_URL, lvl:1, reviewed:NOT_SHOWN };
  const homeHtml = await fetchPage(HOME_URL);
  let top = parseChildren(homeHtml, "0");
  if (CONFIG.sections.length) {
    const want = new Set(CONFIG.sections.map(s => "0," + s));
    top = top.filter(t => want.has(t.id));
  }
  console.log("Top-level sections:", top.map(t => `${t.id} ${t.name}`).join(" | ") || "(none found)");
  if (!top.length)
    console.warn("!! No top-level sections parsed from Home. The menu may be an include/JS — see parseChildren note.");

  const chains = [], visited = new Set();
  let n = 0;
  async function visit(cid, name, breadcrumb) {
    if (visited.has(cid) || cid.split(",").length > CONFIG.maxDepth) return;
    visited.add(cid);
    const html = await fetchPage(SECTION(cid));
    const reviewed = html ? extractReviewed(html) : NOT_SHOWN;
    const node = { id:cid, name, url:SECTION(cid), lvl:cid.split(",").length, reviewed };
    const chain = breadcrumb.concat([node]);
    chains.push(chain);
    if (++n % 25 === 0) process.stdout.write(`\r  crawled ${n} nodes…            `);
    for (const ch of parseChildren(html, cid)) await visit(ch.id, ch.name, chain);
  }
  for (const t of top) await visit(t.id, t.name, [home]);
  process.stdout.write("\n");
  console.log(`Crawl complete: ${chains.length} chains, ${visited.size} unique nodes.`);
  return { chains, top };
}

// --------------------------------------------------------------------- Build rows
function buildSheets(chains, top) {
  const names = Object.assign({}, DEFAULT_NAMES);
  top.forEach(t => { names[t.id.split(",")[1]] = t.name; });

  const order = [], buckets = {};
  for (const ch of chains) {
    const leafId = ch[ch.length - 1].id;
    const seg = leafId.split(",")[1] || leafId;
    if (!buckets[seg]) { buckets[seg] = []; order.push(seg); }
    buckets[seg].push(ch);
  }

  const sheets = [], summary = [];
  for (const seg of order) {
    const rows = [HEADER.slice()];
    const pages = new Set(), dates = [];
    let nChains = 0;
    for (const ch of buckets[seg]) {
      nChains++;
      const leaf = ch[ch.length - 1].name;
      for (const nd of ch) {
        const indent = "    ".repeat(nd.lvl - 1);
        const pageId = nd.id === "0" ? "index.jsp?lang=0" : nd.id;
        rows.push([leaf, nd.lvl, indent + nd.name, pageId, nd.reviewed, nd.url, TODAY]);
        pages.add(pageId);
        const pd = parseDate(nd.reviewed); if (pd) dates.push(pd);
      }
    }
    const oldest = dates.length ? fmtFromDate(new Date(Math.min(...dates.map(d=>d.getTime())))) : "\u2014";
    const newest = dates.length ? fmtFromDate(new Date(Math.max(...dates.map(d=>d.getTime())))) : "\u2014";
    sheets.push({ name: (names[seg] || ("Section " + seg)).slice(0, 31), rows });
    summary.push([names[seg] || ("Section " + seg), pages.size, nChains, oldest, newest]);
  }
  return { sheets, summary };
}

// --------------------------------------------------------------------- Output
function writeOutput(sheets, summary) {
  if (XLSX) {
    const wb = XLSX.utils.book_new();
    const sumAoa = [
      ["Central Railway \u2014 Last Reviewed Date Audit"],
      [`Generated: ${TODAY}   Source: cr.indianrailways.gov.in`],
      [],
      ["Section","Pages","Chains","Oldest Review","Most Recent Review"],
      ...summary,
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumAoa), "Summary");
    for (const sh of sheets)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows), sh.name);
    XLSX.writeFile(wb, CONFIG.outFile);
    console.log("Wrote " + CONFIG.outFile);
  } else {
    console.warn('"xlsx" package not installed — writing CSV + JSON instead. Run `npm install xlsx` for a real workbook.');
    const csvName = CONFIG.outFile.replace(/\.xlsx$/, ".csv");
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Section", ...HEADER].join(",")];
    for (const sh of sheets)
      for (let i = 1; i < sh.rows.length; i++)
        lines.push([sh.name, ...sh.rows[i]].map(esc).join(","));
    fs.writeFileSync(csvName, lines.join("\n"), "utf8");
    fs.writeFileSync(CONFIG.outFile.replace(/\.xlsx$/, ".json"),
                     JSON.stringify({ summary, sheets }, null, 2), "utf8");
    console.log("Wrote " + csvName + " and .json backup");
  }
}

// --------------------------------------------------------------------- Selftest (offline)
function selftest() {
  const sampleSection = `<html><body>
    <ul id="leftmenu">
      <li><a href="view_section.jsp?lang=0&id=0,1,264">Photo Gallery &amp; Railway Magzines</a></li>
      <li><a href="/view_section.jsp?fontColor=black&lang=0&id=0,1,304">Page 304</a></li>
      <li><a href="index.jsp?lang=0">Home</a></li>
    </ul>
    <div class="footer">Last Reviewed : 09-08-2023</div>
  </body></html>`;
  const kids = parseChildren(sampleSection, "0,1");
  const rev  = extractReviewed(sampleSection);
  console.log("parseChildren ->", kids);
  console.log("extractReviewed ->", rev);
  const ok = kids.length === 2 && kids[0].id === "0,1,264" &&
             kids[0].name === "Photo Gallery & Railway Magzines" && rev === "09-08-2023";
  console.log(ok ? "PARSER OK ✓" : "PARSER MISMATCH ✗");

  const home = { id:"0", name:"Home", url:HOME_URL, lvl:1, reviewed:NOT_SHOWN };
  const chains = [
    [home, {id:"0,1",name:"Public Information",url:SECTION("0,1"),lvl:2,reviewed:"09-08-2023"}],
    [home, {id:"0,1",name:"Public Information",url:SECTION("0,1"),lvl:2,reviewed:"09-08-2023"},
           {id:"0,1,264",name:"Photo Gallery & Railway Magzines",url:SECTION("0,1,264"),lvl:3,reviewed:NOT_SHOWN}],
  ];
  const { sheets, summary } = buildSheets(chains, [{id:"0,1",name:"Public Information"}]);
  CONFIG.outFile = "CR_selftest.xlsx";
  writeOutput(sheets, summary);
  console.table(summary.map(r => ({Section:r[0],Pages:r[1],Chains:r[2],Oldest:r[3],Newest:r[4]})));
}

// --------------------------------------------------------------------- Main
function parseArgs() {
  const a = process.argv.slice(2);
  if (a.includes("--selftest")) return { selftest: true };
  const si = a.indexOf("--sections");
  if (si !== -1) CONFIG.sections = a.slice(si + 1).filter(x => /^\d+$/.test(x)).map(Number);
  const oi = a.indexOf("--out");
  if (oi !== -1 && a[oi + 1]) CONFIG.outFile = a[oi + 1];
  return { selftest: false };
}

(async () => {
  const { selftest: st } = parseArgs();
  if (st) return selftest();
  const t0 = Date.now();
  const { chains, top } = await crawl();
  const { sheets, summary } = buildSheets(chains, top);
  console.table(summary.map(r => ({Section:r[0],Pages:r[1],Chains:r[2],Oldest:r[3],Newest:r[4]})));
  writeOutput(sheets, summary);
  console.log(`Finished in ${((Date.now()-t0)/1000).toFixed(1)}s`);
})().catch(e => { console.error(e); process.exit(1); });