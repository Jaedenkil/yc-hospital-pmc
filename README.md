# yc-hospital-pmc

盐城市公立医院改革与高质量发展示范项目 —— 信息化全流程项目管控平台（简称"监理平台"）。

| 项 | 位置 |
|---|---|
| 项目档案（知识库） | `D:\projects\KnowledgeBase\yc-hospital-pmc\` |
| ├ 项目总览 | `01-总览\yc-hospital-pmc-项目总览.md` |
| ├ 需求原文 | `01-总览\yc-hospital-pmc-需求原文.md` |
| └ 开发日志 | `04-开发\yc-hospital-pmc-开发日志.md` |

**当前状态（2026-09-20）：** 演示 Demo 已完成，是可直接运行、演示、导出的完整前端系统。

- **技术栈**：Vue 3.5 + TypeScript + Vite 8 + Ant Design Vue 4 + ECharts 6 + Pinia + Less
- **范围**：21 个路由页面（登录页 + 数据驾驶舱 + 项目 / 进度 / 统计 / 资金 / 报表 / 文档 / 监理 / 审计 / 系统管理 九大模块）
- **数据**：全部来自前端 mock（20 个子项目与 9 类业务数据），无后端接口、无网络请求
- **构建产物**：`npm run build` → `dist/`（静态站，可部署）；`npm run build:single` → `dist-single/index.html`（单文件，双击即演示）
- **演示基准日**：2026-09-20，数据由确定性种子生成，刷新后完全一致

> 本目录为工程根目录。需求、设计、会议、复盘等文档统一归档在知识库对应目录，避免两处各留一份造成不一致。

---

## 通过 IP 访问（多人演示）

```powershell
npm run dev
```

启动后终端会打印 `Network: http://<本机IP>:5173/`，同一局域网的其他电脑 / 手机用该地址直接打开即可（无需部署）。
预览正式构建产物用 `npm run build && npm run preview`（端口 4173）。

- 开发服务器与预览服务器均已配置监听全部网卡（`vite.config.ts` 的 `server.host` / `preview.host`）
- 单文件版 `dist-single/index.html` 可拷贝到任意电脑双击打开，不依赖网络与服务
- 详细说明（启动方式、其他设备访问、Nginx 部署、二级目录部署）见知识库《IP访问与部署说明》
