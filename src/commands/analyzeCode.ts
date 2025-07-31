// src/commands/analyzeCode.ts
import * as vscode from "vscode";
import * as path from "path";
import { NotificationManager } from "../utils/notificationManager";
import { GeminiApiClient } from "../core/geminiApiClient";
import { SecretManager } from "../core/secretManager";
import { FileSystemManager } from "../utils/fileSystemManager"; // FileSystemManager 임포트 추가
import { aiNoteOutputChannel } from "../extension";

/**
 * '코드 분석 및 노트 생성' 명령어의 메인 로직을 처리하는 클래스입니다.
 * 현재 활성 에디터의 코드를 Gemini API로 분석하고 결과를 Markdown 파일로 저장합니다.
 */
export class AnalyzeCodeCommand {
  private static geminiApiClient: GeminiApiClient | undefined;
  private static readonly promptTemplateFileName = "analyze_code_prompt.md";

  /**
   * 파일 이름에서 플랫폼, 문제 ID, 제목을 파싱합니다.
   * 예: "[백준]1000_A+B.py" -> { platform: "백준", problemId: "1000", title: "A+B" }
   * 예: "[프로그래머스]42576_완주하지_못한_선수.js" -> { platform: "프로그래머스", problemId: "42576", title: "완주하지 못한 선수" }
   * 예: "test_file.py" -> { platform: "Unknown", problemId: "Unknown", title: "test_file" }
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
      title: path.basename(fileName, path.extname(fileName)), // 파일 확장자 제거
    };

    // 플랫폼, 문제 ID, 제목을 유연하게 매칭하는 정규식
    // 플랫폼은 대괄호 [] 안에 선택 사항, 문제 ID는 숫자, 제목은 나머지 문자 (특수문자 포함)
    // 예: [플랫폼]문제ID_문제제목.확장자 또는 [플랫폼]문제ID-문제제목.확장자
    const regex = /^(?:\[(.*?)\])?(\d+)[_.-]?(.*?)(?:\..+)?$/;
    const match = fileName.match(regex);

    if (match) {
      result.platform = match[1] ? match[1].trim() : "Unknown"; // 플랫폼 추출
      result.problemId = match[2] ? match[2].trim() : "Unknown"; // 문제 ID 추출

      // 제목 부분 처리: 언더스코어를 공백으로 바꾸고, 특수문자를 허용하며, 앞뒤 공백 제거
      if (match[3] && match[3].trim().length > 0) {
        result.title = match[3].replace(/_/g, " ").trim();
      } else {
        // 제목이 없는 경우, 파일명 전체에서 확장자만 제거한 것을 기본 제목으로 사용
        result.title = path
          .basename(fileName, path.extname(fileName))
          .replace(/_/g, " ")
          .trim();
      }
    }
    return result;
  }

  /**
   * 명령어를 실행하는 진입점입니다.
   * @param context 확장 프로그램 컨텍스트
   */
  static async run(context: vscode.ExtensionContext): Promise<void> {
    NotificationManager.showStatusBarMessage(
      "AI가 코드를 분석하고 있습니다...",
      0
    ); // 상태 바 메시지 표시

    if (!AnalyzeCodeCommand.geminiApiClient) {
      const secretManager = new SecretManager(context);
      AnalyzeCodeCommand.geminiApiClient = new GeminiApiClient(secretManager);
    }

    const initialized = await AnalyzeCodeCommand.geminiApiClient.initialize();
    if (!initialized) {
      NotificationManager.showWarning(
        "Gemini API 클라이언트 초기화에 실패했습니다. API 키를 확인해주세요."
      );
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      NotificationManager.showWarning(
        "활성화된 텍스트 에디터가 없습니다. 코드를 연 후 다시 시도하세요."
      );
      return;
    }

    const document = editor.document;
    const code = document.getText();
    const language = document.languageId;
    const fileName = path.basename(document.uri.fsPath); // 현재 파일의 이름만 가져옴

    // 파일 이름에서 플랫폼, 문제 ID, 제목 파싱
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

    aiNoteOutputChannel.appendLine("[INFO] Starting code analysis command.");

    try {
      // 프롬프트 생성 로직 변경: static 메서드로 분리하고 await 적용
      const prompt = await AnalyzeCodeCommand.generatePrompt(
        // static 메서드 호출 및 await
        context,
        code,
        language,
        platform,
        problemId,
        title
      );

      const analysisResult =
        await AnalyzeCodeCommand.geminiApiClient.generateContent(prompt);

      if (analysisResult) {
        const workspaceRootUri = FileSystemManager.getWorkspaceRootUri();
        if (!workspaceRootUri) {
          NotificationManager.showError(
            "작업 공간 루트를 찾을 수 없어 분석 노트를 저장할 수 없습니다."
          );
          return;
        }

        // 현재 파일이 있는 디렉토리 경로
        const currentFileUri = editor.document.uri;
        const currentFileDirPath = path.dirname(currentFileUri.fsPath);
        const currentFileDirUri = vscode.Uri.file(currentFileDirPath);

        // 분석 노트 파일 이름 생성 (원래 파일명_analysis.md)
        const originalFileName = path.basename(currentFileUri.fsPath);
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

          // 생성된 마크다운 파일을 에디터에서 열고 미리보기 표시
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
   * src/prompts/analyze_code_prompt.md 파일을 읽어와 플레이스홀더를 대체합니다.
   * @param context 확장 프로그램 컨텍스트
   * @param code 분석할 코드
   * @param language 코드의 언어
   * @param platform 문제 플랫폼 (예: "프로그래머스")
   * @param problemId 문제 번호 (예: "1234")
   * @param title 문제 제목 (예: "K번째 수")
   * @returns 생성된 프롬프트 텍스트 (Promise 반환)
   */
  private static async generatePrompt(
    context: vscode.ExtensionContext,
    code: string,
    language: string,
    platform: string,
    problemId: string,
    title: string
  ): Promise<string> {
    const analyzedAt = new Date().toISOString().split("T")[0]; // YYYY-MM-DD 형식

    // 프롬프트 템플릿 파일 경로 구성
    const promptTemplatePath = path.join(
      context.extensionPath,
      "src",
      "prompts",
      AnalyzeCodeCommand.promptTemplateFileName
    );
    let promptTemplateContent: string;

    try {
      // FileSystemManager를 사용하여 비동기적으로 파일 내용 읽기
      promptTemplateContent = await vscode.workspace.fs
        .readFile(vscode.Uri.file(promptTemplatePath))
        .then((bytes) => Buffer.from(bytes).toString("utf8")); // Uint8Array를 string으로 변환

      aiNoteOutputChannel.appendLine(
        `[DEBUG] Prompt template loaded from: ${promptTemplatePath}`
      );
    } catch (error: any) {
      NotificationManager.showError(
        `프롬프트 템플릿 파일을 읽을 수 없습니다: ${error.message}`
      );
      aiNoteOutputChannel.appendLine(
        `[ERROR] Failed to read prompt template file: ${error.message}`
      );
      // 파일 읽기 실패 시 대체 프롬프트 반환
      return `Analyze the following ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`\n\nProblem Platform: ${platform}\nProblem ID: ${problemId}\nProblem Title: ${title}\nAnalyzed Date: ${analyzedAt}`;
    }

    // YAML Front Matter 및 서두에 사용할 유효 값 결정
    const effectivePlatform =
      platform !== "Unknown" ? platform : "Unknown Platform";
    const effectiveProblemId =
      problemId !== "Unknown" ? problemId : "Unknown ID";
    const effectiveTitle = title !== "Unknown" ? title : "Untitled Problem";

    // 메인 제목 생성 (템플릿의 {{mainHeading}}에 바인딩)
    const mainHeading = `## ${effectivePlatform} ${effectiveProblemId} ${language} 코드 분석`;

    // 서두 문장 생성 (템플릿의 {{initialSentence}}에 바인딩)
    const initialSentence = `${effectivePlatform}${
      effectiveProblemId !== "Unknown ID" ? ` ${effectiveProblemId}` : ""
    }${
      effectiveTitle !== "Untitled Problem" ? ` (${effectiveTitle})` : ""
    } ${language} 코드는 다음과 같습니다.`;

    // 플레이스홀더 대체
    let prompt = promptTemplateContent
      .replace(/{{yamlPlatform}}/g, effectivePlatform) // YAML Front Matter용 플랫폼
      .replace(/{{yamlProblemId}}/g, effectiveProblemId) // YAML Front Matter용 문제 ID
      .replace(/{{yamlTitle}}/g, effectiveTitle) // YAML Front Matter용 문제 제목
      .replace(/{{language}}/g, language) // YAML Front Matter 및 본문용 언어
      .replace(/{{analyzedAt}}/g, analyzedAt) // YAML Front Matter 및 본문용 분석 날짜
      .replace(/{{mainHeading}}/g, mainHeading) // 본문 메인 제목
      .replace(/{{initialSentence}}/g, initialSentence) // 본문 서두 문장
      .replace(/{{code}}/g, code); // 분석할 코드

    return prompt;
  }
}
