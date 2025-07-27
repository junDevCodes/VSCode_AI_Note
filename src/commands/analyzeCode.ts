// src/commands/analyzeCode.ts
import * as vscode from "vscode";
import { NotificationManager } from "../utils/notificationManager";
import { GeminiApiClient } from "../core/geminiApiClient";
import { SecretManager } from "../core/secretManager"; // SecretManager도 필요하므로 임포트
import { FileSystemManager } from "../utils/fileSystemManager"; // FileSystemManager 임포트 추가
import * as path from "path";
import { aiNoteOutputChannel } from "../extension";

/**
 * '코드 분석 및 노트 생성' 명령어의 메인 로직을 처리하는 클래스입니다.
 * 현재 에디터의 코드를 Gemini API를 통해 분석하고, 결과를 웹뷰로 표시합니다.
 */
export class AnalyzeCodeCommand {
  private static webviewPanel: vscode.WebviewPanel | undefined;
  private static geminiApiClient: GeminiApiClient | undefined;

  /**
   * 파일 이름에서 플랫폼, 문제 ID, 제목을 파싱합니다.
   * 예: "[프로그래머스]1234_K번째_수.py" -> { platform: "프로그래머스", problemId: "1234", title: "K번째 수" }
   * @param fileName 파싱할 파일 이름
   * @returns 파싱된 정보 또는 기본값
   */
  private static parseFileName(fileName: string): {
    platform: string;
    problemId: string;
    title: string;
  } {
    const result = {
      platform: "Unknown",
      problemId: "Unknown",
      title: path.basename(fileName, path.extname(fileName)),
    };
    const regex = /\[(.*?)\](\d+)_?([^_.]+)?(?:\.py|\.js|\.ts|\.java|\.cpp)?$/i;
    const match = fileName.match(regex);

    if (match) {
      result.platform = match[1] || "Unknown";
      result.problemId = match[2] || "Unknown";
      result.title =
        match[3] || path.basename(fileName, path.extname(fileName));
    }
    return result;
  }

  /**
   * 명령어를 실행하는 진입점입니다.
   */
  static async run(context: vscode.ExtensionContext): Promise<void> {
    // GeminiApiClient 인스턴스가 없으면 새로 생성
    if (!AnalyzeCodeCommand.geminiApiClient) {
      const secretManager = new SecretManager(context);
      AnalyzeCodeCommand.geminiApiClient = new GeminiApiClient(secretManager);
    }

    // Gemini API 클라이언트 초기화 (API 키 확인 및 유도)
    const initialized = await AnalyzeCodeCommand.geminiApiClient.initialize();
    if (!initialized) {
      // 초기화 실패 (API 키 없음 또는 사용자 취소)
      NotificationManager.showWarning(
        "Gemini API 클라이언트 초기화에 실패했습니다. API 키를 확인해주세요."
      );
      return;
    }

    // 현재 활성화된 텍스트 에디터 가져오기
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      NotificationManager.showWarning(
        "활성화된 텍스트 에디터가 없습니다. 코드를 연 후 다시 시도하세요."
      );
      return;
    }

    const document = editor.document;
    const code = document.getText(); // 현재 에디터의 모든 코드 가져오기
    const language = document.languageId; // 현재 파일의 언어 ID 가져오기
    const fileName = path.basename(document.uri.fsPath); // 현재 파일 이름 가져오기

    // 파일 이름에서 정보 파싱
    const { platform, problemId, title } =
      AnalyzeCodeCommand.parseFileName(fileName);
    aiNoteOutputChannel.appendLine(
      `[DEBUG] Parsed file info: Platform=${platform}, ProblemId=${problemId}, Title=${title}`
    );

    if (!code.trim()) {
      NotificationManager.showWarning(
        "분석할 코드가 없습니다. 파일이 비어 있습니다."
      );
      return;
    }

    NotificationManager.showStatusBarMessage(
      "AI가 코드를 분석하고 있습니다...",
      0
    );
    aiNoteOutputChannel.appendLine("[INFO] Starting code analysis command.");

