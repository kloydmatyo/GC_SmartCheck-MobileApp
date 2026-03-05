import {
    androidStatusBarHeight,
    horizontalPadding,
    isAndroid,
    rf,
    rp,
    rs,
} from "@/utils/responsive";
import { DARK_MODE_STORAGE_KEY } from "@/constants/preferences";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { WebView } from "react-native-webview";

import StatusModal from "@/components/common/StatusModal";
import DuplicateBatchWarningModal from "@/components/exam/DuplicateBatchWarningModal";
import VersionMismatchWarningModal from "@/components/exam/VersionMismatchWarningModal";
import { auth } from "@/config/firebase";
import { COLORS, RADIUS } from "../../constants/theme";
import { BatchHistoryService } from "../../services/batchHistoryService";
import type {
    BatchDuplicateWarning,
    BatchVersionMismatch,
} from "../../types/batch";

const TEMPLATES = [
  { key: "standard20", label: "20 Questions", totalQuestions: 20 },
  { key: "standard50", label: "50 Questions", totalQuestions: 50 },
  { key: "standard100", label: "100 Questions", totalQuestions: 100 },
] as const;

type TemplateKey = (typeof TEMPLATES)[number]["key"];
const VERSIONS = ["A", "B", "C", "D"] as const;
type Version = (typeof VERSIONS)[number];

const LOGO_URI =
  "https://gordoncollege.edu.ph/wp-content/uploads/2022/09/cropped-GC-Logo.png";

// Generate a single answer sheet for 20 questions (used in 4-up layout)
function generateSingleSheet20Q(
  examName: string,
  section: string,
  version: Version,
  examCode: string,
): string {
  const generateQuestions = () => {
    let html = "";
    for (let i = 1; i <= 10; i++) {
      html += `
        <div style="display:flex;align-items:center;gap:3px;font-size:6px;margin:1px 0;">
          <span style="width:12px;text-align:right;font-weight:600;">${i}.</span>
          ${["A", "B", "C", "D", "E"]
            .map(
              (opt) => `
            <span style="border:1px solid #222;border-radius:50%;width:8px;height:8px;display:inline-block;"></span>
          `,
            )
            .join("")}
        </div>`;
    }
    return html;
  };

  return `
    <div style="position:relative;width:280px;height:360px;border:2px solid #000;padding:6px;background:white;">
      <!-- Alignment markers -->
      <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;top:4px;left:4px;"></div>
      <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;top:4px;right:4px;"></div>
      <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;bottom:4px;left:4px;"></div>
      <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;bottom:4px;right:4px;"></div>
      
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #333;">
        <img src="${LOGO_URI}" style="height:20px;width:auto;" alt="Logo"/>
        <div style="font-size:8px;font-weight:700;">Gordon College</div>
      </div>
      
      <!-- Exam Info -->
      <div style="font-size:6px;text-align:center;margin-bottom:4px;">
        <div style="font-weight:700;">Exam Code: ${examCode}</div>
        <div>Date: _______________</div>
      </div>
      
      <!-- Name and Student ID -->
      <div style="border:1px solid #333;padding:4px;margin-bottom:4px;font-size:6px;">
        <div style="margin-bottom:2px;">Name: _______________________</div>
        <div style="font-weight:600;margin-bottom:2px;">Student ZipGrade ID</div>
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:2px;">
          ${Array.from(
            { length: 8 },
            (_, pos) => `
            <div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
              <div style="font-size:5px;font-weight:700;">${pos + 1}</div>
              ${Array.from(
                { length: 10 },
                (_, digit) => `
                <div style="display:flex;align-items:center;gap:1px;">
                  <span style="border:1px solid #222;border-radius:50%;width:6px;height:6px;display:inline-block;"></span>
                  <span style="font-size:5px;">${digit}</span>
                </div>
              `,
              ).join("")}
            </div>
          `,
          ).join("")}
        </div>
      </div>
      
      <!-- Questions in 2 columns -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;border:1px solid #333;padding:4px;background:#f9f9f9;">
        <div>
          ${generateQuestions()}
        </div>
        <div>
          ${(() => {
            let html = "";
            for (let i = 11; i <= 20; i++) {
              html += `
                <div style="display:flex;align-items:center;gap:3px;font-size:6px;margin:1px 0;">
                  <span style="width:12px;text-align:right;font-weight:600;">${i}.</span>
                  ${["A", "B", "C", "D", "E"]
                    .map(
                      (opt) => `
                    <span style="border:1px solid #222;border-radius:50%;width:8px;height:8px;display:inline-block;"></span>
                  `,
                    )
                    .join("")}
                </div>`;
            }
            return html;
          })()}
        </div>
      </div>
    </div>
  `;
}

