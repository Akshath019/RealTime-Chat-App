"use client";
import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Cookies from "js-cookie";

const Page = () => {
  return (
    <Suspense>
      <Lobby />
    </Suspense>
  );
};

export default Page;

function Lobby() {
  const { username } = useUsername();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedType, setSelectedType] = useState<"group" | "private">(
    "group",
  );

  const wasDestroyed = searchParams.get("destroyed") === "true";
  const error = searchParams.get("error");

  const { mutate: createRoom, isPending } = useMutation({
    mutationFn: async () => {
      const res = await client.room.create.post({
        type: selectedType,
        username: username,
      });

      if (res.status === 200 && res.data) {
        // Store token in cookie for authentication
        Cookies.set("x-auth-token", res.data.token, { expires: 1 });
        router.push(`/room/${res.data.roomId}`);
      }
    },
  });

  // Only show room full error for private chats
  const showRoomFullError = error === "room-full";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Error Messages */}
        {wasDestroyed && (
          <div className="bg-red-950/50 border border-red-900 p-4 text-center">
            <p className="text-red-500 text-sm font-bold">ROOM DESTROYED</p>
            <p className="text-zinc-500 text-xs mt-1">
              All messages were permanently deleted
            </p>
          </div>
        )}
        {error === "room-not-found" && (
          <div className="bg-red-950/50 border border-red-900 p-4 text-center">
            <p className="text-red-500 text-sm font-bold">ROOM NOT FOUND</p>
            <p className="text-zinc-500 text-xs mt-1">
              This room may have expired or never existed
            </p>
          </div>
        )}
        {/* Only show room full for private chat attempts */}
        {showRoomFullError && (
          <div className="bg-red-950/50 border border-red-900 p-4 text-center">
            <p className="text-red-500 text-sm font-bold">ROOM FULL</p>
            <p className="text-zinc-500 text-xs mt-1">
              This private room is at maximum capacity (2 users)
            </p>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-green-500 flex items-center justify-center gap-1">
            <span className="animate-pulse">&gt;</span>
            <span>private_chat</span>
          </h1>
          <p className="text-zinc-500 text-sm">
            Self-destructing ephemeral chat rooms
          </p>
        </div>

        {/* Main Card */}
        <div className="border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md space-y-6">
          {/* Username Display */}
          <div className="space-y-2">
            <label className="text-zinc-500 text-xs uppercase tracking-wider">
              Your Identity
            </label>
            <div className="bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-400 font-mono">
              {username}
            </div>
          </div>

          {/* Room Type Selection */}
          <div className="space-y-3">
            <label className="text-zinc-500 text-xs uppercase tracking-wider">
              Select Room Type
            </label>

            <div className="space-y-3">
              {/* Group Option */}
              <button
                onClick={() => setSelectedType("group")}
                className={`w-full p-4 text-left transition-all border ${
                  selectedType === "group"
                    ? "bg-green-500/10 border-green-500"
                    : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div
                      className={`text-sm font-bold ${
                        selectedType === "group"
                          ? "text-green-500"
                          : "text-blue-500"
                      }`}
                    >
                      GROUP CHAT
                    </div>
                    <div className="text-xs text-zinc-500">
                      Auto-join available rooms or create new
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-600">
                    <div>Max 10 users</div>
                  </div>
                </div>
              </button>

              {/* Private Option */}
              <button
                onClick={() => setSelectedType("private")}
                className={`w-full p-4 text-left transition-all border ${
                  selectedType === "private"
                    ? "bg-green-500/10 border-green-500"
                    : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div
                      className={`text-sm font-bold ${
                        selectedType === "private"
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      PRIVATE CHAT
                    </div>
                    <div className="text-xs text-zinc-500">
                      One-on-one encrypted conversation
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-600">
                    <div>2 users only</div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Create Button */}
          <button
            onClick={() => createRoom()}
            disabled={isPending}
            className="w-full bg-zinc-100 text-black p-3 text-sm font-bold hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending
              ? "Creating..."
              : selectedType === "group"
                ? "Find or Create Group Room"
                : "Create Private Room"}
          </button>
        </div>

        {/* Footer Info */}
        <div className="text-center">
          <p className="text-zinc-600 text-xs">
            Zero logs • No history • Auto-destruct
          </p>
        </div>
      </div>
    </main>
  );
}
