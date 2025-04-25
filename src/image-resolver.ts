// server.ts - Minimal Read Logic
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const packageJson = require('../package.json');
const { z } = require("zod");
const fsPromises = require('fs').promises;
const path = require("path");
const sharp = require('sharp'); // Import sharp

// Constants for image processing
const DEFAULT_MAX_WIDTH = 512;
const DEFAULT_MAX_HEIGHT = 512;

// Main async function
async function main() {
  const server = new McpServer({
    name: packageJson.name,
    version: packageJson.version
  });

  // Define the Zod schema for the tool input
  const loadImageSchema = {
      imageName: z.string().describe("The name of the image file (e.g., 'happy.png')")
  };

  // Define 'resolve_image' tool with full logic
  server.tool(
    "resolve_image",
    loadImageSchema,
    async (args: { imageName?: string }) => {
      // Get IMAGE_ROOT
      const imageRoot = process.env.IMAGE_ROOT;
      if (typeof imageRoot !== 'string' || imageRoot === '') {
        return { isError: true, content: [{ type: "text", text: "Server Configuration Error: IMAGE_ROOT is not set." }] };
      }

      // Get imageName
      const imageName = args.imageName;
      if (typeof imageName !== 'string' || imageName === '') {
        return { isError: true, content: [{ type: "text", text: "Invalid arguments: 'imageName' is required." }] };
      }

      // --- Start of File Processing Logic ---
      let filePath: string = "";
      try {
          // Construct full file path
          filePath = path.join(imageRoot, imageName);

          // Verify file existence (optional but good practice)
          await fsPromises.access(filePath); // Throws error if file doesn't exist

          // Read file as buffer
          let imageBuffer = await fsPromises.readFile(filePath);

          // --- Start Sharp Processing ---
          let metadata = await sharp(imageBuffer).metadata();

          // Resize if necessary
          if (metadata.width && metadata.height) {
            const targetWidth = Math.min(metadata.width, DEFAULT_MAX_WIDTH);
            const targetHeight = Math.min(metadata.height, DEFAULT_MAX_HEIGHT);

            if (metadata.width > targetWidth || metadata.height > targetHeight) {
              imageBuffer = await sharp(imageBuffer)
                .resize({
                  width: targetWidth,
                  height: targetHeight,
                  fit: 'inside',
                  withoutEnlargement: true
                })
                .toBuffer();
              // Update metadata after resize
              metadata = await sharp(imageBuffer).metadata();
            }
          }
          // --- End Sharp Processing ---

          // Determine MIME type from metadata or extension
          let mime_type = metadata.format ? `image/${metadata.format}` : 'application/octet-stream';
          const extension = path.extname(imageName).toLowerCase(); // Keep extension for format guess if needed
          // Refine common MIME types based on sharp's format detection
          if (metadata.format === 'jpeg') mime_type = 'image/jpeg'; 
          else if (metadata.format === 'png') mime_type = 'image/png';
          else if (metadata.format === 'gif') mime_type = 'image/gif';
          else if (metadata.format === 'webp') mime_type = 'image/webp';
          // Add more specific checks if sharp returns other formats

          // Perform Base64 encoding on the processed buffer
          const base64 = imageBuffer.toString('base64');
          
          // Return structure with processed image data and metadata
          return {
            content: [
              { 
                type: "text", 
                text: JSON.stringify({ 
                  width: metadata.width,
                  height: metadata.height,
                  format: metadata.format,
                  size: imageBuffer.length // Size after processing
                })
              },
              {
                type: "image",
                data: base64,      // Use 'data' field with processed base64
                mimeType: mime_type // Use 'mimeType' field (camelCase)
              }
            ]
          };

      } catch (processingError: any) {
          // Handle file not found and other errors
          if (processingError.code === 'ENOENT') {
              // Log using imageName instead of potentially unassigned filePath
              return { isError: true, content: [{ type: "text", text: `❌ 이미지 파일을 찾을 수 없습니다: ${imageName}` }] };
          } else {
              // Log using imageName or a generic message if path construction failed
              const attemptedPath = filePath ? filePath : path.join(imageRoot, imageName); // Try to reconstruct path for logging if available
              return { isError: true, content: [{ type: "text", text: `❌ 이미지 파일을 처리하는 중 오류 발생: ${processingError.message || processingError}` }] };
          }
      }
      // --- End of File Processing Logic ---
    }
  );

  // Server connect and run
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server connected via stdio.");

  process.stdin.resume();
}

// Correctly placed main execution and catch block
main().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
