import { logger, type ToolRegistry, ToolRegistryClass } from "$/shared";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFetchTool } from "../fetch";
import { registerLocalRestApiTools } from "../local-rest-api";
import { setupObsidianPrompts } from "../prompts";
import { registerSmartConnectionsTools } from "../smart-connections";
import { registerTemplaterTools } from "../templates";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export class ObsidianMcpServer {
  private server: Server;
  private tools: ToolRegistry;
  private currentModel: 'openai' | 'gemini' | 'anthropic' = 'openai';

  constructor(initialModel: 'openai' | 'gemini' | 'anthropic' = 'openai') {
    this.currentModel = initialModel;
    this.server = new Server(
      {
        name: "obsidian-mcp-tools",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      },
    );

    this.tools = new ToolRegistryClass();

    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => {
      logger.error("Server error", { error });
      console.error("[MCP Tools Error]", error);
    };
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers() {
    setupObsidianPrompts(this.server);

    registerFetchTool(this.tools, this.server);
    registerLocalRestApiTools(this.tools, this.server);
    registerSmartConnectionsTools(this.tools);
    registerTemplaterTools(this.tools);

    this.server.setRequestHandler(ListToolsRequestSchema, this.tools.list);
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      logger.debug("Handling request", { request });
      try {
        const response = await this.tools.dispatch(
          this.currentModel,
          request.params,
          { server: this.server }
        );
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Tool dispatch error", { error: errorMessage, stack: error instanceof Error ? error.stack : undefined });
        return {
          content: [{
            type: "text",
            text: `Error: ${errorMessage}`
          }],
          isError: true
        };
      }
      logger.debug("Request handled", { response });
      return response;
    });
  }

  setModel(newModel: 'openai' | 'gemini' | 'anthropic') {
    this.currentModel = newModel;
    logger.info(`Changed model to ${newModel}`);
    // Aquí podrías reinicializar conexiones si es necesario
    return this;
  }

  getCurrentModel() {
    return this.currentModel;
  }

  async run() {
    logger.debug("Starting server...");
    const transport = new StdioServerTransport();
    try {
      await this.server.connect(transport);
      logger.debug("Server started successfully");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.fatal("Failed to start server", { error: error.message });
      console.error("[MCP Tools Error]", error);
      process.exit(1);
    }
  }
}
