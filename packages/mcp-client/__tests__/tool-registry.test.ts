import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "../src/tool-registry.js";
import type { DiscoveredTool } from "../src/client-types.js";

const makeTool = (
  name: string,
  serverName: string = "test-server"
): DiscoveredTool => ({
  name,
  description: `Tool: ${name}`,
  serverName,
  inputSchema: { type: "object" },
});

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers and retrieves tools", () => {
    const tool = makeTool("edit_file");
    registry.register(tool, { languages: ["typescript"] });

    expect(registry.size).toBe(1);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0].name).toBe("edit_file");
  });

  it("registers bulk tools", () => {
    const tools = [makeTool("read"), makeTool("write"), makeTool("delete")];
    registry.registerBulk(tools, { languages: ["python"] });

    expect(registry.size).toBe(3);
  });

  it("queries by language", () => {
    registry.register(makeTool("ts-tool"), { languages: ["typescript"] });
    registry.register(makeTool("py-tool"), { languages: ["python"] });
    registry.register(makeTool("any-tool")); // no language restriction

    const tsTools = registry.query({ language: "typescript" });
    expect(tsTools).toHaveLength(2); // ts-tool + any-tool (no restriction = matches all)
  });

  it("queries by framework", () => {
    registry.register(makeTool("react-tool"), {
      frameworks: ["react"],
    });
    registry.register(makeTool("vue-tool"), { frameworks: ["vue"] });

    const reactTools = registry.query({ framework: "react" });
    expect(reactTools).toHaveLength(1);
    expect(reactTools[0].name).toBe("react-tool");
  });

  it("queries by task type", () => {
    registry.register(makeTool("fixer"), { taskTypes: ["bug-fix"] });
    registry.register(makeTool("tester"), { taskTypes: ["test"] });

    const fixTools = registry.query({ taskType: "bug-fix" });
    expect(fixTools).toHaveLength(1);
    expect(fixTools[0].name).toBe("fixer");
  });

  it("queries by server name", () => {
    registry.register(makeTool("tool-a", "server-1"));
    registry.register(makeTool("tool-b", "server-2"));

    const s1Tools = registry.query({ serverName: "server-1" });
    expect(s1Tools).toHaveLength(1);
    expect(s1Tools[0].serverName).toBe("server-1");
  });

  it("queries by name pattern", () => {
    registry.register(makeTool("file_read"));
    registry.register(makeTool("file_write"));
    registry.register(makeTool("git_commit"));

    const fileTools = registry.query({ namePattern: "file" });
    expect(fileTools).toHaveLength(2);
  });

  it("combines multiple query criteria", () => {
    registry.register(makeTool("ts-fix", "copilot"), {
      languages: ["typescript"],
      taskTypes: ["bug-fix"],
    });
    registry.register(makeTool("py-fix", "copilot"), {
      languages: ["python"],
      taskTypes: ["bug-fix"],
    });
    registry.register(makeTool("ts-feat", "copilot"), {
      languages: ["typescript"],
      taskTypes: ["feature"],
    });

    const results = registry.query({
      language: "typescript",
      taskType: "bug-fix",
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("ts-fix");
  });

  it("removes tools by server name", () => {
    registry.register(makeTool("a", "server-1"));
    registry.register(makeTool("b", "server-1"));
    registry.register(makeTool("c", "server-2"));

    registry.removeServer("server-1");
    expect(registry.size).toBe(1);
    expect(registry.getAll()[0].serverName).toBe("server-2");
  });

  it("clears all entries", () => {
    registry.register(makeTool("a"));
    registry.register(makeTool("b"));
    registry.clear();
    expect(registry.size).toBe(0);
  });
});
