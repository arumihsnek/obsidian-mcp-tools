import { type, type Type } from "arktype";
import { formatMcpError } from "./formatMcpError.js";
import { logger } from "./logger.js";

interface JsonSchema {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  [key: string]: unknown;
}

interface TypeWithDef<T> {
  def?: {
    value?: T;
  };
  has(key: string): boolean;
  get(key: string): TypeWithDef<unknown>;
  toJsonSchema(): JsonSchema;
  expression: string;
  description?: string;
}

type Result = {
  content: Array<{
    type: string;
    text?: string;
  }>;
};
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

type SimplifiedTool = ToolMetadata;

export class ToolRegistryClass<
  TSchema extends TypeWithDef<{
    name: string;
    arguments?: Record<string, unknown>;
  }>,
  THandler extends (
    request: TSchema["infer"],
    context: HandlerContext,
  ) => Promise<Result>,
> extends Map<TSchema, THandler> {
  private enabled = new Set<TSchema>();

  register<
    Schema extends TypeWithDef<{
      name: string;
      arguments?: Record<string, unknown>;
    }>,
    Handler extends (
      request: { name: string; arguments?: Record<string, unknown> },
      context: HandlerContext,
    ) => ResultSchema | Promise<ResultSchema>,
  >(schema: Schema, handler: Handler) {
    if (this.has(schema as unknown as TSchema)) {
      throw new Error(`Tool already registered: ${schema.get("name")}`);
    }
    const result = super.set(
      schema as unknown as TSchema,
      handler as unknown as THandler,
    );
    this.enable(schema);
    return result;
  }

  enable = <Schema extends TSchema>(schema: Schema) => {
    this.enabled.add(schema);
    return this;
  };

  disable = <Schema extends TSchema>(schema: Schema) => {
    this.enabled.delete(schema);
    return this;
  };

  list = (modelType: 'openai' | 'gemini' | 'anthropic' = 'openai') => {
    const simplifiedTools = Array.from(this.enabled.values()).map(schema => {
      // Simplificación más agresiva para Gemini
      const simplifyForGemini = modelType === 'gemini';
      const tool = {
        name: (schema.get("name").toJsonSchema() as any).const,
        description: schema.description,
        inputSchema: schema.has("arguments") 
          ? schema.get("arguments").toJsonSchema() 
          : { type: "object", properties: {} },
      } as SimplifiedTool;

      function simplifySchema(obj: any) {
        if (typeof obj !== 'object' || obj === null) return;

        // First, recurse into children
        for (const key in obj) {
          if (typeof obj[key] === 'object') {
            simplifySchema(obj[key]);
          }
        }

        // Handle anyOf: convert to enum if possible
        if (obj.anyOf) {
          // Check if every element in anyOf is a const string
          if (Array.isArray(obj.anyOf) && obj.anyOf.every((item: any) => item.const && typeof item.const === 'string')) {
            obj.enum = obj.anyOf.map((item: any) => item.const);
            obj.type = "string";
          }
        }

        // Remove all complex schema features
        const unsupportedFields = [
          'prefixItems', '$defs', 
          'anyOf', 'allOf', 'oneOf',
          'additionalProperties', 'patternProperties',
          'dependencies', 'propertyNames'
        ];
        
        unsupportedFields.forEach(field => {
          if (obj[field] !== undefined) {
            delete obj[field];
          }
        });

        // Handle arrays - ensure they have minimal items definition
        if (obj.type === 'array' && !obj.items) {
          obj.items = { type: 'string' };
        }

        // Convert const to enum if needed
        if (obj.const !== undefined) {
          obj.enum = [obj.const];
          obj.type = typeof obj.const === 'number' ? 'number' : 'string';
          delete obj.const;
        }

        // Basic type validation
        if (obj.type === undefined && obj.enum) {
          obj.type = typeof obj.enum[0] === 'number' ? 'number' : 'string';
        }

        // Remove numeric validation
        ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'].forEach(field => {
          if (obj[field] !== undefined) {
            delete obj[field];
          }
        });
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
    let argsSchema;
    if (schema.has("arguments")) {
        argsSchema = schema.get("arguments").exclude("undefined");
    }
    if (!args || !argsSchema) return params;

    const fixed = { ...params.arguments };
    for (const [key, value] of Object.entries(args)) {
        if (argsSchema.has(key)) {
            const valueSchema = argsSchema.get(key).exclude("undefined");
            if (valueSchema.expression === "boolean") {
                // Handle boolean conversion from various formats
                if (typeof value === 'string') {
                    fixed[key] = value.toLowerCase() === 'true';
                } else if (typeof value === 'number') {
                    fixed[key] = Boolean(value);
                } else if (typeof value === 'boolean') {
                    fixed[key] = value;
                }
            }
        }
    }

    return { ...params, arguments: fixed };
  };

  dispatch = async <Schema extends TSchema>(
    modelType: 'openai' | 'gemini' | 'anthropic' = 'openai',
    params: Schema["infer"],
    context: HandlerContext,
  ) => {
    try {
      for (const schema of this.enabled) {
        const handler = this.get(schema);
        if (!handler) continue;
        let toolName: string;
        try {
          // Try to get name from def.value first
          const nameField = schema.get("name");
          let toolName = 'unknown';
          if (nameField.def?.value) {
            toolName = String(nameField.def.value).replace(/^"|"$/g, '');
          } else {
            try {
              const nameJsonSchema = nameField.toJsonSchema();
              if (typeof nameJsonSchema === 'object' && nameJsonSchema !== null) {
                toolName = String(
                  (nameJsonSchema as {const?: unknown}).const ?? 
                  ((nameJsonSchema as {enum?: unknown[]}).enum?.[0]) ?? 
                  'unknown'
                );
              }
            } catch (error) {
              logger.error('Error parsing tool name schema', {error});
            }
          }
          if (toolName === params.name) {
            const validParams = new Function("return " + schema.expression)()(
              this.coerceBooleanParams(schema, params)
            );
            return await handler(validParams, context);
          }
        } catch (error) {
          logger.error('Error processing tool schema', { schema: schema.description, error });
        }
      }
      const availableTools = Array.from(this.enabled).reduce<string[]>((tools, s) => {
        try {
          const nameField = s.get("name");
          if (nameField.def?.value) {
            tools.push((nameField.def.value as string).replace(/^"|"$/g, ''));
          } else {
            const nameJsonSchema = nameField.toJsonSchema();
            const name = nameJsonSchema.const || nameJsonSchema.enum?.[0] || 'unknown';
            tools.push(name as string);
          }
        } catch (error) {
          logger.error('Error getting tool name', { error });
        }
        return tools;
      }, []);
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown tool: ${params.name}. Available tools: ${availableTools.join(', ')}`,
      );
    } catch (error) {
      const formattedError = formatMcpError(error);
      const logData = {
        ...formattedError,
        message: formattedError.message,
        stack: formattedError.stack,
        error,
        params,
      };
      logger.error(`Error handling ${params.name}`, logData);
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
