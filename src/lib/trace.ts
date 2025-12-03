import potrace from "potrace";
import makerjs from "makerjs";

interface TraceOptions {
  threshold?: number;
  turnPolicy?: string;
  turdSize?: number;
  optCurve?: boolean;
  optTolerance?: number;
  color?: string;
  background?: string;
}

interface PathCommand {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

function parseSvgPath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const regex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1];
    const args = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s !== "")
      .map(Number);

    switch (type) {
      case "M":
      case "m":
      case "L":
      case "l":
        for (let i = 0; i < args.length; i += 2) {
          commands.push({ type, x: args[i], y: args[i + 1] });
        }
        break;
      case "H":
      case "h":
        for (const arg of args) {
          commands.push({ type, x: arg });
        }
        break;
      case "V":
      case "v":
        for (const arg of args) {
          commands.push({ type, y: arg });
        }
        break;
      case "C":
      case "c":
        for (let i = 0; i < args.length; i += 6) {
          commands.push({
            type,
            x1: args[i],
            y1: args[i + 1],
            x2: args[i + 2],
            y2: args[i + 3],
            x: args[i + 4],
            y: args[i + 5],
          });
        }
        break;
      case "Z":
      case "z":
        commands.push({ type });
        break;
    }
  }

  return commands;
}

function sampleBezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  segments: number = 10
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    const x = mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0];
    const y = mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1];
    points.push([x, y]);
  }
  return points;
}

function svgPathToPolylinePoints(
  d: string,
  flipY: boolean = true,
  height: number = 0
): [number, number][][] {
  const commands = parseSvgPath(d);
  const polylines: [number, number][][] = [];
  let currentPolyline: [number, number][] = [];

  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  const transformY = (y: number) => (flipY ? height - y : y);

  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        if (currentPolyline.length > 0) {
          polylines.push(currentPolyline);
        }
        currentX = cmd.x!;
        currentY = cmd.y!;
        startX = currentX;
        startY = currentY;
        currentPolyline = [[currentX, transformY(currentY)]];
        break;
      case "m":
        if (currentPolyline.length > 0) {
          polylines.push(currentPolyline);
        }
        currentX += cmd.x!;
        currentY += cmd.y!;
        startX = currentX;
        startY = currentY;
        currentPolyline = [[currentX, transformY(currentY)]];
        break;
      case "L":
        currentX = cmd.x!;
        currentY = cmd.y!;
        currentPolyline.push([currentX, transformY(currentY)]);
        break;
      case "l":
        currentX += cmd.x!;
        currentY += cmd.y!;
        currentPolyline.push([currentX, transformY(currentY)]);
        break;
      case "H":
        currentX = cmd.x!;
        currentPolyline.push([currentX, transformY(currentY)]);
        break;
      case "h":
        currentX += cmd.x!;
        currentPolyline.push([currentX, transformY(currentY)]);
        break;
      case "V":
        currentY = cmd.y!;
        currentPolyline.push([currentX, transformY(currentY)]);
        break;
      case "v":
        currentY += cmd.y!;
        currentPolyline.push([currentX, transformY(currentY)]);
        break;
      case "C":
        const bezierPts = sampleBezier(
          [currentX, transformY(currentY)],
          [cmd.x1!, transformY(cmd.y1!)],
          [cmd.x2!, transformY(cmd.y2!)],
          [cmd.x!, transformY(cmd.y!)],
          12
        );
        currentPolyline.push(...bezierPts);
        currentX = cmd.x!;
        currentY = cmd.y!;
        break;
      case "c":
        const bezierPtsRel = sampleBezier(
          [currentX, transformY(currentY)],
          [currentX + cmd.x1!, transformY(currentY + cmd.y1!)],
          [currentX + cmd.x2!, transformY(currentY + cmd.y2!)],
          [currentX + cmd.x!, transformY(currentY + cmd.y!)],
          12
        );
        currentPolyline.push(...bezierPtsRel);
        currentX += cmd.x!;
        currentY += cmd.y!;
        break;
      case "Z":
      case "z":
        currentPolyline.push([startX, transformY(startY)]);
        currentX = startX;
        currentY = startY;
        break;
    }
  }

  if (currentPolyline.length > 0) {
    polylines.push(currentPolyline);
  }

  return polylines;
}

