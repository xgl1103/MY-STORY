// 联调第1步：验证 DeepSeek API Key 可用性
// 运行: node tests/step1_verify_apikey.mjs

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = 'https://api.deepseek.com/v1/chat/completions';

if (!API_KEY) {
  throw new Error('请先设置环境变量 DEEPSEEK_API_KEY。');
}

async function main() {
  console.log('=== 第1步：验证 DeepSeek API Key ===\n');
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个测试助手。' },
          { role: 'user', content: '请回复"API连接成功"四个字。' }
        ],
        temperature: 0.1,
        max_tokens: 50
      })
    });

    console.log(`HTTP 状态码: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`错误响应: ${errorText}`);
      
      if (response.status === 401) {
        console.log('\n结论: API Key 无效或已过期');
      } else if (response.status === 429) {
        console.log('\n结论: 触发频率限制，但 Key 有效');
      } else if (response.status === 402) {
        console.log('\n结论: 额度不足，但 Key 有效');
      }
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`AI 回复: ${content}`);
    console.log(`Token 用量: ${JSON.stringify(data.usage)}`);
    console.log('\n结论: API Key 有效，DeepSeek 可正常调用');

  } catch (error) {
    console.log(`网络错误: ${error.message}`);
    console.log('\n结论: 网络连接失败，请检查网络');
  }
}

main();
