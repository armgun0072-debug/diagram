export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await req.json();
    const targetUrl = data?.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    // Call TinyURL API to shorten the URL
    const resp = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(targetUrl)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`TinyURL HTTP ${resp.status}`);
    }

    const shortUrl = (await resp.text()).trim();
    if (!shortUrl.startsWith('http')) {
      throw new Error('Invalid short URL');
    }

    return new Response(JSON.stringify({ shortUrl }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ shortUrl: null, error: String(err) }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
};

