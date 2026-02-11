// Vercel serverless function — proxies requests to PropertyRadar API
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

  // The client sends the PR API path as a query parameter
  // e.g., /api/pr-proxy?path=/v1/properties&Criteria=...
  const { path, ...queryParams } = req.query;
  if (!path) {
    return res.status(400).json({ error: "Missing 'path' query parameter" });
  }

  // Build the PR API URL
  const prBase = "https://api.propertyradar.com";
  const url = new URL(path, prBase);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }

  try {
    const prResponse = await fetch(url.toString(), {
      method: req.method === "POST" ? "POST" : "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(req.method === "POST" && req.body ? { body: JSON.stringify(req.body) } : {}),
    });

    const contentType = prResponse.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await prResponse.json();
    } else {
      data = await prResponse.text();
    }

    // Forward rate-limit headers if present
    const rateLimitHeaders = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"];
    for (const h of rateLimitHeaders) {
      const val = prResponse.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    return res.status(prResponse.status).json(data);
  } catch (err) {
    console.error("PR API proxy error:", err);
    return res.status(502).json({ error: "Failed to reach PropertyRadar API", details: err.message });
  }
}
