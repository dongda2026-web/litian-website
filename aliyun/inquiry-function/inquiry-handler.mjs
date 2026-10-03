const DEFAULT_ALLOWED_ORIGINS = ["http://127.0.0.1:4189", "http://localhost:4189"];
const REQUIRED_FIELDS = ["type", "company", "contact", "email", "product"];
const VALID_TYPES = new Set(["inquiry", "quote-calculator", "ai-customer-service"]);
const FIELD_LIMITS = {
  company: 120,
  contact: 120,
  email: 160,
  phone: 80,
  product: 160,
  productId: 80,
  quantity: 80,
  specifications: 1200,
  notes: 2400,
  page: 500
};

function parseAllowedOrigins(env = {}) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function corsHeaders(origin, env = {}) {
  const allowed = parseAllowedOrigins(env);
  const isAllowed = allowed.length ? allowed.includes(origin) : DEFAULT_ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function response(status, body, headers = {}) {
  return {
    statusCode: status,
    headers,
    body: JSON.stringify(body)
  };
}

function textValue(value, limit) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.trim().slice(0, limit || 2000);
}

function normalizeLead(input, event = {}) {
  const leadId = input.leadId || `litian-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  return {
    leadId,
    type: textValue(input.type || "inquiry", 40),
    company: textValue(input.company, FIELD_LIMITS.company),
    contact: textValue(input.contact, FIELD_LIMITS.contact),
    email: textValue(input.email, FIELD_LIMITS.email),
    phone: textValue(input.phone, FIELD_LIMITS.phone),
    product: textValue(input.product, FIELD_LIMITS.product),
    productId: textValue(input.productId, FIELD_LIMITS.productId),
    quantity: textValue(input.quantity, FIELD_LIMITS.quantity),
    specifications: textValue(input.specifications, FIELD_LIMITS.specifications),
    estimatedPrice: input.estimatedPrice || "",
    notes: textValue(input.notes, FIELD_LIMITS.notes),
    language: textValue(input.language, 20),
    page: textValue(input.page, FIELD_LIMITS.page),
    timestamp: input.timestamp || new Date().toISOString(),
    transcript: Array.isArray(input.transcript) ? input.transcript.slice(-30) : [],
    source: "litian-website",
    requestId: event.requestContext?.requestId || event.requestId || ""
  };
}

function validateLead(lead, raw) {
  const errors = [];
  if (raw.honeypot) errors.push("Spam check failed");
  if (!VALID_TYPES.has(lead.type)) errors.push("Invalid lead type");
  for (const field of REQUIRED_FIELDS) {
    if (!lead[field]) errors.push(`Missing ${field}`);
  }
  if (lead.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) {
    errors.push("Invalid email");
  }
  return errors;
}

function parseEvent(event = {}) {
  const method = event.httpMethod || event.requestContext?.http?.method || event.method || "POST";
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || "";
  let body = event.body || "{}";
  if (event.isBase64Encoded && typeof Buffer !== "undefined") {
    body = Buffer.from(body, "base64").toString("utf8");
  }
  const payload = typeof body === "string" ? JSON.parse(body || "{}") : body;
  return { method, headers, origin, payload };
}

async function forwardLead(env = {}, lead) {
  if (!env.LEADS_WEBHOOK_URL) {
    return { skipped: true, reason: "LEADS_WEBHOOK_URL is not configured" };
  }
  const result = await fetch(env.LEADS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.LEADS_WEBHOOK_TOKEN ? { "Authorization": `Bearer ${env.LEADS_WEBHOOK_TOKEN}` } : {})
    },
    body: JSON.stringify(lead)
  });
  if (!result.ok) {
    throw new Error(`Lead webhook failed: ${result.status} ${await result.text()}`);
  }
  return { ok: true };
}

export async function handler(event = {}, context = {}) {
  const env = context.env || process.env || {};
  let request;
  try {
    request = parseEvent(event);
  } catch (error) {
    return response(400, { ok: false, error: "Invalid request body" }, corsHeaders("", env));
  }

  const headers = corsHeaders(request.origin, env);
  if (request.method === "OPTIONS") return response(204, {}, headers);
  if (request.method !== "POST") return response(405, { ok: false, error: "Method not allowed" }, headers);

  const allowedOrigins = parseAllowedOrigins(env);
  if (allowedOrigins.length && !allowedOrigins.includes(request.origin)) {
    return response(403, { ok: false, error: "Origin not allowed" }, headers);
  }

  const lead = normalizeLead(request.payload, event);
  const errors = validateLead(lead, request.payload);
  if (errors.length) {
    return response(422, { ok: false, errors }, headers);
  }

  let webhookResult;
  try {
    webhookResult = await forwardLead(env, lead);
  } catch (error) {
    return response(502, { ok: false, leadId: lead.leadId, error: error.message }, headers);
  }

  return response(200, {
    ok: true,
    leadId: lead.leadId,
    salesToEmail: env.SALES_TO_EMAIL || "",
    webhookResult
  }, headers);
}

export default { handler };
