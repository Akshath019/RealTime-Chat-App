import { NextRequest, NextResponse } from "next/server";
import { redis } from "./lib/redis";
import { nanoid } from "nanoid";

function isBot(userAgent: string): boolean {
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /whatsapp/i,
    /telegram/i,
    /slack/i,
    /discord/i,
    /twitter/i,
    /facebook/i,
    /linkedin/i,
    /preview/i,
    /prefetch/i,
  ];
  return botPatterns.some((pattern) => pattern.test(userAgent));
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const roomMatch = pathname.match(/^\/room\/([^/]+)$/);

  if (!roomMatch) return NextResponse.redirect(new URL("/", req.url));

  const roomId = roomMatch[1];

  const roomExists = await redis.exists(`meta:${roomId}`);
  if (!roomExists) {
    return NextResponse.redirect(new URL("/?error=room-not-found", req.url));
  }

  // Check if this is a bot/crawler/preview request
  const userAgent = req.headers.get("user-agent") || "";
  if (isBot(userAgent)) {
    // Allow bots to access the page for preview, but don't add them to the room
    return NextResponse.next();
  }

  const existingToken = req.cookies.get("x-auth-token")?.value;

  if (existingToken) {
    const isMember = await redis.sismember(`connected:${roomId}`, existingToken);
    if (isMember) {
      return NextResponse.next();
    }
  }

  // Atomically check capacity and add user (prevents race conditions)
  const token = nanoid();
  const added = await redis.eval(
    `local count = redis.call('SCARD', KEYS[1])
     if count >= 2 then return 0 end
     redis.call('SADD', KEYS[1], ARGV[1])
     return 1`,
    [`connected:${roomId}`],
    [token],
  );

  if (added === 0) {
    return NextResponse.redirect(new URL("/?error=room-full", req.url));
  }

  const response = NextResponse.next();

  response.cookies.set("x-auth-token", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  // Sync TTL with the room
  const ttl = await redis.ttl(`meta:${roomId}`);
  if (ttl > 0) {
    await redis.expire(`connected:${roomId}`, ttl);
  }

  return response;
}

export const config = {
  matcher: "/room/:path*",
};
