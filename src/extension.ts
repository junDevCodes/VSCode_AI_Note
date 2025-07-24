// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SecretManager } from "./core/secretManager"; // SecretManager 임포트
import { NotificationManager } from "./utils/notificationManager"; // NotificationManager 임포트

import { SetupProblemCommand } from "./commands/setupProblem"; // 새로 생성한 명령어 로직 임포트
import { AnalyzeCodeCommand } from "./commands/analyzeCode"; // 새로 생성한 명령어 로직 임포트

// 상태 바 아이템을 전역적으로 관리 (deactivate 시 dispose 위함)
let setupProblemStatusBarItem: vscode.StatusBarItem;
let analyzeCodeStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "vscode-ai-note" is now active!'
  );

  // SecretManager 인스턴스 생성
  const secretManager = new SecretManager(context);

  // 확장이 활성화될 때 API 키가 설정되어 있는지 확인하고, 없으면 사용자에게 입력 요청
  secretManager.getGeminiApiKey().then((apiKey) => {
    if (!apiKey) {
      NotificationManager.showWarning(
        // NotificationManager 사용
        "AI Note 확장을 사용하려면 Google Gemini API 키가 필요합니다. 설정을 열어 입력하거나, 지금 입력하시겠습니까?",
        "지금 입력",
        "설정 열기"
      ).then(async (selection) => {
        if (selection === "지금 입력") {
          await secretManager.promptForGeminiApiKey();
          showKeybindingSetupGuide(context);
        } else if (selection === "설정 열기") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "vscode-ai-note.geminiApiKey"
          );
        }
        // API 키 설정 유도 후에도, 단축키 안내는 별도로 한 번만 보여줌.
        showKeybindingSetupGuide(context);
      });
    } else {
      // API 키가 이미 있으면, 단축키 안내를 한 번도 본 적이 없을 때만 보여줌.
      const hasSeenKeybindingGuide = context.globalState.get(
        "aiNote.hasSeenKeybindingGuide",
        false
      );
      if (!hasSeenKeybindingGuide) {
        showKeybindingSetupGuide(context);
      }
    }
  });

  async function showKeybindingSetupGuide(context: vscode.ExtensionContext) {
    const hasSeenKeybindingGuide = context.globalState.get(
      "aiNote.hasSeenKeybindingGuide",
      false
    );
    if (hasSeenKeybindingGuide) {
      return; // 이미 봤으면 다시 보여주지 않음
    }

    const learnMore = await NotificationManager.showInformation(
      "AI Note 확장 기능의 추천 단축키(Alt+Ctrl/Cmd+S, Alt+Ctrl/Cmd+A)가 설정되었습니다. 키보드 단축키 설정에서 언제든지 변경할 수 있습니다.",
      "단축키 설정 열기",
      "나중에"
    );
    if (learnMore === "단축키 설정 열기") {
      vscode.commands.executeCommand("workbench.action.openGlobalKeybindings");
    }
    context.globalState.update("aiNote.hasSeenKeybindingGuide", true); // 안내 메시지를 봤다고 기록
  }

  // 1. 'AI Note: 문제 풀이 시작' 명령어 등록
  let disposableSetupProblem = vscode.commands.registerCommand(
    "vscode-ai-note.setupProblem",
    () => {
      SetupProblemCommand.run();
    }
  );

  // 2. 'AI Note: 코드 분석 및 노트 생성' 명령어 등록
  let disposableAnalyzeCode = vscode.commands.registerCommand(
    "vscode-ai-note.analyzeCode",
    () => {
      AnalyzeCodeCommand.run(context); // context를 AnalyzeCodeCommand에 전달
    }
  );

  context.subscriptions.push(disposableSetupProblem, disposableAnalyzeCode);

  // 3. API 키를 수동으로 입력/삭제할 수 있는 명령어 추가
  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-ai-note.setGeminiApiKey", () => {
      secretManager.promptForGeminiApiKey();
    }),
    vscode.commands.registerCommand(
      "vscode-ai-note.deleteGeminiApiKey",
      async () => {
        const confirm = await NotificationManager.showWarning(
          // NotificationManager 사용
          "정말로 Gemini API 키를 삭제하시겠습니까?",
          "삭제",
          "취소"
        );
        if (confirm === "삭제") {
          await secretManager.deleteGeminiApiKey();
        }
      }
    )
  );

  // --- 상태 바 아이템 추가 시작 ---

  // '문제 풀이 시작' 상태 바 아이템 생성
  setupProblemStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  setupProblemStatusBarItem.command = "vscode-ai-note.setupProblem"; // 연결할 명령어 ID
  setupProblemStatusBarItem.text = "$(new-folder) 문제 시작"; // 아이콘과 텍스트
  setupProblemStatusBarItem.tooltip = "새로운 코딩 테스트 문제 풀이 환경 설정"; // 툴팁
  setupProblemStatusBarItem.show(); // 상태 바에 표시
  context.subscriptions.push(setupProblemStatusBarItem); // 확장 프로그램 비활성화 시 자동 dispose 되도록 등록

  // '코드 분석' 상태 바 아이템 생성
  analyzeCodeStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    90
  );
  analyzeCodeStatusBarItem.command = "vscode-ai-note.analyzeCode"; // 연결할 명령어 ID
  analyzeCodeStatusBarItem.text = "$(lightbulb) AI 분석"; // 아이콘과 텍스트
  analyzeCodeStatusBarItem.tooltip = "현재 코드 AI 분석 및 노트 생성"; // 툴팁
  analyzeCodeStatusBarItem.show(); // 상태 바에 표시
  context.subscriptions.push(analyzeCodeStatusBarItem); // 확장 프로그램 비활성화 시 자동 dispose 되도록 등록

  // --- 상태 바 아이템 추가 끝 ---
}

// This method is called when your extension is deactivated
export function deactivate() {
  // 확장이 비활성화될 때 상태 바 아이템 리소스 해제
  NotificationManager.disposeStatusBarItem();
  // 상태 바 아이템도 dispose (context.subscriptions에 등록했으므로 사실 필수 아님)
  setupProblemStatusBarItem?.dispose();
  analyzeCodeStatusBarItem?.dispose();
}
