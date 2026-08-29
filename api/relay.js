export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { targetUrl, proxyMethod = 'POST', payload, headers } = req.body;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const fetchOptions = {
      method: proxyMethod,
      headers: headers || { 'Content-Type': 'application/json' },
      signal: controller.signal
    };

    if (proxyMethod !== 'GET' && proxyMethod !== 'HEAD' && payload) {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutId);

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { error: 'Invalid response from target server', text: text.substring(0, 200) };
    }

    return res.status(response.status).json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ error: error.message || 'Server timeout or network error' });
  }
}
