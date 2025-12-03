import { DxfWriter, point3d, Units, Colors, MTextAttachmentPoint } from "@tarikjabiri/dxf";

interface LabelLine {
  text: string;
  textSizeMm: number;
  spacingTopMm: string | number;
  spacingLeftMm: string | number;
}

interface LabelSetup {
  name?: string;
  labelLengthMm: number;
  labelHeightMm: number;
  labelThicknessMm: number;
  labelColourBackground: string;
  textColour: string;
  labelQuantity: number;
  style: string;
  noOfHoles: number;
  holeSizeMm: number;
  holeDistanceMm: number;
  holeType?: "circle" | "square";
  holeLengthMm?: number;
  holeHeightMm?: number;
  lines: LabelLine[];
}

interface SheetConfig {
  width: number;
  height: number;
  margin: number;
  gap: number;
}

interface PlacedLabel {
  setup: LabelSetup;
  x: number;
  y: number;
  quantity: number;
}

interface DxfSheet {
  pageNumber: number;
  labels: PlacedLabel[];
}

const DEFAULT_SHEET: SheetConfig = {
  width: 600,
  height: 300,
  margin: 0,
  gap: 0,
};

function arrangeLabelsOnSheets(
  setups: LabelSetup[],
  sheet: SheetConfig = DEFAULT_SHEET
): DxfSheet[] {
  const sheets: DxfSheet[] = [];
  const usableWidth = sheet.width - 2 * sheet.margin;
  const usableHeight = sheet.height - 2 * sheet.margin;

  const allLabels: LabelSetup[] = [];
  for (const setup of setups) {
    const qty = setup.labelQuantity || 1;
    for (let i = 0; i < qty; i++) {
      allLabels.push(setup);
    }
  }

  let currentSheet: DxfSheet = { pageNumber: 1, labels: [] };
  let currentX = sheet.margin;
  let currentY = sheet.height - sheet.margin;
  let rowHeight = 0;

  for (const label of allLabels) {
    const labelWidth = label.labelLengthMm;
    const labelHeight = label.labelHeightMm;

    if (rowHeight === 0) {
      rowHeight = labelHeight;
    }

    if (currentX + labelWidth > sheet.width - sheet.margin) {
      currentX = sheet.margin;
      currentY -= rowHeight + sheet.gap;
      rowHeight = labelHeight;
    }

    if (currentY - labelHeight < sheet.margin) {
      if (currentSheet.labels.length > 0) {
        sheets.push(currentSheet);
      }
      currentSheet = { pageNumber: sheets.length + 1, labels: [] };
      currentX = sheet.margin;
      currentY = sheet.height - sheet.margin;
      rowHeight = labelHeight;
    }

    if (labelWidth > usableWidth || labelHeight > usableHeight) {
      console.warn(`Label ${label.name || 'unnamed'} (${labelWidth}x${labelHeight}mm) is too large for sheet (${usableWidth}x${usableHeight}mm)`);
    }

    currentSheet.labels.push({
      setup: label,
      x: currentX,
      y: currentY - labelHeight,
      quantity: 1,
    });

    rowHeight = Math.max(rowHeight, labelHeight);
    currentX += labelWidth + sheet.gap;
  }

  if (currentSheet.labels.length > 0) {
    sheets.push(currentSheet);
  }

  return sheets;
}

function estimateTextWidth(text: string, textHeight: number): number {
  const avgCharWidthRatio = 0.55;
  return text.length * textHeight * avgCharWidthRatio;
}

function calculateFitTextHeight(text: string, maxWidth: number, desiredHeight: number, padding: number = 2): number {
  const availableWidth = maxWidth - (padding * 2);
  const estimatedWidth = estimateTextWidth(text, desiredHeight);
  
  if (estimatedWidth <= availableWidth) {
    return desiredHeight;
  }
  
  const scaleFactor = availableWidth / estimatedWidth;
  const newHeight = desiredHeight * scaleFactor;
  
  return Math.max(0.5, newHeight);
}

