# Tests

真实 AI 集成测试会自动读取项目根目录下这些配置文件：

- `.env`
- `.env.local`
- `.env.test`
- `.env.test.local`

推荐做法：

1. 复制 `.env.example` 为 `.env.test.local`
2. 填入真实的 `AETHER_LLM_*` 配置
3. 运行 `npm run test:ai:e2e`

普通单元测试继续使用：

```bash
npm test
```
