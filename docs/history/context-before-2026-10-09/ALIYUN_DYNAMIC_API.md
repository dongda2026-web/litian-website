# Alibaba Cloud Dynamic API Handoff

Date: 2026-10-02

This folder now includes a static-first website plus a safe starter for dynamic inquiry capture on Alibaba Cloud.

## Files

- `content/runtime-config.json`: public runtime endpoints for the static frontend.
- `content/inquiry-schema.json`: lead payload contract shared by the frontend and backend template.
- `aliyun/inquiry-function/inquiry-handler.mjs`: Node.js HTTP handler template for Function Compute or API Gateway style events.
- `aliyun/inquiry-function/README.md`: setup, environment variables and test commands.

## Recommended Flow

1. Deploy the website package to OSS + CDN first.
2. Deploy the inquiry handler as a Function Compute HTTP function.
3. Configure environment variables on the function, not in frontend code.
4. Test the function with the sample curl in `aliyun/inquiry-function/README.md`.
5. Update `content/runtime-config.json` in OSS:

   ```json
   {
     "endpoints": {
       "inquiry": "https://your-api.example.com/inquiry",
       "aiService": "https://your-api.example.com/ai-service"
     }
   }
   ```

6. Purge CDN cache for `/content/runtime-config.json`.
7. Submit a test inquiry from the website and confirm the backend receives the lead.

## Security Rules

- Do not put API keys, email passwords, database passwords or bearer tokens in `runtime-config.json`.
- Keep credentials in Function Compute environment variables.
- Restrict `ALLOWED_ORIGINS` to the final production domain.
- Add WAF, rate limiting or captcha before high-traffic public launch.
- Keep the static mailto fallback until the API endpoint is fully verified.
