// src/core/geminiApiClient.ts
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { NotificationManager } from "../utils/notificationManager";
import { SecretManager } from "./secretManager";
import * as vscode from "vscode";
import { aiNoteOutputChannel } from "../extension";

/**
 * Google Gemini API와 상호작용하는 클라이언트입니다.
 * API 키 관리 및 안전 설정을 포함합니다.
 */
export class GeminiApiClient {
  private genAI: GoogleGenerativeAI | undefined;
  private readonly modelName = "gemini-2.5-flash"; // 사용할 Gemini 모델 이름

  constructor(private readonly secretManager: SecretManager) {}

  /**
   * Gemini API 클라이언트를 초기화합니다.
   * API 키가 없으면 사용자에게 입력을 유도합니다.
   * @returns 클라이언트 초기화 성공 여부
   */
  public async initialize(): Promise<boolean> {
    const apiKey = await this.secretManager.getGeminiApiKey();

    if (!apiKey) {
      // API 키가 없으면 사용자에게 경고 및 입력 유도
      const selected = await NotificationManager.showWarning(
        "AI Note 확장을 사용하려면 Google Gemini API 키가 필요합니다. 설정을 열어 입력하시겠습니까?",
        "지금 입력",
        "설정 열기"
      );
      if (selected === "지금 입력") {
        await this.secretManager.promptForGeminiApiKey();
        // 키 입력 후 다시 시도
        return this.initialize();
      } else if (selected === "설정 열기") {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "vscode-ai-note.geminiApiKey"
        );
      }
      return false; // 키가 없거나 사용자가 취소함
    }

    // API 키가 있으면 클라이언트 초기화
    this.genAI = new GoogleGenerativeAI(apiKey);
    return true;
  }

  /**
   * Gemini 모델에 텍스트 프롬프트를 전송하고 응답을 받습니다.
   * @param prompt AI에게 전달할 프롬프트 텍스트
   * @returns AI의 응답 텍스트 또는 undefined (오류 발생 시)
   */
  public async generateContent(prompt: string): Promise<string | undefined> {
    if (!this.genAI) {
      NotificationManager.showError(
        "Gemini API 클라이언트가 초기화되지 않았습니다. API 키를 확인해주세요."
      );
      return undefined;
    }

    try {
      aiNoteOutputChannel.appendLine(
        `[INFO] Attempting Gemini API call with model: ${this.modelName}`
      );
      aiNoteOutputChannel.appendLine(
        `[DEBUG] Prompt length: ${prompt.length} characters.`
      );
      if (prompt.length > 1000) {
        // 프롬프트가 너무 길면 일부만 출력
        aiNoteOutputChannel.appendLine(
          `[DEBUG] Prompt start: "${prompt.substring(0, 500)}..."`
        );
      } else {
        aiNoteOutputChannel.appendLine(`[DEBUG] Full Prompt: "${prompt}"`);
      }

      const model = this.genAI.getGenerativeModel({ model: this.modelName });

      // 안전 설정 (유해 콘텐츠 차단)
      const generationConfig = {
        temperature: 0.7, // 창의성 (0.0 ~ 1.0, 높을수록 창의적)
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 8192,
      };

      const safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE, // 괴롭힘
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE, // 혐오 발언
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE, // 성적인 콘텐츠
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE, // 위험한 콘텐츠
        },
      ];

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
        safetySettings,
      });

      const response = result.response;
      if (!response || !response.text) {
        // 응답 객체가 없거나 text() 메서드가 없다면

        let errorMessage = `Gemini API가 텍스트 응답을 생성하지 못했습니다.`;

        if (response && response.candidates && response.candidates.length > 0) {
          // 콘텐츠 차단 등의 이유로 텍스트 응답이 없을 수 있음
          const finishReason = response.candidates[0]?.finishReason;
          const safetyRatings = response.candidates[0]?.safetyRatings;
          let errorMessage = `Gemini API가 텍스트 응답을 생성하지 못했습니다.`;

          if (finishReason) {
            errorMessage += ` 완료 이유: ${finishReason}.`;
          }
          if (safetyRatings && safetyRatings.length > 0) {
            errorMessage += ` 안전 등급: ${JSON.stringify(safetyRatings)}.`;
          }
          NotificationManager.showError(errorMessage);
          console.error(
            "Gemini API Response Error (No text content):",
            errorMessage,
            result
          );
        } else {
          NotificationManager.showError(
            "Gemini API로부터 유효한 응답을 받지 못했습니다."
          );
          console.error(
            "Gemini API Response Error (Empty or invalid):",
            result
          );
        }
        NotificationManager.showError(errorMessage);
        aiNoteOutputChannel.appendLine(
          `[ERROR] Gemini API Response Error: ${errorMessage}`
        );
        aiNoteOutputChannel.appendLine(
          `[DEBUG] Full API Result: ${JSON.stringify(result, null, 2)}`
        ); // 전체 결과 로그
        return undefined;
      }

      const text = response.text();
      aiNoteOutputChannel.appendLine("[INFO] Gemini API call successful.");
      aiNoteOutputChannel.appendLine(
        `[DEBUG] Received text length: ${text.length} characters.`
      ); // ✨ 추가: 받은 텍스트 길이 로그 ✨
      return text;
    } catch (error: any) {
      aiNoteOutputChannel.appendLine(
        `[ERROR] An error occurred during Gemini API call processing.`
      );
      aiNoteOutputChannel.appendLine(`[ERROR] Error message: ${error.message}`);

      let errorLogMessage: string;

      if (error.message.includes("API key not valid")) {
        NotificationManager.showError(
          "Gemini API 키가 유효하지 않습니다. 다시 설정해주세요."
        );
        errorLogMessage = `Gemini API Key Error: ${error.message}`;
        console.error("Gemini API Key Error:", error);
      } else if (error.message.includes("User location is not supported")) {
        NotificationManager.showError(
          "현재 사용자 위치에서는 Gemini API 사용이 지원되지 않습니다."
        );
        errorLogMessage = `Gemini API Location Error: ${error.message}`;
      } else if (error.message.includes("quota exceeded")) {
        NotificationManager.showError(
          "Gemini API 호출 할당량이 초과되었습니다. 잠시 후 다시 시도하거나, Google Cloud 콘솔에서 할당량을 확인해주세요."
        );
        errorLogMessage = `Gemini API Quota Exceeded Error: ${error.message}`;
      } else {
        NotificationManager.showError(
          `Gemini API 호출 중 오류 발생: ${error.message}`
        );
        errorLogMessage = `Gemini API Call Error: ${error.message}`;
      }
      NotificationManager.showError(errorLogMessage);
      aiNoteOutputChannel.appendLine(
        `[ERROR] User-facing message: ${errorLogMessage}`
      );
      aiNoteOutputChannel.appendLine(
        `[DEBUG] Full Error Object: ${JSON.stringify(
          error,
          Object.getOwnPropertyNames(error),
          2
        )}`
      );
      return undefined;
      return undefined;
    } finally {
      NotificationManager.hideStatusBarMessage();
    }
  }
}
