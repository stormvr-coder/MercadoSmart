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
    return { statusCode: 405, headers, body: JSON.stringify({ code: 'method' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers, body: JSON.stringify({ code: 'no_key' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ code: 'bad_json' }) };
  }

  if (!Array.isArray(payload.parts) || payload.parts.length < 1 || payload.parts.length > 8) {
    return { statusCode: 400, headers, body: JSON.stringify({ code: 'bad_request' }) };
  }

  const models = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  let lastStatus = 0;

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
            contents: [{ role: 'user', parts: payload.parts }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );
    } catch (e) {
      console.error('Falha de rede', model, String(e));
      lastStatus = 0;
      continue;
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erro do Google', model, response.status, errText.slice(0, 800));
      lastStatus = response.status;
      // modelo fora do ar, sobrecarregado ou limitado: tenta o próximo
      if ([404, 429, 500, 503].includes(response.status)) continue;
      // erro de chave/pedido: não adianta tentar outro modelo
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ code: `google_${response.status}` })
      };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Resposta vazia', model, JSON.stringify(data).slice(0, 800));
      continue;
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  }

  return {
    statusCode: 502,
    headers,
    body: JSON.stringify({ code: `google_${lastStatus}` })
  };
};
