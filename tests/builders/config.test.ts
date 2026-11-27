import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFeatureFlags } from "../../src/args/parse";
import { analyzeNodes } from "../../src/analysis/classify";
import { buildBaseLists } from "../../src/builders/selectors";
import { assembleConfig } from "../../src/builders/config";
import { buildProxyGroups } from "../../src/builders/proxy-groups";
import { PROXY_GROUPS } from "../../src/catalog/group-names";
import { ruleSets } from "../../src/catalog/rule-sets";
import type { ClashConfig } from "../../src/types/clash";
import type { ProxyGroup } from "../../src/types/proxy";
import type { ScriptArgs } from "../../src/types/args";

function run(args: ScriptArgs, config: ClashConfig): ClashConfig {
    const flags = buildFeatureFlags(args);
    const proxies = config.proxies ?? [];
    const nodes = analyzeNodes(proxies, flags.countryThreshold);
    const lists = buildBaseLists({
        landing: nodes.landing,
        landingNodes: nodes.landingNodes,
        lowCostNodes: nodes.lowCostNodes,
        nonLandingNodes: nodes.nonLandingNodes,
        tailscaleNodes: nodes.tailscaleNodes,
        regexFilter: flags.regexFilter,
        regions: nodes.regionLayout,
    });
    const proxyGroups = buildProxyGroups({ flags, nodes, lists });
    return assembleConfig(config, { flags, nodes, proxyGroups });
}

function group(config: ClashConfig, name: string): ProxyGroup | undefined {
    return config["proxy-groups"]?.find((item) => item.name === name);
}

const CONFIG: ClashConfig = {
    proxies: [{ name: "香港01" }, { name: "香港02" }, { name: "美国01" }, { name: "美国02" }],
    hosts: { "example.com": ["1.2.3.4"] },
};

