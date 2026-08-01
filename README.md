# My Story

将每天的真实经历转化为一部由自己主演的 AI 连载小说。

体验地址：[https://peaceful-boba-4311e7.netlify.app/#/](https://peaceful-boba-4311e7.netlify.app/#/)

## 核心功能

- 引导式日记记录与行为映射
- 根据世界观生成连续小说章节，并展示日记—剧情对应关系
- 多层故事记忆：章节摘要、世界观检索、历史剧情检索、实体档案、伏笔池与最近上下文
- 本地优先保存，支持备份导出和导入恢复
- 用户自带兼容模型 API Key；项目不保存、不提供任何 API Key

## 本地运行

```bash
npm install
copy .env.example .env.development
npm run dev
```

在应用“我的 → API Key 管理”中填写你自己的兼容 API Key，然后创建故事、写日记并生成章节。

## 验证与构建

```bash
npm test
npm run build
```

## 项目资料

- [初赛作品帖文案](docs/TRAE初赛Demo作品帖-MyStory.md)
- [初赛投稿图片素材](docs/TRAE初赛投稿素材)

## 安全说明

`.env*` 与 `api_key.txt` 均不会提交到仓库。请勿将 API Key 写入源码、截图或 Git 提交记录。
