// src/utils/notificationManager.ts
import * as vscode from "vscode";

/**
 * VS Code 알림 메시지 관리 유틸리티 클래스입니다.
 * 사용자에게 정보, 경고, 에러 메시지를 표시하고, 상태 바 메시지를 관리합니다.
 */
export class NotificationManager {
  private static statusBarItem: vscode.StatusBarItem | undefined;

  /**
   * 정보 메시지를 사용자에게 표시합니다.
   * @param message 표시할 메시지
   * @param items 선택 가능한 버튼 (선택 사항)
   * @returns 사용자가 선택한 버튼의 텍스트 또는 undefined
   */
  static async showInformation(
    message: string,
    ...items: string[]
  ): Promise<string | undefined> {
    return vscode.window.showInformationMessage(message, ...items);
  }

  /**
   * 경고 메시지를 사용자에게 표시합니다.
   * @param message 표시할 메시지
   * @param items 선택 가능한 버튼 (선택 사항)
   * @returns 사용자가 선택한 버튼의 텍스트 또는 undefined
   */
  static async showWarning(
    message: string,
    ...items: string[]
  ): Promise<string | undefined> {
    return vscode.window.showWarningMessage(message, ...items);
  }

  /**
   * 에러 메시지를 사용자에게 표시합니다.
   * @param message 표시할 메시지
   * @param items 선택 가능한 버튼 (선택 사항)
   * @returns 사용자가 선택한 버튼의 텍스트 또는 undefined
   */
  static async showError(
    message: string,
    ...items: string[]
  ): Promise<string | undefined> {
    return vscode.window.showErrorMessage(message, ...items);
  }

  /**
   * VS Code 상태 바에 메시지를 표시합니다.
   * @param message 표시할 메시지
   * @param timeout 메시지가 사라질 시간 (밀리초), 0 이하면 영구적
   */
  static showStatusBarMessage(message: string, timeout: number = 5000): void {
    if (!NotificationManager.statusBarItem) {
      NotificationManager.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
      );
      NotificationManager.statusBarItem.command = undefined; // 클릭 시 아무 동작 안 함
    }
    NotificationManager.statusBarItem.text = `$(sync~spin) ${message}`; // 아이콘 추가
    NotificationManager.statusBarItem.tooltip = message;
    NotificationManager.statusBarItem.show();

    if (timeout > 0) {
      setTimeout(() => {
        NotificationManager.statusBarItem?.hide();
      }, timeout);
    }
  }

  /**
   * 상태 바 메시지를 숨깁니다.
   */
  static hideStatusBarMessage(): void {
    NotificationManager.statusBarItem?.hide();
  }

  /**
   * 상태 바 아이템을 해제합니다 (확장 프로그램 비활성화 시).
   */
  static disposeStatusBarItem(): void {
    if (NotificationManager.statusBarItem) {
      NotificationManager.statusBarItem.dispose();
      NotificationManager.statusBarItem = undefined;
    }
  }
}
