// src/core/analysisPostProcessor.ts
import * as vscode from "vscode";
import { GeminiApiClient } from "./geminiApiClient";
import { NotificationManager } from "../utils/notificationManager";
import { aiNoteOutputChannel } from "../extension";

/**
 * AI 모델로부터 받은 원시 분석 결과를 후처리하여
 * 최종 마크다운 솔루션 노트를 생성하는 클래스입니다.
 * 누락된 섹션을 감지하고 재요청하여 보완하는 로직을 포함합니다.
 */
export class AnalysisPostProcessor {
  // AI 응답에서 섹션을 구분하는 시작/종료 마커의 정규식 패턴
  private static readonly SECTION_START_MARKER = "---SECTION_START_";
  private static readonly SECTION_END_MARKER = "---SECTION_END_";
  private static readonly MAX_RETRY_ATTEMPTS = 2; // 누락 섹션 재요청 최대 시도 횟수

  constructor(private readonly geminiApiClient: GeminiApiClient) {}

  /**
   * AI의 원시 분석 결과를 처리하여 최종 마크다운 솔루션 노트를 생성합니다.
   * 누락된 섹션은 재요청을 통해 보완을 시도합니다.
   * @param rawAiResponse AI 모델로부터 받은 원시 응답 텍스트
   * @param context VS Code 확장 프로그램 컨텍스트
   * @param code 분석 대상 코드
   * @param language 코드 언어
   * @param platform 문제 플랫폼
   * @param problemId 문제 ID
   * @param title 문제 제목
   * @returns 최종 마크다운 콘텐츠 또는 undefined (처리 실패 시)
   */
  public async processAnalysisResult(
    rawAiResponse: string,
    context: vscode.ExtensionContext,
    code: string,
    language: string,
    platform: string,
    problemId: string,
    title: string
  ): Promise<string | undefined> {
    aiNoteOutputChannel.appendLine(
      "[INFO] Starting AnalysisPostProcessor.processAnalysisResult."
    );

    let sectionsContent: { [key: number]: string } = {};
    const totalSections = 7; // 템플릿에 정의된 총 섹션 수

    for (let i = 1; i <= totalSections; i++) {
      let sectionContent = this._extractSectionContent(rawAiResponse, i);
      if (!sectionContent.trim()) {
        // 섹션 내용이 비어있으면 재요청 시도
        aiNoteOutputChannel.appendLine(
          `[WARN] Section ${i} content is missing or empty. Attempting re-request.`
        );
        sectionContent = await this._reRequestMissingSection(
          i,
          context,
          code,
          language,
          platform,
          problemId,
          title
        );
      }
      sectionsContent[i] = sectionContent.trim(); // 공백 제거 후 저장
    }

    // YAML Front Matter 및 본문 메타데이터 준비
    const analyzedAt = new Date().toISOString().split("T")[0]; // YYYY-MM-DD 형식
    const effectivePlatform =
      platform !== "Unknown" ? platform : "Unknown Platform";
    const effectiveProblemId =
      problemId !== "Unknown" ? problemId : "Unknown ID";
    const effectiveTitle = title !== "Unknown" ? title : "Untitled Problem";

    const metadata = {
      platform: effectivePlatform,
      problemId: effectiveProblemId,
      title: effectiveTitle,
      language: language,
      analyzedAt: analyzedAt,
    };

    // 최종 마크다운 생성
    const finalMarkdown = this._generateMarkdownTemplate(
      metadata,
      sectionsContent
    );

    aiNoteOutputChannel.appendLine(
      "[INFO] AnalysisPostProcessor.processAnalysisResult finished."
    );
    return finalMarkdown;
  }

