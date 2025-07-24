// src/core/secretManager.ts
import * as vscode from "vscode";

const GEMINI_API_KEY_SECRET_KEY = "vscode-ai-note.geminiApiKey";

export class SecretManager {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Gemini API 키를 SecretStorage에 안전하게 저장합니다.
   * @param apiKey 저장할 API 키
   */
  async storeGeminiApiKey(apiKey: string): Promise<void> {
    if (!apiKey) {
      vscode.window.showWarningMessage("API 키는 비워둘 수 없습니다.");
      return;
    }
    await this.context.secrets.store(GEMINI_API_KEY_SECRET_KEY, apiKey);
    vscode.window.showInformationMessage(
      "Gemini API 키가 안전하게 저장되었습니다."
    );
  }

  /**
   * SecretStorage에서 Gemini API 키를 조회합니다.
   * @returns 저장된 API 키 또는 undefined
   */
  async getGeminiApiKey(): Promise<string | undefined> {
    return await this.context.secrets.get(GEMINI_API_KEY_SECRET_KEY);
  }

  /**
   * SecretStorage에서 Gemini API 키를 삭제합니다.
   */
  async deleteGeminiApiKey(): Promise<void> {
    await this.context.secrets.delete(GEMINI_API_KEY_SECRET_KEY);
    vscode.window.showInformationMessage("Gemini API 키가 삭제되었습니다.");
  }

  /**
   * 사용자에게 Gemini API 키 입력을 요청하고 저장합니다.
   */
  async promptForGeminiApiKey(): Promise<void> {
    const currentKey = await this.getGeminiApiKey();
    const input = await vscode.window.showInputBox({
      prompt: "Google Gemini API 키를 입력하세요.",
      placeHolder: "API 키는 Google AI Studio에서 얻을 수 있습니다.",
      value: currentKey, // 현재 저장된 키가 있다면 미리 채워줍니다.
      ignoreFocusOut: true, // 포커스를 잃어도 입력 상자가 닫히지 않도록 합니다.
      password: true, // 입력 내용을 마스킹 처리합니다.
    });

    if (input !== undefined) {
      // 사용자가 취소하지 않았다면
      await this.storeGeminiApiKey(input.trim());
    } else {
      vscode.window.showWarningMessage(
        "Gemini API 키 입력이 취소되었습니다. 기능 사용에 제한이 있을 수 있습니다."
      );
    }
  }
}