// Build 4-up layout for 20 questions (4 sheets per page)
function build20QuestionFourUpLayout(
  examName: string,
  section: string,
  version: Version,
  examCode: string,
): string {
  const singleSheet = generateSingleSheet20Q(
    examName,
    section,
    version,
    examCode,
  );

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3,user-scalable=yes"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 8px; background: white; }
    .page { width: 612px; height: 792px; position: relative; }
    .grid-4up { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      grid-template-rows: 1fr 1fr;
      gap: 16px;
      width: 100%;
      height: 100%;
      padding: 16px;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .page-break { page-break-after: always; }
    }
  </style></head><body>
  <div class="page">
    <div class="grid-4up">
      ${singleSheet}
      ${singleSheet}
      ${singleSheet}
      ${singleSheet}
    </div>
  </div>
  </body></html>`;
}

// Generate a single answer sheet for 50 questions (used in 2-up layout)
function generateSingleSheet50Q(
  examName: string,
  section: string,
  version: Version,
  examCode: string,
): string {
  const generateQuestionBlock = (start: number, end: number) => {
    let html = "";
    for (let i = start; i <= end; i++) {
      html += `
        <div style="display:flex;align-items:center;gap:2px;font-size:7px;margin:1px 0;">
          <span style="width:14px;text-align:right;font-weight:600;">${i}.</span>
          ${["A", "B", "C", "D", "E"]
            .map(
              (opt) => `
            <span style="border:1px solid #222;border-radius:50%;width:9px;height:9px;display:inline-block;"></span>
          `,
            )
            .join("")}
        </div>`;
    }
    return html;
  };

  return `
    <div style="position:relative;width:280px;height:750px;border:2px solid #000;padding:8px;background:white;">
      <!-- Alignment markers -->
      <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;top:5px;left:5px;"></div>
      <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;top:5px;right:5px;"></div>
      <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;bottom:5px;left:5px;"></div>
      <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;bottom:5px;right:5px;"></div>
      
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #333;">
        <img src="${LOGO_URI}" style="height:24px;width:auto;" alt="Logo"/>
        <div style="font-size:10px;font-weight:700;">Gordon College</div>
      </div>
      
      <!-- Exam Info -->
      <div style="font-size:7px;margin-bottom:6px;">
        <div style="font-weight:700;text-align:center;margin-bottom:2px;">Exam Code: ${examCode}</div>
        <div style="display:flex;justify-content:space-between;">
          <span>Name: _______________</span>
          <span>Date: _______</span>
        </div>
      </div>
      
      <!-- Student ID Grid -->
      <div style="border:1px solid #333;padding:6px;margin-bottom:6px;background:#f9f9f9;">
        <div style="font-weight:600;font-size:7px;margin-bottom:3px;text-align:center;">Student ZipGrade ID</div>
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:3px;">
          ${Array.from(
            { length: 8 },
            (_, pos) => `
            <div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
              <div style="font-size:6px;font-weight:700;">${pos + 1}</div>
              ${Array.from(
                { length: 10 },
                (_, digit) => `
                <div style="display:flex;align-items:center;gap:1px;margin:1px 0;">
                  <span style="border:1px solid #222;border-radius:50%;width:7px;height:7px;display:inline-block;"></span>
                  <span style="font-size:5px;">${digit}</span>
                </div>
              `,
              ).join("")}
            </div>
          `,
          ).join("")}
        </div>
      </div>
      
      <!-- Questions in 4 blocks -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
        <!-- Block 1: Questions 1-10 -->
        <div style="border:1px solid #333;padding:4px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;left:-8px;top:2px;"></div>
          ${generateQuestionBlock(1, 10)}
        </div>
        
        <!-- Block 2: Questions 11-20 -->
        <div style="border:1px solid #333;padding:4px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;right:-8px;top:2px;"></div>
          ${generateQuestionBlock(11, 20)}
        </div>
        
        <!-- Block 3: Questions 21-30 -->
        <div style="border:1px solid #333;padding:4px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;left:-8px;top:2px;"></div>
          ${generateQuestionBlock(21, 30)}
        </div>
        
        <!-- Block 4: Questions 31-40 -->
        <div style="border:1px solid #333;padding:4px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;right:-8px;top:2px;"></div>
          ${generateQuestionBlock(31, 40)}
        </div>
        
        <!-- Block 5: Questions 41-50 -->
        <div style="border:1px solid #333;padding:4px;background:#f9f9f9;grid-column:1/3;position:relative;">
          <div style="position:absolute;width:4px;height:4px;background:black;border-radius:50%;left:-8px;top:2px;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            <div>${generateQuestionBlock(41, 45)}</div>
            <div>${generateQuestionBlock(46, 50)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Build 2-up layout for 50 questions (2 sheets per page)
function build50QuestionTwoUpLayout(
  examName: string,
  section: string,
  version: Version,
  examCode: string,
): string {
  const singleSheet = generateSingleSheet50Q(
    examName,
    section,
    version,
    examCode,
  );

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3,user-scalable=yes"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 8px; background: white; }
    .page { width: 612px; height: 792px; position: relative; }
    .grid-2up { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 12px;
      width: 100%;
      height: 100%;
      padding: 12px;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .page-break { page-break-after: always; }
    }
  </style></head><body>
  <div class="page">
    <div class="grid-2up">
      ${singleSheet}
      ${singleSheet}
    </div>
  </div>
  </body></html>`;
}

// Build full-page layout for 100 questions (1 sheet per page)
function build100QuestionFullPageLayout(
  examName: string,
  section: string,
  version: Version,
  examCode: string,
): string {
  const generateQuestionBlock = (start: number, end: number) => {
    let html = "";
    for (let i = start; i <= end; i++) {
      html += `
        <div style="display:flex;align-items:center;gap:2px;font-size:8px;margin:1.5px 0;">
          <span style="width:16px;text-align:right;font-weight:600;">${i}.</span>
          ${["A", "B", "C", "D", "E"]
            .map(
              (opt) => `
            <span style="border:1.5px solid #222;border-radius:50%;width:10px;height:10px;display:inline-block;"></span>
          `,
            )
            .join("")}
        </div>`;
    }
    return html;
  };

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3,user-scalable=yes"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 12px; background: white; width: 612px; }
    .page { position: relative; width: 100%; min-height: 792px; }
    @media print {
      body { margin: 0; padding: 12px; }
      .page-break { page-break-after: always; }
    }
  </style></head><body>
  <div class="page">
    <!-- Alignment markers at page corners -->
    <div style="position:absolute;width:8px;height:8px;background:black;border-radius:50%;top:8px;left:8px;"></div>
    <div style="position:absolute;width:8px;height:8px;background:black;border-radius:50%;top:8px;right:8px;"></div>
    <div style="position:absolute;width:8px;height:8px;background:black;border-radius:50%;bottom:8px;left:8px;"></div>
    <div style="position:absolute;width:8px;height:8px;background:black;border-radius:50%;bottom:8px;right:8px;"></div>
    
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #333;">
      <img src="${LOGO_URI}" style="height:32px;width:auto;" alt="Logo"/>
      <div style="font-size:14px;font-weight:700;">Gordon College</div>
    </div>
    
    <!-- Exam Info -->
    <div style="font-size:9px;margin-bottom:8px;text-align:center;">
      <div style="font-weight:700;font-size:11px;margin-bottom:3px;">Exam Code: ${examCode}</div>
      <div style="display:flex;justify-content:space-between;max-width:600px;margin:0 auto;">
        <span>Name: _________________________________</span>
        <span>Date: _______________</span>
      </div>
    </div>
    
    <!-- Main content grid -->
    <div style="display:grid;grid-template-columns:240px 1fr;gap:8px;">
      <!-- Left column: Student ID -->
      <div style="border:2px solid #333;padding:8px;background:#f9f9f9;height:fit-content;">
        <div style="font-weight:700;font-size:9px;margin-bottom:6px;text-align:center;">Student ZipGrade ID</div>
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;">
          ${Array.from(
            { length: 8 },
            (_, pos) => `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
              <div style="font-size:7px;font-weight:700;margin-bottom:2px;">${pos + 1}</div>
              ${Array.from(
                { length: 10 },
                (_, digit) => `
                <div style="display:flex;flex-direction:column;align-items:center;gap:1px;margin:2px 0;">
                  <span style="border:1.5px solid #222;border-radius:50%;width:10px;height:10px;display:inline-block;"></span>
                  <span style="font-size:6px;">${digit}</span>
                </div>
              `,
              ).join("")}
            </div>
          `,
          ).join("")}
        </div>
      </div>
      
      <!-- Right column: Questions 41-80 in 4 blocks -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <!-- Block: Questions 41-50 -->
        <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;left:-10px;top:4px;"></div>
          ${generateQuestionBlock(41, 50)}
        </div>
        
        <!-- Block: Questions 71-80 -->
        <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;right:-10px;top:4px;"></div>
          ${generateQuestionBlock(71, 80)}
        </div>
        
        <!-- Block: Questions 51-60 -->
        <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;left:-10px;top:4px;"></div>
          ${generateQuestionBlock(51, 60)}
        </div>
        
        <!-- Block: Questions 81-90 -->
        <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;right:-10px;top:4px;"></div>
          ${generateQuestionBlock(81, 90)}
        </div>
        
        <!-- Block: Questions 61-70 -->
        <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;left:-10px;top:4px;"></div>
          ${generateQuestionBlock(61, 70)}
        </div>
        
        <!-- Block: Questions 91-100 -->
        <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
          <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;right:-10px;top:4px;"></div>
          ${generateQuestionBlock(91, 100)}
        </div>
      </div>
    </div>
    
    <!-- Bottom section: Questions 1-40 in 4 blocks -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;">
      <!-- Block: Questions 1-10 -->
      <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
        <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;left:-10px;top:4px;"></div>
        ${generateQuestionBlock(1, 10)}
      </div>
      
      <!-- Block: Questions 11-20 -->
      <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
        <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;left:-10px;top:4px;"></div>
        ${generateQuestionBlock(11, 20)}
      </div>
      
      <!-- Block: Questions 21-30 -->
      <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
        <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;right:-10px;top:4px;"></div>
        ${generateQuestionBlock(21, 30)}
      </div>
      
      <!-- Block: Questions 31-40 -->
      <div style="border:1px solid #333;padding:6px;background:#f9f9f9;position:relative;">
        <div style="position:absolute;width:5px;height:5px;background:black;border-radius:50%;right:-10px;top:4px;"></div>
        ${generateQuestionBlock(31, 40)}
      </div>
    </div>
  </div>
  </body></html>`;
}

function buildFallbackHtml(
  templateKey: TemplateKey,
  examName: string,
  section: string,
  version: Version,
): string {
  const total =
    TEMPLATES.find((t) => t.key === templateKey)?.totalQuestions ?? 50;
  const examCode = `${String(examName || "GCSC")
    .replace(/\s+/g, "-")
    .toUpperCase()}-${version}`;

  // For 20 questions, use 4-up layout (4 sheets per page)
  if (templateKey === "standard20") {
    return build20QuestionFourUpLayout(examName, section, version, examCode);
  }

  // For 50 questions, use 2-up layout (2 sheets per page)
  if (templateKey === "standard50") {
    return build50QuestionTwoUpLayout(examName, section, version, examCode);
  }

  // For 100 questions, use full-page layout (1 sheet per page)
  if (templateKey === "standard100") {
    return build100QuestionFullPageLayout(examName, section, version, examCode);
  }

  // Fallback for any other template (shouldn't happen)
  const questionsPerColumn = Math.ceil(total / 2);
  const column1 = Array.from({ length: questionsPerColumn }, (_, i) => i + 1);
  const column2 = Array.from(
    { length: total - questionsPerColumn },
    (_, i) => i + questionsPerColumn + 1,
  );

  const generateQuestionRow = (q: number) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:9px;margin:2px 0;">
      <span style="width:20px;text-align:right;font-weight:600;">${q}.</span>
      <div style="display:flex;gap:6px;">
        ${["A", "B", "C", "D", "E"]
          .map(
            (opt) => `
          <div style="display:flex;align-items:center;gap:2px;">
            <span style="border:1.5px solid #222;border-radius:50%;width:12px;height:12px;display:inline-block;background:white;"></span>
            <span style="font-size:8px;">${opt}</span>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3,user-scalable=yes"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body{font-family:Arial,sans-serif;margin:0;padding:16px;color:#222;width:612px;background:white;}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #333;}
    .logo{height:48px;width:auto;object-fit:contain;}
    .title{font-size:14px;font-weight:700;text-align:center;flex:1;margin:0 12px;}
    .exam-info{border:1px solid #333;border-radius:6px;padding:10px;margin-bottom:10px;background:#f9f9f9;}
    .exam-info-row{display:flex;justify-content:space-between;margin-bottom:4px;font-size:10px;}
    .exam-code{font-size:16px;font-weight:700;font-family:monospace;letter-spacing:1px;color:#000;text-align:center;padding:6px;background:#fff;border:2px solid #000;border-radius:4px;margin:8px 0;}
    .instructions{font-size:9px;color:#555;margin-bottom:10px;padding:6px;background:#fffbea;border-left:3px solid #f59e0b;}
    .section-title{font-size:11px;font-weight:700;margin:10px 0 6px 0;color:#333;text-transform:uppercase;letter-spacing:0.5px;}
    .student-id-box{border:1px solid #333;border-radius:6px;padding:10px;margin-bottom:12px;background:#f5f5f5;}
    .bubble-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin-top:8px;}
    .bubble-column{display:flex;flex-direction:column;align-items:center;gap:3px;}
    .bubble-column-label{font-size:8px;font-weight:700;margin-bottom:2px;}
    .bubble{border:1.5px solid #222;border-radius:50%;width:12px;height:12px;display:inline-block;background:white;}
    .bubble-label{font-size:7px;color:#666;margin-left:2px;}
    .questions-box{border:1px solid #333;border-radius:6px;padding:10px;background:#f5f5f5;}
    .questions-grid{display:grid;grid-template-columns:${total > 25 ? "repeat(2,1fr)" : "1fr"};gap:12px;margin-top:8px;}
    .alignment-marker{position:absolute;width:6px;height:6px;background:black;border-radius:50%;}
    .marker-tl{top:10px;left:10px;} .marker-tr{top:10px;right:10px;}
    .marker-bl{bottom:10px;left:10px;} .marker-br{bottom:10px;right:10px;}
    .footer{margin-top:12px;padding-top:8px;border-top:1px solid #ccc;font-size:8px;color:#666;text-align:center;}
    @media print { body { margin: 0; padding: 16px; } .page-break { page-break-after: always; } }
  </style></head><body>
  <!-- Alignment markers for OMR scanning -->
  <div class="alignment-marker marker-tl"></div>
  <div class="alignment-marker marker-tr"></div>
  <div class="alignment-marker marker-bl"></div>
  <div class="alignment-marker marker-br"></div>
  
  <!-- Header with Logo -->
  <div class="header">
    <img class="logo" src="${LOGO_URI}" alt="GC Logo" crossorigin="anonymous"/>
    <div class="title">GC SmartCheck OMR Answer Sheet</div>
  </div>
  
  <!-- Exam Information -->
  <div class="exam-info">
    <div class="exam-info-row">
      <span><strong>Exam:</strong> ${examName || "Untitled Exam"}</span>
      <span><strong>Version:</strong> ${version}</span>
    </div>
    <div class="exam-info-row">
      <span><strong>Section:</strong> ${section || "N/A"}</span>
      <span><strong>Questions:</strong> ${total}</span>
    </div>
    <div class="exam-code">${examCode}</div>
  </div>
  
  <!-- Instructions -->
  <div class="instructions">
    <strong>Instructions:</strong> Use a #2 pencil only • Fill bubbles completely • Erase cleanly to change answers • Do not fold or tear this sheet
  </div>
  
  <!-- Student ID Section (8 digits) -->
  <div class="section-title">Student ID (8 Digits)</div>
  <div class="student-id-box">
    <div class="bubble-grid">
      ${Array.from(
        { length: 8 },
        (_, pos) => `
        <div class="bubble-column">
          <div class="bubble-column-label">${pos + 1}</div>
          ${Array.from(
            { length: 10 },
            (_, digit) => `
            <div style="display:flex;align-items:center;gap:2px;margin:2px 0;">
              <span class="bubble"></span>
              <span class="bubble-label">${digit}</span>
            </div>
          `,
          ).join("")}
        </div>
      `,
      ).join("")}
    </div>
  </div>
  
  <!-- Questions Section -->
  <div class="section-title">Answer Bubbles</div>
  <div class="questions-box">
    <div class="questions-grid">
      ${
        total > 25
          ? `
        <div>${column1.map(generateQuestionRow).join("")}</div>
        <div>${column2.map(generateQuestionRow).join("")}</div>
      `
          : `
        <div>${column1.map(generateQuestionRow).join("")}</div>
      `
      }
    </div>
  </div>
  
  <!-- Footer -->
  <div class="footer">
    SmartCheck Mobile Scanner Compatible • Generated: ${new Date().toLocaleDateString()} • Optimized for Mobile Viewing & Printing
  </div>
  </body></html>`;
}

async function createPdfFromHtml(
  html: string,
  baseName: string,
): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html,
    width: 612,
    height: 792,
  });
  const dest = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ""}${baseName}.pdf`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export default function PrintAnswerSheetScreen() {
  const router = useRouter();
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const goToQuizzes = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/index");
  };

  const [templateKey, setTemplateKey] = useState<TemplateKey>("standard50");
  const [examName, setExamName] = useState("");
  const [section, setSection] = useState("");
  const [version, setVersion] = useState<Version>("A");
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });
  const [pdfMetrics, setPdfMetrics] = useState<{
    loadTime: number;
    fileSize: number;
    resolution: { width: number; height: number };
  } | null>(null);

  // Batch tracking state
  const [duplicateWarning, setDuplicateWarning] =
    useState<BatchDuplicateWarning | null>(null);
  const [versionMismatch, setVersionMismatch] =
    useState<BatchVersionMismatch | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState(false);

  const selected = useMemo(
    () => TEMPLATES.find((t) => t.key === templateKey)!,
    [templateKey],
  );

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const savedDarkMode = await AsyncStorage.getItem(
            DARK_MODE_STORAGE_KEY,
          );
          setDarkModeEnabled(savedDarkMode === "true");
        } catch (error) {
          console.warn("Failed to load dark mode preference:", error);
        }
      })();
    }, []),
  );

  const colors = darkModeEnabled
    ? {
        bg: "#111815",
        headerBg: "#1a2520",
        cardBg: "#1f2b26",
        border: "#34483f",
        title: "#e7f1eb",
        text: "#b9c9c0",
        primary: "#1f3a2f",
      }
    : {
        bg: COLORS.bg,
        headerBg: COLORS.white,
        cardBg: COLORS.white,
        border: COLORS.border,
        title: COLORS.textDark,
        text: COLORS.textMid,
        primary: COLORS.primaryMid,
      };

  // Check for duplicate batches
  async function checkForDuplicates() {
    if (!examName) return null;

    try {
      const warning = await BatchHistoryService.checkDuplicateBatch(
        examName, // Using examName as examId
        version,
        5, // 5-minute window
      );
      return warning;
    } catch (error) {
      console.error("Error checking duplicates:", error);
      return null;
    }
  }

  // Check for version mismatch
  async function checkForVersionMismatch() {
    if (!examName) return null;

    try {
      const mismatch = await BatchHistoryService.checkVersionMismatch(
        examName, // Using examName as examId
        1, // Current template version
      );
      return mismatch;
    } catch (error) {
      console.error("Error checking version:", error);
      return null;
    }
  }

  // Create batch record after successful generation
  async function createBatchRecord() {
    if (!examName || !pdfMetrics) return;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn("User not authenticated, skipping batch creation");
        return;
      }

      const examCode = `${examName.toUpperCase().replace(/\s+/g, "-")}-${version}`;
      const batchId = await BatchHistoryService.createBatch(
        examName, // examId
        examName, // examTitle
        examCode,
        selected.label, // templateName
        version,
        1, // sheetsGenerated - 1 sheet per generation
        1, // templateVersion
        {
          totalQuestions: selected.totalQuestions,
          columns: selected.totalQuestions > 25 ? 2 : 1,
          studentIdLength: 8,
        },
      );

      console.log("✅ Batch created:", batchId);
    } catch (error) {
      console.error("Error creating batch:", error);
      // Don't throw - batch creation failure shouldn't block PDF generation
    }
  }

  // Main generation handler with duplicate/version checks
  async function handleGeneratePreview() {
    // Check for duplicates first
    const dupWarning = await checkForDuplicates();
    if (dupWarning?.isDuplicate) {
      setDuplicateWarning(dupWarning);
      setShowDuplicateModal(true);
      setPendingGeneration(true);
      return;
    }

    // Check for version mismatch
    const verMismatch = await checkForVersionMismatch();
    if (verMismatch?.hasMismatch) {
      setVersionMismatch(verMismatch);
      setShowVersionModal(true);
      setPendingGeneration(true);
      return;
    }

    // Proceed with generation
    await performGeneration();
  }

  // Actual PDF generation logic
  async function performGeneration() {
    setLoading(true);
    setErrorText(null);
    setPdfMetrics(null);
    setPdfUri(null);
    setHtmlContent(null);
    const startTime = Date.now();

    try {
      // Generate HTML content for preview
      const html = buildFallbackHtml(templateKey, examName, section, version);
      setHtmlContent(html);

      // Also generate PDF for download
      const local = await createPdfFromHtml(
        html,
        `omr-preview-${templateKey}-${version}-${Date.now()}`,
      );

      const fileInfo = await FileSystem.getInfoAsync(local);
      const fileSize =
        fileInfo.exists && "size" in fileInfo
          ? Math.round(fileInfo.size / 1024)
          : 0;
      const loadTime = Date.now() - startTime;

      if (fileSize === 0) {
        throw new Error("Failed to generate PDF. File is empty.");
      }

      setPdfUri(local);
      const metrics = {
        loadTime,
        fileSize,
        resolution: { width: 612, height: 792 },
      };
      setPdfMetrics(metrics);

      // Create batch record after successful generation
      await createBatchRecord();

      // Check performance
      if (loadTime > 5000) {
        setStatusModal({
          visible: true,
          type: "info",
          title: "Performance Notice",
          message: `Preview generated in ${(loadTime / 1000).toFixed(1)}s (target: <5s).`,
        });
      }
    } catch (error: any) {
      setPdfUri(null);
      setHtmlContent(null);
      setPdfMetrics(null);

      // Enhanced error messages
      let errorMessage = error?.message ?? "Failed to load preview.";
      if (
        error?.message?.includes("timeout") ||
        error?.message?.includes("network")
      ) {
        errorMessage =
          "Network timeout. Please check your internet connection and retry.";
      } else if (error?.message?.includes("corrupted")) {
        errorMessage = "PDF file is corrupted. Please try generating again.";
      }

      setErrorText(errorMessage);
    } finally {
      setLoading(false);
      setPendingGeneration(false);
    }
  }

  // Modal handlers
  function handleDuplicateCancel() {
    setShowDuplicateModal(false);
    setDuplicateWarning(null);
    setPendingGeneration(false);
  }

  function handleDuplicateProceed() {
    setShowDuplicateModal(false);
    setDuplicateWarning(null);
    performGeneration();
  }

  function handleVersionCancel() {
    setShowVersionModal(false);
    setVersionMismatch(null);
    setPendingGeneration(false);
  }

  function handleVersionProceed() {
    setShowVersionModal(false);
    setVersionMismatch(null);
    performGeneration();
  }

  function navigateToBatchHistory() {
    router.push("/(tabs)/batch-history");
  }

  async function handleDownload() {
    if (!pdfUri) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: "application/pdf",
          dialogTitle: "Download / Share PDF",
        });
      } else {
        setStatusModal({
          visible: true,
          type: "success",
          title: "Saved",
          message: `PDF saved to:\n${pdfUri}`,
        });
      }
    } catch (error: any) {
      setStatusModal({
        visible: true,
        type: "error",
        title: "Download Failed",
        message: error?.message ?? "Unable to download PDF.",
      });
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle={darkModeEnabled ? "light-content" : "dark-content"}
        backgroundColor={colors.headerBg}
        translucent={false}
      />

      <View
        style={[
          styles.header,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={goToQuizzes} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={rs(24)} color={colors.title} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.title }]}>OMR PDF Preview</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalPadding },
        ]}
      >
        <View style={[styles.stepCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.stepTitle, { color: colors.title }]}>Template</Text>
          <View style={styles.templateRow}>
            {TEMPLATES.map((t) => {
              const active = t.key === templateKey;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.templateBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: darkModeEnabled ? "#2a3a33" : "#f3f7f4",
                    },
                    active && styles.templateBtnActive,
                    active && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setTemplateKey(t.key)}
                >
                  <Text
                    style={[
                      styles.templateText,
                      active && styles.templateTextActive,
                      { color: active ? "#fff" : colors.title },
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Exam Title</Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: darkModeEnabled ? "#2a3a33" : COLORS.white,
                color: colors.title,
              },
            ]}
            value={examName}
            onChangeText={setExamName}
            placeholder="Exam title"
            placeholderTextColor={darkModeEnabled ? "#8fa39a" : "#9ca3af"}
          />

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Section/Block</Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: darkModeEnabled ? "#2a3a33" : COLORS.white,
                color: colors.title,
              },
            ]}
            value={section}
            onChangeText={setSection}
            placeholder="e.g., BSIT-3B"
            placeholderTextColor={darkModeEnabled ? "#8fa39a" : "#9ca3af"}
          />

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Version</Text>
          <View style={styles.versionRow}>
            {VERSIONS.map((v) => {
              const active = version === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.versionBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: darkModeEnabled ? "#2a3a33" : "#f3f7f4",
                    },
                    active && styles.versionBtnActive,
                    active && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setVersion(v)}
                >
                  <Text
                    style={[
                      styles.versionText,
                      active && styles.versionTextActive,
                      { color: active ? "#fff" : colors.title },
                    ]}
                  >
                    {v}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.previewBtn, { backgroundColor: colors.primary }]}
            onPress={handleGeneratePreview}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.previewBtnText}>Generate PDF Preview</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.infoText, { color: colors.text }]}>
            Expected load: within 5 seconds (normal connection).
          </Text>
          <Text style={[styles.infoText, { color: colors.text }]}>
            Questions: {selected.totalQuestions} • Includes exam code + ID
            bubble grid + logo
          </Text>

          <TouchableOpacity
            style={[
              styles.batchHistoryBtn,
              {
                borderColor: colors.primary,
                backgroundColor: darkModeEnabled ? "#2a3a33" : COLORS.white,
              },
            ]}
            onPress={navigateToBatchHistory}
          >
            <Ionicons
              name="time-outline"
              size={rs(18)}
              color={colors.primary}
            />
            <Text style={[styles.batchHistoryText, { color: colors.primary }]}>View Batch History</Text>
          </TouchableOpacity>
        </View>

        {errorText ? (
          <View
            style={[
              styles.errorBox,
              darkModeEnabled && {
                backgroundColor: "#3a2626",
                borderColor: "#7a4a4a",
              },
            ]}
          >
            <Text style={styles.errorTitle}>PDF Preview Failed</Text>
            <Text style={[styles.errorText, { color: darkModeEnabled ? "#f1c6c6" : COLORS.textMid }]}>
              {errorText}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={handleGeneratePreview}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {htmlContent ? (
          <View style={[styles.viewerCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={[styles.viewerHeader, { backgroundColor: darkModeEnabled ? "#2a3a33" : "#f5f9f6", borderBottomColor: colors.border }]}>
              <Text style={[styles.viewerTitle, { color: colors.title }]}>Answer Sheet Preview</Text>
              <TouchableOpacity
                style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
                onPress={handleDownload}
              >
                <Ionicons
                  name="download-outline"
                  size={rs(16)}
                  color={COLORS.white}
                />
                <Text style={styles.downloadText}>Download PDF</Text>
              </TouchableOpacity>
            </View>

            {pdfMetrics && (
              <View
                style={[
                  styles.metricsBar,
                  {
                    backgroundColor: darkModeEnabled ? "#22302a" : "#f9fafb",
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.metricItem}>
                  <Ionicons
                    name="time-outline"
                    size={rs(14)}
                    color={
                      pdfMetrics.loadTime <= 5000
                        ? COLORS.success
                        : COLORS.warning
                    }
                  />
                  <Text
                    style={[
                      styles.metricText,
                      { color: darkModeEnabled ? "#c4d2cb" : COLORS.textMid },
                      pdfMetrics.loadTime <= 5000 && styles.metricSuccess,
                    ]}
                  >
                    {(pdfMetrics.loadTime / 1000).toFixed(1)}s
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Ionicons
                    name="document-outline"
                    size={rs(14)}
                    color={
                      pdfMetrics.fileSize <= 1500
                        ? COLORS.success
                        : COLORS.warning
                    }
                  />
                  <Text
                    style={[
                      styles.metricText,
                      { color: darkModeEnabled ? "#c4d2cb" : COLORS.textMid },
                      pdfMetrics.fileSize <= 1500 && styles.metricSuccess,
                    ]}
                  >
                    {pdfMetrics.fileSize}KB
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Ionicons
                    name="resize-outline"
                    size={rs(14)}
                    color={COLORS.success}
                  />
                  <Text style={[styles.metricText, { color: darkModeEnabled ? "#c4d2cb" : COLORS.textMid }]}>
                    {pdfMetrics.resolution.width}×{pdfMetrics.resolution.height}
                  </Text>
                </View>
              </View>
            )}

            <WebView
              source={{ html: htmlContent }}
              style={styles.webview}
              javaScriptEnabled
              domStorageEnabled
              scalesPageToFit
              originWhitelist={["*"]}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error("WebView error:", nativeEvent);
                setErrorText("Failed to load preview. Please try again.");
              }}
              onLoadEnd={() => setLoading(false)}
            />

            {loading && (
              <View
                style={[
                  styles.webviewLoader,
                  {
                    backgroundColor: darkModeEnabled
                      ? "rgba(17,24,21,0.88)"
                      : "rgba(255,255,255,0.9)",
                  },
                ]}
              >
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text
                  style={[
                    styles.loadingText,
                    { color: darkModeEnabled ? "#c4d2cb" : COLORS.textMid },
                  ]}
                >
                  Loading Preview...
                </Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={{ height: rp(20) }} />
      </ScrollView>

      <StatusModal
        visible={statusModal.visible}
        type={statusModal.type}
        title={statusModal.title}
        message={statusModal.message}
        onClose={() =>
          setStatusModal({
            visible: false,
            type: "info",
            title: "",
            message: "",
          })
        }
      />

      <DuplicateBatchWarningModal
        visible={showDuplicateModal}
        existingBatch={duplicateWarning?.existingBatch || null}
        onCancel={handleDuplicateCancel}
        onProceed={handleDuplicateProceed}
      />

      <VersionMismatchWarningModal
        visible={showVersionModal}
        currentVersion={versionMismatch?.currentVersion || 1}
        batchVersion={versionMismatch?.batchVersion || 1}
        message={versionMismatch?.message || ""}
        onClose={handleVersionCancel}
        onProceed={handleVersionProceed}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.white,
    paddingTop: isAndroid ? androidStatusBarHeight + rp(12) : rp(12),
    paddingBottom: rp(12),
    paddingHorizontal: horizontalPadding,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
    }),
  },
  headerBack: { width: rs(28), alignItems: "center" },
  headerTitle: { fontSize: rf(18), fontWeight: "700", color: COLORS.textDark },
  content: { paddingVertical: rp(14), gap: rp(12) },

  stepCard: {
    backgroundColor: COLORS.white,
    borderRadius: rs(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: rp(14),
  },
  stepTitle: {
    fontSize: rf(15),
    fontWeight: "700",
    color: COLORS.textDark,
    marginBottom: rp(8),
  },
  templateRow: {
    flexDirection: "row",
    gap: rp(8),
    marginBottom: rp(10),
    flexWrap: "wrap",
  },
  templateBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: rs(RADIUS.sm),
    paddingVertical: rp(7),
    paddingHorizontal: rp(10),
    backgroundColor: "#f3f7f4",
  },
  templateBtnActive: {
    backgroundColor: COLORS.primaryMid,
    borderColor: COLORS.primaryMid,
  },
  templateText: { fontSize: rf(12), color: COLORS.textDark, fontWeight: "600" },
  templateTextActive: { color: COLORS.white },

  fieldLabel: {
    fontSize: rf(12),
    color: COLORS.textMid,
    marginBottom: rp(4),
    marginTop: rp(8),
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: rs(RADIUS.sm),
    backgroundColor: COLORS.white,
    fontSize: rf(13),
    color: COLORS.textDark,
    paddingHorizontal: rp(10),
    paddingVertical: rp(9),
  },
  versionRow: { flexDirection: "row", gap: rp(8), marginTop: rp(4) },
  versionBtn: {
    width: rs(42),
    height: rs(34),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: rs(RADIUS.sm),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f7f4",
  },
  versionBtnActive: {
    backgroundColor: COLORS.primaryMid,
    borderColor: COLORS.primaryMid,
  },
  versionText: { color: COLORS.textDark, fontSize: rf(13), fontWeight: "700" },
  versionTextActive: { color: COLORS.white },

  previewBtn: {
    marginTop: rp(12),
    backgroundColor: COLORS.primaryMid,
    borderRadius: rs(RADIUS.sm),
    paddingVertical: rp(11),
    alignItems: "center",
    justifyContent: "center",
  },
  previewBtnText: { color: COLORS.white, fontSize: rf(13), fontWeight: "700" },
  infoText: { marginTop: rp(6), color: COLORS.textMuted, fontSize: rf(11) },
  batchHistoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rp(8),
    marginTop: rp(12),
    paddingVertical: rp(10),
    paddingHorizontal: rp(16),
    borderRadius: rs(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.primaryMid,
    backgroundColor: COLORS.white,
  },
  batchHistoryText: {
    fontSize: rf(13),
    fontWeight: "600",
    color: COLORS.primaryMid,
  },

  errorBox: {
    backgroundColor: "#fff4f3",
    borderColor: "#ffd5d1",
    borderWidth: 1,
    borderRadius: rs(RADIUS.md),
    padding: rp(12),
  },
  errorTitle: { color: COLORS.danger, fontSize: rf(13), fontWeight: "700" },
  errorText: { color: COLORS.textMid, fontSize: rf(12), marginTop: rp(4) },
  retryBtn: {
    marginTop: rp(8),
    alignSelf: "flex-start",
    borderRadius: rs(RADIUS.sm),
    backgroundColor: COLORS.primaryMid,
    paddingHorizontal: rp(10),
    paddingVertical: rp(7),
  },
  retryText: { color: COLORS.white, fontSize: rf(12), fontWeight: "700" },

  viewerCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: rs(RADIUS.md),
    overflow: "hidden",
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f5f9f6",
    paddingHorizontal: rp(10),
    paddingVertical: rp(8),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  viewerTitle: { fontSize: rf(13), color: COLORS.textDark, fontWeight: "700" },
  downloadBtn: {
    backgroundColor: COLORS.primaryMid,
    borderRadius: rs(RADIUS.sm),
    paddingHorizontal: rp(10),
    paddingVertical: rp(6),
    flexDirection: "row",
    alignItems: "center",
    gap: rp(6),
  },
  downloadText: { color: COLORS.white, fontSize: rf(12), fontWeight: "700" },
  webview: { height: rp(480), backgroundColor: "#efefef" },
  webviewLoader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: rp(10),
    fontSize: rf(13),
    color: COLORS.textMid,
  },
  metricsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: rp(10),
    paddingVertical: rp(8),
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  metricItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: rp(4),
  },
  metricText: {
    fontSize: rf(11),
    color: COLORS.textMid,
    fontWeight: "600",
  },
  metricSuccess: {
    color: COLORS.success,
  },
});
