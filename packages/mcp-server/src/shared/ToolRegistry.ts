import { type, type Type } from "arktype";
import { formatMcpError } from "./formatMcpError.js";
import type { Simplify } from './types';
import { logger } from "./logger.js";

type Result = {};
class McpError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = 'McpError';
  }
}

enum ErrorCode {
  InvalidParams = 'INVALID_PARAMS',
  InternalError = 'INTERNAL_ERROR',
  InvalidRequest = 'INVALID_REQUEST',
}

interface HandlerContext { }
interface ToolMetadata {
  name: string;
  description?: string;
  inputSchema: any;
}

const textResult = type({
  type: '"text"',
  text: "string",
});
const imageResult = type({
  type: '"image"',
  data: "string.base64",
  mimeType: "string",
});
const resultSchema = type({
  content: textResult.or(imageResult).array(),
  "isError?": "boolean",
});

type ResultSchema = typeof resultSchema.infer;

type SimplifiedTool = Simplify<ToolMetadata>

export class ToolRegistryClass<
  TSchema extends Type<
    {
      name: string;
      arguments?: Record<string, unknown>;
    },
    {}
  >,
  THandler extends (
    request: TSchema["infer"],
    context: HandlerContext,
  ) => Promise<Result>,
> extends Map<TSchema, THandler> {
  private enabled = new Set<TSchema>();

  register<
    Schema extends TSchema,
    Handler extends (
      request: Schema["infer"],
      context: HandlerContext,
    ) => ResultSchema | Promise<ResultSchema>,
  >(schema: Schema, handler: Handler) {
    if (this.has(schema)) {
      throw new Error(`Tool already registered: ${schema.get("name")}`);
    }
    this.enable(schema);
    return super.set(
      schema as unknown as TSchema,
      handler as unknown as THandler,
    );
  }

  enable = <Schema extends TSchema>(schema: Schema) => {
    this.enabled.add(schema);
    return this;
  };

  disable = <Schema extends TSchema>(schema: Schema) => {
    this.enabled.delete(schema);
    return this;
  };

  list = () => {
    const simplifiedTools = Array.from(this.enabled.values()).map(schema => {
      const tool = {
        name: (schema.get("name").toJsonSchema() as any).const,
        description: schema.description,
        inputSchema: schema.get("arguments").toJsonSchema(),
      } as SimplifiedTool;

      function simplifySchema(obj: any) {
        if (typeof obj !== 'object' || obj === null) return;

        if (obj.hasOwnProperty('additionalProperties')) {
          delete obj.additionalProperties;
        }
        for (const key in obj) {
          if (typeof obj[key] === 'object') {
            simplifySchema(obj[key]);
          }

          const unsupportedKeys = ['const', 'exclusiveMinimum'];
          if (unsupportedKeys.includes(key)) {
            delete obj[key];
          }
        }
      }

      simplifySchema(tool.inputSchema);
      return tool;
    });

    return {
      tools: simplifiedTools,
    };
  };

  private coerceBooleanParams = <Schema extends TSchema>(
    schema: Schema,
    params: Schema["infer"],
  ): Schema["infer"] => {
    const args = params.arguments;
    const argsSchema = schema.get("arguments").exclude("undefined");
    if (!args || !argsSchema) return params;

    const fixed = { ...params.arguments };
    for (const [key, value] of Object.entries(args)) {
      const valueSchema = argsSchema.get(key).exclude("undefined");
      if (
        valueSchema.expression === "boolean" &&
        typeof value === "string" &&
        ["true", "false"].includes(value)
      ) {
        fixed[key] = value === "true";
      }
    }

    return { ...params, arguments: fixed };
  };

  dispatch = async <Schema extends TSchema>(
    params: Schema["infer"],
    context: HandlerContext,
  ) => {
    try {
      for (const [schema, handler] of this.entries()) {
        if (schema.get("name").allows(params.name)) {
          const validParams = schema.assert(
            this.coerceBooleanParams(schema, params),
          );
          return await handler(validParams, context);
        }
      }
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown tool: ${params.name}`,
      );
    } catch (error) {
      const formattedError = formatMcpError(error);
      logger.error(`Error handling ${params.name}`, {
        ...formattedError,
        message: formattedError.message,
        stack: formattedError.stack,
        error,
        params,
      });
      throw formattedError;
    }
  };
}

export type ToolRegistry = ToolRegistryClass<
  Type<
    {
      name: string;
      arguments?: Record<string, unknown>;
    },
    {}
  >,
  (
    request: {
      name: string;
      arguments?: Record<string, unknown>;
    },
    context: HandlerContext,
  ) => Promise<Result>
>;