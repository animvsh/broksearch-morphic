import { ChatPlayground } from '@/components/playground/chat-playground';

export default function PlaygroundPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-xl font-semibold">Brok Playground</h1>
        <p className="text-sm text-muted-foreground">
          Test Brok models, see streaming responses, and get code snippets
        </p>
      </div>
      <ChatPlayground />
    </div>
  );
}