function createPolylineModel(points: [number, number][]): makerjs.IModel {
  const model: makerjs.IModel = { paths: {} };
  
  for (let i = 0; i < points.length - 1; i++) {
    model.paths![`line_${i}`] = {
      type: "line",
      origin: points[i],
      end: points[i + 1],
    } as makerjs.IPathLine;
  }
  
  return model;
}

function extractPathsFromSvg(svg: string): { paths: string[]; width: number; height: number } {
  const pathRegex = /<path[^>]*d="([^"]+)"[^>]*>/g;
  const viewBoxRegex = /viewBox="([^"]+)"/;
  const widthRegex = /width="([^"]+)"/;
  const heightRegex = /height="([^"]+)"/;

  const paths: string[] = [];
  let match;

  while ((match = pathRegex.exec(svg)) !== null) {
    paths.push(match[1]);
  }

  let width = 100;
  let height = 100;

  const viewBoxMatch = viewBoxRegex.exec(svg);
  if (viewBoxMatch) {
    const [, , w, h] = viewBoxMatch[1].split(/\s+/).map(Number);
    width = w || 100;
    height = h || 100;
  } else {
    const widthMatch = widthRegex.exec(svg);
    const heightMatch = heightRegex.exec(svg);
    if (widthMatch) width = parseFloat(widthMatch[1]);
    if (heightMatch) height = parseFloat(heightMatch[1]);
  }

  return { paths, width, height };
}

export async function traceImageToDxf(
  imageBuffer: Buffer,
  options: TraceOptions = {}
): Promise<{ dxf: string; svg: string }> {
  return new Promise((resolve, reject) => {
    const traceOptions = {
      threshold: options.threshold ?? 128,
      turnPolicy: "minority" as const,
      turdSize: options.turdSize ?? 2,
      optCurve: options.optCurve ?? true,
      optTolerance: options.optTolerance ?? 0.2,
      color: options.color ?? "#000000",
      background: options.background ?? "transparent",
    };

    potrace.trace(imageBuffer, traceOptions, (err: Error | null, svg: string) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const { paths, width, height } = extractPathsFromSvg(svg);

        const model: makerjs.IModel = {
          models: {},
        };

        let polylineIndex = 0;
        paths.forEach((pathD) => {
          const polylines = svgPathToPolylinePoints(pathD, true, height);
          polylines.forEach((points) => {
            model.models![`polyline_${polylineIndex++}`] = createPolylineModel(points);
          });
        });

        const dxf = makerjs.exporter.toDXF(model, {
          units: "mm",
          usePOLYLINE: true,
        });

        resolve({ dxf, svg });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

export async function traceImageToSvg(
  imageBuffer: Buffer,
  options: TraceOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const traceOptions = {
      threshold: options.threshold ?? 128,
      turnPolicy: "minority" as const,
      turdSize: options.turdSize ?? 2,
      optCurve: options.optCurve ?? true,
      optTolerance: options.optTolerance ?? 0.2,
      color: options.color ?? "#000000",
      background: options.background ?? "transparent",
    };

    potrace.trace(imageBuffer, traceOptions, (err: Error | null, svg: string) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(svg);
    });
  });
}

export async function svgToDxf(svgContent: string): Promise<string> {
  const { paths, width, height } = extractPathsFromSvg(svgContent);

  const model: makerjs.IModel = {
    models: {},
  };

  let polylineIndex = 0;
  paths.forEach((pathD) => {
    const polylines = svgPathToPolylinePoints(pathD, true, height);
    polylines.forEach((points) => {
      model.models![`polyline_${polylineIndex++}`] = createPolylineModel(points);
    });
  });

  const dxf = makerjs.exporter.toDXF(model, {
    units: "mm",
    usePOLYLINE: true,
  });

  return dxf;
}

export type { TraceOptions };
