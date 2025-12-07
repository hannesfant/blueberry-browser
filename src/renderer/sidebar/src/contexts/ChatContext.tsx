import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

interface ChatContextType {
  messages: Message[];
  isLoading: boolean;

  // Chat actions
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Convert CoreMessage to our frontend Message format
  const convertCoreMessage = (msg: any, index: number): Message => {
    const base = {
      id: `msg-${index}`,
      role: msg.role as Message["role"],
      timestamp: Date.now(),
      isStreaming: false,
    };

    // Handle different content types
    if (typeof msg.content === "string") {
      return { ...base, content: msg.content };
    }

    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find((p: any) => p.type === "text");
      const toolCallParts = msg.content.filter(
        (p: any) => p.type === "tool-call",
      );
      const toolResultParts = msg.content.filter(
        (p: any) => p.type === "tool-result",
      );

      return {
        ...base,
        content: textPart?.text || "",
        toolCalls:
          toolCallParts.length > 0
            ? toolCallParts.map((tc: any) => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                args: tc.args,
              }))
            : undefined,
        toolResults:
          toolResultParts.length > 0
            ? toolResultParts.map((tr: any) => ({
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                // Handle v5 format: output is { type: 'json', value: ... }
                result: tr.output?.value ?? tr.output ?? tr.result,
              }))
            : undefined,
      };
    }

    return { ...base, content: "" };
  };

  // Load initial messages from main process
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const storedMessages = await window.sidebarAPI.getMessages();
        if (storedMessages && storedMessages.length > 0) {
          const convertedMessages = storedMessages.map(convertCoreMessage);
          setMessages(convertedMessages);
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    };
    loadMessages();
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    setIsLoading(true);

    try {
      const messageId = Date.now().toString();

      // Send message to main process (which will handle context)
      await window.sidebarAPI.sendChatMessage({
        message: content,
        messageId: messageId,
      });

      // Messages will be updated via the chat-messages-updated event
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearChat = useCallback(async () => {
    try {
      await window.sidebarAPI.clearChat();
      setMessages([]);
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  }, []);

  const getPageContent = useCallback(async () => {
    try {
      return await window.sidebarAPI.getPageContent();
    } catch (error) {
      console.error("Failed to get page content:", error);
      return null;
    }
  }, []);

  const getPageText = useCallback(async () => {
    try {
      return await window.sidebarAPI.getPageText();
    } catch (error) {
      console.error("Failed to get page text:", error);
      return null;
    }
  }, []);

  const getCurrentUrl = useCallback(async () => {
    try {
      return await window.sidebarAPI.getCurrentUrl();
    } catch (error) {
      console.error("Failed to get current URL:", error);
      return null;
    }
  }, []);

  // Set up message listeners
  useEffect(() => {
    // Listen for streaming response updates
    const handleChatResponse = (data: {
      messageId: string;
      content: string;
      isComplete: boolean;
    }) => {
      if (data.isComplete) {
        setIsLoading(false);
      }
    };

    // Listen for message updates from main process
    const handleMessagesUpdated = (updatedMessages: any[]) => {
      const convertedMessages = updatedMessages.map(convertCoreMessage);
      setMessages(convertedMessages);
    };

    window.sidebarAPI.onChatResponse(handleChatResponse);
    window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated);

    return () => {
      window.sidebarAPI.removeChatResponseListener();
      window.sidebarAPI.removeMessagesUpdatedListener();
    };
  }, []);

  const value: ChatContextType = {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    getPageContent,
    getPageText,
    getCurrentUrl,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
