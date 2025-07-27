// src/commands/setupProblem.ts
import * as vscode from "vscode";
import * as path from "path"; // 경로 조작을 위해 Node.js 'path' 모듈 임포트
import { NotificationManager } from "../utils/notificationManager";
import { UiProvider } from "../utils/uiProvider";
import { FileSystemManager } from "../utils/fileSystemManager";

/**
 * '문제 풀이 시작' 명령어의 메인 로직을 처리하는 클래스입니다.
 * 사용자로부터 문제 정보를 입력받아 해당 문제의 풀이 환경을 자동으로 생성합니다.
 */
export class SetupProblemCommand {
  /**
   * 명령어 실행 진입점입니다.
   */
  static async run(): Promise<void> {
    NotificationManager.showStatusBarMessage("문제 풀이 환경 설정 중...", 0); // 상태 바 메시지 표시

    try {
      const workspaceRootUri = FileSystemManager.getWorkspaceRootUri();
      if (!workspaceRootUri) {
        return;
      }

      // 1. 문제 풀이 플랫폼 선택 (옵션은 한글, 내부적으로 영문 매핑)
      const platformDisplayName = await UiProvider.showQuickPick(
        "문제 풀이 플랫폼을 선택하세요.",
        ["백준", "프로그래머스", "SWEA"]
      );
      if (!platformDisplayName) {
        NotificationManager.showWarning("플랫폼 선택이 취소되었습니다.");
        return;
      }

      // 플랫폼 한글 이름을 영문 약어로 매핑
      let platformCode: string;
      switch (platformDisplayName) {
        case "백준":
          platformCode = "BOJ";
          break;
        case "프로그래머스":
          platformCode = "Programmers";
          break;
        case "SWEA":
          platformCode = "SWEA";
          break;
        default:
          NotificationManager.showError(
            `알 수 없는 플랫폼입니다: ${platformDisplayName}`
          );
          return;
      }

      // 2. 문제 번호 입력
      const problemNumber = await UiProvider.showInputBox(
        `${platformDisplayName} 문제 번호를 입력하세요. (예: 1000)`,
        "문제 번호 또는 문제 제목"
      );
      if (!problemNumber) {
        NotificationManager.showWarning(
          "문제 번호/제목 입력이 취소되었습니다."
        );
        return;
      }

      // 3. 사용할 프로그래밍 언어 선택
      const language = await UiProvider.showQuickPick(
        "사용할 프로그래밍 언어를 선택하세요.",
        ["Python", "C", "C++", "JAVA"]
      );
      if (!language) {
        NotificationManager.showWarning("언어 선택이 취소되었습니다.");
        return;
      }

      // 파일 확장자 및 기본 파일 내용 정의
      let fileExtension: string;
      let initialFileContent: string = "";

      // 파일 이름에 사용할 수 없는 문자 대체 (문제 번호/제목 정규화)
      const normalizedProblemIdentifier = problemNumber.replace(
        /[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g,
        "_"
      );

      // 파일 이름 (예: BOJ_1234.py)
      const fileNamePrefix = `${platformCode}_${normalizedProblemIdentifier}`;

      switch (language) {
        case "Python":
          fileExtension = "py";
          initialFileContent = `# ${platformDisplayName} ${problemNumber} - Python Solution\n\n# import sys\n# input = sys.stdin.readline\n\ndef solve():\n    # TODO: 여기에 문제 풀이 코드를 작성하세요.\n    pass\n\nif __name__ == "__main__":\n    solve()\n`;
          break;
        case "Java":
          fileExtension = "java";
          initialFileContent = `// ${platformDisplayName} ${problemNumber} - Java Solution\n\nimport java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        // TODO: 여기에 문제 풀이 코드를 작성하세요.\n    }\n}\n`;
          break;
        case "C":
          fileExtension = "c";
          initialFileContent = `// ${platformDisplayName} ${problemNumber} - C Solution\n\n#include <stdio.h>\n\nint main() {\n    // TODO: 여기에 문제 풀이 코드를 작성하세요.\n    return 0;\n}\n`;
          break;
        case "C++":
          fileExtension = "cpp";
          initialFileContent = `// ${platformDisplayName} ${problemNumber} - C++ Solution\n\n#include <iostream>\n#include <vector>\n#include <string>\n\nint main() {\n    std::ios_base::sync_with_stdio(false);\n    std::cin.tie(NULL);\n    // TODO: 여기에 문제 풀이 코드를 작성하세요.\n    return 0;\n}\n`;
          break;
        default:
          NotificationManager.showError(
            `지원하지 않는 언어입니다: ${language}`
          );
          return;
      }

      const problemFileName = `${fileNamePrefix}.${fileExtension}`; // 최종 파일 이름

      // 4. 디렉토리 및 파일 경로 구성 (새로운 구조 적용)
      // 작업 공간 루트 / <플랫폼_영문명> / <문제번호>
      const platformDirPath = vscode.Uri.joinPath(
        workspaceRootUri,
        platformCode
      ); // BOJ/
      const problemDirPath = vscode.Uri.joinPath(
        platformDirPath,
        normalizedProblemIdentifier
      ); // BOJ/1234/
      const problemFilePath = vscode.Uri.joinPath(
        problemDirPath,
        problemFileName
      ); // BOJ/1234/BOJ_1234.py

      // 5. 디렉토리 생성
      const dirCreated = await FileSystemManager.createDirectory(
        problemDirPath
      );
      if (!dirCreated) {
        NotificationManager.showError("문제 디렉토리 생성에 실패했습니다.");
        return;
      }

      // 6. 파일 생성 및 내용 작성
      const fileWritten = await FileSystemManager.writeFile(
        problemFilePath,
        initialFileContent
      );
      if (!fileWritten) {
        NotificationManager.showError("문제 파일 생성에 실패했습니다.");
        return;
      }

      // 7. 생성된 파일 에디터에서 열기
      await FileSystemManager.openFileInEditor(problemFilePath);

      NotificationManager.showInformation(
        `'${platformCode}/${normalizedProblemIdentifier}' 문제 풀이 환경이 성공적으로 생성되었습니다.`
      );
    } catch (error: any) {
      NotificationManager.showError(
        `문제 풀이 환경 설정 중 오류 발생: ${error.message}`
      );
      console.error("Setup Problem Command Error:", error);
    } finally {
      NotificationManager.hideStatusBarMessage(); // 작업 완료 후 상태 바 메시지 숨기기
    }
  }
}
