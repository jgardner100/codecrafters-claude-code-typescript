# AI Agent CLI Tool

## Overview

This is an AI-powered command-line agent built with TypeScript that leverages Claude AI (via OpenRouter) to execute file operations and shell commands. The agent can read files, write files, and execute bash commands based on natural language instructions.

## What It Does

The application implements an agentic loop that:

1. **Accepts natural language prompts** - Users provide instructions via the `-p` command-line flag
2. **Communicates with Claude AI** - Sends prompts to Anthropic's Claude Haiku model via OpenRouter API
3. **Executes tool calls** - Claude can request the agent to:
   - **Read files** - Retrieve file contents
   - **Write files** - Create or modify files with specific content
   - **Execute bash commands** - Run shell commands for filesystem operations
4. **Iterates intelligently** - Continues the conversation loop for up to 10 iterations, allowing Claude to refine requests and achieve complex tasks

## How It Works

### Architecture

The agent follows a standard agentic pattern:

```
User Prompt → Claude AI → Tool Calls → Tool Execution → Results → Claude Response → Output
```

### Key Components

#### Tool Definitions
Three tools are defined for Claude to use:

- **Read Tool** - Reads and returns file contents
- **Write Tool** - Writes content to files (creates directories as needed)
- **Bash Tool** - Executes shell commands with full output capture

#### Tool Call Handling

The application normalizes tool calls from different AI providers:
- **OpenAI/OpenRouter format** - `message.tool_calls[].function.name|arguments`
- **Claude format** - Content blocks with `type: "tool_use"`

#### Execution Loop

1. Sends user prompt + message history to Claude
2. Receives response with potential tool calls
3. Extracts and validates tool calls
4. Executes each tool call and captures results
5. Appends tool results to message history
6. Repeats until Claude provides a final text response or max iterations reached (10)

### Usage

```bash
npx ts-node app/main.ts -p "your instruction here"
```

**Environment Variables Required:**
- `OPENROUTER_API_KEY` - Your OpenRouter API key for accessing Claude
- `OPENROUTER_BASE_URL` (optional) - Defaults to `https://openrouter.ai/api/v1`

### Examples

```bash
# Read a file
npx ts-node app/main.ts -p "What's in package.json?"

# Create a file
npx ts-node app/main.ts -p "Create a file called test.txt with the content 'Hello World'"

# Complex operation
npx ts-node app/main.ts -p "Create a directory called 'logs' and write the current date to a file called 'logs/timestamp.txt'"

# Execute commands
npx ts-node app/main.ts -p "List all TypeScript files in the current directory"
```

## System Behavior

The agent operates with a system prompt that instructs Claude to:
- Use the **Read** tool when asked about local files
- Use the **Write** tool when asked to create or modify files
- Use the **Bash** tool for shell operations
- Provide concise answers using only necessary information
- Follow exact instructions when requested

## Error Handling

The application includes robust error handling for:
- Missing API key configuration
- Invalid tool arguments
- Command execution failures
- File I/O errors
- Exceeding maximum iteration limit (10)

All errors are caught and printed to stderr with a non-zero exit code.

## Dependencies

- **OpenAI SDK** - For API communication (works with OpenRouter)
- **Node.js built-ins** - `child_process`, `fs`, `path`

## Limitations

- Maximum 10 agentic iterations per request to prevent infinite loops
- 10MB max buffer for bash command output
- Requires valid OpenRouter API credentials
- Claude Haiku model is used (balance of speed and capability)

## Future Enhancements

- Support for additional tools (network requests, database queries)
- Configurable model selection
- Streaming response support
- Tool call retry logic
- Custom system prompts
