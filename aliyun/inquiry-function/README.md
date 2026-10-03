# Litian Inquiry Function Template

This is a starter HTTP handler for Alibaba Cloud Function Compute or an API Gateway integration that forwards Litian website leads to a CRM webhook.

## Environment Variables

- `ALLOWED_ORIGINS`: comma-separated production origins. Example: `https://www.litian.example,https://china-litian.pages.dev`
- `LEADS_WEBHOOK_URL`: required for forwarding leads to CRM, email service or an internal automation endpoint.
- `LEADS_WEBHOOK_TOKEN`: optional bearer token for the webhook.
- `SALES_TO_EMAIL`: optional sales inbox metadata returned in responses.

No secret belongs in frontend JavaScript or `content/runtime-config.json`.

## Local Smoke Test

After deploying the function, test the public endpoint:

```bash
curl -i -X POST "https://your-api.example.com/inquiry" \
  -H "Content-Type: application/json" \
  -H "Origin: https://your-production-domain.example" \
  --data '{
    "type": "inquiry",
    "company": "Demo Cement",
    "contact": "Procurement Team",
    "email": "buyer@example.com",
    "product": "FIBC Bulk Bags",
    "quantity": "20000",
    "specifications": "500-2000 kg, liner optional",
    "notes": "Destination: Kazakhstan"
  }'
```

Expected response:

```json
{
  "ok": true,
  "leadId": "..."
}
```

If `LEADS_WEBHOOK_URL` is not configured, the function validates and accepts the lead but reports webhook forwarding as skipped.
