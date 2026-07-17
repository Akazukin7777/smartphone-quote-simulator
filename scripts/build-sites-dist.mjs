import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = new URL("../", import.meta.url);
const distServerUrl = new URL("../dist/server/", import.meta.url);

const files = [
  "index.html",
  "application.html",
  "options.html",
  "result.html",
  "styles.css",
  "app.js",
  "data/plans.js",
];

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const assets = {};
for (const file of files) {
  const fileUrl = new URL(file, projectRoot);
  assets[`/${file}`] = {
    body: await readFile(fileUrl, "utf8"),
    contentType: contentTypes[path.extname(file)] ?? "application/octet-stream",
  };
}
assets["/"] = assets["/index.html"];

await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true });
await mkdir(distServerUrl, { recursive: true });
await writeFile(new URL("../dist/package.json", import.meta.url), `${JSON.stringify({ type: "module" }, null, 2)}\n`);

const worker = `const assets = ${JSON.stringify(assets)};

function normalizePath(pathname) {
  if (pathname === "/" || pathname === "") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);
    const asset = assets[pathname] ?? assets[\`\${pathname}.html\`];

    if (!asset) {
      return new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(asset.body, {
      headers: {
        "cache-control": "public, max-age=60",
        "content-type": asset.contentType,
      },
    });
  },
};
`;

await writeFile(new URL("index.js", distServerUrl), worker);
console.log(`Wrote ${new URL("index.js", distServerUrl).pathname}`);