describe("本分支定制与回归", () => {
    it("保留已有服务组，不恢复已删除的服务组", () => {
        const result = run(
            {},
            {
                proxies: [
                    ...CONFIG.proxies!,
                    { name: "香港 0.2x" },
                    { name: "落地A", "dialer-proxy": "前置代理" },
                ],
            }
        );
        const names = new Set(result["proxy-groups"]?.map((item) => item.name));
        for (const name of Object.values(PROXY_GROUPS)) assert.ok(names.has(name), name);
        for (const name of [
            "金融服务",
            "Tailscale",
            "TikTok",
            "Truth Social",
            "新浪微博",
            "哔哩哔哩",
            "Spotify",
            "巴哈姆特",
            "PikPak网盘",
            "E-Hentai",
            "搜狗输入法",
        ]) {
            assert.ok(!names.has(name), name);
        }
    });

    it("保留自定义规则及 Steam 国内下载优先顺序", () => {
        const result = run({}, CONFIG);
        const rules = result.rules ?? [];
        for (const rule of [
            "RULE-SET,Emby,Emby",
            "RULE-SET,linkedin,LinkedIn",
            "RULE-SET,facebook,Facebook",
            "RULE-SET,whatsapp,WhatsApp",
            "RULE-SET,Microsoft,微软服务",
            "RULE-SET,Crypto,加密货币",
            "DST-PORT,22,SSH",
            "DOMAIN-SUFFIX,events.data.microsoft.com,微软服务",
        ]) {
            assert.ok(rules.includes(rule), rule);
        }
        assert.ok(
            rules.indexOf("RULE-SET,SteamFix,DIRECT") < rules.indexOf("RULE-SET,SteamCN,DIRECT")
        );
        assert.ok(rules.indexOf("RULE-SET,SteamCN,DIRECT") < rules.indexOf("RULE-SET,Steam,Steam"));
        assert.ok(!rules.some((rule) => /GoogleFCM|TikTok|Tailscale|金融服务/.test(rule)));
    });

    it("没有源 DNS 时不再注入专用 DoH，仍保留正常的源策略", () => {
        const plain = run({}, CONFIG);
        assert.ok(!JSON.stringify(plain).includes("mouckegogaidy.com"));
        assert.ok(!JSON.stringify(plain).includes("jeeyio.com"));
        const dns: NonNullable<ClashConfig["dns"]> = {
            enable: false,
            ipv6: true,
            "prefer-h3": false,
            "enhanced-mode": "redir-host",
            nameserver: ["192.0.2.1"],
            fallback: [],
            listen: "127.0.0.1:1053",
            "nameserver-policy": { "+.example.com": "system" },
            "proxy-server-nameserver-policy": { "+.example.org": ["223.5.5.5"] },
        };
        const merged = run({ fakeip: "true", ipv6: "false" }, { ...CONFIG, dns });
        assert.equal(merged.dns?.enable, true);
        assert.equal(merged.dns?.ipv6, false);
        assert.equal(merged.dns?.["enhanced-mode"], "fake-ip");
        assert.equal(merged.dns?.listen, dns.listen);
        assert.deepEqual(merged.dns?.["nameserver-policy"], dns["nameserver-policy"]);
        assert.deepEqual(
            merged.dns?.["proxy-server-nameserver-policy"],
            dns["proxy-server-nameserver-policy"]
        );
        assert.notDeepEqual(merged.dns?.nameserver, dns.nameserver);
        assert.equal(dns.enable, false);
    });

    it("单节点订阅的测速和故障转移都使用该节点", () => {
        const result = run({}, { proxies: [{ name: "香港01" }] });
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, ["香港01"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, ["香港01"]);
    });

    it("full 模式保留有密码的控制接口和本机监听地址", () => {
        for (const [controller, secret] of [
            ["0.0.0.0:9090", "existing-password"],
            ["127.0.0.1:9090", ""],
            ["[::1]:9090", ""],
        ]) {
            const result = run(
                { full: "true" },
                { ...CONFIG, "external-controller": controller, secret }
            );
            assert.equal(result["external-controller"], controller);
            assert.equal(result.secret, secret);
        }
    });

    it("full 模式拒绝继承没有密码的非本机控制接口", () => {
        for (const controller of [
            ":9999",
            "0.0.0.0:9090",
            "[::]:9090",
            "192.168.1.10:9090",
            "127.example.com:9090",
        ]) {
            const result = run({ full: "true" }, { ...CONFIG, "external-controller": controller });
            assert.equal(result["external-controller"], "127.0.0.1:9999");
        }
    });

    it("正则分组时，前置地区组与低倍率组均排除落地节点", () => {
        const landingName = "香港落地[0.2x]+";
        const result = run(
            { regex: "true" },
            { proxies: [...CONFIG.proxies!, { name: landingName, "dialer-proxy": "前置代理" }] }
        );
        const excluded = group(result, "香港节点")?.["exclude-filter"];
        assert.ok(excluded);
        assert.ok(new RegExp(excluded).test(landingName));
        assert.ok(!new RegExp(excluded).test("香港01"));
        const lowCostExcluded = group(result, PROXY_GROUPS.LOW_COST)?.["exclude-filter"];
        assert.ok(lowCostExcluded && new RegExp(lowCostExcluded).test(landingName));
        assert.ok(!group(result, PROXY_GROUPS.FRONT_PROXY)?.proxies?.includes(landingName));
    });

    it("广告源切换时引用完整且不重复，并保持所有组可解析", () => {
        for (const adblock of ["0", "1", "2", "3"]) {
            const result = run({ adblock }, CONFIG);
            const rules = result.rules ?? [];
            assert.equal(new Set(rules).size, rules.length);
            for (const rule of rules) {
                if (rule.startsWith("RULE-SET,"))
                    assert.ok(rule.split(",")[1] in (result["rule-providers"] ?? {}), rule);
            }
            const names = new Set([
                "DIRECT",
                "REJECT",
                "REJECT-DROP",
                ...CONFIG.proxies!.map((node) => node.name),
                ...result["proxy-groups"]!.map((item) => item.name),
            ]);
            for (const item of result["proxy-groups"]!) {
                for (const candidate of item.proxies ?? [])
                    assert.ok(names.has(candidate), `${item.name}: ${candidate}`);
            }
        }
    });
});

