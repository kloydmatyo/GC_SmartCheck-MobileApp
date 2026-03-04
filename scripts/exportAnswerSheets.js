const fs = require('fs');
const path = require('path');

function getTemplates() {
  return {
    standard20: {
      name: 'Standard 20 Questions',
      totalQuestions: 20,
      questionsPerColumn: 20,
      columns: 1,
      studentIdLength: 8,
      bubbleRadius: 8,
      spacing: { horizontal: 25, vertical: 18 },
      margins: { top: 120, left: 50, right: 50, bottom: 50 },
      regions: {
        studentId: { x: 50, y: 40, width: 300, height: 60 },
        answers: { x: 50, y: 120, width: 200, height: 400 },
        examInfo: { x: 300, y: 40, width: 150, height: 60 },
      },
    },
    standard50: {
      name: 'Standard 50 Questions',
      totalQuestions: 50,
      questionsPerColumn: 25,
      columns: 2,
      studentIdLength: 8,
      bubbleRadius: 6,
      spacing: { horizontal: 20, vertical: 15 },
      margins: { top: 120, left: 40, right: 40, bottom: 40 },
      regions: {
        studentId: { x: 40, y: 30, width: 280, height: 60 },
        answers: { x: 40, y: 120, width: 400, height: 400 },
        examInfo: { x: 350, y: 30, width: 120, height: 60 },
      },
    },
    standard100: {
      name: 'Standard 100 Questions',
      totalQuestions: 100,
      questionsPerColumn: 50,
      columns: 2,
      studentIdLength: 8,
      bubbleRadius: 5,
      spacing: { horizontal: 18, vertical: 12 },
      margins: { top: 100, left: 30, right: 30, bottom: 30 },
      regions: {
        studentId: { x: 30, y: 20, width: 250, height: 60 },
        answers: { x: 30, y: 100, width: 450, height: 650 },
        examInfo: { x: 320, y: 20, width: 100, height: 60 },
      },
    },
  };
}

function generateStudentIdSection(template) {
  const { studentId } = template.regions;
  const { bubbleRadius, spacing } = template;

  let svg = `\n  <!-- Student ID Section -->\n  <text x="${studentId.x}" y="${studentId.y - 10}" class="label-text">STUDENT ID (Fill bubbles for each digit)</text>\n  <rect x="${studentId.x - 5}" y="${studentId.y - 5}" width="${studentId.width + 10}" height="${studentId.height + 10}" \n        fill="none" stroke="black" stroke-width="1"/>\n`;

  for (let pos = 0; pos < template.studentIdLength; pos++) {
    const x = studentId.x + 20 + pos * spacing.horizontal;
    svg += `<text x="${x}" y="${studentId.y + 10}" class="question-text" text-anchor="middle">${pos + 1}</text>`;

    for (let digit = 0; digit <= 9; digit++) {
      const y = studentId.y + 20 + digit * 15;
      svg += `<circle cx="${x}" cy="${y}" r="${bubbleRadius}" class="bubble"/>`;
      svg += `<text x="${x - 15}" y="${y + 3}" class="question-text">${digit}</text>`;
    }
  }

  return svg;
}

function generateAnswerSection(template) {
  const { answers } = template.regions;
  const { bubbleRadius, spacing } = template;

  let svg = `\n  <!-- Answer Section -->\n  <text x="${answers.x}" y="${answers.y - 10}" class="label-text">ANSWERS</text>\n  <rect x="${answers.x - 5}" y="${answers.y - 5}" width="${answers.width + 10}" height="${answers.height + 10}" \n        fill="none" stroke="black" stroke-width="1"/>\n`;

  const questionsPerColumn = template.questionsPerColumn;
  const options = ['A', 'B', 'C', 'D'];

  for (let col = 0; col < template.columns; col++) {
    const colX = answers.x + 20 + col * 200;

    for (let row = 0; row < questionsPerColumn; row++) {
      const questionNum = col * questionsPerColumn + row + 1;
      if (questionNum > template.totalQuestions) break;

      const questionY = answers.y + 20 + row * spacing.vertical;
      svg += `<text x="${colX - 15}" y="${questionY + 3}" class="question-text">${questionNum}</text>`;

      options.forEach((option, optIndex) => {
        const bubbleX = colX + optIndex * spacing.horizontal;
        svg += `<circle cx="${bubbleX}" cy="${questionY}" r="${bubbleRadius}" class="bubble"/>`;
        svg += `<text x="${bubbleX}" y="${questionY - bubbleRadius - 3}" class="question-text" text-anchor="middle">${option}</text>`;
      });
    }
  }

  return svg;
}

