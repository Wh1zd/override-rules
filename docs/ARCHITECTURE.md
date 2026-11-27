# 覆写脚本架构

本分支采用上游 v2.10.2 的分层核心，保留 Wh1zd 的服务组、规则源与分流顺序。

## 数据流

`main(config)` 每次读取 `$arguments`，依次解析参数、分析节点、构造候选列表、生成代理组和组装配置。参数不再在脚本求值时固定，因此 YAML 生成器可以复用同一个 VM 上下文。

| 目录 | 职责 |
| --- | --- |
| `src/args/` | 参数解析，`schema.ts` 是默认值的唯一来源 |
| `src/analysis/` | 过滤无名称节点，识别落地节点，按国家和低倍率分类，决定展平或分组 |
| `src/catalog/` | 地区正则、服务组、组名、图标、DNS 常量与规则源 |
| `src/builders/` | 构造候选列表、规则、DNS、TUN、完整配置，组装最终结果 |
| `src/domain/` | 代理组工厂，集中处理候选来源合并与空组兜底 |
| `src/utils/` | 基础转换和节点名正则转义 |
| `src/types/` | 参数、节点和 Clash 配置类型 |
| `tests/` | 对应模块的单元与回归测试 |

## 本分支行为

- 默认地区组类型为自动测速，`threshold=2`，`fakeip=true`，`adblock=3`，其他布尔开关默认关闭。
- 达标地区不足两个时不生成地区组和手动选择组，主组及服务组直接引用非落地节点。空候选补 `DIRECT`，动态 `include-all` 来源除外。
- 地区组与低倍率组的正则来源同时排除已知落地节点，避免前置代理通过这些组重新选择落地节点。排除正则按完整节点名匹配并转义特殊字符。
- 所有服务组都保留本分支定义；不恢复金融、TikTok 等已删除的服务组。输入中的 Tailscale 节点仅作分类隔离，不生成其专用组或分流规则。
- Emby、LinkedIn、Facebook、WhatsApp、SteamCN、Steam、Microsoft、Crypto 和 SSH 保留原有分流。SteamFix、SteamCN 直连规则先于 Steam 代理规则。GoogleFCM 的强制直连例外随上游移除。
- 静态资源优先低倍率组，其余候选顺序保持一致。VS Code 下载域名进入 AdditionalCDNResources。
- 自动测速间隔保持 300 秒，容差保持 30 毫秒。
- DNS 按上游白名单继承 `listen`、两个 policy、`proxy-server-nameserver` 和 `fake-ip-filter`。脚本生成的核心 DNS 字段优先，`hosts` 仅在源配置存在时保留。无专用 DoH 注入。
- `full=true` 的控制接口默认监听本机；保留密码及已配置的本机地址，有非空密码时可保留显式远程地址。
- TUN 使用 `mips`、MTU 9000，保留原有局域网和 Tailscale 地址段排除。需要使用支持 `mips` 的新版 Mihomo 内核。

## 构建与验证

`npm test` 运行参数、节点分类、候选列表、代理组、DNS、TUN、定制分流和控制接口回归测试。`npm run typecheck` 同时检查源码与测试。

`npm run build` 用 esbuild 生成 `convert.js` 和 `convert.min.js`。`npm run generate` 异步读写文件，只读取并求值 `convert.js` 一次，每次调用前更新 `$arguments`、复制基础配置。按 3 种地区组类型、4 种广告源、6 个布尔开关生成 768 份 YAML，并清理旧格式文件。`LIMIT_COMBOS` 可限制本地生成数量。

CI 检查类型、格式、lint、测试及产物生成。发布工作流和版本号不在本次更新范围内。
