exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ code: 'method' })
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ code: 'no_key' })
    };
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ code: 'bad_json' })
    };
  }

  if (!Array.isArray(payload.parts) || payload.parts.length < 1 || payload.parts.length > 8) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ code: 'bad_request' })
    };
  }

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const model of models) {
    let response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: payload.parts
            }],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );
    } catch {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ code: 'upstream' })
      };
    }

    if (response.status === 404) continue;

    if (!response.ok) {
      const status = response.status === 429 ? 429 :
        (response.status === 400 || response.status === 403 ? response.status : 502);

      return {
        statusCode: status,
        headers,
        body: JSON.stringify({ code: `http_${status}` })
      };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ code: 'empty' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text })
    };
  }

  return {
    statusCode: 502,
    headers,
    body: JSON.stringify({ code: 'model_unavailable' })
  };
};