    try {
      // Gemini API에 보낼 프롬프트 구성
      const prompt = this.generatePrompt(
        code,
        language,
        platform,
        problemId,
        title
      );

      // Gemini API 호출
      const analysisResult =
        await AnalyzeCodeCommand.geminiApiClient.generateContent(prompt);

      if (analysisResult) {
        // 1. AI 분석 결과를 파일로 저장
        const workspaceRootUri = FileSystemManager.getWorkspaceRootUri();
        if (!workspaceRootUri) {
          NotificationManager.showError(
            "작업 공간 루트를 찾을 수 없어 분석 노트를 저장할 수 없습니다."
          );
          return;
        }

        // 현재 열려있는 파일의 URI에서 디렉토리 경로 추출 (수정된 부분)
        const currentFileUri = editor.document.uri;
        const currentFileDirPath = path.dirname(currentFileUri.fsPath);
        const currentFileDirUri = vscode.Uri.file(currentFileDirPath); // 추출한 디렉토리 경로로 새로운 Uri 생성

        // 파일 이름에서 확장자를 제거하고 "_analysis.md" 추가
        const originalFileName = path.basename(currentFileUri.fsPath); // 파일 이름만 가져오기
        const baseFileName =
          originalFileName.substring(0, originalFileName.lastIndexOf(".")) ||
          originalFileName;
        const analysisFileName = `${baseFileName}_analysis.md`;

        const analysisFilePath = vscode.Uri.joinPath(
          currentFileDirUri,
          analysisFileName
        );

        const fileWritten = await FileSystemManager.writeFile(
          analysisFilePath,
          analysisResult
        );
        if (fileWritten) {
          NotificationManager.showInformation(
            `AI 코드 분석 노트가 '${analysisFileName}' 파일로 저장되었습니다.`
          );
          aiNoteOutputChannel.appendLine(
            `[INFO] Analysis note saved to: ${analysisFilePath.fsPath}`
          );

          // 2. 저장된 마크다운 파일을 미리보기 모드로 열기
          const mdDocument = await vscode.workspace.openTextDocument(
            analysisFilePath
          );
          await vscode.commands.executeCommand(
            "markdown.showPreviewToSide",
            mdDocument.uri
          );
        } else {
          NotificationManager.showError(
            "AI 코드 분석 노트 파일 저장에 실패했습니다."
          );
          aiNoteOutputChannel.appendLine(
            "[ERROR] Failed to save analysis note file."
          );
        }
      } else {
        aiNoteOutputChannel.appendLine(
          "[ERROR] AnalyzeCodeCommand: Gemini API returned no content."
        );
      }
    } catch (error: any) {
      NotificationManager.showError(`코드 분석 중 오류 발생: ${error.message}`);
      aiNoteOutputChannel.appendLine(
        `[ERROR] Analyze Code Command general error: ${error.message}`
      );
      aiNoteOutputChannel.appendLine(
        `[DEBUG] Error details: ${JSON.stringify(
          error,
          Object.getOwnPropertyNames(error),
          2
        )}`
      );
    } finally {
      NotificationManager.hideStatusBarMessage();
      aiNoteOutputChannel.appendLine("[INFO] Code analysis command finished.");
    }
  }
  /**
   * Gemini API에 보낼 프롬프트 텍스트를 생성합니다.
   * @param code 분석할 코드
   * @param language 코드의 언어
   * @param platform 문제 플랫폼 (예: "프로그래머스")
   * @param problemId 문제 번호 (예: "1234")
   * @param title 문제 제목 (예: "K번째 수")
   * @returns 생성된 프롬프트 텍스트
   */
  private static generatePrompt(
    code: string,
    language: string,
    platform: string,
    problemId: string,
    title: string
  ): string {
    const analyzedAt = new Date().toISOString().split("T")[0];

    let mainHeading = `## ${platform !== "Unknown" ? platform : "제공된"} ${
      problemId !== "Unknown" ? `${problemId}번` : ""
    } ${language} 코드 분석`;
    let initialSentence = "";

    if (platform !== "Unknown" && problemId !== "Unknown") {
      initialSentence = `${platform} ${problemId}번 ${language} 코드는 `;
    } else {
      initialSentence = `제공된 ${language} 코드는 `;
    }

    return `---
platform: ${platform}
problem_id: ${problemId}
title: ${title}
language: ${language}
analyzed_at: ${analyzedAt}
---

You are an expert software engineer and a coding test specialist. You are also a helpful AI assistant.
Analyze the following ${language} code from the perspective of a coding test problem solution.
Provide a comprehensive analysis note in **Korean Markdown format** based on the following instructions.
Ensure the analysis is **evidence-based** and backed by **professional reasoning**.

${mainHeading}

### 1. 전체 분석 및 접근 방식 (Overall Analysis & Approach)
* Briefly describe the overall purpose and main functionalities of the provided code.
* Provide a concise overview of the general algorithm or core approach used by the code to solve the problem.

### 2. 코드 구조 및 가독성 (Code Structure & Readability)
* Evaluate the code's organization (e.g., function separation, variable naming conventions, comment usage) and overall readability.
* **Identify any potential code smells or common antipatterns** (e.g., magic numbers, code duplication, overly long functions, etc.), and **propose specific improvements** for them.
* Suggest **concrete ways to enhance the code's readability**.

### 3. 시간 복잡도 분석 (Time Complexity Analysis)
* **Clearly state the time complexity of the main logic using Big O notation.**
* **Explain the derivation process in detail, citing specific evidence** such as loop iterations, nested structures, and the complexity of operations on used data structures.

### 4. 공간 복잡도 분석 (Space Complexity Analysis)
* **Clearly state the space complexity of the main logic using Big O notation.**
* **Explain the derivation process in detail, citing specific evidence** such as variables, data structures (arrays, lists, maps, etc.) that consume memory.

### 5. 잠재적 문제점 및 버그 (Potential Issues & Bugs)
* Point out any **potential bugs, unhandled edge cases, or common mistakes** in the code.
* Provide **specific scenarios** for each identified issue.
* **If any part of the analysis is based on assumptions or is uncertain, clearly state those assumptions and explain why.**

### 6. 개선 제안 (Suggestions for Improvement)
* Propose **concrete methods to optimize performance, improve code clarity, or handle more cases.**
* **Specifically explain how your proposed optimizations impact specific performance metrics like time or memory.**
* **Suggest improvements by applying idiomatic ${language} code or best practices for the ${language} language, providing concrete code examples where applicable.**
* **Include simple test cases or scenarios that can verify the suggested improvements.**

### 7. 대안적 접근 방식 (Alternative Approaches) (선택 사항)
* Briefly mention any **alternative algorithms or data structures** that could be considered for solving this problem. (This section should be generated as needed.)

---

Here is the code to analyze:

\`\`\`${language}
${code}
\`\`\`
`;
  }
  /**
   * 웹뷰에 표시될 HTML 콘텐츠를 생성합니다.
   * @param markdownContent Gemini API에서 받은 마크다운 분석 결과
   * @returns 웹뷰에 렌더링될 HTML 문자열
   */
  private static getWebviewContent(markdownContent: string): string {
    // ... (이 메서드는 변경 없음)
    const escapedMarkdown = markdownContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 코드 분석 노트</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; line-height: 1.6; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); }
        h1, h2, h3, h4, h5, h6 { color: var(--vscode-textLink-foreground); margin-top: 1em; margin-bottom: 0.5em; }
        pre { background-color: var(--vscode-editorGroup-border); padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
        code { font-family: "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background-color: var(--vscode-textBlockQuote-background); padding: 2px 4px; border-radius: 3px; }
        blockquote { border-left: 4px solid var(--vscode-editorWidget-background); padding-left: 1em; margin-left: 0; color: var(--vscode-editor-foreground); }
        a { color: var(--vscode-textLink-activeForeground); }
        strong { color: var(--vscode-editor-foreground); }
        p { margin-bottom: 1em; }
        ul, ol { margin-bottom: 1em; padding-left: 20px; }
        li { margin-bottom: 0.5em; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
        th, td { border: 1px solid var(--vscode-editorGroup-border); padding: 8px; text-align: left; }
        th { background-color: var(--vscode-editorGroupHeader-tabsBorder); }
    </style>
</head>
<body>
    <div id="content">
        <pre>${escapedMarkdown}</pre>
    </div>
    <script>
        // A more advanced implementation would use a markdown rendering library (e.g., marked.js) here
        // to convert markdownContent into proper HTML. For simplicity, we are using <pre>
        // For now, let's just display the preformatted markdown text.
        // Future improvement: Add a markdown renderer.
    </script>
</body>
</html>`;
  }
}
