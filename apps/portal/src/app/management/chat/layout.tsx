import { ChatWorkspace } from "../../../components/management/chat/chat-workspace";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <ChatWorkspace>{children}</ChatWorkspace>;
}
