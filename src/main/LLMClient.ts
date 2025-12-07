import { WebContents } from "electron";
import {
  streamText,
  tool,
  type LanguageModel,
  type CoreMessage,
  zodSchema,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import * as dotenv from "dotenv";
import { join } from "path";
import { z } from "zod";
import type { Window } from "./Window";
import { syncServerRequest } from "./api-client";

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, "../../.env") });

interface ChatRequest {
  message: string;
  messageId: string;
}

interface StreamChunk {
  content: string;
  isComplete: boolean;
}

type LLMProvider = "openai" | "anthropic";

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-haiku-4-5-20251001",
};

const MAX_CONTEXT_LENGTH = 4000;
const DEFAULT_TEMPERATURE = 0.7;
const MAX_STEPS = 10;

export class LLMClient {
  private readonly webContents: WebContents;
  private window: Window | null = null;
  private readonly provider: LLMProvider;
  private readonly modelName: string;
  private readonly model: LanguageModel | null;
  private messages: CoreMessage[] = [];

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.provider = this.getProvider();
    this.modelName = this.getModelName();
    this.model = this.initializeModel();

    this.logInitializationStatus();
  }

  // Set the window reference after construction to avoid circular dependencies
  setWindow(window: Window): void {
    this.window = window;
  }

  private getProvider(): LLMProvider {
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === "anthropic") return "anthropic";
    return "openai"; // Default to OpenAI
  }

  private getModelName(): string {
    return process.env.LLM_MODEL || DEFAULT_MODELS[this.provider];
  }

  private initializeModel(): LanguageModel | null {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    switch (this.provider) {
      case "anthropic":
        return anthropic(this.modelName);
      case "openai":
        return openai(this.modelName);
      default:
        return null;
    }
  }

  private getApiKey(): string | undefined {
    switch (this.provider) {
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      case "openai":
        return process.env.OPENAI_API_KEY;
      default:
        return undefined;
    }
  }

  private logInitializationStatus(): void {
    if (this.model) {
      console.log(
        `✅ LLM Client initialized with ${this.provider} provider using model: ${this.modelName}`,
      );
    } else {
      const keyName =
        this.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      console.error(
        `❌ LLM Client initialization failed: ${keyName} not found in environment variables.\n` +
          `Please add your API key to the .env file in the project root.`,
      );
    }
  }

  async sendChatMessage(request: ChatRequest): Promise<void> {
    try {
      // Get screenshot from active tab if available
      let screenshot: string | null = null;
      if (this.window) {
        const activeTab = this.window.activeTab;
        if (activeTab) {
          try {
            const image = await activeTab.screenshot();
            screenshot = image.toDataURL();
          } catch (error) {
            console.error("Failed to capture screenshot:", error);
          }
        }
      }

      // Build user message content with screenshot first, then text
      const userContent: any[] = [];

      // Add screenshot as the first part if available
      if (screenshot) {
        userContent.push({
          type: "image",
          image: screenshot,
        });
      }

      // Add text content
      userContent.push({
        type: "text",
        text: request.message,
      });

      // Create user message in CoreMessage format
      const userMessage: CoreMessage = {
        role: "user",
        content: userContent.length === 1 ? request.message : userContent,
      };

      this.messages.push(userMessage);

      // Send updated messages to renderer
      this.sendMessagesToRenderer();

      if (!this.model) {
        this.sendErrorMessage(
          request.messageId,
          "LLM service is not configured. Please add your API key to the .env file.",
        );
        return;
      }

      const messages = await this.prepareMessagesWithContext(request);
      await this.streamResponse(messages, request.messageId);
    } catch (error) {
      console.error("Error in LLM request:", error);
      this.handleStreamError(error, request.messageId);
    }
  }

  clearMessages(): void {
    this.messages = [];
    this.sendMessagesToRenderer();
  }

  getMessages(): CoreMessage[] {
    return this.messages;
  }

  private sendMessagesToRenderer(): void {
    this.webContents.send("chat-messages-updated", this.messages);
  }

  private async prepareMessagesWithContext(
    _request: ChatRequest,
  ): Promise<CoreMessage[]> {
    // Get page context from active tab
    let pageUrl: string | null = null;
    let pageText: string | null = null;

    if (this.window) {
      const activeTab = this.window.activeTab;
      if (activeTab) {
        pageUrl = activeTab.url;
        try {
          pageText = await activeTab.getTabText();
        } catch (error) {
          console.error("Failed to get page text:", error);
        }
      }
    }

    // Build system message
    const systemMessage: CoreMessage = {
      role: "system",
      content: this.buildSystemPrompt(pageUrl, pageText),
    };

    // Include all messages in history (system + conversation)
    return [systemMessage, ...this.messages];
  }

  private buildSystemPrompt(
    url: string | null,
    pageText: string | null,
  ): string {
    const parts: string[] = [
      "You are a helpful AI assistant integrated into a web browser.",
      "You can analyze and discuss web pages with the user.",
      "The user's messages may include screenshots of the current page as the first image.",
    ];

    if (url) {
      parts.push(`\nCurrent page URL: ${url}`);
    }

    if (pageText) {
      const truncatedText = this.truncateText(pageText, MAX_CONTEXT_LENGTH);
      parts.push(`\nPage content (text):\n${truncatedText}`);
    }

    parts.push(
      "\nPlease provide helpful, accurate, and contextual responses about the current webpage.",
      "If the user asks about specific content, refer to the page content and/or screenshot provided.",
    );

    return parts.join("\n");
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  private getTools() {
    return {
      create_scheduled_task: tool({
        description:
          "Create a scheduled task that runs on a regular interval defined by cron syntax. The browser agent will execute the given prompt at each scheduled time. Ask follow-up questions if you cannot construct an adequate prompt.",
        inputSchema: zodSchema(
          z.object({
            cron: z
              .string()
              .describe(
                'Cron syntax string defining when the task should run (e.g., "0 0 9 * * *" for 9am daily, "0 */30 * * * *" for every 30 minutes, "0 0 0 * * 0" for weekly on Sunday). The format is [second] [minute] [hour] [day of month] [month] [day of week]',
              ),
            instruction: z
              .string()
              .describe(
                "The exact instruction that the agent should execute at each scheduled interval. Do not include the interval in the instruction.",
              ),
          }),
        ),
        execute: async ({ cron, instruction }) => {
          console.log("📅 Create Scheduled Task Tool Called:");
          console.log("  Cron:", cron);
          console.log("  Instruction:", instruction);

          try {
            const response = await syncServerRequest("/tasks/schedule", {
              method: "POST",
              body: { cron, instruction },
            });

            if (!response.ok) {
              const error = await response.text();
              console.error("Failed to schedule task:", error);
              return {
                success: false,
                message: `Failed to schedule task: ${error}`,
              };
            }

            console.log("✅ Task scheduled successfully");
            return {
              success: true,
              message: `Task scheduled with cron "${cron}"`,
            };
          } catch (error) {
            console.error("Error scheduling task:", error);
            return {
              success: false,
              message: `Error scheduling task: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        },
      }),
      list_scheduled_tasks: tool({
        description:
          "List all scheduled tasks for the user. Shows task ID, cron schedule, and instruction.",
        inputSchema: zodSchema(z.object({})),
        execute: async () => {
          console.log("📋 List Scheduled Tasks Tool Called");

          try {
            const response = await syncServerRequest("/tasks", {
              method: "GET",
            });

            if (!response.ok) {
              const error = await response.text();
              console.error("Failed to list tasks:", error);
              return {
                success: false,
                message: `Failed to list tasks: ${error}`,
              };
            }

            const data = await response.json();
            console.log(`✅ Retrieved ${data.tasks?.length || 0} tasks`);

            return {
              success: true,
              tasks: data.tasks || [],
            };
          } catch (error) {
            console.error("Error listing tasks:", error);
            return {
              success: false,
              message: `Error listing tasks: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        },
      }),
      delete_scheduled_task: tool({
        description:
          "Delete a scheduled task by its ID. Use list_scheduled_tasks first to get the task IDs.",
        inputSchema: zodSchema(
          z.object({
            taskId: z.number().describe("The ID of the task to delete"),
          }),
        ),
        execute: async ({ taskId }) => {
          console.log("🗑️  Delete Scheduled Task Tool Called:");
          console.log("  Task ID:", taskId);

          try {
            const response = await syncServerRequest(`/tasks/${taskId}`, {
              method: "DELETE",
            });

            if (!response.ok) {
              const error = await response.text();
              console.error("Failed to delete task:", error);
              return {
                success: false,
                message: `Failed to delete task: ${error}`,
              };
            }

            console.log("✅ Task deleted successfully");
            return {
              success: true,
              message: `Task ${taskId} deleted successfully`,
            };
          } catch (error) {
            console.error("Error deleting task:", error);
            return {
              success: false,
              message: `Error deleting task: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        },
      }),
    };
  }

  private async streamResponse(
    messages: CoreMessage[],
    messageId: string,
  ): Promise<void> {
    if (!this.model) {
      throw new Error("Model not initialized");
    }

    let currentMessages = [...messages];
    let stepCount = 0;

    while (stepCount < MAX_STEPS) {
      stepCount++;

      const result = streamText({
        model: this.model,
        messages: currentMessages,
        temperature: DEFAULT_TEMPERATURE,
        maxRetries: 3,
        tools: this.getTools(),
      });

      const { hasToolCalls, newMessages } = await this.processStream(
        result,
        messageId,
      );

      // If no tool calls were made, we're done
      if (!hasToolCalls) {
        break;
      }

      // Add new messages (tool calls and results) for next iteration
      currentMessages = [...currentMessages, ...newMessages];
    }

    // Ensure we always send the complete signal at the very end
    this.sendStreamChunk(messageId, {
      content: "",
      isComplete: true,
    });
  }

  private async processStream(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: any,
    messageId: string,
  ): Promise<{ hasToolCalls: boolean; newMessages: CoreMessage[] }> {
    let currentStepText = "";
    let messageIndex = this.messages.length;
    const newMessages: CoreMessage[] = [];
    let hasToolCalls = false;

    let currentToolCalls: Array<{
      toolCallId: string;
      toolName: string;
      input: unknown;
    }> = [];

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        currentStepText += part.text;

        // Update or create assistant message for current step
        if (this.messages.length <= messageIndex) {
          this.messages.push({ role: "assistant", content: currentStepText });
        } else {
          this.messages[messageIndex] = {
            role: "assistant",
            content: currentStepText,
          };
        }
        this.sendMessagesToRenderer();

        this.sendStreamChunk(messageId, {
          content: part.text,
          isComplete: false,
        });
      } else if (part.type === "tool-call") {
        hasToolCalls = true;
        currentToolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });

        // Build assistant message with tool calls for UI
        const toolCallParts = currentToolCalls.map((tc) => ({
          type: "tool-call" as const,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input,
        }));

        const toolCallMessage: CoreMessage = {
          role: "assistant",
          content: [
            ...(currentStepText
              ? [{ type: "text" as const, text: currentStepText }]
              : []),
            ...toolCallParts,
          ],
        };

        if (this.messages.length <= messageIndex) {
          this.messages.push(toolCallMessage);
          newMessages.push(toolCallMessage);
        } else {
          this.messages[messageIndex] = toolCallMessage;
          // Update the last new message if it was the assistant message
          if (
            newMessages.length > 0 &&
            newMessages[newMessages.length - 1].role === "assistant"
          ) {
            newMessages[newMessages.length - 1] = toolCallMessage;
          } else {
            newMessages.push(toolCallMessage);
          }
        }
        this.sendMessagesToRenderer();
      } else if (part.type === "tool-result") {
        // Format output for v5 - must be { type: 'json', value: ... }
        const formattedOutput = {
          type: "json" as const,
          value: part.output,
        };

        // Add tool result message
        const toolResultMessage: CoreMessage = {
          role: "tool",
          content: [
            {
              type: "tool-result" as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output: formattedOutput,
            },
          ],
        };

        messageIndex = this.messages.length;
        this.messages.push(toolResultMessage);
        newMessages.push(toolResultMessage);
        this.sendMessagesToRenderer();

        // Reset for next step
        currentStepText = "";
        currentToolCalls = [];
        messageIndex = this.messages.length;
      }
    }

    return { hasToolCalls, newMessages };
  }

  private handleStreamError(error: unknown, messageId: string): void {
    console.error("Error streaming from LLM:", error);

    const errorMessage = this.getErrorMessage(error);
    this.sendErrorMessage(messageId, errorMessage);
  }

  private getErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return "An unexpected error occurred. Please try again.";
    }

    const message = error.message.toLowerCase();

    if (message.includes("401") || message.includes("unauthorized")) {
      return "Authentication error: Please check your API key in the .env file.";
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return "Rate limit exceeded. Please try again in a few moments.";
    }

    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("econnrefused")
    ) {
      return "Network error: Please check your internet connection.";
    }

    if (message.includes("timeout")) {
      return "Request timeout: The service took too long to respond. Please try again.";
    }

    return "Sorry, I encountered an error while processing your request. Please try again.";
  }

  private sendErrorMessage(messageId: string, errorMessage: string): void {
    this.sendStreamChunk(messageId, {
      content: errorMessage,
      isComplete: true,
    });
  }

  private sendStreamChunk(messageId: string, chunk: StreamChunk): void {
    this.webContents.send("chat-response", {
      messageId,
      content: chunk.content,
      isComplete: chunk.isComplete,
    });
  }
}