describe("assembleConfig", () => {
    it("追加 GLOBAL 组并以其前置组为候选", () => {
        const result = run({}, CONFIG);
        const groups = result["proxy-groups"] ?? [];
        const global = groups.at(-1);

        assert.equal(global?.name, PROXY_GROUPS.GLOBAL);
        assert.equal(global?.["include-all"], true);
        assert.deepEqual(
            global?.proxies,
            groups.slice(0, -1).map((item) => item.name)
        );
    });

    it("保留上游 proxies 与 hosts", () => {
        const result = run({}, CONFIG);
        assert.deepEqual(result.proxies, CONFIG.proxies);
        assert.deepEqual(result.hosts, CONFIG.hosts);
    });

    it("丢弃无名称节点，不写入 proxies 或代理组", () => {
        const result = run({}, { proxies: [{ name: "" }, { name: "香港01" }] });

        assert.deepEqual(result.proxies, [{ name: "香港01" }]);
        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, ["香港01", "DIRECT"]);
    });

    it("无上游 hosts 时不输出 hosts 字段", () => {
        const result = run({}, { proxies: [{ name: "香港01" }] });
        assert.ok(!("hosts" in result));
    });

    it("full=true 时追加完整内核参数", () => {
        const result = run({ full: "true" }, CONFIG);
        assert.equal(result["mixed-port"], 7890);
        assert.equal(result["external-controller"], "127.0.0.1:9999");
        assert.equal(result.mode, "rule");
    });

    it("full 默认关闭", () => {
        const result = run({}, CONFIG);
        assert.equal(result["mixed-port"], undefined);
    });

    it("无地区组时三大主组直接使用节点（回归 #64）", () => {
        const result = run({}, { proxies: [{ name: "NodeA" }, { name: "NodeB" }] });

        // 展平后没有 AUTO / FALLBACK 的相互嵌套，也不再生成「手动选择」组。
        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, ["NodeA", "NodeB", "DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, ["NodeA", "NodeB"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, ["NodeA", "NodeB"]);
        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);

        // 服务组也直接使用展平节点，不再引用「选择代理」。
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, ["NodeA", "NodeB", "DIRECT"]);
        // 没有低倍率组时，静态资源组保持正常顺序。
        assert.deepEqual(group(result, PROXY_GROUPS.STATIC_RESOURCES)?.proxies, [
            "NodeA",
            "NodeB",
            "DIRECT",
        ]);
    });

    it("存在低倍率组时静态资源组优先使用低倍率节点", () => {
        const result = run(
            {},
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "美国02" },
                    { name: "香港 0.2x 大流量" },
                ],
            }
        );

        assert.deepEqual(group(result, PROXY_GROUPS.STATIC_RESOURCES)?.proxies, [
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.SELECT,
            "香港节点",
            "美国节点",
            PROXY_GROUPS.MANUAL,
            "DIRECT",
        ]);
        // 其他服务组仍保持正常顺序，低倍率组只移动一次。
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, [
            PROXY_GROUPS.SELECT,
            "香港节点",
            "美国节点",
            PROXY_GROUPS.LOW_COST,
            PROXY_GROUPS.MANUAL,
            "DIRECT",
        ]);
    });

    it("展平模式下静态资源组同样优先使用低倍率节点", () => {
        const result = run({}, { proxies: [{ name: "NodeA" }, { name: "NodeB 0.2x 大流量" }] });

        assert.deepEqual(group(result, PROXY_GROUPS.STATIC_RESOURCES)?.proxies, [
            PROXY_GROUPS.LOW_COST,
            "NodeA",
            "NodeB 0.2x 大流量",
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, [
            "NodeA",
            "NodeB 0.2x 大流量",
            PROXY_GROUPS.LOW_COST,
            "DIRECT",
        ]);
    });

    it("空 proxies 时所有代理组都不为空，且展平模式不生成手动选择组", () => {
        const result = run({}, { proxies: [] });
        const groups = result["proxy-groups"] ?? [];

        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, ["DIRECT"]);
        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, ["DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, ["DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, ["DIRECT"]);

        for (const item of groups) {
            if (item.proxies) {
                assert.ok(item.proxies.length > 0, `${item.name} 不应包含空 proxies`);
            }
        }
    });

    it("全落地时保留落地节点组，前置代理仅包含 DIRECT", () => {
        const result = run({}, { proxies: [{ name: "落地A", "dialer-proxy": "前置代理" }] });

        assert.deepEqual(group(result, PROXY_GROUPS.LANDING)?.proxies, ["落地A"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FRONT_PROXY)?.proxies, ["DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, [
            PROXY_GROUPS.LANDING,
            "DIRECT",
        ]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, [PROXY_GROUPS.LANDING]);
        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, [
            PROXY_GROUPS.LANDING,
            "DIRECT",
        ]);
    });

    it("展平 + regex 时前置代理仍显式排除落地节点", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "落地A", "dialer-proxy": "前置代理" },
                ],
            }
        );

        assert.deepEqual(group(result, PROXY_GROUPS.FRONT_PROXY)?.proxies, [
            "DIRECT",
            "香港01",
            "香港02",
        ]);
        assert.equal(group(result, PROXY_GROUPS.SELECT)?.["exclude-filter"], "^(?:落地A)$");
        assert.equal(group(result, PROXY_GROUPS.SELECT)?.["include-all"], true);

        const google = group(result, PROXY_GROUPS.GOOGLE);
        assert.equal(google?.["include-all"], true);
        assert.equal(google?.["exclude-filter"], "^(?:落地A)$");
        assert.deepEqual(google?.proxies, [PROXY_GROUPS.LANDING, PROXY_GROUPS.LOW_COST, "DIRECT"]);
    });

    it("只有台湾时服务组不引用未生成的地区组", () => {
        const result = run({}, { proxies: [{ name: "台湾01" }, { name: "台湾02" }] });
        const allGroupNames = (result["proxy-groups"] ?? []).map((item) => item.name);

        assert.ok(!allGroupNames.includes("台湾节点"));
        assert.deepEqual(group(result, PROXY_GROUPS.LINKEDIN)?.proxies, [
            "台湾01",
            "台湾02",
            "DIRECT",
        ]);
    });

    it("只有美国时 Emby 不引用未生成的地区组", () => {
        const result = run({}, { proxies: [{ name: "美国01" }, { name: "美国02" }] });

        assert.ok(!(result["proxy-groups"] ?? []).some((item) => item.name === "美国节点"));
        assert.deepEqual(group(result, PROXY_GROUPS.EMBY)?.proxies, ["美国01", "美国02", "DIRECT"]);
    });

    it("regex=true 时手动选择组使用 include-all，不枚举节点名称", () => {
        const result = run({ regex: "true" }, CONFIG);
        const manual = (result["proxy-groups"] ?? []).find(
            (group) => group.name === PROXY_GROUPS.MANUAL
        );

        assert.equal(manual?.["include-all"], true);
        assert.equal(manual?.proxies, undefined);
    });

    it("regex=false 时手动选择组仍按上游顺序枚举节点名称", () => {
        const result = run({}, CONFIG);
        const manual = (result["proxy-groups"] ?? []).find(
            (group) => group.name === PROXY_GROUPS.MANUAL
        );

        assert.equal(manual?.["include-all"], undefined);
        assert.deepEqual(
            manual?.proxies,
            CONFIG.proxies?.map((node) => node.name)
        );
    });

    it("不生成 Tailscale 组，特殊节点不进入手动选择列表", () => {
        const result = run(
            {},
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "美国02" },
                    { name: "Tailscale出口", type: "tailscale" },
                ],
            }
        );

        const tailscale = group(result, "Tailscale");
        assert.equal(tailscale, undefined);

        assert.deepEqual(group(result, PROXY_GROUPS.MANUAL)?.proxies, [
            "香港01",
            "香港02",
            "美国01",
            "美国02",
        ]);
    });

    it("展平模式下 Tailscale 节点不进入任何常规选择列表", () => {
        const result = run(
            {},
            {
                proxies: [{ name: "香港01" }, { name: "Tailscale出口", type: "tailscale" }],
            }
        );

        assert.equal(group(result, PROXY_GROUPS.MANUAL), undefined);
        assert.deepEqual(group(result, PROXY_GROUPS.SELECT)?.proxies, ["香港01", "DIRECT"]);
        assert.deepEqual(group(result, PROXY_GROUPS.AUTO)?.proxies, ["香港01"]);
        assert.deepEqual(group(result, PROXY_GROUPS.FALLBACK)?.proxies, ["香港01"]);
        assert.deepEqual(group(result, PROXY_GROUPS.GOOGLE)?.proxies, ["香港01", "DIRECT"]);
        assert.equal(group(result, "Tailscale"), undefined);
    });

    it("regex 分组模式下手动选择组排除 Tailscale", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "美国02" },
                    { name: "Tailscale出口", type: "tailscale" },
                ],
            }
        );

        const manual = group(result, PROXY_GROUPS.MANUAL);
        assert.equal(manual?.["include-all"], true);
        assert.equal(manual?.["exclude-filter"], "^(?:Tailscale出口)$");
    });

    it("regex 地区组与低倍率组均排除 Tailscale", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "美国02" },
                    { name: "美国-Tailscale 低倍率", type: "tailscale" },
                ],
            }
        );

        assert.equal(
            group(result, "美国节点")?.["exclude-filter"],
            "美属|亚美尼亚|圣多美|普林西比|^(?:美国-Tailscale 低倍率)$"
        );
        assert.equal(
            group(result, PROXY_GROUPS.LOW_COST)?.["exclude-filter"],
            "^(?:美国-Tailscale 低倍率)$"
        );
    });

    it("regex 展平模式同时排除落地节点与 Tailscale", () => {
        const result = run(
            { regex: "true" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "落地A", "dialer-proxy": "前置代理" },
                    { name: "Tailscale出口", type: "tailscale" },
                ],
            }
        );

        const expected = "^(?:落地A|Tailscale出口)$";
        assert.equal(group(result, PROXY_GROUPS.SELECT)?.["exclude-filter"], expected);
        assert.equal(group(result, PROXY_GROUPS.GOOGLE)?.["exclude-filter"], expected);
        assert.equal(group(result, "Tailscale"), undefined);
    });

    it("引用同一份规则集与 Geo 数据源", () => {
        const result = run({}, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.equal(providers.Emby, ruleSets.Emby);
        assert.equal(providers.facebook, ruleSets.facebook);
        assert.equal(result["geodata-mode"], true);
        assert.ok(result["geox-url"]?.geoip);
    });

    it("adblock=0 时广告拦截组隐藏", () => {
        const result = run({ adblock: "0" }, CONFIG);
        assert.equal(group(result, PROXY_GROUPS.AD_BLOCK)?.hidden, true);
    });

    it("adblock>0 时广告拦截组可见", () => {
        const result = run({ adblock: "2" }, CONFIG);
        assert.equal(group(result, PROXY_GROUPS.AD_BLOCK)?.hidden, undefined);
    });

    it("adblock=0 时 rule-providers 不包含广告规则集", () => {
        const result = run({ adblock: "0" }, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.ok(!("ADBlock" in providers));
        assert.ok(!("AdditionalFilter" in providers));
    });

    it("adblock=1 时 ADBlock 指向 adrules.top", () => {
        const result = run({ adblock: "1" }, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.equal(providers.ADBlock?.url, "https://adrules.top/adrules-mihomo.mrs");
        assert.equal(providers.ADBlock?.format, "mrs");
        assert.ok("AdditionalFilter" in providers);
    });

    it("adblock=2 时 ADBlock 使用默认的 217heidai 规则集", () => {
        const result = run({ adblock: "2" }, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.equal(providers.ADBlock, ruleSets.ADBlock);
        assert.ok("AdditionalFilter" in providers);
    });

    it("adblock=3 时 ADBlock 指向 AWAvenue", () => {
        const result = run({ adblock: "3" }, CONFIG);
        const providers = result["rule-providers"] ?? {};
        assert.match(providers.ADBlock?.url ?? "", /AWAvenue-Ads-Rule/);
        assert.equal(providers.ADBlock?.format, "mrs");
        assert.ok("AdditionalFilter" in providers);
    });
});
