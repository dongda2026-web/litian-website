# Alibaba Cloud Deployment Handoff

Date: 2026-10-02

## Current Recommended Path

Deploy the current website as a static-first site:

- Build root: this folder
- Build command: `npm run preflight:aliyun`
- Upload web root: `dist/client`
- Hosting target: Alibaba Cloud OSS static website hosting with Alibaba Cloud CDN in front

This keeps the corporate website fast and SEO-friendly while dynamic modules are added behind API endpoints.

## Static Launch Steps

1. Run the local gate:

   ```bash
   npm run preflight:aliyun
   ```

2. Create or select an OSS bucket for the public website.
3. Upload everything inside `dist/client` to the bucket root.
4. Set `index.html` as the default index document.
5. Add CDN in front of the bucket and bind the final domain.
6. Configure HTTPS certificate on the CDN domain.
7. Set cache rules:
   - `index.html`: no-cache or very short TTL.
   - `assets/*`, `img/*`, icons and images: long TTL.
   - JSON content under `content/*`: short TTL during migration, then controlled by the CMS release process.
8. Purge CDN cache after every production upload.

## Dynamic Upgrade Path

Phase 1 is now implemented as a static-first baseline with structured content seeds.

Phase 2 should move these JSON files into a managed CMS or database:

- `content/products.json`
- `content/news.json`
- `content/company.json`
- `content/site-settings.json`
- `content/content-index.json`
- `content/runtime-config.json`

Phase 3 should add backend services:

- `/api/inquiry`: receive RFQ and inquiry forms.
- `/api/ai-service`: receive AI assistant transcripts and lead intent.
- `/api/products`: serve product catalog data.
- `/api/news`: serve news and insights.

`content/runtime-config.json` is the current bridge between static OSS hosting and future APIs. Keep endpoint values empty before the backend is live. After Function Compute or API Gateway is ready, update the JSON in OSS, purge CDN cache for `/content/runtime-config.json`, and confirm forms post to the configured endpoint.

Phase 4 should connect operations:

- Email or CRM delivery for sales leads.
- Spam protection and rate limiting.
- Admin authentication and audit logs.
- OSS image upload and automatic WebP/AVIF derivatives.
- Sitemap regeneration after content publish.
- Content index regeneration after product, news or company updates.

## Security Notes

- Do not upload `.env` files.
- Do not put SMTP passwords, database passwords or AI API keys in frontend JavaScript.
- Use RAM users with least privilege for deployment.
- Add server-side validation before sending any lead to email, CRM or AI services.
- Enable WAF or equivalent rate limiting before exposing public dynamic APIs.

## Rollback

Keep a copy of the previously uploaded `dist/client` package. Static rollback is simply re-uploading the prior package and purging CDN cache.
