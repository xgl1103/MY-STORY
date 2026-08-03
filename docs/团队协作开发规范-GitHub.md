# My Story 双人协作开发规范（GitHub）

> 适用成员：
> - 前端负责人：界面、交互、页面体验与展示素材。
> - AI 叙事负责人：Writer Agent、Critical Agent、Memory、SQLite 数据结构与自动化测试。
>
> 目标：两个人可以同时开发，但任何时刻都保留一个可演示、可回退的稳定版本。

## 1. 协作总原则

1. **不直接在 `main` 分支写代码。** `main` 只保留已经通过测试、可以演示或部署的版本。
2. **一项独立功能对应一个分支和一个 Pull Request（PR）。** 不把多个无关改动混在同一个 PR 中。
3. **先同步，再开始；先测试，再合并。** 每天开始工作前拉取最新 `main`；发起 PR 前运行自己负责范围内的测试。
4. **不提交密钥、用户数据或本地数据库。** API Key 只存在本机环境变量或 `.env`，不能提交到 GitHub。
5. **改共享接口前先沟通。** 页面和 AI 引擎之间的字段、状态名、调用顺序属于共同约定，不能由一方单独修改。

## 2. 分支策略

仓库采用“稳定主线 + 短期功能分支”：

```text
main                              已验证，可演示/部署
├─ feat/frontend-reading-ui       前端：阅读页体验
├─ feat/frontend-diary-flow       前端：日记输入与选择交互
├─ feat/narrative-handoff         AI：日终交接单与 Writer
└─ fix/critical-json-stability    AI：Critical 审查稳定性修复
```

### 命名规则

| 类型 | 何时使用 | 示例 |
| --- | --- | --- |
| `feat/` | 新功能 | `feat/frontend-story-card` |
| `fix/` | 修复缺陷 | `fix/memory-handoff-save` |
| `test/` | 增加或调整测试 | `test/real-7day-checkpoint` |
| `docs/` | 只改文档 | `docs/demo-script` |
| `chore/` | 配置、整理、非产品功能 | `chore/update-ignore-rules` |

一个分支只做一件事。比如“优化日记输入界面”和“重写记忆提取器”必须使用两个分支、两个 PR。

## 3. 责任边界

### 前端负责人

主要负责：

- `src/views/`：页面与页面流程。
- `src/components/`：通用 UI 组件。
- 页面样式、响应式适配、加载/失败/空状态、动画与演示体验。
- 以 Mock 数据完成页面开发；不必等待 AI 引擎完成。

### AI 叙事负责人

主要负责：

- `src/ai/`：Writer、Story Planner、Critical、Memo Extractor、Prompt。
- `src/core/`：`StoryEngine` 和生成流程编排。
- `src/db/`：SQLite 表、迁移、Repository、导入导出。
- `tests/`、`mock/`：单元测试、全链路测试、真实 7 天连续性报告。

### 必须共同确认的文件/接口

| 范围 | 约定 |
| --- | --- |
| `StoryEngine` 的返回值 | 前端改动前必须确认 `success`、`segmentId`、`content`、`error`、`errorCode` 的含义不变。 |
| 页面状态 | 至少统一：`idle`、`generating`、`draft_ready`、`finalized`、`generate_failed`。 |
| 日记与命运选择 | 明确传入字段、保存时机、重新生成是否复用选择与计划。 |
| `package.json`、路由入口、构建配置 | 谁需要改，先在群里说明；改完由另一人拉取并验证构建。 |

建议把前后端所需的 Mock 数据和接口说明集中写在 `docs/`；前端只依赖约定字段，不直接读取 SQLite 内部表结构。

## 4. 每次开发的标准流程

以下命令在项目目录中执行。

### 4.1 开始一项工作前

```powershell
git checkout main
git pull origin main
git checkout -b feat/你的功能名称
```

示例：

```powershell
# 前端负责人
git checkout -b feat/frontend-diary-flow

# AI 叙事负责人
git checkout -b feat/narrative-writer-handoff
```

> 如果当前功能分支仍在继续，不要新建分支。先执行 `git fetch origin`，再把最新 `main` 合并进自己的分支：

```powershell
git fetch origin
git merge origin/main
```

出现冲突时先停止，不要随意删除另一人的代码；按照第 7 节处理。

### 4.2 开发过程中

每完成一个可以独立描述的小步骤，就提交一次：

```powershell
git status
git add src/路径/文件名
git commit -m "feat(ui): improve diary input feedback"
```

