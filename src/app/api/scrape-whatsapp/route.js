import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WHATSAPP_HOSTS = new Set([
  "chat.whatsapp.com",
  "www.chat.whatsapp.com",
  "whatsapp.com",
  "www.whatsapp.com",
]);

const DEFAULT_SELECTOR_SETTINGS = {
  group: { imageClass: "_9vx6", nameClass: "_as2p", typeClass: "" },
  channel: { imageClass: "_9vx6", nameClass: "_as2p", typeClass: "" },
  community: { imageClass: "_9vx6", nameClass: "_as2p", typeClass: "" },
};

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isNaN(codePoint) ? _ : String.fromCodePoint(codePoint);
    })
    .replace(/&#(\d+);/g, (_, decimal) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isNaN(codePoint) ? _ : String.fromCodePoint(codePoint);
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMetaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=(["'])([\\s\\S]*?)\\1[^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=(["'])([\\s\\S]*?)\\1[^>]+property=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=(["'])([\\s\\S]*?)\\1[^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=(["'])([\\s\\S]*?)\\1[^>]+name=["']${key}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[2]) return decodeHtml(match[2].trim());
  }

  return "";
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].trim()) : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildClassPattern(className) {
  const classes = String(className || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => `(?=.*(?:^|\\s)${escapeRegExp(item)}(?:\\s|$))`)
    .join("");

  return classes ? new RegExp(`class=["'][^"']*${classes}[^"']*["']`, "i") : null;
}

function extractByClass(html, className) {
  const classPattern = buildClassPattern(className);
  if (!classPattern) return "";

  const pattern = new RegExp(`(<[^>]+${classPattern.source}[^>]*>)([\\s\\S]*?)<\\/[^>]+>`, "i");
  const match = html.match(pattern);
  const content = match?.[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return content ? decodeHtml(content) : "";
}

function extractImageByClass(html, className) {
  const classPattern = buildClassPattern(className);
  if (!classPattern) return "";

  const imgPattern = new RegExp(`<img[^>]+${classPattern.source}[^>]+src=(["'])([\\s\\S]*?)\\1`, "i");
  const imgMatch = html.match(imgPattern);
  if (imgMatch?.[2]) return decodeHtml(imgMatch[2].trim());

  const genericPattern = new RegExp(`(<[^>]+${classPattern.source}[^>]*>)([\\s\\S]*?)<\\/[^>]+>`, "i");
  const genericMatch = html.match(genericPattern);
  const tag = genericMatch?.[1] || "";
  const tagSrc = tag.match(/src=(["'])([\s\S]*?)\1/i)?.[2];
  if (tagSrc) return decodeHtml(tagSrc.trim());

  const svgMatch = genericMatch?.[2]?.match(/<svg[\s\S]*?<\/svg>/i)?.[0];
  return svgMatch ? svgMatch.trim() : "";
}

function normalizeGroupName(value) {
  return value
    .replace(/\s*\|\s*WhatsApp.*$/i, "")
    .replace(/\s*-\s*WhatsApp.*$/i, "")
    .trim();
}

function isPlaceholderInviteName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "whatsapp" ||
    normalized === "whatsapp group invite" ||
    normalized === "group chat invite" ||
    normalized === "chat invite"
  );
}

function inferGroupType({ title, description, url }) {
  const source = `${title} ${description}`.toLowerCase();
  const urlStr = String(url || "").toLowerCase();

  if (urlStr.includes("/channel/") || source.includes("channel")) return "Channel";
  if (source.includes("community")) return "Community";
  if (source.includes("business")) return "Business";
  return "WhatsApp Group";
}

function normalizeTypeKey(value) {
  const source = String(value || "").toLowerCase();
  if (source.includes("channel")) return "channel";
  if (source.includes("community")) return "community";
  return "group";
}

function normalizeGroupTypeLabel(value) {
  const typeKey = normalizeTypeKey(value);
  if (typeKey === "channel") return "channel";
  if (typeKey === "community") return "community";
  return "group";
}

function mergeSelectorSettings(rawSettings) {
  const merged = { ...DEFAULT_SELECTOR_SETTINGS };

  for (const key of Object.keys(DEFAULT_SELECTOR_SETTINGS)) {
    merged[key] = {
      ...DEFAULT_SELECTOR_SETTINGS[key],
      ...(rawSettings?.[key] && typeof rawSettings[key] === "object" ? rawSettings[key] : {}),
    };
  }

  return merged;
}

function isInvalidImageValue(value) {
  const normalized = decodeHtml(String(value || "").trim()).toLowerCase();
  if (!normalized) return true;
  return (
    normalized.startsWith("<svg") ||
    normalized.includes("</svg>") ||
    normalized.includes("xmlns=\"http://www.w3.org/2000/svg\"") ||
    normalized.startsWith("data:image/svg")
  );
}

function getValidWhatsappUrl(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    throw new Error("WhatsApp link is required.");
  }

  let url;
  try {
    url = new URL(rawValue.trim());
  } catch {
    throw new Error("Invalid WhatsApp link.");
  }

  const hostname = url.hostname.toLowerCase();
  if (!WHATSAPP_HOSTS.has(hostname)) {
    throw new Error("Only chat.whatsapp.com and whatsapp.com links are supported.");
  }

  // For whatsapp.com, ensure it's a channel link
  if (hostname === "whatsapp.com" || hostname === "www.whatsapp.com") {
    if (!url.pathname.startsWith("/channel/")) {
      throw new Error("Only WhatsApp channel links are supported for whatsapp.com domain.");
    }
  }

  return url.toString();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const groupLink = getValidWhatsappUrl(body?.groupLink);
    const selectorSettings = mergeSelectorSettings(body?.selectorSettings);

    const response = await fetch(groupLink, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "error",
          message: `WhatsApp returned HTTP ${response.status}.`,
        },
        { status: 502 }
      );
    }

    const html = await response.text();
    
    // Standard meta tags
    let title = extractMetaContent(html, "og:title") || extractTitle(html);
    let description =
      extractMetaContent(html, "og:description") || extractMetaContent(html, "description");
    let image = extractMetaContent(html, "og:image");
    const inferredType = inferGroupType({ title, description, url: groupLink });
    const selectorTypeKey = normalizeTypeKey(inferredType);
    const selectors = selectorSettings[selectorTypeKey] || selectorSettings.group;

    if (!image) {
      image = extractImageByClass(html, selectors.imageClass);
    }

    if (!title || isPlaceholderInviteName(title)) {
      const classTitle = extractByClass(html, selectors.nameClass);
      if (classTitle) title = classTitle;
    }

    const classType = extractByClass(html, selectors.typeClass);
    const groupName = normalizeGroupName(title);
    const groupType = normalizeGroupTypeLabel(classType || inferredType);

    if (isPlaceholderInviteName(groupName) || isInvalidImageValue(image)) {
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid or expired WhatsApp invite detected.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      status: "success",
      data: {
        group_link: groupLink,
        group_name: groupName,
        group_image: image,
        group_type: groupType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unable to scrape WhatsApp group.",
      },
      { status: 400 }
    );
  }
}
