// src/utils/fileSystemManager.ts
import * as vscode from 'vscode';
import * as path from 'path'; // Node.js 'path' 모듈 임포트
import * as fs from 'fs';   // Node.js 'fs' 모듈 임포트 (fs/promises 사용 권장)
import * as fsPromises from 'fs/promises'; // Node.js 'fs/promises' 모듈 임포트 (비동기 파일 시스템 작업)
import { NotificationManager } from './notificationManager'; // 알림 유틸리티 임포트

/**
 * 파일 시스템 관련 작업을 처리하는 유틸리티 클래스입니다.
 * 디렉토리/파일 생성, 경로 관리 등을 담당합니다.
 */
export class FileSystemManager {

    /**
     * 작업 공간(Workspace)의 루트 URI를 가져옵니다.
     * @returns 현재 열려있는 작업 공간의 루트 URI 또는 undefined
     */
    static getWorkspaceRootUri(): vscode.Uri | undefined {
        // 현재 열려있는 폴더(workspace)가 있는지 확인
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri;
        }
        NotificationManager.showWarning('VS Code 작업 공간(폴더)이 열려있지 않습니다. 먼저 폴더를 여세요.');
        return undefined;
    }

    /**
     * 주어진 경로에 디렉토리를 생성합니다. 이미 존재하면 아무것도 하지 않습니다.
     * @param directoryPath 생성할 디렉토리의 전체 경로 (string 또는 vscode.Uri)
     * @returns 성공 여부
     */
    static async createDirectory(directoryPath: string | vscode.Uri): Promise<boolean> {
        const dirUri = typeof directoryPath === 'string' ? vscode.Uri.file(directoryPath) : directoryPath;
        const fsPath = dirUri.fsPath;

        try {
            await fsPromises.mkdir(fsPath, { recursive: true }); // recursive: true는 상위 디렉토리도 함께 생성
            NotificationManager.showInformation(`디렉토리 생성: ${path.basename(fsPath)}`);
            return true;
        } catch (error: any) {
            if (error.code === 'EEXIST') { // 이미 존재하는 경우
                // NotificationManager.showInformation(`디렉토리 이미 존재: ${path.basename(fsPath)}`);
                return true; // 이미 존재하므로 성공으로 간주
            }
            NotificationManager.showError(`디렉토리 생성 실패: ${path.basename(fsPath)} - ${error.message}`);
            console.error('Failed to create directory:', error);
            return false;
        }
    }

    /**
     * 주어진 경로에 파일을 생성하고 내용을 작성합니다. 이미 존재하면 덮어씁니다.
     * @param filePath 생성할 파일의 전체 경로 (string 또는 vscode.Uri)
     * @param content 파일에 작성할 내용
     * @returns 성공 여부
     */
    static async writeFile(filePath: string | vscode.Uri, content: string): Promise<boolean> {
        const fileUri = typeof filePath === 'string' ? vscode.Uri.file(filePath) : filePath;
        const fsPath = fileUri.fsPath;

        try {
            await fsPromises.writeFile(fsPath, content, { encoding: 'utf8' });
            NotificationManager.showInformation(`파일 생성/업데이트: ${path.basename(fsPath)}`);
            return true;
        } catch (error: any) {
            NotificationManager.showError(`파일 생성/업데이트 실패: ${path.basename(fsPath)} - ${error.message}`);
            console.error('Failed to write file:', error);
            return false;
        }
    }

    /**
     * 주어진 파일을 VS Code 에디터에서 엽니다.
     * @param filePath 열 파일의 전체 경로 (string 또는 vscode.Uri)
     */
    static async openFileInEditor(filePath: string | vscode.Uri): Promise<void> {
        const fileUri = typeof filePath === 'string' ? vscode.Uri.file(filePath) : filePath;
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            NotificationManager.showError(`파일 열기 실패: ${path.basename(fileUri.fsPath)} - ${error.message}`);
            console.error('Failed to open file in editor:', error);
        }
    }

    /**
     * 파일이나 디렉토리 경로의 마지막 부분(이름)을 반환합니다.
     * @param fullPath 전체 경로 (string 또는 vscode.Uri)
     * @returns 경로의 마지막 부분 (예: /path/to/file.txt -> file.txt)
     */
    static getBasename(fullPath: string | vscode.Uri): string {
        const fsPath = typeof fullPath === 'string' ? fullPath : fullPath.fsPath;
        return path.basename(fsPath);
    }
}