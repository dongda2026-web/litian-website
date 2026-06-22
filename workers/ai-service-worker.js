const DEFAULT_SALES_EMAIL = "ynakobka@dongdaltd.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function asText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function assistantReply(payload) {
  const text = `${payload.product || ""} ${payload.notes || ""}`.toLowerCase();
  if (/fibc|ton|bulk|吨袋|集装袋|1000/.test(text)) {
    return [
      "Thank you for your cement FIBC ton bag inquiry.",
      "To prepare an accurate quotation, please confirm load capacity, dimensions, liner requirement, lifting loop type, filling/discharge spout, quantity and destination port.",
      "Our sales engineer will review your request and reply with specifications and price details."
    ].join("\n\n");
  }
  if (/valve|阀口|水泥袋|50kg|50 kg/.test(text)) {
    return [
      "Thank you for your cement valve bag inquiry.",
      "To prepare an accurate quotation, please confirm bag size, valve type, fabric weight, lamination, printing colours, quantity and destination port.",
      "Our sales engineer will review your request and reply with specifications and price details."
    ].join("\n\n");
  }
  return [
    "Thank you for contacting Litian Group.",
    "Please share product type, quantity, specifications, destination and contact details so our sales team can prepare a quotation.",
    "We will respond as soon as possible."
  ].join("\n\n");
}

function emailText(payload, autoReply) {
  return [
    "New Litian AI customer-service lead",
    "",
    `Type: ${payload.type || "ai-customer-service"}`,
    `Language: ${payload.language || ""}`,
    `Page: ${payload.page || ""}`,
    `Company: ${payload.company || ""}`,
    `Contact: ${payload.contact || ""}`,
    `Email: ${payload.email || ""}`,
    `Phone: ${payload.phone || ""}`,
    `Product: ${payload.product || ""}`,
    `Quantity: ${payload.quantity || ""}`,
    `Specifications: ${asText(payload.specifications)}`,
    `Notes: ${payload.notes || ""}`,
    "",
    "Suggested auto reply:",
    autoReply,
    "",
    "Transcript:",
    asText(payload.transcript)
  ].join("\n");
}

async function sendResendEmail(env, message) {
  if (!env.RESEND_API_KEY) {
    return { skipped: true, reason: "RESEND_API_KEY is not configured" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(message)
  });
  if (!response.ok) {
    throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: corsHeaders() });
    }

    const salesEmail = env.SALES_TO_EMAIL || DEFAULT_SALES_EMAIL;
    const fromEmail = env.SALES_FROM_EMAIL || `Litian Website <no-reply@${new URL(request.url).hostname}>`;
    const reply = assistantReply(payload);
    const subject = `Litian AI RFQ - ${payload.product || payload.company || "Website Lead"}`;

    await sendResendEmail(env, {
      from: fromEmail,
      to: [salesEmail],
      subject,
      text: emailText(payload, reply)
    });

    if (payload.email) {
      await sendResendEmail(env, {
        from: fromEmail,
        to: [payload.email],
        subject: "Litian Group received your inquiry",
        text: reply
      });
    }

    return Response.json({ ok: true, reply }, { headers: corsHeaders() });
  }
};