  /**
   * 원시 AI 응답 텍스트에서 특정 섹션의 내용을 추출합니다.
   * @param rawText 원시 AI 응답 텍스트
   * @param sectionNumber 추출할 섹션 번호
   * @returns 추출된 섹션 내용 (trim 처리됨) 또는 빈 문자열
   */
  private _extractSectionContent(
    rawText: string,
    sectionNumber: number
  ): string {
    const startMarker = `${AnalysisPostProcessor.SECTION_START_MARKER}${sectionNumber}---`;
    const endMarker = `${AnalysisPostProcessor.SECTION_END_MARKER}${sectionNumber}---`;

    const startIndex = rawText.indexOf(startMarker);
    if (startIndex === -1) {
      return "";
    }

    const endIndex = rawText.indexOf(
      endMarker,
      startIndex + startMarker.length
    );
    if (endIndex === -1) {
      return "";
    }

    // 섹션 마커를 제외한 순수 내용 추출
    let content = rawText.substring(startIndex + startMarker.length, endIndex);

    // AI가 프롬프트 템플릿에 포함된 헤더를 실수로 생성했을 경우 제거
    // 예: ### 1. 전체 분석 및 접근 방식
    const headerRegex = new RegExp(
      `^\\s*#+\\s*${sectionNumber}\\.\\s*[^\\n]*\\n?`,
      "m"
    );
    content = content.replace(headerRegex, "").trim();

    return content.trim();
  }

