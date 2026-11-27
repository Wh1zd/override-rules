import { PROXY_GROUPS } from "../catalog/group-names";

import { ruleSet } from "../catalog/rule-sets";
import type { AdblockSource } from "../types/args";

const baseRules = [
    `DST-PORT,22,${PROXY_GROUPS.SSH}`,
    `GEOIP,private,DIRECT,no-resolve`,
    `DOMAIN-SUFFIX,events.data.microsoft.com,${PROXY_GROUPS.MICROSOFT}`,
    ruleSet("StaticResources", PROXY_GROUPS.STATIC_RESOURCES),
    ruleSet("CDNResources", PROXY_GROUPS.STATIC_RESOURCES),
    ruleSet("AdditionalCDNResources", PROXY_GROUPS.STATIC_RESOURCES),
    `GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`,
    `GEOSITE,youtube,${PROXY_GROUPS.YOUTUBE}`,
    `GEOSITE,telegram,${PROXY_GROUPS.TELEGRAM}`,
    `GEOIP,telegram,${PROXY_GROUPS.TELEGRAM},no-resolve`,
    `GEOSITE,xbox,${PROXY_GROUPS.XBOX}`,
    `GEOSITE,github,${PROXY_GROUPS.GITHUB}`,
    `GEOSITE,netflix,${PROXY_GROUPS.NETFLIX}`,
    `GEOSITE,twitch,${PROXY_GROUPS.TWITCH}`,
    `GEOIP,netflix,${PROXY_GROUPS.NETFLIX},no-resolve`,
    ruleSet("Emby", PROXY_GROUPS.EMBY),
    ruleSet("linkedin", PROXY_GROUPS.LINKEDIN),
    ruleSet("whatsapp", PROXY_GROUPS.WHATSAPP),
    ruleSet("facebook", PROXY_GROUPS.FACEBOOK),
    ruleSet("SteamFix", "DIRECT"),
    ruleSet("SteamCN", "DIRECT"),
    ruleSet("Steam", PROXY_GROUPS.STEAM),
    `GEOSITE,google-play@cn,DIRECT`,
    `GEOSITE,microsoft@cn,DIRECT`,
    `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
    ruleSet("Microsoft", PROXY_GROUPS.MICROSOFT),
    `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
    ruleSet("Crypto", PROXY_GROUPS.CRYPTO),
    ruleSet("GFWList", PROXY_GROUPS.SELECT),
    `GEOIP,cn,DIRECT`,
    `MATCH,${PROXY_GROUPS.FINAL}`,
];

/**
 * 构建最终的规则列表。
 *
 * @param {Object} params - 构建参数
 * @param {boolean} params.quicEnabled - 是否启用 QUIC（如未启用会插入 UDP:443 拦截规则）
 * @returns {string[]} 规则字符串数组
 */
export function buildRules({
    quicEnabled,
    adblockSource,
}: {
    quicEnabled: boolean;
    adblockSource: AdblockSource;
}): string[] {
    const ruleList = [...baseRules];
    if (!quicEnabled) {
        ruleList.unshift("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    }
    if (adblockSource > 0) {
        const insertAt = ruleList.findIndex((rule) => rule.startsWith("GEOIP,private,")) + 1;
        ruleList.splice(
            insertAt,
            0,
            ruleSet("ADBlock", PROXY_GROUPS.AD_BLOCK),
            ruleSet("AdditionalFilter", PROXY_GROUPS.AD_BLOCK)
        );
    }
    return ruleList;
}
