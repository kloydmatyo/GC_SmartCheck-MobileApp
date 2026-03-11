import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';

interface TemplateData {
  name: string;
  description: string;
  numQuestions: number;
  choicesPerQuestion: number;
  examName?: string;
  className?: string;
  examCode?: string;
  answerKey?: string[]; // e.g. ['A','C','B', ...]
}

// Load GC logo as base64
async function loadGCLogoBase64(): Promise<string> {
  try {
    console.log('[PDF-GEN] Loading Gordon College logo...');
    const asset = Asset.fromModule(require('../assets/images/gordon-college-logo.png'));
    await asset.downloadAsync();
    
    if (!asset.localUri) {
      throw new Error('Failed to download logo asset');
    }
    
    // Read as base64 using the correct encoding constant
    const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
      encoding: 'base64', // Use string literal instead of enum
    });
    
    console.log('[PDF-GEN] Logo loaded successfully');
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('[PDF-GEN] Failed to load GC logo:', error);
    console.log('[PDF-GEN] Continuing without logo...');
    return '';
  }
}

// Generate HTML for 20-question template (4 mini sheets in 2x2 grid)
function generate20QuestionHTML(template: TemplateData, logoData: string): string {
  const choices = ['A', 'B', 'C', 'D', 'E'].slice(0, template.choicesPerQuestion);
  
  // Helper: generate a mini sheet
  const generateMiniSheet = (sheetIndex: number) => {
    const logoHTML = logoData 
      ? `<img src="${logoData}" style="height: 6mm; vertical-align: middle; margin-right: 2mm;" />`
      : '';
    
    return `
      <div class="mini-sheet">
        <!-- Corner markers -->
        <div class="corner-marker" style="top: 4mm; left: 4mm;"></div>
        <div class="corner-marker" style="top: 4mm; right: 4mm;"></div>
        <div class="corner-marker" style="bottom: 4mm; left: 4mm;"></div>
        <div class="corner-marker" style="bottom: 4mm; right: 4mm;"></div>
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 3mm;">
          ${logoHTML}
          <span style="font-size: 8pt; font-weight: bold;">Gordon College</span>
        </div>
        
        ${template.examCode ? `<div style="text-align: center; font-size: 6pt; color: #666; margin-bottom: 3mm;">Exam Code: ${template.examCode}</div>` : ''}
        
        <!-- Name/Date -->
        <div style="display: flex; gap: 2mm; margin-bottom: 4mm; font-size: 6pt;">
          <div style="flex: 1;">
            <span style="font-weight: bold;">Name:</span>
            <div style="border-bottom: 0.5mm solid black; margin-top: 0.5mm;"></div>
          </div>
          <div style="flex: 1;">
            <span style="font-weight: bold;">Date:</span>
            <div style="border-bottom: 0.5mm solid black; margin-top: 0.5mm;"></div>
          </div>
        </div>
        
        <!-- Student ID -->
        <div class="id-section-mini">
          <div style="font-size: 6pt; font-weight: bold; margin-bottom: 2mm;">Student ZipGrade ID</div>
          <div style="display: flex; gap: 0.5mm; margin-bottom: 2mm;">
            ${Array(10).fill(0).map(() => '<div class="id-box-mini"></div>').join('')}
          </div>
          <div style="display: flex; gap: 0.2mm;">
            <div style="display: flex; flex-direction: column;">
              ${[0,1,2,3,4,5,6,7,8,9].map(n => `<div style="height: 3.5mm; font-size: 5pt; font-weight: bold; display: flex; align-items: center; width: 6mm; justify-content: flex-end; padding-right: 0.5mm;">${n}</div>`).join('')}
            </div>
            ${Array(10).fill(0).map(() => `
              <div style="display: flex; flex-direction: column;">
                ${[0,1,2,3,4,5,6,7,8,9].map(() => '<div class="bubble-mini"></div>').join('')}
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Answer blocks (2 columns of 10) -->
        <div style="display: flex; gap: 4mm; margin-top: 3mm;">
          ${[0, 1].map(col => `
            <div>
              <!-- Header -->
              <div style="display: flex; align-items: center; gap: 0.5mm; margin-bottom: 1mm;">
                <div style="width: 2mm; height: 2mm; background: black;"></div>
                <div style="width: 10mm;"></div>
                ${choices.map(c => `<div style="width: 4.8mm; text-align: center; font-size: 6.5pt; font-weight: bold;">${c}</div>`).join('')}
              </div>
              <!-- Rows -->
              ${Array(10).fill(0).map((_, i) => {
                const q = col * 10 + i + 1;
                const correctLetter = template.answerKey?.[q - 1]?.toUpperCase();
                return `
                  <div style="display: flex; align-items: center; gap: 0.5mm; margin-bottom: 0.5mm;">
                    <div style="width: 2mm;"></div>
                    <div style="width: 10mm; text-align: right; font-size: 6.5pt; font-weight: bold; padding-right: 1mm;">${q}</div>
                    ${choices.map(c => `<div class="bubble-answer${correctLetter === c ? ' filled' : ''}"></div>`).join('')}
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: A4; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; }
          .page { width: 210mm; height: 297mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
          .mini-sheet { position: relative; border: 0.5mm solid black; padding: 6mm; }
          .corner-marker { position: absolute; width: 4mm; height: 4mm; background: black; }
          .id-section-mini { border: 0.4mm solid black; padding: 2mm; margin-bottom: 3mm; }
          .id-box-mini { width: 4mm; height: 4mm; border: 0.3mm solid black; }
          .bubble-mini { width: 3.2mm; height: 3.2mm; border: 0.3mm solid #333; border-radius: 50%; background: white; margin: 0.2mm; }
          .bubble-answer { width: 3.2mm; height: 3.2mm; border: 0.3mm solid #333; border-radius: 50%; background: white; }
          .bubble-answer.filled { background: black; }
        </style>
      </head>
      <body>
        <div class="page">
          ${generateMiniSheet(0)}
          ${generateMiniSheet(1)}
          ${generateMiniSheet(2)}
          ${generateMiniSheet(3)}
        </div>
      </body>
    </html>
  `;
}

// Generate HTML for 50-question template (2 sheets side by side)
function generate50QuestionHTML(template: TemplateData, logoData: string): string {
  const choices = ['A', 'B', 'C', 'D', 'E'].slice(0, template.choicesPerQuestion);
  
  const generateSheet = () => {
    const logoHTML = logoData 
      ? `<img src="${logoData}" style="height: 6mm; vertical-align: middle; margin-right: 2mm;" />`
      : '';
    
    return `
      <div class="half-sheet">
        <!-- Corner markers -->
        <div class="corner-marker" style="top: 4mm; left: 4mm;"></div>
        <div class="corner-marker" style="top: 4mm; right: 4mm;"></div>
        <div class="corner-marker" style="bottom: 4mm; left: 4mm;"></div>
        <div class="corner-marker" style="bottom: 4mm; right: 4mm;"></div>
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 3mm;">
          ${logoHTML}
          <span style="font-size: 8pt; font-weight: bold;">Gordon College</span>
        </div>
        
        ${template.examCode ? `<div style="text-align: center; font-size: 6pt; color: #666; margin-bottom: 3mm;">Exam Code: ${template.examCode}</div>` : ''}
        
        <!-- Name/Date -->
        <div style="display: flex; gap: 2mm; margin-bottom: 4mm; font-size: 6pt;">
          <div style="flex: 1;">
            <span style="font-weight: bold;">Name:</span>
            <div style="border-bottom: 0.5mm solid black; margin-top: 0.5mm;"></div>
          </div>
          <div style="flex: 1;">
            <span style="font-weight: bold;">Date:</span>
            <div style="border-bottom: 0.5mm solid black; margin-top: 0.5mm;"></div>
          </div>
        </div>
        
        <!-- Student ID -->
        <div class="id-section-mini">
          <div style="font-size: 6pt; font-weight: bold; margin-bottom: 2mm;">Student ZipGrade ID</div>
          <div style="display: flex; gap: 0.5mm; margin-bottom: 2mm;">
            ${Array(10).fill(0).map(() => '<div class="id-box-mini"></div>').join('')}
          </div>
          <div style="display: flex; gap: 0.2mm;">
            <div style="display: flex; flex-direction: column;">
              ${[0,1,2,3,4,5,6,7,8,9].map(n => `<div style="height: 3.5mm; font-size: 5pt; font-weight: bold; display: flex; align-items: center; width: 6mm; justify-content: flex-end; padding-right: 0.5mm;">${n}</div>`).join('')}
            </div>
            ${Array(10).fill(0).map(() => `
              <div style="display: flex; flex-direction: column;">
                ${[0,1,2,3,4,5,6,7,8,9].map(() => '<div class="bubble-mini"></div>').join('')}
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Answer blocks (2 columns, 3 blocks left, 2 blocks right) -->
        <div style="display: flex; gap: 2mm; margin-top: 3mm;">
          <div style="display: flex; flex-direction: column; gap: 3mm;">
            ${[0, 1, 2].map(blockIdx => {
              const startQ = blockIdx * 10 + 1;
              return `
                <div>
                  <!-- Header -->
                  <div style="display: flex; align-items: center; gap: 0.5mm; margin-bottom: 1mm;">
                    <div style="width: 2mm; height: 2mm; background: black;"></div>
                    <div style="width: 10mm;"></div>
                    ${choices.map(c => `<div style="width: 4.8mm; text-align: center; font-size: 6.5pt; font-weight: bold;">${c}</div>`).join('')}
                  </div>
                  <!-- Rows -->
                  ${Array(10).fill(0).map((_, i) => {
                    const q = startQ + i;
                    const correctLetter = template.answerKey?.[q - 1]?.toUpperCase();
                    return `
                      <div style="display: flex; align-items: center; gap: 0.5mm; margin-bottom: 0.5mm;">
                        <div style="width: 2mm;"></div>
                        <div style="width: 10mm; text-align: right; font-size: 6.5pt; font-weight: bold; padding-right: 1mm;">${q}</div>
                        ${choices.map(c => `<div class="bubble-answer${correctLetter === c ? ' filled' : ''}"></div>`).join('')}
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            }).join('')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 3mm;">
            ${[3, 4].map(blockIdx => {
              const startQ = blockIdx * 10 + 1;
              return `
                <div>
                  <!-- Header -->
                  <div style="display: flex; align-items: center; gap: 0.5mm; margin-bottom: 1mm;">
                    <div style="width: 2mm; height: 2mm; background: black;"></div>
                    <div style="width: 10mm;"></div>
                    ${choices.map(c => `<div style="width: 4.8mm; text-align: center; font-size: 6.5pt; font-weight: bold;">${c}</div>`).join('')}
                  </div>
                  <!-- Rows -->
                  ${Array(10).fill(0).map((_, i) => {
                    const q = startQ + i;
                    const correctLetter = template.answerKey?.[q - 1]?.toUpperCase();
                    return `
                      <div style="display: flex; align-items: center; gap: 0.5mm; margin-bottom: 0.5mm;">
                        <div style="width: 2mm;"></div>
                        <div style="width: 10mm; text-align: right; font-size: 6.5pt; font-weight: bold; padding-right: 1mm;">${q}</div>
                        ${choices.map(c => `<div class="bubble-answer${correctLetter === c ? ' filled' : ''}"></div>`).join('')}
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  };
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: A4; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; }
          .page { width: 210mm; height: 297mm; display: grid; grid-template-columns: 1fr 1fr; }
          .half-sheet { position: relative; border: 0.5mm solid black; padding: 6mm; }
          .corner-marker { position: absolute; width: 4mm; height: 4mm; background: black; }
          .id-section-mini { border: 0.4mm solid black; padding: 2mm; margin-bottom: 3mm; }
          .id-box-mini { width: 4mm; height: 4mm; border: 0.3mm solid black; }
          .bubble-mini { width: 3.2mm; height: 3.2mm; border: 0.3mm solid #333; border-radius: 50%; background: white; margin: 0.2mm; }
          .bubble-answer { width: 3.2mm; height: 3.2mm; border: 0.3mm solid #333; border-radius: 50%; background: white; }
          .bubble-answer.filled { background: black; }
        </style>
      </head>
      <body>
        <div class="page">
          ${generateSheet()}
          ${generateSheet()}
        </div>
      </body>
    </html>
  `;
}

// Generate HTML for 100-question template (full page)
function generate100QuestionHTML(template: TemplateData, logoData: string): string {
  const choices = ['A', 'B', 'C', 'D', 'E'].slice(0, template.choicesPerQuestion);
  
  const logoHTML = logoData 
    ? `<img src="${logoData}" style="height: 12mm; vertical-align: middle; margin-right: 3mm;" />`
    : '';
  
  // Helper to generate a question block
  const generateQBlock = (startQ: number, endQ: number) => {
    return `
      <div>
        <!-- Header -->
        <div style="display: flex; align-items: center; gap: 0.5mm; margin-bottom: 2mm;">
          <div style="width: 2.5mm; height: 2.5mm; background: black;"></div>
          <div style="width: 12mm;"></div>
          ${choices.map(c => `<div style="width: 5mm; text-align: center; font-size: 7pt; font-weight: bold;">${c}</div>`).join('')}
        </div>
        <!-- Rows -->
        ${Array(endQ - startQ + 1).fill(0).map((_, i) => {
          const q = startQ + i;
          const correctLetter = template.answerKey?.[q - 1]?.toUpperCase();
          return `
            <div style="display: flex; align-items: center; gap: 0.5mm; margin-bottom: 0.8mm;">
              <div style="width: 2.5mm;"></div>
              <div style="width: 12mm; text-align: right; font-size: 7pt; font-weight: bold; padding-right: 2mm;">${q}</div>
              ${choices.map(c => `<div class="bubble-full${correctLetter === c ? ' filled' : ''}"></div>`).join('')}
            </div>
          `;
        }).join('')}
      </div>
    `;
  };
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: A4; margin: 10mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; position: relative; }
          .corner-marker { position: absolute; width: 7mm; height: 7mm; background: black; }
          .id-section { border: 0.4mm solid black; padding: 3mm; display: inline-block; }
          .id-box { width: 4.5mm; height: 5mm; border: 0.3mm solid black; }
          .bubble-id { width: 3.5mm; height: 3.5mm; border: 0.3mm solid #333; border-radius: 50%; background: white; margin: 0.3mm; }
          .bubble-full { width: 3.8mm; height: 3.8mm; border: 0.4mm solid #000; border-radius: 50%; background: white; }
          .bubble-full.filled { background: black; }
        </style>
      </head>
      <body>
        <!-- Corner markers -->
        <div class="corner-marker" style="top: 3mm; left: 3mm;"></div>
        <div class="corner-marker" style="top: 3mm; right: 3mm;"></div>
        <div class="corner-marker" style="bottom: 3mm; left: 3mm;"></div>
        <div class="corner-marker" style="bottom: 3mm; right: 3mm;"></div>
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 5mm;">
          ${logoHTML}
          <span style="font-size: 14pt; font-weight: bold;">Gordon College</span>
        </div>
        
        ${template.examCode ? `<div style="text-align: center; font-size: 8pt; color: #666; margin-bottom: 5mm;">Exam Code: ${template.examCode}</div>` : ''}
        
        <!-- Name/Date -->
        <div style="display: flex; gap: 5mm; margin-bottom: 5mm; font-size: 9pt;">
          <div style="flex: 3;">
            <span style="font-weight: bold;">Name:</span>
            <div style="border-bottom: 0.5mm solid black; margin-top: 1mm; margin-left: 5mm;"></div>
          </div>
          <div style="flex: 2;">
            <span style="font-weight: bold;">Date:</span>
            <div style="border-bottom: 0.5mm solid black; margin-top: 1mm; margin-left: 5mm;"></div>
          </div>
        </div>
        
        <!-- Top section: ID + Q41-50 + Q71-80 -->
        <div style="display: flex; gap: 4mm; margin-bottom: 4mm; align-items: flex-start;">
          <!-- Student ID -->
          <div class="id-section">
            <div style="font-size: 8pt; font-weight: bold; margin-bottom: 3mm;">Student ZipGrade ID</div>
            <div style="display: flex; gap: 0.5mm; margin-bottom: 3mm;">
              ${Array(10).fill(0).map(() => '<div class="id-box"></div>').join('')}
            </div>
            <div style="display: flex; gap: 0.3mm;">
              <div style="display: flex; flex-direction: column;">
                ${[0,1,2,3,4,5,6,7,8,9].map(n => `<div style="height: 4.8mm; font-size: 7pt; font-weight: bold; display: flex; align-items: center; width: 8mm; justify-content: flex-end; padding-right: 1mm;">${n}</div>`).join('')}
              </div>
              ${Array(10).fill(0).map(() => `
                <div style="display: flex; flex-direction: column;">
                  ${[0,1,2,3,4,5,6,7,8,9].map(() => '<div class="bubble-id"></div>').join('')}
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- Q41-50 and Q71-80 -->
          <div style="display: flex; gap: 4mm; margin-top: 10mm;">
            ${generateQBlock(41, 50)}
            ${generateQBlock(71, 80)}
          </div>
        </div>
        
        <!-- Bottom: 4 cols × 2 rows -->
        <div style="display: flex; gap: 3mm; margin-bottom: 2mm;">
          ${generateQBlock(1, 10)}
          ${generateQBlock(21, 30)}
          ${generateQBlock(51, 60)}
          ${generateQBlock(81, 90)}
        </div>
        <div style="display: flex; gap: 3mm;">
          ${generateQBlock(11, 20)}
          ${generateQBlock(31, 40)}
          ${generateQBlock(61, 70)}
          ${generateQBlock(91, 100)}
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; font-size: 6pt; font-style: italic; color: #666; margin-top: 5mm;">
          Do not fold, staple, or tear this answer sheet.
        </div>
      </body>
    </html>
  `;
}

// Main function to generate PDF
export async function generateTemplatePDF(template: TemplateData): Promise<string> {
  console.log('[PDF-GEN] Starting PDF generation...');
  
  // Load logo
  const logoData = await loadGCLogoBase64();

  // Generate HTML based on template
  let html = '';
  if (template.numQuestions === 20) {
    html = generate20QuestionHTML(template, logoData);
  } else if (template.numQuestions === 50) {
    html = generate50QuestionHTML(template, logoData);
  } else if (template.numQuestions === 100) {
    html = generate100QuestionHTML(template, logoData);
  } else {
    throw new Error(`Unsupported question count: ${template.numQuestions}`);
  }

  // Generate PDF from HTML
  const { uri } = await Print.printToFileAsync({ html });
  
  // Generate filename
  const filename = `${template.name.replace(/[^a-z0-9]/gi, '_')}_Answer_Sheet.pdf`;
  const fileUri = `${FileSystem.documentDirectory}${filename}`;
  
  // Move to permanent location
  await FileSystem.moveAsync({
    from: uri,
    to: fileUri,
  });
  
  console.log('[PDF-GEN] PDF saved to:', fileUri);
  
  // Share the PDF
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Save Answer Sheet',
      UTI: 'com.adobe.pdf',
    });
  }
  
  return fileUri;
}
