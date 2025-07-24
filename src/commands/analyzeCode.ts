// src/commands/analyzeCode.ts
import * as vscode from "vscode";
import { NotificationManager } from "../utils/notificationManager";
import { GeminiApiClient } from "../core/geminiApiClient";
import { SecretManager } from "../core/secretManager"; // SecretManager도 필요하므로 임포트
import { FileSystemManager } from "../utils/fileSystemManager"; // FileSystemManager 임포트 추가
import * as path from "path";

/**
 * '코드 분석 및 노트 생성' 명령어의 메인 로직을 처리하는 클래스입니다.
 * 현재 에디터의 코드를 Gemini API를 통해 분석하고, 결과를 웹뷰로 표시합니다.
 */
export class AnalyzeCodeCommand {
  private static webviewPanel: vscode.WebviewPanel | undefined;
  private static geminiApiClient: GeminiApiClient | undefined;

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

    try {
      // Gemini API에 보낼 프롬프트 구성
      const prompt = this.generatePrompt(code, language);

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
        }

        NotificationManager.showInformation("AI 코드 분석이 완료되었습니다."); // 최종 성공 알림
      } else {
        NotificationManager.showError(
          "AI 코드 분석 결과를 가져오지 못했습니다."
        );
      }
    } catch (error: any) {
      NotificationManager.showError(`코드 분석 중 오류 발생: ${error.message}`);
      console.error("Analyze Code Command Error:", error);
    } finally {
      NotificationManager.hideStatusBarMessage();
    }
  }

  /**
   * Gemini API에 보낼 프롬프트 텍스트를 생성합니다.
   * @param code 분석할 코드
   * @param language 코드의 언어
   * @returns 생성된 프롬프트 텍스트
   */
  private static generatePrompt(code: string, language: string): string {
    // 여기에 코드 분석을 위한 구체적인 프롬프트를 작성합니다.
    // 예를 들어, "이 ${language} 코드를 분석하고, 개선점, 버그 가능성, 시간 복잡도, 공간 복잡도에 대해 상세한 노트를 제공해줘."
    return `You are an expert programming assistant. Analyze the following ${language} code for a coding test problem. Provide a comprehensive note that includes:\n\n1. **Overall Analysis & Approach**: Briefly describe what the code does and its general approach.\n2. **Code Structure & Readability**: Comment on code organization, variable names, comments, and overall readability.\n3. **Time Complexity Analysis**: Estimate the time complexity of the main logic with justification.\n4. **Space Complexity Analysis**: Estimate the space complexity of the main logic with justification.\n5. **Potential Issues/Bugs**: Identify any potential bugs, edge cases not handled, or common pitfalls.\n6. **Suggestions for Improvement**: Suggest ways to optimize performance, improve clarity, or handle more cases. Provide specific code examples if applicable.\n7. **Alternative Approaches (Optional)**: Briefly mention any alternative algorithms or data structures that could be used.\n\nHere is the code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nPlease provide the note in Markdown format.`;
  }

  /**
   * 웹뷰에 표시될 HTML 콘텐츠를 생성합니다.
   * @param markdownContent Gemini API에서 받은 마크다운 분석 결과
   * @returns 웹뷰에 렌더링될 HTML 문자열
   */
  private static getWebviewContent(markdownContent: string): string {
    // 마크다운 렌더링을 위해 간단한 CSS와 스크립트를 포함할 수 있습니다.
    // 여기서는 기본 마크다운 렌더링을 위해 <pre> 태그 안에 넣거나,
    // 더 나은 렌더링을 위해 마크다운 라이브러리를 사용해야 합니다 (향후 개선 가능성).
    // 일단은 기본 스타일과 함께 마크다운 텍스트를 표시합니다.
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
        /* Markdown rendering basic styles */
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
