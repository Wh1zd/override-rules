import { PROXY_GROUPS } from "./group-names";
import { ICONS } from "./icons";
import type { GroupBuildContext, ProxyGroupCandidate } from "../types/proxy";

interface ServiceGroupDef {
    name: string;
    icon: string;
    proxies: (ctx: GroupBuildContext) => ProxyGroupCandidate[];
}

function prioritizeLowCost(ctx: GroupBuildContext): ProxyGroupCandidate[] {
    const { defaultProxies } = ctx.lists;
    if (!defaultProxies.includes(PROXY_GROUPS.LOW_COST)) return defaultProxies;
    return [
        PROXY_GROUPS.LOW_COST,
        ...defaultProxies.filter((candidate) => candidate !== PROXY_GROUPS.LOW_COST),
    ];
}

/** 保留本分支的服务组；静态资源优先低倍率节点。 */
export const serviceGroups: ServiceGroupDef[] = [
    {
        name: PROXY_GROUPS.STATIC_RESOURCES,
        icon: ICONS.staticResources,
        proxies: prioritizeLowCost,
    },
    {
        name: PROXY_GROUPS.AI_SERVICE,
        icon: ICONS.aiService,
        proxies: (ctx) => ctx.lists.defaultProxies,
    },
    { name: PROXY_GROUPS.CRYPTO, icon: ICONS.crypto, proxies: (ctx) => ctx.lists.defaultProxies },
    { name: PROXY_GROUPS.APPLE, icon: ICONS.apple, proxies: (ctx) => ctx.lists.defaultProxies },
    { name: PROXY_GROUPS.GOOGLE, icon: ICONS.google, proxies: (ctx) => ctx.lists.defaultProxies },
    {
        name: PROXY_GROUPS.MICROSOFT,
        icon: ICONS.microsoft,
        proxies: (ctx) => ctx.lists.defaultProxies,
    },
    { name: PROXY_GROUPS.XBOX, icon: ICONS.xbox, proxies: (ctx) => ctx.lists.defaultProxies },
    { name: PROXY_GROUPS.GITHUB, icon: ICONS.github, proxies: (ctx) => ctx.lists.defaultProxies },
    { name: PROXY_GROUPS.YOUTUBE, icon: ICONS.youtube, proxies: (ctx) => ctx.lists.defaultProxies },
    { name: PROXY_GROUPS.TWITCH, icon: ICONS.twitch, proxies: (ctx) => ctx.lists.defaultProxies },
    { name: PROXY_GROUPS.NETFLIX, icon: ICONS.netflix, proxies: (ctx) => ctx.lists.defaultProxies },
    { name: PROXY_GROUPS.EMBY, icon: ICONS.emby, proxies: (ctx) => ctx.lists.defaultProxies },
    { name: PROXY_GROUPS.STEAM, icon: ICONS.steam, proxies: (ctx) => ctx.lists.defaultProxies },
    {
        name: PROXY_GROUPS.TELEGRAM,
        icon: ICONS.telegram,
        proxies: (ctx) => ctx.lists.defaultProxies,
    },
    { name: PROXY_GROUPS.SSH, icon: ICONS.ssh, proxies: (ctx) => ctx.lists.defaultProxies },
    {
        name: PROXY_GROUPS.LINKEDIN,
        icon: ICONS.linkedin,
        proxies: (ctx) => ctx.lists.defaultProxies,
    },
    {
        name: PROXY_GROUPS.FACEBOOK,
        icon: ICONS.facebook,
        proxies: (ctx) => ctx.lists.defaultProxies,
    },
    {
        name: PROXY_GROUPS.WHATSAPP,
        icon: ICONS.whatsapp,
        proxies: (ctx) => ctx.lists.defaultProxies,
    },
];
