# Litian Group Website Deployment

This folder is a production-ready static website. Deploy the `litian-website` directory as the web root.

## Recommended Hosting

Cloudflare Pages is the preferred deployment target because the original site is already aligned with a Pages URL.

1. Create or select a Cloudflare Pages project.
2. Build command: leave empty.
3. Output directory: `/` if uploading this folder directly, or `litian-website` if deploying from the parent folder.
4. Upload all files in this directory, including `_headers`, `_redirects`, `index.html`, and `assets/`.
5. Add the custom domain in Cloudflare Pages, then point DNS to Cloudflare as instructed by the dashboard.

## Inquiry Form

The site works in static mode by default:

- Inquiry and quote forms generate a prepared email to `ynakobka@dongdaltd.com`.
- A local browser backup is stored in `localStorage` as `litian_inquiries`.

For production CRM capture, add this before the closing `</head>` or via a small injected script:

```html
<script>
window.LITIAN_INQUIRY_ENDPOINT = "https://your-worker-or-form-endpoint.example.com/inquiry";
</script>
```

The endpoint should accept JSON POST bodies.

## AI Customer Service

The site includes a floating AI customer-service assistant. It can classify common requests such as cement valve bags, cement FIBC ton bags, lead time, samples, and quote requests.

Static mode:

- The assistant prepares a sales email to `ynakobka@dongdaltd.com`.
- A local browser backup is stored in `localStorage` as `litian_inquiries` and `litian_ai_chat`.

Production automatic email mode:

```html
<script>
window.LITIAN_AI_ENDPOINT = "https://your-worker-or-crm-endpoint.example.com/ai-service";
</script>
```

The endpoint should accept JSON POST bodies and send the email server-side. A Cloudflare Worker template is included at `workers/ai-service-worker.js`.

Recommended Worker environment variables:

- `RESEND_API_KEY`: server-side email API key.
- `SALES_TO_EMAIL`: sales inbox, for example `ynakobka@dongdaltd.com`.
- `SALES_FROM_EMAIL`: verified sender, for example `Litian Group <sales@yourdomain.com>`.

Do not put SMTP passwords, mailbox passwords, or AI API keys in frontend JavaScript.

## Launch Checklist

- WhatsApp is configured as `+7 707 559 0188` (`https://wa.me/77075590188`). Confirm this is the final business number before launch.
- Replace duplicated case images with final client-approved photos or generated product visuals.
- Confirm the legal company name, privacy email, and domain.
- Verify every language page visually after final translation review.
- Run a fresh broken-resource check before publishing.

## Cache And Security

`_headers` sets:

- no-store for `index.html`
- immutable long cache for `/assets/*`
- common security headers suitable for a static B2B site

After visual or copy updates, change asset filenames or clear CDN cache if an asset is replaced with the same name.
