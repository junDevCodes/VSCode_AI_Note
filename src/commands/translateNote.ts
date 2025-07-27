// src/commands/translateNote.ts
import * as vscode from "vscode";
import { NotificationManager } from "../utils/notificationManager";
import { UiProvider } from "../utils/uiProvider";
import { GeminiApiClient } from "../core/geminiApiClient";
import { SecretManager } from "../core/secretManager"; // Needed for GeminiApiClient initialization

/**
 * '분석 노트 번역' 명령어의 메인 로직을 처리하는 클래스입니다.
 * 현재 활성화된 마크다운 분석 노트를 Gemini API를 통해 다른 언어로 번역합니다.
 */
export class TranslateNoteCommand {
  private static geminiApiClient: GeminiApiClient | undefined;

  /**
   * 명령어 실행 진입점입니다.
   * @param context VS Code 확장 프로그램의 컨텍스트
   */
  static async run(context: vscode.ExtensionContext): Promise<void> {
    NotificationManager.showStatusBarMessage("분석 노트 번역 준비 중...", 0);

    try {
      // 1. Gemini API 클라이언트 초기화 (API 키 확인 및 유도)
      if (!TranslateNoteCommand.geminiApiClient) {
        const secretManager = new SecretManager(context);
        TranslateNoteCommand.geminiApiClient = new GeminiApiClient(
          secretManager
        );
      }

      const initialized =
        await TranslateNoteCommand.geminiApiClient.initialize();
      if (!initialized) {
        NotificationManager.showWarning(
          "Gemini API 클라이언트 초기화에 실패했습니다. API 키를 확인해주세요."
        );
        return;
      }

      // 2. 현재 활성화된 텍스트 에디터에서 문서 내용 가져오기
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        NotificationManager.showWarning(
          "활성화된 텍스트 에디터가 없습니다. 번역할 분석 노트를 연 후 다시 시도하세요."
        );
        return;
      }

      const document = editor.document;
      const contentToTranslate = document.getText();

      if (!contentToTranslate.trim()) {
        NotificationManager.showWarning(
          "번역할 내용이 없습니다. 파일이 비어 있습니다."
        );
        return;
      }

      // 선택적으로, .md 파일만 번역하도록 제한할 수 있습니다.
      if (document.languageId !== "markdown") {
        const confirm = await vscode.window.showInformationMessage(
          `현재 파일은 Markdown 파일이 아닙니다 (${document.languageId}). 그래도 번역을 진행하시겠습니까?`,
          { modal: true },
          "예",
          "아니오"
        );
        if (confirm !== "예") {
          NotificationManager.showWarning("번역이 취소되었습니다.");
          return;
        }
      }

      // 3. 사용자로부터 번역할 언어 선택 받기
      const targetLanguage = await UiProvider.showQuickPick(
        "번역할 대상 언어를 선택하세요.",
        ["English", "한국어"],
        false
      );

      if (!targetLanguage) {
        NotificationManager.showWarning("대상 언어 선택이 취소되었습니다.");
        return;
      }

      NotificationManager.showStatusBarMessage(
        `AI가 ${targetLanguage}로 번역 중...`,
        0
      );

      // 4. 번역 프롬프트 생성
      const prompt = TranslateNoteCommand.generateTranslationPrompt(
        contentToTranslate,
        targetLanguage as string
      );

      // 5. Gemini API 호출하여 번역 수행
      const translatedContent =
        await TranslateNoteCommand.geminiApiClient.generateContent(prompt);

      if (translatedContent) {
        // 6. 번역된 내용을 새 에디터 탭에 표시
        // 새 문서를 생성하고 읽기 전용으로 설정하여 표시합니다.
        const newDocument = await vscode.workspace.openTextDocument({
          content: translatedContent,
          language: document.languageId, // 원본 문서의 언어 ID를 사용 (예: markdown)
        });
        await vscode.window.showTextDocument(
          newDocument,
          vscode.ViewColumn.Beside,
          true
        ); // 옆에 띄우고, 읽기 전용 (preview)

        NotificationManager.showInformation(
          `분석 노트가 성공적으로 ${targetLanguage}로 번역되었습니다.`
        );
      } else {
        NotificationManager.showError(
          "AI 번역 결과를 가져오지 못했습니다. (자세한 내용은 출력 채널을 확인하세요)"
        );
      }
    } catch (error: any) {
      NotificationManager.showError(`노트 번역 중 오류 발생: ${error.message}`);
      console.error("Translate Note Command Error:", error);
    } finally {
      NotificationManager.hideStatusBarMessage();
    }
  }

  /**
   * 번역을 위한 프롬프트 텍스트를 생성합니다.
   * @param content 번역할 원본 텍스트
   * @param targetLanguage 목표 언어 (예: "English", "한국어")
   * @returns 생성된 프롬프트 텍스트
   */
  private static generateTranslationPrompt(
    content: string,
    targetLanguage: string
  ): string {
    return `You are a professional translator. Translate the following Markdown content into ${targetLanguage}. Maintain the original Markdown formatting precisely, including headings, lists, code blocks, and bold/italic text. Ensure the translation is natural and accurate, especially for technical terms.

Here is the Markdown content to translate:

\`\`\`markdown
${content}
\`\`\`
`;
  }
}