提交说明采用：`类型(范围): 简短动作`。

示例：

```text
feat(ui): add loading state for story generation
fix(memory): refresh handoff after user edits story
test(narrative): save real test checkpoint after each day
docs(team): add GitHub collaboration workflow
```

### 4.3 完成功能后发起 PR

```powershell
git status
git push -u origin feat/你的功能名称
```

然后在 GitHub：

1. 点击 **Compare & pull request**。
2. Base 选择 `main`，Compare 选择自己的功能分支。
3. PR 标题写清功能；描述写清“做了什么、怎么测试、是否影响接口”。
4. 请求另一位成员 Review。
5. Review 通过、测试通过后，使用 **Squash and merge** 或 **Create a merge commit** 合并到 `main`。
6. 合并后删除远端功能分支，本地也可删除。

PR 描述可直接复制：

```markdown
## 改动内容
- 

## 是否影响前后端接口
- 否 / 是：说明字段或状态变化

## 验证方式
- [ ] `npm run build`
- [ ] 已完成手动页面流程验证
- [ ] 已完成相关自动化测试

## 演示关注点
- 
```

## 5. 合并前验收清单

### 前端 PR

- [ ] 主要页面在桌面端可正常使用。
- [ ] 有加载中、生成失败、无数据三种状态。
- [ ] 不包含真实 API Key。
- [ ] `npm run build` 成功。
- [ ] 不破坏既有日记、生成、阅读、设置流程。

### AI / Memory PR

- [ ] 原有测试通过，新增行为有对应测试。
- [ ] 真实 API 测试仅用本机临时环境变量，密钥不写入报告和 Git。
- [ ] Memory、日终交接单、剧情计划在定稿/编辑后都能更新。
- [ ] Writer、Critical 使用同一份剧情计划，重新生成不改变用户已选命运。
- [ ] `npm run build` 成功。

### 所有 PR

- [ ] 没有无关文件、`dist/`、本地数据库、测试密钥。
- [ ] `git diff --check` 无格式错误。
- [ ] PR 描述说明了测试结果和接口影响。

## 6. 每日协作节奏

建议每天用 5 分钟同步一次即可：

1. **开始前**：各自说清“今天改哪个分支、会不会改共享接口”。
2. **中间**：若要改 `StoryEngine` 返回值、路由或数据状态，先发消息确认。
3. **结束前**：推送分支、发 PR，附上截图或测试报告路径。
4. **合并后**：两人都执行：

```powershell
git checkout main
git pull origin main
```

前端可以在 AI 功能未完成时使用 Mock；AI 功能也可在 UI 未完成时直接运行测试脚本。这样双方不互相等待。

## 7. 冲突处理规则

发生冲突时，不要使用“全部接受当前/传入更改”直接覆盖。

```powershell
git status
```

1. 先确认冲突文件归谁负责。
2. 如果只属于一方的目录，由该负责人解决。
3. 如果是共享接口，双方一起确认最终字段和流程，再解决冲突。
4. 解决后执行：

```powershell
git add 冲突文件路径
git commit
```

5. 运行构建和相关测试，再推送。

如果不确定冲突含义，保留冲突状态并截图/复制冲突片段给对方；不要为了让 Git 通过而删除逻辑。

## 8. 版本、部署与回退

1. `main` 每次合并后都应可构建。
2. 准备给评审演示前，从 `main` 创建一个发布标签，例如 `v0.2-demo`。
3. 只部署 `main` 或已确认的发布提交；功能分支只用于预览和开发。
4. 部署出现问题时，优先在 GitHub 回到上一个已验证提交重新部署，而不是在生产环境临时改代码。
5. Vercel 的 API Key 放在项目环境变量中；绝不写进前端代码、Git 历史或截图。

## 9. 你们现在可以立刻这样开始

1. 在 GitHub 仓库 **Settings → Collaborators** 邀请另一位成员，并给予 Write 权限。
2. 前端负责人从 `main` 新建：`feat/frontend-ui-optimization`。
3. AI 叙事负责人从 `main` 新建：`feat/narrative-memory-v2`。
4. 先在 `docs/` 确认一份“前端需要的生成状态和字段”说明，再各自开工。
5. 每个功能通过 PR 合并，不直接 Push 到 `main`。

---

这份规范的核心不是增加流程，而是让你们可以并行推进：前端负责“评审看得到的体验”，AI 叙事负责“故事真正连续、记忆真正生效”，最后通过 PR 在稳定的 `main` 汇合。
