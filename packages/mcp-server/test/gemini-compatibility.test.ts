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
          "format?": type({
            anyOf: [
              { const: "markdown" },
              { const: "html" }
            ]
          })
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
    
    // Verify arrays have items definition
    expect(json).toContain('"items"');
    
    // Verify enums are strings
    const formatProp = list.tools[0].inputSchema.properties.format;
    expect(formatProp.type).toBe("string");
    expect(formatProp.enum).toEqual(["markdown", "html"]);
  });

  test("Boolean parameter handling", () => {
    const tools = new ToolRegistryClass();

    tools.register(
      type({
        name: '"bool-test"',
        arguments: {
          flag: "boolean"
        },
      }),
      async () => ({ content: [] })
    );

    const params = {
      name: "bool-test",
      arguments: {
        flag: "true" // Test string representation
      }
    };
    
    const result = tools.dispatch('gemini', params, {});
    expect(result.arguments.flag).toBe(true);
  });
});
