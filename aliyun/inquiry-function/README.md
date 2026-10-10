# DongDa Legacy Inquiry Forwarder

Not a standalone production intake backend. New durable single-instance service is documented in `server/README.md`. This legacy adapter now fails closed: no storage endpoint -> 503; no explicit durable acknowledgement -> 502. Do not connect it to a plain SMTP/webhook endpoint and treat email dispatch as database reception. It must forward to a durable intake API using the same Idempotency-Key and receive `{ok:true,persisted:true,leadId:"DD-..."}`. Cloud deployment has not been verified.

This is a starter HTTP handler for Alibaba Cloud Function Compute or an API Gateway integration that forwards DongDa website leads to a CRM webhook.

## Environment Variables

- `ALLOWED_ORIGINS`: comma-separated production origins. Example: `https://cn-dongda.com,https://www.cn-dongda.com`
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

If `LEADS_WEBHOOK_URL` is not configured, the function rejects reception (503). The old smoke example must also include an `Idempotency-Key` header (16-100 allowed characters). Only the downstream server-generated ID is returned; skipped forwarding is never success.
