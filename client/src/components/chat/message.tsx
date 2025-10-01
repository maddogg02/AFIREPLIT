import { User, Bot } from "lucide-react";
import { type ChatMessage } from "@shared/schema";
import SourceReference from "./source-reference";
import ReactMarkdown from "react-markdown";

interface MessageProps {
  message: ChatMessage;
}

export default function Message({ message }: MessageProps) {
  const isUser = message.role === "user";
  const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
          <Bot className="h-4 w-4 text-accent-foreground" />
        </div>
      )}
      
      <div className={`space-y-2 max-w-[80%] ${isUser ? "items-end" : ""}`}>
        <div
          className={`p-3 rounded-lg ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          }`}
          data-testid={`message-${message.id}`}
        >
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown 
              components={{
                h2: ({children}) => <h2 className="text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h2>,
                ul: ({children}) => <ul className="list-disc pl-4 my-2 space-y-1">{children}</ul>,
                li: ({children}) => <li className="text-sm">{children}</li>,
                p: ({children}) => <p className="text-sm my-1">{children}</p>
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        
        {/*!isUser && message.sources && (
          <SourceReference sources={message.sources} />
        )*/}
        
        <p className={`text-xs text-muted-foreground ${isUser ? "text-right" : ""}`}>
          {timestamp}
        </p>
      </div>
      
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}
