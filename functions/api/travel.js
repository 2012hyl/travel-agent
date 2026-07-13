export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '只支持POST' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: 'JSON解析失败' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (body.type === 'activate') {
    const code = (body.code || '').toUpperCase().trim();
    const answer = (body.answer || '').trim();

    if (!code) {
      return new Response(JSON.stringify({ valid: false, message: '请输入激活码', step: 1 }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const codesStr = env.ACTIVATION_CODES || '';
    const codeMap = {};
    codesStr.split(',').forEach(entry => {
      const parts = entry.trim().split(':');
      if (parts[0]) codeMap[parts[0].toUpperCase()] = parseInt(parts[1] || '1');
    });

    if (!codeMap[code] || codeMap[code] <= 0) {
      return new Response(JSON.stringify({ valid: false, message: '激活码无效或已用完', step: 1 }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!answer) {
      return new Response(JSON.stringify({ valid: false, message: '请完成验证', step: 2, code: code }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const parts = answer.split('|');
    const challenge = (parts[0] || '').toUpperCase();
    const userInput = (parts[1] || '').toUpperCase();

    if (challenge.length !== 5 || userInput !== challenge) {
      return new Response(JSON.stringify({ valid: false, message: '验证字符不匹配', step: 2, code: code }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(JSON.stringify({ valid: true, message: '激活成功', step: 3 }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const messages = body.messages;
  const model = body.model || 'deepseek-v4-flash';
  const temperature = body.temperature || 0.7;
  const max_tokens = body.max_tokens || 3000;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: '缺少messages参数' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!env.DEEPSEEK_API_KEY) {
    return new Response(JSON.stringify({ error: '后端未配置API Key' }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true }),
    });

    if (!aiResponse.ok) {
      return new Response(JSON.stringify({ error: 'AI接口返回错误: ' + aiResponse.status }), {
        status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(aiResponse.body, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '服务器内部错误: ' + error.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