  /**
   * 누락된 섹션에 대해 AI에 재요청을 시도합니다.
   * @param sectionNumber 재요청할 섹션 번호
   * @param context VS Code 확장 프로그램 컨텍스트
   * @param code 분석 대상 코드
   * @param language 코드 언어
   * @param platform 문제 플랫폼
   * @param problemId 문제 ID
   * @param title 문제 제목
   * @returns 재요청을 통해 얻은 섹션 내용 또는 대체 콘텐츠
   */
  private async _reRequestMissingSection(
    sectionNumber: number,
    context: vscode.ExtensionContext,
    code: string,
    language: string,
    platform: string,
    problemId: string,
    title: string
  ): Promise<string> {
    let retryCount = 0;
    while (retryCount < AnalysisPostProcessor.MAX_RETRY_ATTEMPTS) {
      aiNoteOutputChannel.appendLine(
        `[INFO] Retrying section ${sectionNumber} (Attempt ${retryCount + 1}/${
          AnalysisPostProcessor.MAX_RETRY_ATTEMPTS
        })`
      );

      const reRequestPrompt = this._generateReRequestPrompt(
        sectionNumber,
        code,
        language,
        platform,
        problemId,
        title
      );

      const reResponse = await this.geminiApiClient.generateContent(
        reRequestPrompt
      );
      if (reResponse) {
        const reExtractedContent = this._extractSectionContent(
          reResponse,
          sectionNumber
        );
        if (reExtractedContent.trim()) {
          aiNoteOutputChannel.appendLine(
            `[INFO] Successfully re-requested content for section ${sectionNumber}.`
          );
          return reExtractedContent;
        } else {
          aiNoteOutputChannel.appendLine(
            `[WARN] Re-requested content for section ${sectionNumber} was still empty or invalid.`
          );
        }
      } else {
        aiNoteOutputChannel.appendLine(
          `[WARN] Re-request for section ${sectionNumber} failed to get a response.`
        );
      }
      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount)); // 지수 백오프
    }

    NotificationManager.showWarning(
      `AI가 ${sectionNumber}번 섹션의 내용을 생성하지 못했습니다. 수동으로 추가해야 할 수 있습니다.`
    );
    aiNoteOutputChannel.appendLine(
      `[ERROR] Failed to get content for section ${sectionNumber} after ${AnalysisPostProcessor.MAX_RETRY_ATTEMPTS} retries.`
    );
    return `**[AI 분석 오류: ${sectionNumber}번 섹션 내용을 생성하지 못함]**\n\n_AI가 이 섹션의 내용을 성공적으로 생성하지 못했습니다. 수동으로 내용을 추가하거나, 다시 시도해 주십시오._`;
  }

  /**
   * 특정 섹션에 대한 재요청 프롬프트를 생성합니다.
   * @param sectionNumber 재요청할 섹션 번호
   * @param code 분석 대상 코드
   * @param language 코드 언어
   * @param platform 문제 플랫폼
   * @param problemId 문제 ID
   * @param title 문제 제목
   * @returns 재요청 프롬프트 텍스트
   */
  private _generateReRequestPrompt(
    sectionNumber: number,
    code: string,
    language: string,
    platform: string,
    problemId: string,
    title: string
  ): string {
    const sectionHeading = this._getSectionTemplate(sectionNumber);
    return `You are an expert software engineer and a coding test specialist.
The previous analysis for the following ${language} code was incomplete, specifically missing content for section ${sectionNumber}.
Please generate only the content for section ${sectionNumber} ( "${sectionHeading
      .replace(/#+\s*\d+\.\s*/, "")
      .trim()}" ) based on the provided code.
Your response MUST start with "${
      AnalysisPostProcessor.SECTION_START_MARKER
    }${sectionNumber}---" and end with "${
      AnalysisPostProcessor.SECTION_END_MARKER
    }${sectionNumber}---".
DO NOT include any other sections, YAML front matter, or additional text outside these markers.

Problem Platform: ${platform}
Problem ID: ${problemId}
Problem Title: ${title}

Code to analyze:
\`\`\`${language}
${code}
\`\`\`
`;
  }

  /**
   * 각 섹션의 고정된 마크다운 제목을 반환합니다.
   * 이는 AI가 생성할 필요 없는 고정된 구조입니다.
   * @param sectionNumber 섹션 번호
   * @returns 마크다운 섹`션 제목
   */
  private _getSectionTemplate(sectionNumber: number): string {
    switch (sectionNumber) {
      case 1:
        return "### 1. 전체 분석 및 접근 방식 (Overall Analysis & Approach)";
      case 2:
        return "### 2. 코드 구조 및 가독성 (Code Structure & Readability)";
      case 3:
        return "### 3. 시간 복잡도 분석 (Time Complexity Analysis)";
      case 4:
        return "### 4. 공간 복잡도 분석 (Space Complexity Analysis)";
      case 5:
        return "### 5. 잠재적 문제점 및 버그 (Potential Issues & Bugs)";
      case 6:
        return "### 6. 개선 제안 (Suggestions for Improvement)";
      case 7:
        return "### 7. 대안적 접근 방식 (Alternative Approaches) (선택 사항)";
      default:
        return `### ${sectionNumber}. 알 수 없는 섹션`;
    }
  }

  /**
   * YAML Front Matter와 추출된 섹션 내용을 결합하여 최종 마크다운을 생성합니다.
   * @param metadata 문제 및 분석 관련 메타데이터
   * @param sectionsContent 각 섹션의 내용 (키: 섹션 번호, 값: 내용)
   * @returns 완성된 마크다운 문자열
   */
  private _generateMarkdownTemplate(
    metadata: {
      platform: string;
      problemId: string;
      title: string;
      language: string;
      analyzedAt: string;
    },
    sectionsContent: { [key: number]: string }
  ): string {
    const yamlFrontMatter = `---
platform: ${metadata.platform}
problemId: ${metadata.problemId}
title: ${metadata.title}
language: ${metadata.language}
analyzedAt: ${metadata.analyzedAt}
---
`;

    const mainHeading = `## ${metadata.platform} ${metadata.problemId} ${metadata.language} 코드 분석`;
    const initialSentence = `${metadata.platform}${
      metadata.problemId !== "Unknown ID" ? ` ${metadata.problemId}` : ""
    }${metadata.title !== "Untitled Problem" ? ` (${metadata.title})` : ""} ${
      metadata.language
    } 코드는 다음과 같습니다.`;

    let markdownContent = `${yamlFrontMatter}\n${mainHeading}\n\n${initialSentence}\n\n`;

    for (let i = 1; i <= 7; i++) {
      const sectionHeading = this._getSectionTemplate(i);
      const content =
        sectionsContent[i] || `_이 섹션의 내용을 생성하지 못했습니다._`; // 내용이 없으면 대체 텍스트
      markdownContent += `${sectionHeading}\n${content}\n\n`;
    }

    return markdownContent.trim(); // 최종 공백 제거
  }
}
