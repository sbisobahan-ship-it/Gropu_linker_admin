const API_BASE_URL =
  process.env.ADMIN_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://buildbdapp.shop/walinker_config/api/v1";

function buildTargetUrl(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path) {
    throw new Error("Missing path parameter.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const targetUrl = new URL(`${API_BASE_URL}${normalizedPath}`);

  // Forward existing search params except 'path'
  searchParams.forEach((value, key) => {
    if (key !== "path") {
      targetUrl.searchParams.append(key, value);
    }
  });

  // Fallback: append token from headers to query string if present
  const authHeader = request.headers.get("authorization") || request.headers.get("x-admin-token") || request.headers.get("token");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    if (!targetUrl.searchParams.has("token")) {
      targetUrl.searchParams.append("token", token);
    }
  }

  return targetUrl.toString();
}

async function proxyRequest(request) {
  let targetUrl;

  try {
    targetUrl = buildTargetUrl(request);
  } catch (error) {
    return Response.json(
      { status: "error", message: error instanceof Error ? error.message : "Invalid proxy request." },
      { status: 400 }
    );
  }

  const headers = new Headers();
  console.log(`[Proxy] Request to: ${targetUrl} | Method: ${request.method}`);
  
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() !== "host") {
      headers.set(key, value);
      const k = key.toLowerCase();
      if (k.includes("auth") || k.includes("token") || k.includes("cookie")) {
        console.log(`[Proxy] Forwarding Header: ${key} = ${value.slice(0, 15)}...`);
      }
    }
  }

  console.log(`[Proxy] Final URL: ${targetUrl}`);

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      // Adding a longer timeout if possible or just ensuring it doesn't hang
      next: { revalidate: 0 }
    });

    const responseText = await upstreamResponse.text();
    const responseHeaders = new Headers();
    const upstreamContentType = upstreamResponse.headers.get("content-type");

    if (upstreamContentType) {
      responseHeaders.set("content-type", upstreamContentType);
    }

    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[Proxy Error]", error);
    return Response.json(
      {
        status: "error",
        message: "সার্ভারের সাথে কানেক্ট করা যাচ্ছে না (Network Error)।",
        debug: error instanceof Error ? error.message : String(error),
        target: targetUrl
      },
      { status: 502 }
    );
  }
}

export async function GET(request) {
  return proxyRequest(request);
}

export async function POST(request) {
  return proxyRequest(request);
}

export async function PUT(request) {
  return proxyRequest(request);
}

export async function DELETE(request) {
  return proxyRequest(request);
}

export async function OPTIONS(request) {
  return proxyRequest(request);
}
