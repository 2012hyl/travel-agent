// functions/api/proxy.js — hyltravel-agent 专用
// AI转发 + 激活码验证（随机验证码防脚本）

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '只支持POST' }), { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: 'JSON解析失败' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  // ========== 激活码验证（随机验证码） ==========
  if (body.type === 'activate') {
    const code = (body.code || '').toUpperCase().trim();
    const answer = (body.answer || '').trim();

    if (!code) {
      return new Response(JSON.stringify({ valid: false, message: '请输入激活码', step: 1 }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const codesStr = env.ACTIVATION_CODES || '';
    const codeEntries = codesStr.split(',').map(c => c.trim()).filter(c => c);
    const codeMap = {};
    codeEntries.forEach(entry => { const [c, count] = entry.split(':'); if (c) codeMap[c.toUpperCase()] = parseInt(count || '1'); });

    if (!codeMap[code] || codeMap[code] <= 0) {
      return new Response(JSON.stringify({ valid: false, message: '激活码无效或已用完', step: 1 }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    if (!answer) {
      return new Response(JSON.stringify({ valid: false, message: '请完成验证', step: 2, code: code }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // 随机验证码比对：answer 格式为 "随机串|用户输入"
    const parts = answer.split('|');
    const challenge = (parts[0] || '').toUpperCase();
    const userInput = (parts[1] || '').toUpperCase();

    if (challenge.length !== 5 || userInput !== challenge) {
      return new Response(JSON.stringify({ valid: false, message: '验证字符不匹配，请重新复制粘贴', step: 2, code: code }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    return new Response(JSON.stringify({ valid: true, message: '激活成功', step: 3 }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  // ========== AI转发 ==========
  const messages = body.messages;
  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: '缺少messages' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: body.model || 'deepseek-v4-flash', messages, temperature: body.temperature || 0.7, max_tokens: body.max_tokens || 3000, stream: body.stream !== false }),
    });
    return new Response(aiResponse.body, { status: aiResponse.status, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'AI调用失败' }), { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
}
