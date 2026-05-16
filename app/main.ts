import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import OpenAI from "openai";

const readTool = {
  type: "function",
  function: {
    name: "Read",
    description: "Read and return the contents of a file",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to read",
        },
      },
      required: ["file_path"],
    },
  },
} as const;

const writeTool = {
  type: "function",
  function: {
    name: "Write",
    description: "Write content to a file",
    parameters: {
      type: "object",
      required: ["file_path", "content"],
      properties: {
        file_path: {
          type: "string",
          description: "The path of the file to write to",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
    },
  },
} as const;

type NormalizedToolCall = {
  id: string;
  name?: string;
  arguments?: unknown;
  original: unknown;
};

function parseArguments(rawArguments: unknown): Record<string, unknown> {
  if (typeof rawArguments === "string") {
    return JSON.parse(rawArguments || "{}");
  }

  if (rawArguments && typeof rawArguments === "object") {
    return rawArguments as Record<string, unknown>;
  }

  return {};
}

function extractToolCalls(message: unknown): NormalizedToolCall[] {
  const rawMessage = message as any;

  // OpenAI/OpenRouter normalized format:
  // message.tool_calls[n].function.name / .arguments
  const openAiStyleCalls = rawMessage?.tool_calls ?? rawMessage?.toolCalls;
  if (Array.isArray(openAiStyleCalls) && openAiStyleCalls.length > 0) {
    return openAiStyleCalls.map((toolCall: any, index: number) => ({
      id: String(toolCall.id ?? `tool_call_${index}`),
      name: toolCall.function?.name ?? toolCall.name,
      arguments:
        toolCall.function?.arguments ??
        toolCall.arguments ??
        toolCall.input,
      original: toolCall,
    }));
  }

  // Some Claude-shaped responses expose tool use as content blocks:
  // message.content = [{ type: "tool_use", id, name: "Read", input: {...} }]
  const contentBlocks = Array.isArray(rawMessage?.content) ? rawMessage.content : [];
  const toolUseBlocks = contentBlocks.filter(
    (block: any) => block?.type === "tool_use" || block?.type === "tool_call",
  );

  return toolUseBlocks.map((block: any, index: number) => ({
    id: String(block.id ?? `tool_call_${index}`),
    name: block.name ?? block.function?.name,
    arguments:
      block.input ??
      block.arguments ??
      block.function?.arguments,
    original: block,
  }));
}

function messageContentToString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block: any) => {
      if (typeof block === "string") {
        return block;
      }

      if (block?.type === "text" && typeof block.text === "string") {
        return block.text;
      }

      return "";
    })
    .join("");
}

function executeToolCall(toolCall: NormalizedToolCall): string {
  const functionName = toolCall.name?.toLowerCase();
  const args = parseArguments(toolCall.arguments);
  const filePath = args.file_path;

  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error(`${toolCall.name ?? "Tool"} tool call missing required file_path argument`);
  }

  if (functionName === "read") {
    return readFileSync(filePath, "utf8");
  }

  if (functionName === "write") {
    const content = args.content;

    if (typeof content !== "string") {
      throw new Error("Write tool call missing required content argument");
    }

    const directory = dirname(filePath);
    if (directory && directory !== ".") {
      mkdirSync(directory, { recursive: true });
    }

    writeFileSync(filePath, content, "utf8");
    return `Wrote ${content.length} bytes to ${filePath}`;
  }

  throw new Error(`unsupported tool call: ${toolCall.name}`);
}

async function main() {
  const [, , flag, ...promptParts] = process.argv;
  const prompt = promptParts.join(" ");

  if (flag !== "-p" || !prompt) {
    throw new Error("error: -p flag is required");
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseURL =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const messages: any[] = [
    {
      role: "system",
      content:
        "When the user asks about a local file, use the Read tool with the exact file path from the user's message. When the user asks you to create or modify a local file, use the Write tool with the exact target path and complete file content. After receiving tool results, answer the user's question using only the needed information. If the user asks you to reply with an exact phrase, reply with exactly that phrase and nothing else after the requested work is complete.",
    },
    { role: "user", content: prompt },
  ];

  for (let iteration = 0; iteration < 10; iteration++) {
    const response = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4.5",
      messages,
      tools: [readTool, writeTool],
      tool_choice: "auto",
    });

    const message = response.choices[0]?.message;

    if (!message) {
      throw new Error("no choices in response");
    }

    messages.push(message);

    const toolCalls = extractToolCalls(message);

    if (toolCalls.length === 0) {
      const content = messageContentToString((message as any).content);
      process.stdout.write(content);
      return;
    }

    for (const toolCall of toolCalls) {
      const result = executeToolCall(toolCall);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  throw new Error("agent loop exceeded maximum iterations");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
