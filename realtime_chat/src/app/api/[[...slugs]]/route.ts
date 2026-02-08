import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { redis } from "@/lib/redis";
import { authMiddleware } from "./auth";
import { z } from "zod";
import { Message, realtime } from "@/lib/realtime";

const ROOM_TTL_SECONDS = 60 * 10;
const MAX_PRIVATE_USERS = 2;

const rooms = new Elysia({ prefix: "/room" })
  .post(
    "/create",
    async ({ body }) => {
      const { type, username } = body;

      // Always create a new room - simple!
      const roomId = nanoid();
      const token = nanoid();

      await redis.hset(`meta:${roomId}`, {
        connected: [token],
        createdAt: Date.now(),
        type,
        users: [username], // Simple array of usernames
      });

      await redis.expire(`meta:${roomId}`, ROOM_TTL_SECONDS);

      return { roomId, token, type };
    },
    {
      body: z.object({
        type: z.enum(["group", "private"]),
        username: z.string(),
      }),
    },
  )
  .post(
    "/join",
    async ({ body }) => {
      const { roomId, username } = body;

      const meta = await redis.hgetall<{
        connected: string[];
        createdAt: string;
        type: string;
        users: string[];
      }>(`meta:${roomId}`);

      if (!meta) {
        return { error: "room-not-found" };
      }

      // Check room capacity - only for private rooms
      if (meta.type === "private" && meta.users.length >= MAX_PRIVATE_USERS) {
        return { error: "room-full" };
      }

      const token = nanoid();
      const updatedUsers = [...meta.users, username];

      await redis.hset(`meta:${roomId}`, {
        ...meta,
        users: updatedUsers,
        connected: [...meta.connected, token],
      });

      // Broadcast user joined
      await realtime.channel(roomId).emit("chat.user_joined", {
        username,
      });

      return { roomId, token, type: meta.type };
    },
    {
      body: z.object({
        roomId: z.string(),
        username: z.string(),
      }),
    },
  )
  .use(authMiddleware)
  .get(
    "/ttl",
    async ({ auth }) => {
      const ttl = await redis.ttl(`meta:${auth.roomId}`);
      return { ttl: ttl > 0 ? ttl : 0 };
    },
    { query: z.object({ roomId: z.string() }) },
  )
  .get(
    "/users",
    async ({ auth }) => {
      const meta = await redis.hgetall<{
        users: string[];
        type: string;
      }>(`meta:${auth.roomId}`);

      return {
        users: meta?.users || [],
        type: meta?.type || "private",
      };
    },
    { query: z.object({ roomId: z.string() }) },
  )
  .delete(
    "/leave",
    async ({ auth }) => {
      const meta = await redis.hgetall<{
        connected: string[];
        users: string[];
        type: string;
      }>(`meta:${auth.roomId}`);

      if (!meta) return { success: false };

      // Find username by token
      const tokenIndex = meta.connected.indexOf(auth.token);
      const username = meta.users[tokenIndex];

      // Remove user and token at same index
      const updatedUsers = meta.users.filter((_, i) => i !== tokenIndex);
      const updatedConnected = meta.connected.filter((t) => t !== auth.token);

      if (updatedUsers.length === 0) {
        // Last user left - destroy room
        await Promise.all([
          redis.del(`meta:${auth.roomId}`),
          redis.del(`messages:${auth.roomId}`),
        ]);

        await realtime.channel(auth.roomId).emit("chat.destroy", {
          isDestroyed: true,
        });
      } else {
        // Update room
        await redis.hset(`meta:${auth.roomId}`, {
          ...meta,
          users: updatedUsers,
          connected: updatedConnected,
        });

        // Broadcast user left
        await realtime.channel(auth.roomId).emit("chat.user_left", {
          username,
        });
      }

      return { success: true };
    },
    { query: z.object({ roomId: z.string() }) },
  )
  .delete(
    "/",
    async ({ auth }) => {
      const meta = await redis.hgetall<{
        type: string;
      }>(`meta:${auth.roomId}`);

      // Only private rooms can be manually destroyed
      if (meta?.type === "group") {
        throw new Error("Cannot manually destroy group rooms");
      }

      await realtime
        .channel(auth.roomId)
        .emit("chat.destroy", { isDestroyed: true });

      await Promise.all([
        redis.del(`meta:${auth.roomId}`),
        redis.del(`messages:${auth.roomId}`),
      ]);

      return { success: true };
    },
    { query: z.object({ roomId: z.string() }) },
  );

const messages = new Elysia({ prefix: "/messages" })
  .use(authMiddleware)
  .post(
    "/",
    async ({ body, auth }) => {
      const { sender, text } = body;
      const { roomId } = auth;

      const roomExists = await redis.exists(`meta:${roomId}`);

      if (!roomExists) {
        throw new Error("Room does not exist");
      }

      const message: Message = {
        id: nanoid(),
        sender,
        text,
        timestamp: Date.now(),
        roomId,
      };

      await redis.rpush(`messages:${roomId}`, {
        ...message,
        token: auth.token,
      });
      await realtime.channel(roomId).emit("chat.message", message);

      const remaining = await redis.ttl(`meta:${roomId}`);

      await redis.expire(`messages:${roomId}`, remaining);
    },
    {
      query: z.object({ roomId: z.string() }),
      body: z.object({
        sender: z.string().max(100),
        text: z.string().max(1000),
      }),
    },
  )
  .get(
    "/",
    async ({ auth }) => {
      const messages = await redis.lrange<Message>(
        `messages:${auth.roomId}`,
        0,
        -1,
      );

      return {
        messages: messages.map((m) => ({
          ...m,
          token: m.token === auth.token ? auth.token : undefined,
        })),
      };
    },
    {
      query: z.object({
        roomId: z.string(),
      }),
    },
  );

const app = new Elysia({ prefix: "/api" }).use(rooms).use(messages);

export type App = typeof app;

export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;