function generateAnswerSheetSVG(templateName, examId = 'EXAM001', version = 'A') {
  const templates = getTemplates();
  const template = templates[templateName];
  if (!template) throw new Error(`Template ${templateName} not found`);

  const svgWidth = 612;
  const svgHeight = 792;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">\n  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white"/>\n  <defs>\n    <style>\n      .header-text { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; }\n      .label-text { font-family: Arial, sans-serif; font-size: 10px; }\n      .question-text { font-family: Arial, sans-serif; font-size: 9px; }\n      .bubble { fill: none; stroke: black; stroke-width: 1; }\n      .grid-line { stroke: #ccc; stroke-width: 0.5; }\n    </style>\n  </defs>\n  \n  <!-- Header -->\n  <text x="50" y="25" class="header-text">ZIPGRADE ANSWER SHEET</text>\n  <text x="400" y="25" class="label-text">Exam: ${examId} | Version: ${version}</text>\n  \n  <!-- Instructions -->\n  <text x="50" y="45" class="label-text">• Use a #2 pencil only</text>\n  <text x="50" y="58" class="label-text">• Fill bubbles completely</text>\n  <text x="50" y="71" class="label-text">• Erase cleanly to change answers</text>\n`;

  svg += generateStudentIdSection(template);
  svg += generateAnswerSection(template);

  svg += `\n  <!-- Footer -->\n  <text x="50" y="${svgHeight - 20}" class="label-text">SmartCheck Mobile Scanner Compatible</text>\n  \n  <!-- Alignment markers -->\n  <circle cx="30" cy="30" r="3" fill="black"/>\n  <circle cx="${svgWidth - 30}" cy="30" r="3" fill="black"/>\n  <circle cx="30" cy="${svgHeight - 30}" r="3" fill="black"/>\n  <circle cx="${svgWidth - 30}" cy="${svgHeight - 30}" r="3" fill="black"/>\n  \n</svg>`;

  return svg;
}

function generateFilledAnswerSheet(templateName, studentId, answers, examId = 'EXAM001') {
  const templates = getTemplates();
  const template = templates[templateName];
  let svg = generateAnswerSheetSVG(templateName, examId);

  const studentIdDigits = studentId.padStart(template.studentIdLength, '0').split('');
  studentIdDigits.forEach((digit, pos) => {
    const x = template.regions.studentId.x + 20 + pos * template.spacing.horizontal;
    const y = template.regions.studentId.y + 20 + parseInt(digit, 10) * 15;
    svg = svg.replace(
      `<circle cx="${x}" cy="${y}" r="${template.bubbleRadius}" class="bubble"/>`,
      `<circle cx="${x}" cy="${y}" r="${template.bubbleRadius}" class="bubble" fill="black"/>`,
    );
  });

  Object.entries(answers).forEach(([questionNum, answer]) => {
    const qNum = parseInt(questionNum, 10);
    const col = Math.floor((qNum - 1) / template.questionsPerColumn);
    const row = (qNum - 1) % template.questionsPerColumn;

    const colX = template.regions.answers.x + 20 + col * 200;
    const questionY = template.regions.answers.y + 20 + row * template.spacing.vertical;

    const optIndex = ['A', 'B', 'C', 'D'].indexOf(answer);
    if (optIndex === -1) return;
    const bubbleX = colX + optIndex * template.spacing.horizontal;

    svg = svg.replace(
      `<circle cx="${bubbleX}" cy="${questionY}" r="${template.bubbleRadius}" class="bubble"/>`,
      `<circle cx="${bubbleX}" cy="${questionY}" r="${template.bubbleRadius}" class="bubble" fill="black"/>`,
    );
  });

  return svg;
}

function createDeterministicAnswers(totalQuestions) {
  const opts = ['A', 'B', 'C', 'D'];
  const answers = {};
  for (let i = 1; i <= totalQuestions; i++) {
    answers[i] = opts[(i - 1) % opts.length];
  }
  return answers;
}

function exportSheets() {
  const outDir = path.join(process.cwd(), 'artifacts', 'answer-sheets');
  fs.mkdirSync(outDir, { recursive: true });

  const templates = getTemplates();
  const templateKeys = ['standard20', 'standard50', 'standard100'];

  for (const key of templateKeys) {
    const template = templates[key];
    const blankSvg = generateAnswerSheetSVG(key, 'EXAM001', 'A');
    const blankPath = path.join(outDir, `${key}-blank.svg`);
    fs.writeFileSync(blankPath, blankSvg, 'utf8');

    const answers = createDeterministicAnswers(template.totalQuestions);
    const filledSvg = generateFilledAnswerSheet(key, '12345678', answers, 'EXAM001');
    const filledPath = path.join(outDir, `${key}-prefilled.svg`);
    fs.writeFileSync(filledPath, filledSvg, 'utf8');
  }

  console.log('Exported answer sheets to:', outDir);
  fs.readdirSync(outDir).forEach((name) => console.log('-', name));
}

exportSheets();




