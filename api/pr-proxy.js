// Vercel serverless function — proxies POST requests to PropertyRadar API
// Base URL: https://api.propertyradar.com/v1
// This avoids CORS issues when calling PR's API from the browser.

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  // The client sends the PR API path in the query string
  // e.g., /api/pr-proxy?path=/v1/properties
  const { path } = req.query;
  if (!path) {
    return res.status(400).json({ error: "Missing 'path' query parameter" });
  }

  const prBase = "https://api.propertyradar.com";
  const url = prBase + path;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    // Forward request body for POST requests
    if (req.method === "POST" && req.body) {
      fetchOptions.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    console.log(`[pr-proxy] ${req.method} ${url}`);
    if (req.body) console.log(`[pr-proxy] Body:`, JSON.stringify(req.body).slice(0, 500));

    const prResponse = await fetch(url, fetchOptions);

    const contentType = prResponse.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await prResponse.json();
    } else {
      const text = await prResponse.text();
      data = { _rawText: text, _status: prResponse.status };
    }

    // Forward rate-limit headers
    const rateLimitHeaders = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"];
    for (const h of rateLimitHeaders) {
      const val = prResponse.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    console.log(`[pr-proxy] Response status: ${prResponse.status}`);

    return res.status(prResponse.status).json(data);
  } catch (err) {
    console.error("[pr-proxy] Error:", err);
    return res.status(502).json({
      error: "Failed to reach PropertyRadar API",
      details: err.message,
      url: url
    });
  }
}
