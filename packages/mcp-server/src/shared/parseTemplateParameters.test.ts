import { describe, expect, test } from "bun:test";
import { parseTemplateParameters } from "./parseTemplateParameters";
import { PromptParameterSchema } from "shared";

describe("parseTemplateParameters", () => {
  test("returns empty array for content without parameters", () => {
    const content = "No parameters here";
    const result = parseTemplateParameters(content);
    PromptParameterSchema.array().assert(result);
    expect(result).toEqual([]);
  });

  test("parses single parameter without description", () => {
    const content = '<% tp.user.promptArg("name") %>';
    // La función ahora detecta tp.user.promptArg
    const result = parseTemplateParameters(content);
    PromptParameterSchema.array().assert(result);
    expect(result).toEqual([{ name: "name" }]);
  });

  test("parses single parameter with description", () => {
    const content = '<% tp.user.promptArg("name", "Enter your name") %>';
    // La función ahora detecta tp.user.promptArg
    const result = parseTemplateParameters(content);
    PromptParameterSchema.array().assert(result);
    expect(result).toEqual([{ name: "name", description: "Enter your name" }]);
  });

  test("parses multiple parameters", () => {
    const content = `
      <% tp.user.promptArg("name", "Enter your name") %>
      <% tp.user.promptArg("age", "Enter your age") %>
    `;
    // La función ahora detecta tp.user.promptArg
    const result = parseTemplateParameters(content);
    PromptParameterSchema.array().assert(result);
    expect(result).toEqual([
      { name: "name", description: "Enter your name" },
      { name: "age", description: "Enter your age" },
    ]);
  });

  test("ignores invalid template syntax", () => {
    const content = `
    <% invalid.syntax %>
    <% tp.user.promptArg("name", "Enter your name") %>
    `;
    // La función ahora detecta tp.user.promptArg
    const result = parseTemplateParameters(content);
    PromptParameterSchema.array().assert(result);
    expect(result).toEqual([{ name: "name", description: "Enter your name" }]);
  });
});
