import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WHATSAPP_HOSTS = new Set([
  "chat.whatsapp.com",
  "www.chat.whatsapp.com",
  "whatsapp.com",
  "www.whatsapp.com",
]);

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
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }

  return "";
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].trim()) : "";
}

function extractByClass(html, className) {
  // Matches <ANY class="...className...">CONTENT</ANY>
  const pattern = new RegExp(`class=["'][^"']*${className}[^"']*["'][^>]*>([^<]+)<\/`, "i");
  const match = html.match(pattern);
  return match?.[1] ? decodeHtml(match[1].trim()) : "";
}

function extractImageByClass(html, className) {
  // Matches <img ... class="...className..." ... src="SRC"
  const pattern = new RegExp(`<img[^>]+class=["'][^"']*${className}[^"']*["'][^>]+src=["']([^"']+)["']`, "i");
  const match = html.match(pattern);
  return match?.[1] ? match[1].trim() : "";
}

function normalizeGroupName(value) {
  return value
    .replace(/\s*\|\s*WhatsApp.*$/i, "")
    .replace(/\s*-\s*WhatsApp.*$/i, "")
    .trim();
}

function inferGroupType({ title, description, url }) {
  const source = `${title} ${description}`.toLowerCase();
  const urlStr = String(url || "").toLowerCase();

  if (urlStr.includes("/channel/") || source.includes("channel")) return "Channel";
  if (source.includes("community")) return "Community";
  if (source.includes("business")) return "Business";
  return "WhatsApp Group";
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

    // Fallback to provided classes (useful for channels)
    // Image class: _9vx6, Name class: _as2p
    if (!image) {
      image = extractImageByClass(html, "_9vx6");
    }
    
    if (!title || title === "WhatsApp Group Invite" || title === "WhatsApp") {
      const classTitle = extractByClass(html, "_as2p");
      if (classTitle) title = classTitle;
    }

    const groupName = normalizeGroupName(title);
    const groupType = inferGroupType({ title, description, url: groupLink });

    if (!groupName || !image) {
      return NextResponse.json(
        {
          status: "error",
          message: "Unable to extract WhatsApp group details from the invite link.",
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
