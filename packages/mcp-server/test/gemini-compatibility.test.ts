import { describe, expect, test } from "bun:test";
import { ToolRegistryClass } from "../src/shared/ToolRegistry";
import { type } from "arktype";

describe("Gemini Compatibility", () => {
  test("Schema generation for Gemini", () => {
    const tools = new ToolRegistryClass();

    // Register a test tool similar to fetch
    tools.register(
      type({
        name: '"test-tool"',
        arguments: {
          url: "string",
          "raw?": type("boolean").describe("Test parameter"),
          "format?": type('"markdown" | "html"')
        },
      }),
      async () => ({ content: [] })
    );

    const list = tools.list('gemini');
    const json = JSON.stringify(list);
    
    // Verify prohibited properties are removed
    expect(json).not.toContain("const");
    expect(json).not.toContain("anyOf");
    expect(json).not.toContain("prefixItems");
    
    // Verify arrays have items definition (only if present)
    if (list.tools[0].inputSchema.properties.format) {
      expect(json).toContain('"items"');
    }
    
    // Verify enums are strings
    const formatProp = list.tools[0].inputSchema.properties.format;
    if (formatProp) {
      expect(formatProp.type).toBe("string");
      expect(formatProp.enum).toEqual(["markdown", "html"]);
    }
  });

  test("Boolean parameter handling", async () => {
    const tools = new ToolRegistryClass();

    tools.register(
      type({
        name: '"bool-test"',
        arguments: {
          flag: "boolean"
        },
      }),
      async (request) => ({ 
        content: [{ 
          type: "text", 
          text: JSON.stringify(request.arguments) 
        }] 
      })
    );

    const params = {
      name: "bool-test",
      arguments: {
        flag: "true" // Test string representation
      }
    };
    
    const result = await tools.dispatch('gemini', params, {});
    const args = JSON.parse(result.content[0].text);
    expect(args.flag).toBe(true);
  });
});
