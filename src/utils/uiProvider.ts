// src/utils/uiProvider.ts
import * as vscode from "vscode";

/**
 * VS Code UI 상호작용을 위한 유틸리티 클래스입니다.
 * Quick Pick (선택 상자) 및 Input Box (입력 필드) 기능을 제공합니다.
 */
export class UiProvider {
  /**
   * 사용자에게 목록에서 하나를 선택하도록 Quick Pick을 표시합니다.
   * @param placeHolder Quick Pick의 플레이스홀더 텍스트
   * @param items 선택 가능한 항목 배열 (문자열 또는 QuickPickItem 객체). string을 전달하는 경우 QuickPickItem.label로 사용됩니다.
   * @param canPickMany 여러 항목 선택 가능 여부 (기본값: false)
   * @returns 사용자가 선택한 항목(들)의 label(문자열) 또는 undefined (취소 시)
   */
  static async showQuickPick(
    placeHolder: string,
    items: (string | vscode.QuickPickItem)[],
    canPickMany: boolean = false
  ): Promise<string | string[] | undefined> {
    const options: vscode.QuickPickOptions = {
      placeHolder: placeHolder,
      canPickMany: canPickMany,
      ignoreFocusOut: true, // 사용자가 포커스를 잃어도 닫히지 않음
    };

    // items를 QuickPickItem[] 타입으로 명확히 변환
    const quickPickItems: vscode.QuickPickItem[] = items.map(
      (item: string | vscode.QuickPickItem) => {
        if (typeof item === "string") {
          return { label: item }; // string인 경우 QuickPickItem 객체로 변환
        }
        return item; // 이미 QuickPickItem인 경우 그대로 사용
      }
    );

    if (canPickMany) {
      // 여러 항목 선택 시: result는 QuickPickItem[] 또는 undefined
      const result = (await vscode.window.showQuickPick(
        quickPickItems,
        options
      )) as vscode.QuickPickItem[] | undefined;
      if (result) {
        // result가 배열이므로 map 사용 가능
        return result.map((item: vscode.QuickPickItem) => item.label);
      }
    } else {
      // 단일 항목 선택 시: result는 QuickPickItem 또는 undefined
      const result = (await vscode.window.showQuickPick(
        quickPickItems,
        options
      )) as vscode.QuickPickItem | undefined;
      if (result) {
        // result가 단일 객체이므로 label 속성 직접 접근
        return result.label;
      }
    }
    return undefined; // 사용자가 취소한 경우
  }

  /**
   * 사용자에게 텍스트 입력을 받도록 Input Box를 표시합니다.
   * @param prompt 입력 상자의 프롬프트 메시지
   * @param placeHolder 입력 상자의 플레이스홀더 텍스트
   * @param value 초기 입력 값 (선택 사항)
   * @param password 입력 내용을 마스킹할지 여부 (기본값: false)
   * @returns 사용자가 입력한 텍스트 또는 undefined (취소 시)
   */
  static async showInputBox(
    prompt: string,
    placeHolder: string = "",
    value: string = "",
    password: boolean = false
  ): Promise<string | undefined> {
    const options: vscode.InputBoxOptions = {
      prompt: prompt,
      placeHolder: placeHolder,
      value: value,
      password: password,
      ignoreFocusOut: true, // 사용자가 포커스를 잃어도 닫히지 않음
    };
    return await vscode.window.showInputBox(options);
  }
}
