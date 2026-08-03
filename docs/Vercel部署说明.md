# My Story · Vercel 托管 AI 部署

## 效果

部署后，访问者直接使用 My Story 提供的 DeepSeek 创作能力：浏览器只会访问同源的 `/api/ai`，不会看到、填写或保存 DeepSeek API Key。

```
浏览器  →  /api/ai（Vercel Function）  →  DeepSeek
              仅在此处读取 DEEPSEEK_API_KEY
```

## Vercel 项目配置

在 Vercel 项目的 **Settings → Environment Variables** 中，为 Production 环境添加以下变量，然后重新部署：

| 变量 | 值 | 是否暴露给浏览器 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 你的 DeepSeek API Key | 否 |
| `VITE_USE_SERVERLESS_AI` | `true` | 是，只有开关本身 |
| `VITE_USE_MOCK` | `false` | 是，只有开关本身 |

不要把密钥写进 `.env.example`、源码、提交记录或任何 `VITE_` 开头的变量；Vite 会把所有 `VITE_` 变量打包进浏览器代码。

## 验证

1. 打开部署站点，首次引导的第 2 步应显示“AI 创作服务已就绪”，而不是 API Key 输入框。
2. 点击“测试连接”，应显示连接成功。
3. 完成一次日记生成，确认获得真实的多段故事文本。
4. 在浏览器开发者工具的 Network 中检查：请求发往站点自身的 `/api/ai`，请求头和响应中均不应包含 DeepSeek 密钥。

## 当前保护与上线前注意事项

`api/ai.js` 已限制为 POST、限制输入长度与最大输出 token，并提供每实例、每 IP 10 分钟 30 次的基础频率控制。Serverless 会有多个实例，因此这不是严格的全局额度保护。

正式公开前，应在 Vercel 防火墙或其他边缘防护中再配置全局限流，并为 DeepSeek 账户设置可接受的消费上限和告警。评审使用的短期部署建议在评审结束后删除 `DEEPSEEK_API_KEY` 或轮换该密钥。
