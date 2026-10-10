# DongDa Dynamic Content Seed

This folder is the first step toward a dynamic DongDa website. It keeps launch-critical business content in structured JSON so the current static site can remain deployable while a future CMS, WordPress Headless setup or Alibaba Cloud backend is prepared.

## Files

- `site-settings.json`: brand, contacts, deployment and SEO defaults.
- `products.json`: product families, specifications, industries and image references.
- `company.json`: company facts, bases and history timeline.
- `news.json`: news and insight entries.
- `content-index.json`: generated searchable index for future CMS, search and AI customer-service use.
- `runtime-config.json`: safe runtime endpoint bridge for Alibaba Cloud API Gateway or Function Compute. Keep values empty until the backend is live.

## Rules

- Keep every referenced image path valid relative to the website root.
- Do not store secrets, API keys, mailbox passwords or database credentials here.
- Run `npm run validate:content` after editing these files.
- Run `npm run build:content` after editing source content files so `content-index.json` stays in sync.
- Edit `runtime-config.json` on OSS only with public endpoint URLs. Never add tokens or credentials to query strings.
- Treat this folder as a CMS schema seed. When a backend is added, map fields directly instead of inventing new field names.
