import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { generateDxfFiles } from "./lib/dxf";
import { generatePdfFiles } from "./lib/pdf";
import { traceImageToDxf, traceImageToSvg } from "./lib/trace";
import JSZip from "jszip";

const LabelLineSchema = t.Object({
  text: t.String(),
  textSizeMm: t.Number(),
  spacingTopMm: t.Union([t.String(), t.Number()]),
  spacingLeftMm: t.Union([t.String(), t.Number()]),
});

const LabelSetupSchema = t.Object({
  name: t.Optional(t.String()),
  labelLengthMm: t.Number(),
  labelHeightMm: t.Number(),
  labelThicknessMm: t.Number(),
  labelColourBackground: t.String(),
  textColour: t.String(),
  labelQuantity: t.Number(),
  style: t.String(),
  noOfHoles: t.Number(),
  holeSizeMm: t.Number(),
  holeDistanceMm: t.Number(),
  holeType: t.Optional(t.Union([t.Literal("circle"), t.Literal("square")])),
  holeLengthMm: t.Optional(t.Number()),
  holeHeightMm: t.Optional(t.Number()),
  lines: t.Array(LabelLineSchema),
});

const ExportBodySchema = t.Object({
  labelSetups: t.Array(LabelSetupSchema),
  projectName: t.Optional(t.String()),
  sheetWidth: t.Optional(t.Number({ default: 600 })),
  sheetHeight: t.Optional(t.Number({ default: 300 })),
});

const app = new Elysia()
  .use(cors())
  .get("/", () => ({
    message: "Elysia Export API",
    endpoints: {
      "/export/dxf": "POST - Generate DXF + PDF files (ZIP)",
      "/export/pdf": "POST - Generate PDF files only (ZIP)",
      "/export/trace": "POST - Trace PNG bitmap to DXF vector",
      "/health": "GET - Health check",
    },
  }))
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .post(
    "/export/dxf",
    async ({ body, set }) => {
      try {
        const { labelSetups, projectName, sheetWidth = 600, sheetHeight = 300 } = body;

        if (!labelSetups || labelSetups.length === 0) {
          set.status = 400;
          return { error: "No label setups provided" };
        }

        const sheetConfig = {
          width: sheetWidth,
          height: sheetHeight,
          margin: 0,
          gap: 0,
        };

        const dxfFiles = generateDxfFiles(labelSetups, projectName || "Labels", sheetConfig);
        const pdfFiles = await generatePdfFiles(labelSetups, projectName || "Labels", sheetConfig);

        if (dxfFiles.length === 0 && pdfFiles.length === 0) {
          set.status = 500;
          return { error: "No files generated" };
        }

        const zip = new JSZip();
        
        for (const file of dxfFiles) {
          zip.file(file.filename, file.content);
        }
        
        for (const file of pdfFiles) {
          zip.file(file.filename, file.content);
        }

        const zipBuffer = await zip.generateAsync({ type: "uint8array" });
        const zipFilename = `${projectName || "Labels"}.zip`;

        set.headers["Content-Type"] = "application/zip";
        set.headers["Content-Disposition"] = `attachment; filename="${zipFilename}"`;

        return new Response(zipBuffer as BodyInit, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${zipFilename}"`,
          },
        });
      } catch (error) {
        console.error("Error generating DXF:", error);
        set.status = 500;
        return { error: "Failed to generate DXF file" };
      }
    },
    { body: ExportBodySchema }
  )
  .post(
    "/export/pdf",
    async ({ body, set }) => {
      try {
        const { labelSetups, projectName, sheetWidth = 600, sheetHeight = 300 } = body;

        if (!labelSetups || labelSetups.length === 0) {
          set.status = 400;
          return { error: "No label setups provided" };
        }

        const sheetConfig = {
          width: sheetWidth,
          height: sheetHeight,
          margin: 0,
          gap: 0,
        };

        const pdfFiles = await generatePdfFiles(labelSetups, projectName || "Labels", sheetConfig);

        if (pdfFiles.length === 0) {
          set.status = 500;
          return { error: "No PDF files generated" };
        }

        const zip = new JSZip();
        for (const file of pdfFiles) {
          zip.file(file.filename, file.content);
        }

        const zipBuffer = await zip.generateAsync({ type: "uint8array" });
        const zipFilename = `${projectName || "Labels"}_PDF.zip`;

        return new Response(zipBuffer as BodyInit, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${zipFilename}"`,
          },
        });
      } catch (error) {
        console.error("Error generating PDF:", error);
        set.status = 500;
        return { error: "Failed to generate PDF file" };
      }
    },
    { body: ExportBodySchema }
  )
  .post(
    "/export/trace",
    async ({ body, set }) => {
      try {
        const formData = body as { image: File; threshold?: string; format?: string };
        const { image, threshold, format } = formData;

        if (!image || !(image instanceof File)) {
          set.status = 400;
          return { error: "No image file provided. Send as multipart/form-data with 'image' field." };
        }

        const allowedTypes = ["image/png", "image/jpeg", "image/bmp", "image/gif"];
        if (!allowedTypes.includes(image.type)) {
          set.status = 400;
          return { error: `Invalid file type: ${image.type}. Allowed: PNG, JPEG, BMP, GIF` };
        }

        const arrayBuffer = await image.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        const traceOptions = {
          threshold: threshold ? parseInt(threshold, 10) : 128,
        };

        const outputFormat = format || "dxf";

        if (outputFormat === "svg") {
          const svg = await traceImageToSvg(imageBuffer, traceOptions);
          const filename = image.name.replace(/\.[^/.]+$/, "") + ".svg";

          return new Response(svg, {
            headers: {
              "Content-Type": "image/svg+xml",
              "Content-Disposition": `attachment; filename="${filename}"`,
            },
          });
        }

        const { dxf, svg } = await traceImageToDxf(imageBuffer, traceOptions);
        const baseName = image.name.replace(/\.[^/.]+$/, "");

        if (format === "both") {
          const zip = new JSZip();
          zip.file(`${baseName}.dxf`, dxf);
          zip.file(`${baseName}.svg`, svg);
          const zipBuffer = await zip.generateAsync({ type: "uint8array" });

          return new Response(zipBuffer as BodyInit, {
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": `attachment; filename="${baseName}_traced.zip"`,
            },
          });
        }

        const filename = baseName + ".dxf";
        return new Response(dxf, {
          headers: {
            "Content-Type": "application/dxf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      } catch (error) {
        console.error("Error tracing image:", error);
        set.status = 500;
        return { error: "Failed to trace image to vector" };
      }
    },
    {
      body: t.Object({
        image: t.File(),
        threshold: t.Optional(t.String()),
        format: t.Optional(t.String()),
      }),
    }
  )
const isVercel = process.env.VERCEL === "1";

if (!isVercel) {
  app.listen(3001);
  console.log(`Elysia Export API running at http://localhost:${app.server?.port}`);
}

export default app;
export type App = typeof app;