function generateSheetDxf(sheet: DxfSheet, sheetConfig: SheetConfig = DEFAULT_SHEET): string {
  const dxf = new DxfWriter();
  
  dxf.setUnits(Units.Millimeters);

  const calibriStyle = dxf.tables.styleTable.addStyle("CALIBRI");
  calibriStyle.fontFileName = "calibri.ttf";

  dxf.addLayer("Cutting", Colors.Red);
  dxf.addLayer("Break", Colors.Cyan);
  dxf.addLayer("Holes", Colors.Red);
  dxf.addLayer("TEXT", Colors.Blue);

  dxf.setCurrentLayerName("Cutting");
  dxf.addLine(point3d(0, 0), point3d(sheetConfig.width, 0));
  dxf.addLine(point3d(sheetConfig.width, 0), point3d(sheetConfig.width, sheetConfig.height));
  dxf.addLine(point3d(sheetConfig.width, sheetConfig.height), point3d(0, sheetConfig.height));
  dxf.addLine(point3d(0, sheetConfig.height), point3d(0, 0));

  for (const placedLabel of sheet.labels) {
    const { setup, x, y } = placedLabel;
    const width = setup.labelLengthMm;
    const height = setup.labelHeightMm;

    dxf.setCurrentLayerName("Break");
    dxf.addLine(point3d(x, y), point3d(x + width, y));
    dxf.addLine(point3d(x + width, y), point3d(x + width, y + height));
    dxf.addLine(point3d(x + width, y + height), point3d(x, y + height));
    dxf.addLine(point3d(x, y + height), point3d(x, y));

    if (setup.noOfHoles > 0 && (setup.holeSizeMm > 0 || (setup.holeLengthMm && setup.holeHeightMm))) {
      dxf.setCurrentLayerName("Holes");
      const holeDistance = setup.holeDistanceMm || 5;
      const holeType = setup.holeType || "circle";

      const drawHole = (cx: number, cy: number) => {
        if (holeType === "square") {
          const holeW = setup.holeLengthMm || setup.holeSizeMm || 3;
          const holeH = setup.holeHeightMm || setup.holeSizeMm || 3;
          const hx = cx - holeW / 2;
          const hy = cy - holeH / 2;
          dxf.addLine(point3d(hx, hy), point3d(hx + holeW, hy));
          dxf.addLine(point3d(hx + holeW, hy), point3d(hx + holeW, hy + holeH));
          dxf.addLine(point3d(hx + holeW, hy + holeH), point3d(hx, hy + holeH));
          dxf.addLine(point3d(hx, hy + holeH), point3d(hx, hy));
        } else {
          const holeRadius = setup.holeSizeMm / 2;
          dxf.addCircle(point3d(cx, cy), holeRadius);
        }
      };

      if (setup.noOfHoles === 1) {
        drawHole(x + holeDistance, y + height / 2);
      } else if (setup.noOfHoles === 2) {
        drawHole(x + holeDistance, y + height / 2);
        drawHole(x + width - holeDistance, y + height / 2);
      } else if (setup.noOfHoles === 4) {
        drawHole(x + holeDistance, y + holeDistance);
        drawHole(x + width - holeDistance, y + holeDistance);
        drawHole(x + holeDistance, y + height - holeDistance);
        drawHole(x + width - holeDistance, y + height - holeDistance);
      } else {
        const spacing = (width - 2 * holeDistance) / (setup.noOfHoles - 1);
        for (let i = 0; i < setup.noOfHoles; i++) {
          drawHole(x + holeDistance + i * spacing, y + height / 2);
        }
      }
    }

    dxf.setCurrentLayerName("TEXT");
    
    const validLines = setup.lines.filter(line => line.text && line.text.trim() !== "");
    
    if (validLines.length > 0) {
      const lineSpacing = 1;
      
      const lineData = validLines.map(line => {
        const desiredHeight = line.textSizeMm || 2;
        const fitHeight = calculateFitTextHeight(line.text, width, desiredHeight, 2);
        return { text: line.text, height: fitHeight };
      });
      
      const totalTextHeight = lineData.reduce((sum, ld) => sum + ld.height, 0) + 
                              (lineData.length - 1) * lineSpacing;
      
      const centerX = x + width / 2;
      let currentY = y + (height + totalTextHeight) / 2;
      
      for (const ld of lineData) {
        currentY -= ld.height;
        
        const mtextEntity = dxf.addMText(
          point3d(centerX, currentY + ld.height / 2),
          ld.height,
          ld.text,
          {
            attachmentPoint: MTextAttachmentPoint.MiddleCenter,
            width: width - 4,
          }
        );
        mtextEntity.textStyle = "CALIBRI";
        
        currentY -= lineSpacing;
      }
    }
  }

  return dxf.stringify();
}

function getGroupKey(setup: LabelSetup): string {
  const text = setup.textColour || "Black";
  const bg = setup.labelColourBackground || "White";
  const thickness = setup.labelThicknessMm || 0.8;
  const style = setup.style || "Adhesive";
  return `${text}|${bg}|${thickness}|${style}`;
}

export function generateDxfFiles(
  setups: LabelSetup[],
  projectName: string = "Project",
  sheetConfig: SheetConfig = DEFAULT_SHEET
): { filename: string; content: string }[] {
  const files: { filename: string; content: string }[] = [];

  const groups = new Map<string, LabelSetup[]>();
  for (const setup of setups) {
    const key = getGroupKey(setup);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(setup);
  }

  for (const [key, groupSetups] of groups) {
    const [textColour, bgColour, thicknessStr, style] = key.split("|");
    const thickness = parseFloat(thicknessStr);
    
    const sheets = arrangeLabelsOnSheets(groupSetups, sheetConfig);
    
    for (const sheet of sheets) {
      const dxfContent = generateSheetDxf(sheet, sheetConfig);
      const pageNum = String(sheet.pageNumber).padStart(2, "0");
      const styleSuffix = style === "Non Adhesive" ? " Non AD" : "";
      const filename = `MLA ${textColour} on ${bgColour} ${thickness}mm${styleSuffix} ${pageNum}.dxf`;
      
      files.push({ filename, content: dxfContent });
    }
  }

  return files;
}

export function getSheetSummary(
  setups: LabelSetup[],
  sheetConfig: SheetConfig = DEFAULT_SHEET
): { totalSheets: number; labelsPerSheet: number[]; totalLabels: number } {
  const sheets = arrangeLabelsOnSheets(setups, sheetConfig);
  return {
    totalSheets: sheets.length,
    labelsPerSheet: sheets.map(s => s.labels.length),
    totalLabels: sheets.reduce((sum, s) => sum + s.labels.length, 0),
  };
}

export { DEFAULT_SHEET, type SheetConfig, type LabelSetup as DxfLabelSetup };
