export const PROXY_GROUPS = {
    SELECT: "选择代理",
    MANUAL: "手动选择",
    AUTO: "自动选择",
    FALLBACK: "故障转移",
    LANDING: "落地节点",
    LOW_COST: "低倍率节点",
    FRONT_PROXY: "前置代理",
    STATIC_RESOURCES: "静态资源",
    AI_SERVICE: "AI服务",
    CRYPTO: "加密货币",
    APPLE: "苹果服务",
    GOOGLE: "谷歌服务",
    MICROSOFT: "微软服务",
    XBOX: "Xbox",
    GITHUB: "Github",
    YOUTUBE: "Youtube",
    NETFLIX: "Netflix",
    EMBY: "Emby",
    STEAM: "Steam",
    TELEGRAM: "Telegram",
    TWITCH: "Twitch",
    SSH: "SSH",
    AD_BLOCK: "广告拦截",
    GLOBAL: "GLOBAL",
    LINKEDIN: "LinkedIn",
    FACEBOOK: "Facebook",
    WHATSAPP: "WhatsApp",
    FINAL: "Final",
} as const;

export function countryGroupName(country: string): string {
    return `${country}节点`;
}
