"use client";

import dynamic from "next/dynamic";

const WebChatBubble = dynamic(
  () => import("./web-chat-bubble").then((mod) => mod.WebChatBubble),
  { ssr: false, loading: () => null },
);

export function WebChatBubbleLazy() {
  return <WebChatBubble />;
}
