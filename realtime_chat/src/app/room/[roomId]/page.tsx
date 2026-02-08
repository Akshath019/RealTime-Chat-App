"use client";

import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { useRealtime } from "@/lib/realtime-client";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";

function formatTimeRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const Page = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.roomId as string;
  const router = useRouter();

  const { username } = useUsername();

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [copyStatus, setCopyStatus] = useState("COPY");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const isJoining = searchParams.get("action") === "join";

  useEffect(() => {
    const initializeRoom = async () => {
      const existingToken = Cookies.get("x-auth-token");

      if (!existingToken && isJoining) {
        const res = await client.room.join.post({
          roomId,
          username,
        });

        if (res.data && "error" in res.data) {
          router.push(`/?error=${res.data.error}`);
          return;
        }

        if (res.data && "token" in res.data) {
          Cookies.set("x-auth-token", res.data.token, { expires: 1 });
        }
      }
    };

    if (username) {
      initializeRoom();
    }
  }, [roomId, username, isJoining, router]);

  const { data: ttlData } = useQuery({
    queryKey: ["ttl", roomId],
    queryFn: async () => {
      const res = await client.room.ttl.get({ query: { roomId } });
      return res.data;
    },
    refetchInterval: 5000,
  });

  // Simple: just fetch users from Redis
  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ["users", roomId],
    queryFn: async () => {
      const res = await client.room.users.get({ query: { roomId } });
      return res.data;
    },
  });

  useEffect(() => {
    if (ttlData?.ttl !== undefined) setTimeRemaining(ttlData.ttl);
  }, [ttlData]);

  useEffect(() => {
    if (timeRemaining === null || timeRemaining < 0) return;
    if (timeRemaining === 0) {
      router.push("/?destroyed=true");
      return;
    }
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, router]);

  const { data: messages, refetch: refetchMessages } = useQuery({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } });
      return res.data;
    },
  });

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      await client.messages.post(
        { sender: username, text },
        { query: { roomId } },
      );
      setInput("");
    },
  });

  // Simple: when event fires, just refetch
  useRealtime({
    channels: [roomId],
    events: [
      "chat.message",
      "chat.destroy",
      "chat.user_joined",
      "chat.user_left",
    ],
    onData: ({ event, data }) => {
      if (event === "chat.message") {
        refetchMessages();
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }

      if (event === "chat.destroy") {
        router.push("/?destroyed=true");
      }

      if (event === "chat.user_joined") {
        const { username: joinedUser } = data as { username: string };
        setNotification(`${joinedUser} joined`);
        refetchUsers(); // Simple refetch
        setTimeout(() => setNotification(null), 3000);
      }

      if (event === "chat.user_left") {
        const { username: leftUser } = data as { username: string };
        setNotification(`${leftUser} left`);
        refetchUsers(); // Simple refetch
        setTimeout(() => setNotification(null), 3000);
      }
    },
  });

  const { mutate: destroyRoom } = useMutation({
    mutationFn: async () => {
      await client.room.delete(null, { query: { roomId } });
    },
    onError: () => {
      setNotification("Cannot destroy group rooms");
      setTimeout(() => setNotification(null), 3000);
    },
  });

  const { mutate: leaveRoom } = useMutation({
    mutationFn: async () => {
      await client.room.leave.delete(null, { query: { roomId } });
      Cookies.remove("x-auth-token");
      router.push("/");
    },
  });

  const copyLink = () => {
    const url = `${window.location.origin}/room/${roomId}?action=join`;
    navigator.clipboard.writeText(url);
    setCopyStatus("COPIED!");
    setTimeout(() => setCopyStatus("COPY"), 2000);
  };

  const isGroupChat = usersData?.type === "group";
  const userCount = usersData?.users?.length || 0;

  return (
    <main className="flex flex-col h-screen max-h-screen overflow-hidden">
      <header className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">Room ID</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-green-500">{roomId}</span>
              <button
                onClick={copyLink}
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {copyStatus}
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          {isGroupChat && (
            <>
              <div className="flex flex-col">
                <span className="text-xs text-zinc-500 uppercase">Users</span>
                <span className="text-sm font-bold text-blue-500">
                  {userCount}
                </span>
              </div>
              <div className="h-8 w-px bg-zinc-800" />
            </>
          )}

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">
              Self-Destruction
            </span>
            <span
              className={`text-sm font-bold ${
                timeRemaining !== null && timeRemaining < 60
                  ? "text-red-500"
                  : "text-amber-500"
              }`}
            >
              {timeRemaining !== null
                ? formatTimeRemaining(timeRemaining)
                : "--:--"}
            </span>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">Type</span>
            <span
              className={`text-sm font-bold ${isGroupChat ? "text-blue-500" : "text-red-500"}`}
            >
              {isGroupChat ? "GROUP" : "PRIVATE"}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {isGroupChat ? (
            <button
              onClick={() => leaveRoom()}
              className="text-xs bg-zinc-800 hover:bg-amber-600 px-3 py-1.5 rounded text-zinc-400 hover:text-white font-bold transition-all"
            >
              LEAVE ROOM
            </button>
          ) : (
            <button
              onClick={() => destroyRoom()}
              className="text-xs bg-zinc-800 hover:bg-red-600 px-3 py-1.5 rounded text-zinc-400 hover:text-white font-bold transition-all group flex items-center gap-2"
            >
              <span className="group-hover:animate-pulse">💣</span>DESTROY NOW
            </button>
          )}
        </div>
      </header>

      {notification && (
        <div className="bg-blue-950/50 border-b border-blue-900 p-2 text-center">
          <p className="text-blue-400 text-xs font-bold">{notification}</p>
        </div>
      )}

      {isGroupChat && usersData?.users && usersData.users.length > 0 && (
        <div className="border-b border-zinc-800 bg-zinc-900/20 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 uppercase">Active:</span>
            {usersData.users.map((user, idx) => (
              <span
                key={idx}
                className={`text-xs px-2 py-1 rounded ${
                  user === username
                    ? "bg-green-500/20 text-green-500 border border-green-500"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {user === username ? "YOU" : user}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages?.messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm font-mono">
              No messages yet, start the conversation...
            </p>
          </div>
        )}
        {messages?.messages.map((msg) => (
          <div key={msg.id} className="flex flex-col items-start">
            <div className="max-w-[80%] group">
              <div className="flex items-baseline gap-3 mb-1">
                <span
                  className={`text-xs font-bold ${
                    msg.sender === username ? "text-green-500" : "text-blue-500"
                  }`}
                >
                  {msg.sender === username ? "YOU" : msg.sender}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {format(msg.timestamp, "HH:mm")}
                </span>
              </div>

              <p className="text-sm text-zinc-300 leading-relaxed break-words">
                {msg.text}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="flex gap-4">
          <div className="flex-1 relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500 animate-pulse">
              {">"}
            </span>
            <input
              autoFocus
              value={input}
              ref={inputRef}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  sendMessage({ text: input });
                  inputRef.current?.focus();
                }
              }}
              placeholder="Type Message..."
              onChange={(e) => setInput(e.target.value)}
              type="text"
              className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-3 pl-8 pr-4 text-sm"
            />
          </div>

          <button
            onClick={() => {
              sendMessage({ text: input });
              inputRef.current?.focus();
            }}
            disabled={!input.trim() || isPending}
            className="bg-zinc-800 text-zinc-400 px-6 text-sm font-bold hover:text-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            SEND
          </button>
        </div>
      </div>
    </main>
  );
};

export default Page;
