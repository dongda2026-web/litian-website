import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });
await mkdir(join(dist, ".openai"), { recursive: true });

for (const item of [
  "index.html",
  "assets",
  "public",
  "_headers",
  "_redirects",
  "site-manifest.json",
  "DEPLOYMENT.md",
  "workers"
]) {
  await cp(join(root, item), join(client, item), { recursive: true });
}

await cp(join(root, ".openai", "hosting.json"), join(dist, ".openai", "hosting.json"));

await writeFile(join(server, "index.js"), `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const wantsPage = path === "/" || !path.split("/").pop().includes(".");
    if (wantsPage) {
      const indexUrl = new URL("/index.html", url);
      return env.ASSETS.fetch(new Request(indexUrl, request));
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      const indexUrl = new URL("/index.html", url);
      return env.ASSETS.fetch(new Request(indexUrl, request));
    }
    return response;
  }
};
`.trimStart());

console.log("Sites build created at dist/");
