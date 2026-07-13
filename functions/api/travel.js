// functions/api/travel.js
export async function onRequest(context) {
  const { request, env } = context;

  // 只允许 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '只支持POST' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 解析用户传来的结构化选项
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'JSON解析失败' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const options = body.options;
  if (!options || !options.destination || !options.budget) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // ===== 白名单校验：城市名必须在预定义列表里 =====
  const ALLOWED_CITIES = [
    '北京','上海','广州','深圳','天津','重庆','哈尔滨','长春','沈阳','大连',
    '呼和浩特','乌鲁木齐','拉萨','西宁','兰州','银川','西安','石家庄','太原',
    '济南','青岛','烟台','威海','郑州','洛阳','开封','南京','苏州','无锡',
    '常州','南通','扬州','徐州','杭州','宁波','温州','绍兴','嘉兴','湖州',
    '金华','舟山','合肥','黄山','芜湖','南昌','九江','景德镇','福州','厦门',
    '泉州','武夷山','武汉','宜昌','长沙','张家界','岳阳','凤凰','珠海','佛山',
    '东莞','中山','惠州','汕头','湛江','南宁','桂林','北海','柳州','海口',
    '三亚','万宁','陵水','成都','绵阳','乐山','峨眉山','九寨沟','稻城','康定',
    '贵阳','遵义','安顺','黄果树','昆明','大理','丽江','香格里拉','西双版纳','腾冲',
    '香港','澳门','台北','高雄','台中','台南','花莲',
    '东京','大阪','京都','札幌','首尔','釜山','济州','新加坡','曼谷','清迈',
    '普吉','芭提雅','吉隆坡','槟城','马六甲','河内','胡志明市','岘港','暹粒',
    '金边','仰光','马尼拉','长滩岛','雅加达','巴厘岛','马尔代夫','迪拜','阿布扎比','伊斯坦布尔',
    '伦敦','曼彻斯特','爱丁堡','巴黎','尼斯','里昂','柏林','慕尼黑','法兰克福',
    '罗马','米兰','威尼斯','佛罗伦萨','巴塞罗那','马德里','里斯本','阿姆斯特丹',
    '布鲁塞尔','苏黎世','日内瓦','维也纳','布拉格','布达佩斯','莫斯科','圣彼得堡',
    '雅典','圣托里尼','纽约','洛杉矶','旧金山','拉斯维加斯','芝加哥','西雅图',
    '波士顿','华盛顿','温哥华','多伦多','蒙特利尔','悉尼','墨尔本','布里斯班',
    '黄金海岸','奥克兰','皇后镇','开罗','开普敦','约翰内斯堡','内罗毕','卡萨布兰卡'
  ];

  if (!ALLOWED_CITIES.includes(options.from) || !ALLOWED_CITIES.includes(options.destination)) {
    return new Response(JSON.stringify({ error: '城市名不合法' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // ===== 白名单校验：交通方式和偏好 =====
  const ALLOWED_VEHICLES = ['高铁','飞机','火车','自驾','大巴','邮轮','地铁','公交','打车','共享单车','步行','景区专线','租电动车'];
  const ALLOWED_PREFS = ['美食','拍照','购物','自然风光','历史文化','冒险','放松度假','亲子'];

  // 过滤掉不合法的选项
  const cityVehicles = (options.cityVehicles || []).filter(v => ALLOWED_VEHICLES.includes(v));
  const localVehicles = (options.localVehicles || []).filter(v => ALLOWED_VEHICLES.includes(v));
  const preferences = (options.preferences || []).filter(p => ALLOWED_PREFS.includes(p));

  // 校验预算和天数
  const budget = parseFloat(options.budget);
  const days = parseInt(options.days);
  if (isNaN(budget) || budget < 100) {
    return new Response(JSON.stringify({ error: '预算不合法' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
  if (isNaN(days) || days < 1 || days > 30) {
    return new Response(JSON.stringify({ error: '天数不合法' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // ===== 后端组装提示词（用户无法篡改） =====
  const systemPrompt = `你是资深旅行规划师。必须严格按照以下结构输出完整Markdown方案：

## 🚄 城际交通（${options.from} → ${options.destination}）
用户偏好：${cityVehicles.join('、') || '无特殊偏好'}
推荐具体车次/航班（含车次号、时间、票价）：

## 🚕 景点间交通
用户偏好：${localVehicles.join('、') || '无特殊偏好'}
每天景点之间推荐接驳方式，结合当地实际情况

## 📅 每日详细行程
按天排列，每天包含：上午/中午/下午/晚上 + 景点 + 餐厅 + 交通方式

## 💰 预算分配表
| 项目 | 费用 |
总预算：${budget}元

## ⚠️ 注意事项
## 🎒 必备物品清单`;

  const userMessage = `出发地：${options.from}，目的地：${options.destination}，天数：${days}天，预算：${budget}元，人数：成人${options.people.adults}人、小孩${options.people.children}人、老人${options.people.elders}人，偏好：${preferences.join('、')}，日期：${options.startDate} 至 ${options.endDate}`;

  // ===== 调用 AI =====
  try {
    const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 3000,
        stream: false
      })
    });

    const aiData = await aiResponse.json();
    
    if (aiData.error) {
      return new Response(JSON.stringify({ error: 'AI调用失败' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const markdown = aiData.choices[0].message.content;

    return new Response(JSON.stringify({ markdown: markdown }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: '服务器错误' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
