// src/image-resolver.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
var server = new McpServer({
  name: "image-resolver",
  version: "1.1.0"
});
server.tool(
  "resolve_image",
  {
    imageName: z.string(),
    dirPath: z.string().optional()
    // 사용자가 디렉토리 직접 넘김
  },
  async ({ imageName, dirPath }) => {
    const ROOT = dirPath ?? process.env.IMAGE_ROOT;
    if (!ROOT) throw new Error("No directory specified.");
    const file = ["png", "jpg", "jpeg", "webp"].map((ext) => path.join(ROOT, `${imageName}.${ext}`)).find(fs.existsSync);
    if (!file) throw new Error(`"${imageName}" not found in "${ROOT}"`);
    const imageData = fs.readFileSync(file);
    return {
      content: [
        {
          type: "image",
          data: imageData.toString("base64"),
          mimeType: "image/" + path.extname(file).slice(1)
        }
      ]
    };
  }
);
var transport = new StdioServerTransport();
await server.connect(transport);
